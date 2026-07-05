/**
 * The keyed union-merge for the sibling sync-state ref's tree, and the
 * push that reconciles it around a concurrent remote.
 *
 * Each entry is keyed by the outstanding notes-push intent it records, so
 * concurrent writes for distinct intents have no true conflict — they union.
 * This mirrors the errand per-slug tree-merge in shape. The writer's current
 * key is authoritative from the local side (its latest write, or its absence
 * when cleared), while every other key is taken from the remote. So no intent
 * clobbers another, including multiple unresolved intents from one workspace.
 *
 * On a non-fast-forward push the reconcile fetches the remote into the tracking
 * ref, unions the trees, commits the result onto both tips (so the follow-up
 * push fast-forwards), and retries — bounded, since the union is conflict-free
 * and a clean push always exists once the trees agree.
 *
 * @module
 */

import {
  MAX_RECONCILE_ATTEMPTS,
  readRefTip,
  readTreeEntriesDiscriminating,
  uniqueRefToken,
  writeTreeCommit,
} from "../git/ref-tree.js";
import type { GitExec } from "../git/exec.js";
import { isNonFastForwardError, isRemoteUnavailableError } from "./notes-merge.js";
import {
  syncStateRef,
  incomingSyncStateRef,
  fetchSyncStateRef,
  type SyncStateRefIO,
} from "./sync-state-ref.js";

/**
 * Union two sync-state entry trees from the writing key's vantage point.
 *
 * Other keys come from `remote` (origin is authoritative for already-published
 * entries); the writer's current key comes from `local` — set when present (a
 * write or re-write), removed when absent (the writer cleared it). The result
 * preserves every sibling entry, applies the writer's latest state for this
 * key, and never resurrects a key the writer deleted.
 *
 * @param local - This repo's local tree: `entryKey` → blob-sha.
 * @param remote - The fetched remote tree: `entryKey` → blob-sha.
 * @param ownEntryKey - The key this write owns — the one key `local` is authoritative for.
 * @returns The unioned `entryKey` → blob-sha entries.
 */
export function mergeSyncStateEntries(
  local: Map<string, string>,
  remote: Map<string, string>,
  ownEntryKey: string,
): Map<string, string> {
  const merged = new Map(remote);
  const own = local.get(ownEntryKey);
  if (own === undefined) {
    merged.delete(ownEntryKey);
  } else {
    merged.set(ownEntryKey, own);
  }
  return merged;
}

// Re-exported from the shared tree-ref chokepoint so same-machine retry and
// cross-machine reconcile share one bound; consumers importing it from here are
// unaffected by the relocation.
export { MAX_RECONCILE_ATTEMPTS };

/** Discriminated outcome of {@link reconcileSyncStatePush}. */
export type SyncStatePushOutcome =
  | { kind: "pushed" }
  | { kind: "noop" }
  | { kind: "reconciled" }
  | { kind: "no-remote" }
  | { kind: "failed"; error: Error };

/**
 * Push this sync-state ref, reconciling a concurrent-remote
 * non-fast-forward by union.
 *
 * A clean push (including the first push that creates an absent remote ref)
 * returns `pushed`. On a non-fast-forward rejection — a sibling pushed its own
 * marker between this write and push — the remote is fetched, the entry
 * trees unioned ({@link mergeSyncStateEntries}, scoped to
 * `ownEntryKey`), the result committed onto both tips, and the push retried
 * (`reconciled`). Because the union has no collision outcome, the loop is
 * bounded only by a relentlessly-racing remote; exhausting the attempts
 * surfaces `failed` rather than looping. An absent local ref is a `noop`.
 *
 * @param io - Injected git seams (including the stdin-fed builder) and identity.
 * @param ownEntryKey - The entry key this push owns.
 * @returns The push outcome.
 */
