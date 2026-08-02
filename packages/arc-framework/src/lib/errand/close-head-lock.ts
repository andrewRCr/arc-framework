/** Durable ownership and retry cleanup for Errand close checkout locks. */

import { open, readFile, unlink } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

import type { GitExec } from "../git/exec.js";
import type { ProcessInspection, ProcessInspector } from "../locus/process-inspector.js";
import type {
  CloseAuthorityGuard,
  CloseAuthorityLeaseResult,
} from "./close-locus.js";

const RECEIPT_KIND = "arc-errand-close-head-lock";
const CLAIM_ID_PATTERN = /^[0-9a-f]{32}$/u;

/** Exact Errand generation protected by a checkout HEAD lock. */
export interface ErrandCloseHeadLockIdentity {
  readonly slug: string;
  readonly claimId: string;
}

interface ErrandCloseHeadLockReceiptV1 extends ErrandCloseHeadLockIdentity {
  readonly version: 1;
  readonly kind: typeof RECEIPT_KIND;
  readonly checkoutPath: string;
  readonly holder: {
    readonly pid: number;
    readonly startToken: string;
    readonly inspector: string;
  };
}

interface CloseHeadLockHandle {
  writeFile(data: string, encoding: BufferEncoding): Promise<void>;
  sync(): Promise<void>;
  close(): Promise<void>;
}

/** File boundaries used to persist and recover one checkout lock receipt. */
export interface CloseHeadLockFileIO {
  openExclusive(path: string): Promise<CloseHeadLockHandle>;
  read(path: string): Promise<string>;
  unlink(path: string): Promise<void>;
}

const NODE_FILE_IO: CloseHeadLockFileIO = {
  openExclusive: (path) => open(path, "wx", 0o600),
  read: (path) => readFile(path, "utf8"),
  unlink,
};

/** Result of inspecting an abandoned close receipt for a terminal or exact-generation retry. */
export type FinalizedCloseHeadLockRecovery =
  | { kind: "absent" | "recovered" }
  | { kind: "blocked"; message: string }
  | { kind: "error"; message: string };

/**
 * Acquire the checkout HEAD lock and persist the exact Errand generation it protects.
 *
 * @param options - Checkout, generation, authority proof, and optional file boundary.
 * @returns A caller-owned authority lease, a concurrent-lock refusal, or an operational error.
 */
export async function acquireErrandCloseHeadLock(options: {
  exec: GitExec;
  checkoutPath: string;
  identity: ErrandCloseHeadLockIdentity;
  revalidate: CloseAuthorityGuard["revalidate"];
  inspector: ProcessInspector;
  fileIO?: CloseHeadLockFileIO;
}): Promise<CloseAuthorityLeaseResult> {
  const fileIO = options.fileIO ?? NODE_FILE_IO;
  const lockPath = await resolveHeadLockPath(options.exec, options.checkoutPath);
  if (lockPath.kind === "error") return lockPath;
  const holder = await inspectCurrentHolder(options.inspector);
  if (holder.kind === "error") return holder;

  let handle: CloseHeadLockHandle;
  try {
    handle = await fileIO.openExclusive(lockPath.path);
  } catch (error) {
    if (errorCode(error) === "EEXIST") {
      return {
        kind: "refused",
        reason: "role-conflict",
        message: `Errand close cannot lock checkout HEAD at '${options.checkoutPath}'; retry after the Git operation.`,
      };
    }
    return { kind: "error", message: errorMessage(error) };
  }

  const receipt: ErrandCloseHeadLockReceiptV1 = {
    version: 1,
    kind: RECEIPT_KIND,
    slug: options.identity.slug,
    claimId: options.identity.claimId,
    checkoutPath: options.checkoutPath,
    holder: holder.value,
  };
  try {
    await handle.writeFile(`${JSON.stringify(receipt)}\n`, "utf8");
    await handle.sync();
  } catch (error) {
    await closeAndUnlinkAfterInitializationFailure(handle, lockPath.path, fileIO);
    return { kind: "error", message: `Could not persist checkout authority: ${errorMessage(error)}` };
  }

  let closed = false;
  let released = false;
  const release = async (): Promise<void> => {
    if (released) return;
    let failure: Error | null = null;
    if (!closed) {
      try {
        await handle.close();
        closed = true;
      } catch (error) {
        failure = new Error(errorMessage(error));
      }
    }
    try {
      await fileIO.unlink(lockPath.path);
      released = true;
    } catch (error) {
      if (errorCode(error) === "ENOENT") released = true;
      else failure ??= new Error(errorMessage(error));
    }
    if (failure !== null) throw failure;
  };

  const authorization = await options.revalidate();
  if (authorization.kind === "valid") return { kind: "acquired", release };
  try {
    await release();
  } catch (error) {
    return { kind: "error", message: `Could not release rejected checkout authority: ${errorMessage(error)}` };
  }
  return authorization;
}

/**
 * Remove an exact ARC-owned close lock after terminal absence or for the matching retained claim.
 *
 * @param options - Current checkout, finalized Errand slug, and optional file boundary.
 * @returns Whether no matching receipt existed, it was recovered, or cleanup failed.
 */
