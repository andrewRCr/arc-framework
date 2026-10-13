/**
 * The per-slug tree-merge for the errand orphan state-ref and the push that
 * reconciles around a concurrent remote.
 *
 * The ref holds independent per-slug blobs, so two machines that each create an
 * errand diverge cleanly. The merge compares each blob against the common
 * ancestor, retaining independent updates and deletions. Byte-identical changes
 * are idempotent; divergent changes to the same slug are surfaced as collisions.
 *
 * Unlike `git notes merge`, an orphan state-ref inherits no built-in union, so
 * the reconcile is realized explicitly: on a non-fast-forward push, fetch the
 * remote into a temp ref, merge the trees, commit the result onto *both* tips
 * (so the follow-up push fast-forwards), and retry.
 *
 * @module
 */

import {
  isNonFastForwardError,
  isRemoteUnavailableError,
  MAX_RECONCILE_ATTEMPTS,
  uniqueRefToken,
  readTreeEntriesStrict,
} from "../git/ref-tree.js";
import { gitFailureText, isCompletedGitFailure, normalizeGitRejection } from "../git/process-error.js";
import { classifyPublicationFailure, type RemotePublicationFailure } from "../git/publication-failure.js";
import {
  errandsRef,
  writeTreeCommit,
  type ErrandRecordIO,
} from "./ref-tree.js";
import type { GitExec } from "../git/exec.js";
import { isGitObjectId } from "../git/object-id.js";
import { reconcileIdentityObjects } from "./identity-object-reconcile.js";

/** The temp tracking ref a remote errand ref is fetched into before merging. */
export function incomingErrandRef(ref: string): string {
  return `${ref}__incoming`;
}

/** Outcome of {@link mergeErrandTrees}: a unioned tree, or a same-slug collision. */
export type ErrandTreeMerge =
  | { kind: "merged"; entries: Map<string, string> }
  | { kind: "collision"; slugs: string[] };

/**
 * Reconcile per-slug trees against their common-history entries.
 *
 * @param local - Tip-pinned local slug to blob-OID entries.
 * @param remote - Tip-pinned remote slug to blob-OID entries.
 * @param base - Common-history entries, or an empty map for unrelated histories.
 * @returns Independent changes, or sorted slugs changed divergently on both sides.
 */
export function mergeErrandTrees(
  local: ReadonlyMap<string, string>,
  remote: ReadonlyMap<string, string>,
  base: ReadonlyMap<string, string>,
): ErrandTreeMerge {
  const result = reconcileIdentityObjects(base, local, remote);
  return result.kind === "conflict"
    ? { kind: "collision", slugs: result.keys }
    : { kind: "merged", entries: result.objects };
}

/** Discriminated outcome of {@link reconcileErrandPush}. */
export type ErrandPushOutcome =
  | { kind: "pushed" }
  | { kind: "noop" }
  | { kind: "reconciled" }
  | { kind: "conflict"; slugs: string[] }
  | { kind: "no-remote"; error?: Error; remoteFailure?: RemotePublicationFailure }
  | { kind: "failed"; error: Error; remoteFailure?: RemotePublicationFailure };

class RemoteReconcileError extends Error {
  constructor(readonly original: Error, readonly remoteFailure: RemotePublicationFailure | undefined) { super(original.message); }
}

/**
 * Push the errand ref, reconciling a concurrent-remote non-fast-forward.
 *
 * A clean push (including the first push that creates an absent remote ref)
 * returns `pushed`. On a non-fast-forward rejection — another machine pushed
 * an errand between this machine's write and push — the remote is fetched,
 * the per-slug trees merged, the result committed onto both tips, and the push
 * retried (`reconciled`). Divergent changes to the same slug on both sides stop
 * the reconcile and surface `conflict`; the local ref is left intact and nothing
 * is pushed.
 *
 * @param io - Injected git seams and identity.
 * @returns The push outcome.
 */
