/** Durable ownership and retry cleanup for Errand close checkout locks. */

import { open, readFile, unlink } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

import type { GitExec } from "../git/exec.js";
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

/** Result of inspecting a terminal close receipt after its identity is absent. */
export type FinalizedCloseHeadLockRecovery =
  | { kind: "absent" | "recovered" }
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
  fileIO?: CloseHeadLockFileIO;
}): Promise<CloseAuthorityLeaseResult> {
  const fileIO = options.fileIO ?? NODE_FILE_IO;
  const lockPath = await resolveHeadLockPath(options.exec, options.checkoutPath);
  if (lockPath.kind === "error") return lockPath;

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
 * Remove an exact ARC-owned close lock after the matching identity reached terminal absence.
 *
 * @param options - Current checkout, finalized Errand slug, and optional file boundary.
 * @returns Whether no matching receipt existed, it was recovered, or cleanup failed.
 */
export async function recoverFinalizedErrandCloseHeadLock(options: {
  exec: GitExec;
  slug: string;
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
  if (receipt === null || receipt.slug !== options.slug || receipt.checkoutPath !== checkoutPath) {
    return { kind: "absent" };
  }
  // Identity absence proves the generation is terminal. A concurrent original release is already
  // past every protected operation, and its ENOENT path below is intentionally idempotent.
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
    ? candidate as unknown as ErrandCloseHeadLockReceiptV1
    : null;
}

function errorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException).code;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
