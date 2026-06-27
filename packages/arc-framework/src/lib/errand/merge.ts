/**
 * The per-slug tree-merge for the errand orphan state-ref and the push that
 * reconciles around a concurrent remote.
 *
 * The ref holds independent per-slug blobs, so two machines that each create an
 * errand diverge cleanly: the merge **unions** distinct slugs and treats a slug
 * present on both sides as idempotent when its blob is byte-identical (the git
 * blob sha *is* the byte-identity check, since blobs are content-addressed). A
 * slug present on both sides with differing content is a **same-slug
 * collision** — surfaced, never silently resolved.
 *
 * Unlike `git notes merge`, an orphan state-ref inherits no built-in union, so
 * the reconcile is realized explicitly: on a non-fast-forward push, fetch the
 * remote into a temp ref, merge the trees, commit the result onto *both* tips
 * (so the follow-up push fast-forwards), and retry.
 *
 * @module
 */

import { MAX_RECONCILE_ATTEMPTS } from "../git/ref-tree.js";
import { isNonFastForwardError, isRemoteUnavailableError } from "../user-sync/index.js";
import {
  errandsRef,
  readRefTip,
  readTreeEntriesDiscriminating,
  writeTreeCommit,
  type ErrandRecordIO,
} from "./ref-tree.js";
import type { GitExec } from "../git/exec.js";

/** The temp tracking ref a remote errand ref is fetched into before merging. */
export function incomingErrandRef(ref: string): string {
  return `${ref}__incoming`;
}

/** Outcome of {@link mergeErrandTrees}: a unioned tree, or a same-slug collision. */
export type ErrandTreeMerge =
  | { kind: "merged"; entries: Map<string, string> }
  | { kind: "collision"; slugs: string[] };

/**
 * Merge two per-slug trees. A slug on only one side unions in; a slug on both
 * sides survives once when byte-identical (equal blob sha) and is reported as a
 * collision when divergent.
 *
 * @param local - Local slug → blob-sha entries.
 * @param remote - Remote slug → blob-sha entries.
 * @returns The merged entries, or the colliding slugs (sorted) when any diverge.
 */
export function mergeErrandTrees(
  local: Map<string, string>,
  remote: Map<string, string>,
): ErrandTreeMerge {
  const merged = new Map(local);
  const collisions: string[] = [];
  for (const [slug, remoteSha] of remote) {
    const localSha = local.get(slug);
    if (localSha === undefined) {
      merged.set(slug, remoteSha);
    } else if (localSha !== remoteSha) {
      collisions.push(slug);
    }
    // Equal shas: identical content already present in `merged` (idempotent).
  }
  if (collisions.length > 0) return { kind: "collision", slugs: collisions.sort() };
  return { kind: "merged", entries: merged };
}

/** Discriminated outcome of {@link reconcileErrandPush}. */
export type ErrandPushOutcome =
  | { kind: "pushed" }
  | { kind: "noop" }
  | { kind: "reconciled" }
  | { kind: "conflict"; slugs: string[] }
  | { kind: "no-remote" }
  | { kind: "failed"; error: Error };

/**
 * Push the errand ref, reconciling a concurrent-remote non-fast-forward.
 *
 * A clean push (including the first push that creates an absent remote ref)
 * returns `pushed`. On a non-fast-forward rejection — another machine pushed
 * an errand between this machine's write and push — the remote is fetched,
 * the per-slug trees merged, the result committed onto both tips, and the push
 * retried (`reconciled`). A divergent same-slug entry stops the reconcile and
 * surfaces `conflict`; the local ref is left intact and nothing is pushed.
 *
 * @param io - Injected git seams and identity.
 * @returns The push outcome.
 */
