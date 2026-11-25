/** Native Git lock evidence and recovery shared by state transactions and fetch notices. */

import { join } from "node:path";
import type { RefBackendContext } from "./context.js";
import type { StoreRefusal } from "../refusal.js";
import { REF_SYNC_DEADLINE_MS } from "./sync-deadline.js";

/** One observed lock in the selected physical state repository. */
export interface RefGitLock { lock: string; ageMs: number }

/** A completed transaction refused while its expected refs and a native lock remained. */
export class RefGitLockError extends Error implements RefGitLock {
  constructor(readonly lock: string, readonly ageMs: number, cause: unknown) {
    super(`The Git ref lock ${lock} is ${ageMs}ms old.`, { cause });
    this.name = "RefGitLockError";
  }
}

/** Observe only lock files the attempted ref operation could require; never remove one. */
export async function findRefGitLock(context: RefBackendContext, refs: readonly string[], deleting = false): Promise<RefGitLock | undefined> {
  const directory = context.repository?.gitDir ?? context.repository?.commonDir;
  if (!directory) return;
  const candidates = [...refs.map(ref => join(directory, `${ref}.lock`)), join(directory, "reftable", "tables.list.lock"),
    ...deleting ? [join(directory, "packed-refs.lock")] : []];
  for (const lock of candidates) {
    try {
      const stat = await context.fs.lstat(lock);
      return { lock, ageMs: Math.max(0, Math.floor(context.clock().getTime() - stat.mtimeMs)) };
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error
        && (error.code === "ENOENT" || error.code === "ENOTDIR")) continue;
      throw error;
    }
  }
}

/** Keep a stale lock's manual repair distinct from a young lock's retry-first route. */
export function refGitLockRefusal(evidence: RefGitLock): Extract<StoreRefusal, { code: "lock-held" }> {
  return { code: "lock-held", class: "recoverable", lock: evidence.lock,
    condition: `The Git ref lock ${evidence.lock} is ${evidence.ageMs}ms old.`,
    remedy: { text: evidence.ageMs > REF_SYNC_DEADLINE_MS
      ? `Remove ${evidence.lock} once no Git process is running in that repository, then retry.`
      : `Retry after the Git writer finishes. If ${evidence.lock} remains, confirm no Git process is running in that repository before removing it, then retry.` } };
}
