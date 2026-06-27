/**
 * The same-machine compare-and-swap retry frame for the shared tree-commit
 * chokepoint — the inter-process complement to the cross-machine reconcile push.
 *
 * The tree refs ({@link module:lib/errand/ref-tree}, {@link
 * module:lib/user-sync/sync-state-ref}) are written by an unguarded
 * read-modify-write: read the tip, read the tree, mutate, commit, move the ref.
 * Two processes on one machine racing the same ref both build on the same tip and
 * the last writer wins. {@link writeTreeCommit}'s compare-and-swap rejects the
 * losing write; this frame wraps the whole RMW so the loser re-reads the fresh
 * tip and tree, rebuilds its mutation on that state, and retries — bounded by the
 * shared {@link MAX_RECONCILE_ATTEMPTS}, mirroring the cross-machine push's
 * typed-failure-on-exhaustion contract rather than looping or dropping.
 *
 * It lives here, beside the {@link isCasRejectionError} discriminator, because it
 * builds on the git plumbing (lower tier) and the user-sync reconcile vocabulary;
 * both the errand and sync-state consumers route their direct writes through it.
 *
 * @module
 */

import {
  MAX_RECONCILE_ATTEMPTS,
  readRefTip,
  readTreeEntries,
  writeTreeCommit,
  type RefTreeWriteIO,
} from "../git/ref-tree.js";
import { isCasRejectionError } from "./notes-merge.js";

/**
 * A per-ref read-modify-write mutation: given the freshly-read tree entries,
 * return the entries to commit. Re-invoked from scratch on each retry so the
 * mutation always applies to the current canonical state, never a stale snapshot.
 * May be async, though the production callers mutate synchronously (the blob is
 * hashed once before the loop).
 */
export type TreeMutation = (
  entries: Map<string, string>,
) => Map<string, string> | Promise<Map<string, string>>;

/** Outcome of {@link writeTreeWithCasRetry}: the new commit, or a typed failure. */
export type CasWriteOutcome =
  | { kind: "written"; sha: string }
  | { kind: "failed"; error: Error };

/**
 * Run a ref's read-modify-write under a bounded compare-and-swap retry.
 *
 * Each attempt reads the ref tip and tree fresh, applies `mutate` to the entries,
 * and commits with that tip as the CAS expected-old value. A losing CAS — the ref
 * advanced under a same-machine sibling between this read and the write — re-reads
 * and rebuilds on the fresh state and retries, bounded by {@link
 * MAX_RECONCILE_ATTEMPTS}. Any non-CAS git error surfaces immediately as `failed`
 * (never retried). Exhausting the bound returns `failed` rather than looping.
 *
 * @param io - Injected git seams (reads plus the stdin-fed builder).
 * @param ref - The ref to read-modify-write.
 * @param message - The commit message for each write attempt.
 * @param mutate - Produces the entries to commit from the freshly-read tree.
 * @returns The new commit on success, or a typed failure on a non-CAS error or exhaustion.
 */
export async function writeTreeWithCasRetry(
  io: RefTreeWriteIO,
  ref: string,
  message: string,
  mutate: TreeMutation,
): Promise<CasWriteOutcome> {
  for (let attempt = 0; attempt < MAX_RECONCILE_ATTEMPTS; attempt++) {
    const tip = await readRefTip(io.exec, ref);
    const entries = await readTreeEntries(io.exec, ref);
    const mutated = await mutate(entries);
    try {
      const sha = await writeTreeCommit(io, ref, mutated, message, tip ? [tip] : [], tip);
      return { kind: "written", sha };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      // A genuine CAS rejection means the ref moved underneath us — re-read and
      // rebuild. Anything else is an unexpected git failure and surfaces as-is.
      if (!isCasRejectionError(error.message)) return { kind: "failed", error };
    }
  }
  return {
    kind: "failed",
    error: new Error(`tree-commit CAS: exceeded retry attempts for ${ref}`),
  };
}