export async function reconcileSyncStatePush(
  io: SyncStateRefIO,
  ownEntryKey: string,
): Promise<SyncStatePushOutcome> {
  const ref = syncStateRef(io.identity);
  if ((await readRefTip(io.exec, ref)) === null) return { kind: "noop" };

  let reconciledOnce = false;
  // Up to MAX_RECONCILE_ATTEMPTS reconciles, each followed by a retry push — so
  // the bound is one more push than reconcile (the final iteration is the push
  // of the last reconciled tip, never followed by another reconcile).
  for (let attempt = 0; attempt <= MAX_RECONCILE_ATTEMPTS; attempt++) {
    try {
      await io.exec("git", ["push", "origin", ref]);
      return reconciledOnce ? { kind: "reconciled" } : { kind: "pushed" };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      if (isRemoteUnavailableError(error.message)) return { kind: "no-remote" };
      if (!isNonFastForwardError(error.message)) return { kind: "failed", error };
      if (attempt === MAX_RECONCILE_ATTEMPTS) {
        return { kind: "failed", error: new Error("sync-state push: exceeded reconcile attempts") };
      }

      // Keep the outcome single-channel: a fetch/read/commit failure inside the
      // reconcile must surface as `failed`, not escape this function as a throw.
      try {
        await reconcileTrees(io, ref, ownEntryKey);
      } catch (reconcileErr) {
        return {
          kind: "failed",
          error: reconcileErr instanceof Error ? reconcileErr : new Error(String(reconcileErr)),
        };
      }
      reconciledOnce = true;
    }
  }
  return { kind: "failed", error: new Error("sync-state push: exceeded reconcile attempts") };
}

/**
 * Fetch the remote ref, union it into the local tree, and commit the result
 * onto both tips so the next push fast-forwards. The union is scoped to
 * `ownEntryKey`, so the merge only ever changes this write's key relative to
 * the remote. The tracking ref is cleaned up regardless of outcome.
 */
async function reconcileTrees(io: SyncStateRefIO, ref: string, ownEntryKey: string): Promise<void> {
  // Per-reconcile-unique tracking ref: a shared identity-scoped one lets a concurrent
  // same-machine reconcile's cleanup delete it before this one resolves incomingTip,
  // which would then read the remote side as empty and CAS-write a narrowed tree.
  const incoming = `${incomingSyncStateRef(ref)}__${uniqueRefToken()}`;
  await fetchSyncStateRef(io, incoming);
  try {
    // Resolve both tips first and read each tree at that exact commit, so the merge
    // input and the compare-and-swap base are bound to one snapshot. Reading a tree
    // by ref name before resolving its tip would let a writer advance the ref in
    // between — the CAS would then pass against the fresher tip while committing a
    // merge built on the stale tree, silently dropping the racer's entry. The incoming
    // side is bound too: the tracking ref is keyed by identity, not process, so a
    // concurrent same-machine reconcile can re-fetch it underneath this one. An absent
    // tip (the ref never resolved) reads as empty; readReconcileTree still aborts on a
    // genuine read error.
    const localTip = await readRefTip(io.exec, ref);
    const incomingTip = await readRefTip(io.exec, incoming);
    const local = localTip ? await readReconcileTree(io.exec, localTip) : new Map<string, string>();
    const remote = incomingTip ? await readReconcileTree(io.exec, incomingTip) : new Map<string, string>();
    const merged = mergeSyncStateEntries(local, remote, ownEntryKey);

    const parents = [localTip, incomingTip].filter((tip): tip is string => tip !== null);
    await writeTreeCommit(io, ref, merged, `sync-state: reconcile ${ownEntryKey}`, parents, localTip);
  } finally {
    await deleteRef(io, incoming);
  }
}

/**
 * Read a reconcile input, treating a legitimately absent ref as empty but a
 * genuine read failure as fatal.
 *
 * The advisory {@link module:lib/git/ref-tree.readTreeEntries} collapses both to
 * empty — fine for fail-open reads, but here an *errored* read after a successful
 * fetch would union a tree narrowed to this machine's own key, dropping siblings'
 * entries. Throwing on `error` aborts the reconcile, which
 * {@link reconcileSyncStatePush} surfaces through its single `{ kind: "failed" }`
 * channel; an absent ref still unions normally as empty.
 */
async function readReconcileTree(exec: GitExec, ref: string): Promise<Map<string, string>> {
  const result = await readTreeEntriesDiscriminating(exec, ref);
  if (result.kind === "error") throw result.error;
  return result.kind === "entries" ? result.entries : new Map();
}

/** Best-effort delete of the temp tracking ref; a failed cleanup never masks the outcome. */
async function deleteRef(io: SyncStateRefIO, ref: string): Promise<void> {
  try {
    await io.exec("git", ["update-ref", "-d", ref]);
  } catch {
    // Cleanup is best-effort.
  }
}
