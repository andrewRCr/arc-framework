/** Durable retry cleanup for Errand close checkout locks. */

import { randomUUID } from "node:crypto";
import { link, open, readFile, unlink } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

import type { GitExec } from "../git/exec.js";
import {
  scanRegisteredWorktrees,
  type RegisteredWorktree,
} from "../git/worktree-roster.js";
import type {
  CloseAuthorityGuard,
  CloseAuthorityLockResult,
  CloseAuthorityResult,
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
  readonly generation: string;
}

interface CloseHeadLockHandle {
  writeFile(data: string, encoding: BufferEncoding): Promise<void>;
  sync(): Promise<void>;
  close(): Promise<void>;
}

/** File boundaries used to persist and recover one checkout lock receipt. */
export interface CloseHeadLockFileIO {
  openExclusive(path: string): Promise<CloseHeadLockHandle>;
  link(existingPath: string, newPath: string): Promise<void>;
  read(path: string): Promise<string>;
  unlink(path: string): Promise<void>;
}

const NODE_FILE_IO: CloseHeadLockFileIO = {
  openExclusive: (path) => open(path, "wx", 0o600),
  link,
  read: (path) => readFile(path, "utf8"),
  unlink,
};

/** Result of inspecting an abandoned close receipt for a terminal or exact-generation retry. */
export type FinalizedCloseHeadLockRecovery =
  | { kind: "absent" | "recovered" }
  | { kind: "blocked"; message: string }
  | { kind: "error"; message: string };

/** Authority held over every registered checkout during local Errand-ref deletion. */
export type ErrandCloseBranchDeletionLockResult =
  | { kind: "acquired"; release(): Promise<void> }
  | { kind: "refused"; message: string }
  | { kind: "error"; message: string };

/**
 * Acquire the checkout HEAD lock and persist the exact Errand generation it protects.
 *
 * @param options - Checkout, generation, authority proof, and optional file boundary.
 * @returns A caller-owned authority lock, a concurrent-lock refusal, or an operational error.
 */