export async function recoverFinalizedErrandCloseHeadLock(options: {
  exec: GitExec;
  slug: string;
  claimId?: string;
  inspector: ProcessInspector;
  fileIO?: CloseHeadLockFileIO;
}): Promise<FinalizedCloseHeadLockRecovery> {
  const fileIO = options.fileIO ?? NODE_FILE_IO;
  let checkoutPath: string;
  try {
    checkoutPath = (await options.exec("git", ["rev-parse", "--show-toplevel"])).stdout.trim();
  } catch (error) {
    return { kind: "error", message: errorMessage(error) };
  }
  if (checkoutPath === "") return { kind: "error", message: "Git returned no current checkout path." };

  const lockPath = await resolveHeadLockPath(options.exec, checkoutPath);
  if (lockPath.kind === "error") return lockPath;
  let bytes: string;
  try {
    bytes = await fileIO.read(lockPath.path);
  } catch (error) {
    return errorCode(error) === "ENOENT"
      ? { kind: "absent" }
      : { kind: "error", message: errorMessage(error) };
  }
  const receipt = parseReceipt(bytes);
  if (receipt === null
    || receipt.slug !== options.slug
    || (options.claimId !== undefined && receipt.claimId !== options.claimId)
    || receipt.checkoutPath !== checkoutPath) {
    return { kind: "absent" };
  }
  const holderLiveness = await inspectHolder(receipt, options.inspector);
  if (holderLiveness.kind === "blocked") return holderLiveness;
  // A proven-dead holder cannot concurrently remove this generation and expose a replacement
  // after this recheck. Identity absence independently proves the close terminal.
  let currentBytes: string;
  try {
    currentBytes = await fileIO.read(lockPath.path);
  } catch (error) {
    return errorCode(error) === "ENOENT"
      ? { kind: "absent" }
      : { kind: "error", message: errorMessage(error) };
  }
  if (currentBytes !== bytes) {
    return { kind: "blocked", message: "Checkout-lock generation changed during terminal recovery." };
  }
  try {
    await fileIO.unlink(lockPath.path);
  } catch (error) {
    if (errorCode(error) !== "ENOENT") return { kind: "error", message: errorMessage(error) };
  }
  return { kind: "recovered" };
}

async function resolveHeadLockPath(
  exec: GitExec,
  checkoutPath: string,
): Promise<{ kind: "ready"; path: string } | { kind: "error"; message: string }> {
  let gitHeadPath: string;
  try {
    gitHeadPath = (await exec("git", ["rev-parse", "--git-path", "HEAD"], { cwd: checkoutPath })).stdout.trim();
  } catch (error) {
    return { kind: "error", message: errorMessage(error) };
  }
  if (gitHeadPath === "") return { kind: "error", message: "Git returned no checkout HEAD path." };
  const path = isAbsolute(gitHeadPath) ? gitHeadPath : resolve(checkoutPath, gitHeadPath);
  return { kind: "ready", path: `${path}.lock` };
}

async function closeAndUnlinkAfterInitializationFailure(
  handle: CloseHeadLockHandle,
  lockPath: string,
  fileIO: CloseHeadLockFileIO,
): Promise<void> {
  await handle.close().catch(() => undefined);
  await fileIO.unlink(lockPath).catch(() => undefined);
}

function parseReceipt(bytes: string): ErrandCloseHeadLockReceiptV1 | null {
  let value: unknown;
  try {
    value = JSON.parse(bytes) as unknown;
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;
  return candidate.version === 1
    && candidate.kind === RECEIPT_KIND
    && typeof candidate.slug === "string"
    && typeof candidate.claimId === "string"
    && CLAIM_ID_PATTERN.test(candidate.claimId)
    && typeof candidate.checkoutPath === "string"
    && isReceiptHolder(candidate.holder)
    ? candidate as unknown as ErrandCloseHeadLockReceiptV1
    : null;
}

async function inspectCurrentHolder(
  inspector: ProcessInspector,
): Promise<
  | { kind: "ready"; value: ErrandCloseHeadLockReceiptV1["holder"] }
  | { kind: "error"; message: string }
> {
  let inspected: ProcessInspection;
  try {
    inspected = await inspector.inspect(process.pid);
  } catch (error) {
    return { kind: "error", message: `Could not inspect checkout-lock holder: ${errorMessage(error)}` };
  }
  if (inspected.kind !== "present" || inspected.pid !== process.pid || inspected.startToken.trim() === "") {
    return { kind: "error", message: "Could not establish the checkout-lock holder generation." };
  }
  return {
    kind: "ready",
    value: { pid: inspected.pid, startToken: inspected.startToken, inspector: inspector.kind },
  };
}

async function inspectHolder(
  receipt: ErrandCloseHeadLockReceiptV1,
  inspector: ProcessInspector,
): Promise<{ kind: "dead" } | { kind: "blocked"; message: string }> {
  if (receipt.holder.inspector !== inspector.kind) {
    return { kind: "blocked", message: "Checkout-lock holder liveness cannot be verified by this runtime." };
  }
  let inspected: ProcessInspection;
  try {
    inspected = await inspector.inspect(receipt.holder.pid);
  } catch (error) {
    return { kind: "blocked", message: `Checkout-lock holder liveness is unavailable: ${errorMessage(error)}` };
  }
  if (inspected.kind === "absent") return { kind: "dead" };
  if (inspected.kind === "unverifiable") {
    return { kind: "blocked", message: `Checkout-lock holder liveness is unavailable: ${inspected.reason}` };
  }
  return inspected.pid === receipt.holder.pid && inspected.startToken === receipt.holder.startToken
    ? { kind: "blocked", message: "Checkout-lock cleanup is still owned by the live close process; retry later." }
    : { kind: "dead" };
}

function isReceiptHolder(value: unknown): value is ErrandCloseHeadLockReceiptV1["holder"] {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return Number.isSafeInteger(candidate.pid)
    && (candidate.pid as number) > 0
    && typeof candidate.startToken === "string"
    && candidate.startToken.trim() !== ""
    && typeof candidate.inspector === "string"
    && candidate.inspector.trim() !== "";
}

function errorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException).code;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