export async function reconcileErrandPush(io: ErrandRecordIO): Promise<ErrandPushOutcome> {
  const ref = errandsRef(io.identity);
  if ((await readRefTip(io.exec, ref)) === null) return { kind: "noop" };

  let reconciledOnce = false;
  for (let attempt = 0; attempt < MAX_RECONCILE_ATTEMPTS; attempt++) {
    try {
      await io.exec("git", ["push", "origin", ref]);
      return reconciledOnce ? { kind: "reconciled" } : { kind: "pushed" };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      if (isRemoteUnavailableError(error.message)) return { kind: "no-remote" };
      if (!isNonFastForwardError(error.message)) return { kind: "failed", error };

      // Keep the outcome single-channel: a fetch/read/commit failure inside the
      // reconcile — including a same-machine CAS rejection in the local-commit leg
      // — must surface as `failed`, not escape this function as a throw.
      let reconcile: ErrandTreeMerge;
      try {
        reconcile = await reconcileTrees(io, ref);
      } catch (reconcileErr) {
        return {
          kind: "failed",
          error: reconcileErr instanceof Error ? reconcileErr : new Error(String(reconcileErr)),
        };
      }
      if (reconcile.kind === "collision") {
        return { kind: "conflict", slugs: reconcile.slugs };
      }
      reconciledOnce = true;
    }
  }
  return { kind: "failed", error: new Error("errand push: exceeded reconcile attempts") };
}

/**
 * Fetch the remote ref, merge it into the local tree, and (when clean) commit
 * the union onto both tips so the next push fast-forwards. Leaves the local ref
 * untouched and returns the collision on a divergent same-slug entry.
 */
async function reconcileTrees(io: ErrandRecordIO, ref: string): Promise<ErrandTreeMerge> {
  const incoming = incomingErrandRef(ref);
  await io.exec("git", ["fetch", "origin", `+${ref}:${incoming}`]);
  try {
    // Resolve both tips first and read each tree at that exact commit, so the merge
    // input and the compare-and-swap base are bound to one snapshot. Reading the
    // local tree by ref name before resolving its tip would let a same-machine
    // writer advance `ref` in between — the CAS would then pass against the fresher
    // tip while committing a merge built on the stale tree, silently dropping the
    // racer's slug.
    const localTip = await readRefTip(io.exec, ref);
    const incomingTip = await readRefTip(io.exec, incoming);
    const local = localTip ? await readErrandReconcileTree(io.exec, localTip) : new Map<string, string>();
    const remote = incomingTip ? await readErrandReconcileTree(io.exec, incomingTip) : new Map<string, string>();
    const result = mergeErrandTrees(local, remote);
    if (result.kind === "collision") return result;

    const parents = [localTip, incomingTip].filter((tip): tip is string => tip !== null);
    await writeTreeCommit(io, result.entries, "merge errand records", parents, localTip);
    return result;
  } finally {
    await deleteRef(io, incoming);
  }
}

/**
 * Read a reconcile input, treating a legitimately absent ref as empty but a genuine
 * read failure as fatal. The fail-open `readTreeEntries` would collapse an errored
 * `ls-tree` to an empty map, so a transient read of `localTip` / `incomingTip` could
 * commit a merge built from an artificially empty side — dropping the other side's
 * slugs under the compare-and-swap bound to `localTip`. Throwing aborts the reconcile,
 * which {@link reconcileErrandPush} surfaces through its single `failed` channel; an
 * absent ref still unions normally as empty. Mirrors the sync-state reconcile reader.
 */
async function readErrandReconcileTree(exec: GitExec, ref: string): Promise<Map<string, string>> {
  const result = await readTreeEntriesDiscriminating(exec, ref);
  if (result.kind === "error") throw result.error;
  return result.kind === "entries" ? result.entries : new Map();
}

/** Best-effort delete of the temp tracking ref; a failed cleanup never masks the outcome. */
async function deleteRef(io: ErrandRecordIO, ref: string): Promise<void> {
  try {
    await io.exec("git", ["update-ref", "-d", ref]);
  } catch {
    // Cleanup is best-effort.
  }
}