export async function acquireErrandCloseHeadLock(options: {
  exec: GitExec;
  checkoutPath: string;
  identity: ErrandCloseHeadLockIdentity;
  revalidate: CloseAuthorityGuard["revalidate"];
  fileIO?: CloseHeadLockFileIO;
}): Promise<CloseAuthorityLockResult> {
  const fileIO = options.fileIO ?? NODE_FILE_IO;
  const lockPath = await resolveHeadLockPath(options.exec, options.checkoutPath);
  if (lockPath.kind === "error") return lockPath;
  const receipt: ErrandCloseHeadLockReceiptV1 = {
    version: 1,
    kind: RECEIPT_KIND,
    slug: options.identity.slug,
    claimId: options.identity.claimId,
    checkoutPath: options.checkoutPath,
    generation: randomUUID(),
  };
  const published = await publishInitializedHeadLock(
    lockPath.path,
    `${JSON.stringify(receipt)}\n`,
    fileIO,
  );
  if (published.kind === "occupied") {
    return {
      kind: "refused",
      reason: "role-conflict",
      message: `Errand close cannot lock checkout HEAD at '${options.checkoutPath}'; retry after the Git operation.`,
    };
  }
  if (published.kind === "error") {
    return { kind: "error", message: `Could not persist checkout authority: ${published.message}` };
  }

  let released = false;
  const release = async (): Promise<void> => {
    if (released) return;
    try {
      await fileIO.unlink(lockPath.path);
      released = true;
    } catch (error) {
      if (errorCode(error) === "ENOENT") released = true;
      else throw new Error(errorMessage(error), { cause: error });
    }
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
 * @param options - Repository, finalized Errand slug, and optional file boundary.
 * @returns Whether no matching receipt existed, it was recovered, or cleanup failed.
 */
export async function recoverFinalizedErrandCloseHeadLock(options: {
  exec: GitExec;
  slug: string;
  fileIO?: CloseHeadLockFileIO;
}): Promise<FinalizedCloseHeadLockRecovery> {
  const fileIO = options.fileIO ?? NODE_FILE_IO;
  const roster = await scanRegisteredWorktrees(options.exec);
  if (!roster.ok) return { kind: "error", message: roster.message };

  let recovered = false;
  for (const worktree of roster.worktrees) {
    const result = await recoverCheckoutHeadLock({
      ...options,
      checkoutPath: worktree.path,
      fileIO,
    });
    if (result.kind === "blocked" || result.kind === "error") return result;
    recovered ||= result.kind === "recovered";
  }
  return { kind: recovered ? "recovered" : "absent" };
}

/**
 * Lock every registered checkout while one exact Errand branch is deleted locally.
 *
 * @param options - Exact Errand generation, target branch, and any already-held checkout guard.
 * @returns Roster-wide locks, an occupancy refusal, or an operational failure.
 */
export async function acquireErrandCloseBranchDeletionHeadLocks(options: {
  exec: GitExec;
  identity: ErrandCloseHeadLockIdentity;
  branch: string;
  guard: CloseAuthorityGuard | null;
  fileIO?: CloseHeadLockFileIO;
}): Promise<ErrandCloseBranchDeletionLockResult> {
  const initial = await readBranchDeletionAuthority(options);
  if (initial.kind !== "ready") return initial;
  const excludedPath = options.guard?.checkoutPath;
  if (excludedPath !== undefined
    && !initial.worktrees.some((worktree) => worktree.path === excludedPath)) {
    return { kind: "error", message: "The guarded checkout is absent from the registered worktree topology." };
  }

  const locks: Array<{ release(): Promise<void> }> = [];
  for (const worktree of initial.worktrees) {
    if (worktree.path === excludedPath) continue;
    const acquired = await acquireErrandCloseHeadLock({
      exec: options.exec,
      checkoutPath: worktree.path,
      identity: options.identity,
      revalidate: async () => {
        const authority = await readBranchDeletionAuthority(options);
        return authority.kind === "ready" ? { kind: "valid" } : authorityToCloseResult(authority);
      },
      ...(options.fileIO === undefined ? {} : { fileIO: options.fileIO }),
    });
    if (acquired.kind !== "acquired") {
      const releaseError = await releaseHeadLocks(locks);
      return releaseError === null
        ? { kind: acquired.kind, message: acquired.message }
        : { kind: "error", message: releaseError };
    }
    locks.push(acquired);
  }

  const confirmed = await readBranchDeletionAuthority(options);
  if (confirmed.kind !== "ready"
    || !sameRegisteredPaths(initial.worktrees, confirmed.worktrees)) {
    const releaseError = await releaseHeadLocks(locks);
    if (releaseError !== null) return { kind: "error", message: releaseError };
    return confirmed.kind === "ready"
      ? { kind: "refused", message: "Registered worktree topology changed during local branch deletion." }
      : confirmed;
  }
  let released = false;
  return {
    kind: "acquired",
    release: async () => {
      if (released) return;
      const releaseError = await releaseHeadLocks(locks);
      if (releaseError !== null) throw new Error(releaseError);
      released = true;
    },
  };
}

async function readBranchDeletionAuthority(options: {
  exec: GitExec;
  branch: string;
  guard: CloseAuthorityGuard | null;
}): Promise<
  | { kind: "ready"; worktrees: RegisteredWorktree[] }
  | { kind: "refused"; message: string }
  | { kind: "error"; message: string }
> {
  if (options.guard !== null) {
    const guarded = await options.guard.revalidate();
    if (guarded.kind !== "valid") return { kind: guarded.kind, message: guarded.message };
  }
  const roster = await scanRegisteredWorktrees(options.exec);
  if (!roster.ok) {
    return { kind: "error", message: `Local Errand branch occupancy cannot be proven: ${roster.message}` };
  }
  const occupied = roster.worktrees.find((worktree) => worktree.branch === options.branch);
  return occupied === undefined
    ? { kind: "ready", worktrees: roster.worktrees }
    : {
        kind: "refused",
        message: `Local Errand branch is checked out by registered worktree '${occupied.path}'.`,
      };
}

function authorityToCloseResult(
  authority: { kind: "refused" | "error"; message: string },
): Extract<CloseAuthorityResult, { kind: "refused" | "error" }> {
  return authority.kind === "refused"
    ? { kind: "refused", reason: "role-conflict", message: authority.message }
    : { kind: "error", message: authority.message };
}

function sameRegisteredPaths(
  left: readonly { path: string }[],
  right: readonly { path: string }[],
): boolean {
  if (left.length !== right.length) return false;
  const rightPaths = new Set(right.map((worktree) => worktree.path));
  return left.every((worktree) => rightPaths.has(worktree.path));
}

async function releaseHeadLocks(locks: readonly { release(): Promise<void> }[]): Promise<string | null> {
  let failure: string | null = null;
  for (const lock of [...locks].reverse()) {
    try {
      await lock.release();
    } catch (error) {
      failure ??= errorMessage(error);
    }
  }
  return failure;
}

async function recoverCheckoutHeadLock(options: {
  exec: GitExec;
  checkoutPath: string;
  slug: string;
  fileIO: CloseHeadLockFileIO;
}): Promise<FinalizedCloseHeadLockRecovery> {
  const lockPath = await resolveHeadLockPath(options.exec, options.checkoutPath);
  if (lockPath.kind === "error") return lockPath;
  let bytes: string;
  try {
    bytes = await options.fileIO.read(lockPath.path);
  } catch (error) {
    return errorCode(error) === "ENOENT"
      ? { kind: "absent" }
      : { kind: "error", message: errorMessage(error) };
  }
  const receipt = parseReceipt(bytes);
  if (receipt === null
    || receipt.slug !== options.slug
    || receipt.checkoutPath !== options.checkoutPath) {
    return { kind: "absent" };
  }
  // Identity absence proves the close is terminal. Exact bytes prevent cleanup from
  // removing a replacement lock generation published after this read.
  let currentBytes: string;
  try {
    currentBytes = await options.fileIO.read(lockPath.path);
  } catch (error) {
    return errorCode(error) === "ENOENT"
      ? { kind: "absent" }
      : { kind: "error", message: errorMessage(error) };
  }
  if (currentBytes !== bytes) {
    return { kind: "blocked", message: "Checkout-lock generation changed during terminal recovery." };
  }
  try {
    await options.fileIO.unlink(lockPath.path);
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

async function publishInitializedHeadLock(
  lockPath: string,
  receipt: string,
  fileIO: CloseHeadLockFileIO,
): Promise<{ kind: "published" | "occupied" } | { kind: "error"; message: string }> {
  const temporaryPath = `${lockPath}.arc-${randomUUID()}.tmp`;
  let handle: CloseHeadLockHandle | null = null;
  try {
    handle = await fileIO.openExclusive(temporaryPath);
    await handle.writeFile(receipt, "utf8");
    await handle.sync();
    await handle.close();
    handle = null;
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await fileIO.unlink(temporaryPath).catch(() => undefined);
    return { kind: "error", message: errorMessage(error) };
  }

  try {
    await fileIO.link(temporaryPath, lockPath);
  } catch (error) {
    await fileIO.unlink(temporaryPath).catch(() => undefined);
    return errorCode(error) === "EEXIST"
      ? { kind: "occupied" }
      : { kind: "error", message: errorMessage(error) };
  }
  await fileIO.unlink(temporaryPath).catch(() => undefined);
  return { kind: "published" };
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
    && typeof candidate.generation === "string"
    && candidate.generation.trim() !== ""
    ? candidate as unknown as ErrandCloseHeadLockReceiptV1
    : null;
}

function errorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException).code;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