export async function reconcileErrandPush(io: ErrandRecordIO): Promise<ErrandPushOutcome> {
  const ref = errandsRef(io.identity);
  try { if ((await readMutatingTip(io.exec, ref)) === null) return { kind: "noop" }; }
  catch (error) { return { kind: "failed", error: error instanceof Error ? error : new Error(String(error), { cause: error }) }; }

  let reconciledOnce = false;
  // Up to MAX_RECONCILE_ATTEMPTS reconciles, each followed by a retry push — so the
  // bound is one more push than reconcile (the final iteration pushes the last
  // reconciled tip and is never itself followed by another reconcile).
  for (let attempt = 0; attempt <= MAX_RECONCILE_ATTEMPTS; attempt++) {
    try {
      await io.exec("git", ["push", "origin", ref]);
      return reconciledOnce ? { kind: "reconciled" } : { kind: "pushed" };
    } catch (err) {
      const failure = terminalPushFailure(err, attempt);
      if (failure !== undefined) return failure;

      // Keep the outcome single-channel: a fetch/read/commit failure inside the
      // reconcile — including a same-machine CAS rejection in the local-commit leg
      // — must surface as `failed`, not escape this function as a throw.
      let reconcile: ErrandTreeMerge;
      try {
        reconcile = await reconcileTrees(io, ref);
      } catch (reconcileErr) {
        if (reconcileErr instanceof RemoteReconcileError) return { kind: "failed", error: reconcileErr.original, remoteFailure: reconcileErr.remoteFailure };
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

function terminalPushFailure(error: unknown, attempt: number): ErrandPushOutcome | undefined {
  const original = error instanceof Error ? error : new Error(String(error));
  const remoteFailure = classifyPublicationFailure(error);
  if (!isCompletedGitFailure(error)) return { kind: "failed", error: original, remoteFailure };
  const detail = gitFailureText(error);
  if (isRemoteUnavailableError(detail)) return { kind: "no-remote", error: original, remoteFailure };
  if (!isNonFastForwardError(detail)) return { kind: "failed", error: original, remoteFailure };
  if (attempt !== MAX_RECONCILE_ATTEMPTS) return undefined;
  return { kind: "failed", error: new Error("errand push: exceeded reconcile attempts"),
    remoteFailure: classifyPublicationFailure(error, attempt + 1) };
}

/**
 * Fetch the remote ref, merge it into the local tree, and (when clean) commit
 * the union onto both tips so the next push fast-forwards. Leaves the local ref
 * untouched and returns a collision when both sides changed the same slug differently.
 */
async function reconcileTrees(io: ErrandRecordIO, ref: string): Promise<ErrandTreeMerge> {
  // Per-reconcile-unique tracking ref: a shared identity-scoped one lets a concurrent
  // same-machine reconcile's cleanup delete it before this one resolves incomingTip,
  // which would then read the remote side as empty and CAS-write a narrowed tree.
  const incoming = `${incomingErrandRef(ref)}__${uniqueRefToken()}`;
  try { await io.exec("git", ["fetch", "origin", `+${ref}:${incoming}`]); }
  catch (error) { throw new RemoteReconcileError(error instanceof Error ? error : new Error(String(error)), classifyPublicationFailure(error)); }
  try {
    // Resolve both tips first and read each tree at that exact commit, so the merge
    // input and the compare-and-swap base are bound to one snapshot. Reading the
    // local tree by ref name before resolving its tip would let a same-machine
    // writer advance `ref` in between — the CAS would then pass against the fresher
    // tip while committing a merge built on the stale tree, silently dropping the
    // racer's slug.
    const localTip = await readMutatingTip(io.exec, ref);
    const incomingTip = await readMutatingTip(io.exec, incoming);
    const local = localTip ? await readErrandReconcileTree(io.exec, localTip) : new Map<string, string>();
    const remote = incomingTip ? await readErrandReconcileTree(io.exec, incomingTip) : new Map<string, string>();
    const base = await readCommonErrandTree(io.exec, localTip, incomingTip);
    const result = mergeErrandTrees(local, remote, base);
    if (result.kind === "collision") return result;

    const parents = [localTip, incomingTip].filter((tip): tip is string => tip !== null);
    await writeTreeCommit(io, result.entries, "merge errand records", parents, localTip);
    return result;
  } finally {
    await deleteRef(io, incoming);
  }
}

/** Read the sole common-history tree; ambiguous or unavailable evidence never becomes an authoritative basis. */
async function readCommonErrandTree(
  exec: GitExec,
  localTip: string | null,
  remoteTip: string | null,
): Promise<Map<string, string>> {
  if (localTip === null || remoteTip === null) return new Map();
  const args = ["merge-base", "--all", localTip, remoteTip];
  let commonTips: string[];
  try {
    commonTips = (await exec("git", args)).stdout.trim().split(/\r?\n/u);
  } catch (error) {
    const failure = normalizeGitRejection(error, { command: "git", args });
    if (isCompletedGitFailure(failure) && failure.exitCode === 1) {
      await requireCompleteErrandHistory(exec);
      return new Map();
    }
    throw error;
  }
  const [commonTip, ...otherTips] = commonTips;
  if (commonTip === undefined || !isGitObjectId(commonTip) || otherTips.some((tip) => !isGitObjectId(tip))) {
    throw new Error("Git merge-base returned a malformed common-ancestor object id");
  }
  if (otherTips.length > 0) {
    throw new Error("Errand histories have multiple best common ancestors. "
      + "Reconcile these histories to one shared basis before retrying arc sync.");
  }
  return readErrandReconcileTree(exec, commonTip);
}

/** A missing ancestor proves unrelated histories only when Git's history is complete and readable. */
async function requireCompleteErrandHistory(exec: GitExec): Promise<void> {
  const shallow = (await exec("git", ["rev-parse", "--is-shallow-repository"])).stdout.trim();
  if (shallow === "true") {
    throw new Error("Errand reconciliation cannot establish a common ancestor from shallow history. "
      + "Fetch complete Errand history before retrying arc sync.");
  }
  if (shallow !== "false") throw new Error("Git returned a malformed shallow-history status");
}

async function readMutatingTip(exec: GitExec, ref: string): Promise<string | null> {
  const args = ["rev-parse", "--verify", "--quiet", ref];
  try { return (await exec("git", args)).stdout.trim() || null; }
  catch (error) {
    const failure = normalizeGitRejection(error, { command: "git", args });
    if (failure.kind === "nonzero-exit" && failure.exitCode === 1 && failure.signal === undefined) return null;
    throw error;
  }
}

/** Enumerate a captured non-null commit; any failed observation aborts reconciliation. */
async function readErrandReconcileTree(exec: GitExec, ref: string): Promise<Map<string, string>> {
  return readTreeEntriesStrict(exec, ref);
}

/** Best-effort delete of the temp tracking ref; a failed cleanup never masks the outcome. */
async function deleteRef(io: ErrandRecordIO, ref: string): Promise<void> {
  try {
    await io.exec("git", ["update-ref", "-d", ref]);
  } catch {
    // Cleanup is best-effort.
  }
}
