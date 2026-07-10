/**
 * `closeErrand` — the composed core of `arc errand close`.
 *
 * Closes a full-protection errand by reaping its branch, removing the identity
 * record, and pushing the removal. The reap is **containment-safe**: the local
 * branch is deleted only when its commits are provably preserved — contained in
 * its remote upstream (`<remote>/<branch>`, i.e. pushed) or in `base` (i.e.
 * merged). An unsafe branch is refused with the record left intact, so an
 * abandoned errand stays recoverable rather than orphaning its intent.
 *
 * The reap is **atomic with the record removal**: safety is checked first, so a
 * refusal never removes the record. The close owns the **remote-head cleanup**
 * (host delete-on-merge is tolerated, never relied on): the remote branch is
 * deleted when the landed-in-base proof holds over the head's own tip — strictly
 * stronger than the reap gate, because when only upstream containment proved the
 * reap (pushed but not provably merged, e.g. a multi-commit squash or a
 * not-yet-merged PR) the remote head IS the preservation and is kept; proving
 * the remote tip rather than the local one also protects a head pushed ahead
 * from another clone. Stale remote-tracking refs are pruned,
 * and the local `base` is fast-forwarded to the freshly-fetched remote base so
 * the primary lands current after the merge rather than on a stale base. The
 * inbox drop is the caller's composition (file I/O over the gitignored inbox,
 * keyed by the record's origin back-pointer) and lands only on a successful close.
 *
 * The git seams and identity are injected (three-layer architecture).
 *
 * @module
 */

import { reconcileErrandPush, type ErrandPushOutcome } from "./merge.js";
import { readErrandRecord, removeErrandRecord, type ErrandRecord } from "./record.js";
import type { ErrandRecordIO } from "./ref-tree.js";
import { assessReapSafety, isLandedInBase } from "../git/branch-containment.js";
import type { GitExec } from "../git/exec.js";
import { refreshBase } from "../git/refresh-base.js";
import { fetchPrune } from "../work-unit/mutators/fetch-prune.js";
import { deleteRemoteBranch } from "../work-unit/mutators/reconcile-branch.js";

/** The default remote whose upstream containment proves preservation. */
const DEFAULT_REMOTE = "origin";

/** Operands for {@link closeErrand}. */
export interface CloseErrandParams {
  /** The errand slug — its logical identity and the record's tree key. */
  slug: string;
  /** The base branch; a branch whose commits are contained here is merged. */
  base: string;
  /** The remote whose upstream containment proves preservation; defaults to `origin`. */
  remote?: string;
  /**
   * Bypass the containment safety check — the deliberate "I've verified it
   * shipped, or I'm abandoning it" override. Covers the narrow case the safe
   * path can't prove (a squash-merge whose remote-tracking ref was pruned).
   */
  force?: boolean;
}

/**
 * Outcome of the remote-head cleanup leg of a close.
 *
 * - `deleted` — the live head's tip provably landed in base and was deleted.
 * - `absent` — no live head after a prune-fetch (never pushed, or host
 *   delete-on-merge got there first); nothing to clean, the no-op.
 * - `kept` — the head's tip could not be proven landed — it may be the only
 *   preservation of the work — or it moved since it was proven (the leased
 *   delete refused), or the remote was unreachable; deliberately left intact.
 * - `failed` — landing was proven but the delete failed (auth, connectivity);
 *   best-effort degrade, the completed local close stands.
 */
export type RemoteHeadCleanup =
  | { kind: "deleted" }
  | { kind: "absent" }
  | { kind: "kept" }
  | { kind: "failed"; detail: string };

/** Outcome of {@link closeErrand}. */
export type CloseErrandResult =
  | {
    kind: "closed";
    record: ErrandRecord;
    branchReaped: boolean;
    remoteHead: RemoteHeadCleanup;
    push: ErrandPushOutcome;
  }
  | { kind: "no-record"; slug: string }
  | { kind: "unsafe-reap"; record: ErrandRecord; reason: string };

/**
 * Close an errand: reap its branch (containment-safe), remove the record, and
 * push the removal.
 *
 * Resolves the record by slug — an absent record is `no-record` (nothing to
 * close). Unless `force` is set, when the branch's commits are not provably
 * preserved it returns `unsafe-reap` without removing the record. Otherwise
 * fetches the authoritative remote base (so containment and the base fast-forward
 * evaluate against the post-merge remote), hops off the branch if occupied,
 * force-deletes it, deletes the remote head when the landed-in-base proof holds
 * (kept otherwise — it may be the only preservation), prunes stale
 * remote-tracking refs, fast-forwards local `base`, removes the record, and
 * pushes the removal.
 *
 * @param io - Injected git seams and identity.
 * @param params - The errand slug, base, remote, and force override.
 * @returns The close outcome — closed, no-record, or unsafe-reap.
 */
export async function closeErrand(
  io: ErrandRecordIO,
  params: CloseErrandParams,
): Promise<CloseErrandResult> {
  const slug = params.slug.trim();
  if (slug === "") throw new Error("closeErrand: slug must be non-empty");
  const remote = params.remote ?? DEFAULT_REMOTE;

  const record = await readErrandRecord(io, slug);
  if (record === null) return { kind: "no-record", slug };

  // Fetch the authoritative remote base before the containment check and the base
  // fast-forward. Right after a remote merge the local `base` is typically stale
  // (the merge landed on `<remote>/<base>`, not yet pulled), so a merged-into-base
  // containment check against the local ref false-negatives a merged branch.
  // Best-effort — offline / no-remote degrades to the local `base`.
  const baseRef = await refreshBase(io.exec, params.base, remote);

  const current = await currentBranch(io.exec);
  const branchPresent = await localBranchExists(io.exec, record.branch);
  let switchedToBase = false;
  // Hop off a dangling HEAD (the branch ref was deleted out from under us) only on
  // the force path — the non-force `!branchPresent` arm below returns `unsafe-reap`
  // without reaping, so it must not mutate HEAD (nor risk throwing on a conflicting
  // checkout) on a rejected close.
  if (params.force === true && !branchPresent && current === record.branch) {
    await io.exec("git", ["switch", params.base]);
    switchedToBase = true;
  }

  if (params.force !== true) {
    if (!branchPresent) {
      return {
        kind: "unsafe-reap",
        record,
        reason: `'${record.branch}' is already absent locally — re-run with --force if you've verified it shipped`,
      };
    }
    // Containment is a union: the branch is preserved if it landed in the local
    // `base` (a local merge) OR in the freshly-fetched remote base (the common
    // state right after a remote merge, when the local `base` is still stale).
    // Check local first, then the remote base only when it differs, so neither a
    // locally-merged branch nor a remote-merged-but-locally-stale one false-negatives.
    let safety = await assessReapSafety(io.exec, { branch: record.branch, base: params.base, remote });
    if (!safety.safe && baseRef !== params.base) {
      safety = await assessReapSafety(io.exec, { branch: record.branch, base: baseRef, remote });
    }
    if (!safety.safe) return { kind: "unsafe-reap", record, reason: safety.reason };
  }

  if (branchPresent) {
    // Hop off the branch before deleting it — `git branch -D` refuses the current branch.
    if (current === record.branch) {
      await io.exec("git", ["switch", params.base]);
      switchedToBase = true;
    }
    // Containment is proven, so force-delete: `-d` re-checks base-reachability,
    // which false-negatives under squash / rebase merges.
    await io.exec("git", ["branch", "-D", record.branch]);
  }

  // Prune ahead of the remote-head leg: after a prune-fetch the remote-tracking
  // refs mirror the live remote heads, so the branch-absent arm below can tell
  // "head still live" from "nothing left to clean". Best-effort: a prune failure
  // (offline) does not undo the completed reap. The delete leg cleans up its own
  // tracking ref (`git push --delete` drops both), so nothing goes stale here.
  let pruned = false;
  try {
    await fetchPrune({ exec: io.exec }, { remote });
    pruned = true;
  } catch {
    // Offline / no remote — nothing to prune.
  }

  // Remote-head cleanup — the close owns it (host delete-on-merge covers this on
  // remotes configured for it; a plain merge leaves the head to linger). The
  // landed-in-base proof is computed over the POST-PRUNE remote-tracking ref: the
  // remote tip is what the delete discards, so the proof must cover it, not the
  // local tip — a head pushed ahead from another clone carries commits a
  // local-tip proof never saw. Checked against the local base first, then the
  // refreshed remote base — the same union as the reap gate. Best-effort like
  // the prune leg: failures degrade to a reported outcome rather than undoing
  // the completed local reap.
  let remoteHead: RemoteHeadCleanup;
  const trackingOid = await resolveRemoteTrackingOid(io.exec, remote, record.branch);
  if (trackingOid !== null) {
    // Bind the proof and the delete to one snapshot: landing is proven over the
    // resolved OID and the delete is leased on that same OID, so a head advanced
    // by a concurrent push after the proof is refused by the lease (→ kept)
    // rather than deleted unproven.
    const landed = (await isLandedInBase(io.exec, trackingOid, params.base))
      || (baseRef !== params.base && (await isLandedInBase(io.exec, trackingOid, baseRef)));
    remoteHead = landed
      ? await removeRemoteHead(io.exec, remote, record.branch, trackingOid)
      : { kind: "kept" };
  } else {
    // No tracking ref. After a successful prune-fetch that is authoritative —
    // nothing is left to clean; without one the remote is unreachable and its
    // state unknown, so stay conservative.
    remoteHead = pruned ? { kind: "absent" } : { kind: "kept" };
  }

  // Land the developer on a current base: fast-forward local `base` to the
  // refreshed remote base after hopping off the errand branch (best-effort; a
  // non-ff local base or unresolved remote base is left as-is). Skipped when the
  // remote base did not resolve (`baseRef === params.base`) or we never hopped.
  if (switchedToBase && baseRef !== params.base) {
    try {
      await io.exec("git", ["merge", "--ff-only", baseRef]);
    } catch {
      // Local base ahead / unavailable — leave it as-is.
    }
  }

  await removeErrandRecord(io, slug);
  const push = await reconcileErrandPush(io);

  return { kind: "closed", record, branchReaped: branchPresent, remoteHead, push };
}

/** The current branch name, including a symbolic HEAD whose branch ref was deleted. */
async function currentBranch(exec: GitExec): Promise<string> {
  try {
    const { stdout } = await exec("git", ["symbolic-ref", "--quiet", "--short", "HEAD"]);
    return stdout.trim();
  } catch {
    // Detached HEAD: preserve the previous `rev-parse` behavior, which returns `HEAD`.
  }
  const { stdout } = await exec("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
  return stdout.trim();
}

/** Whether a local branch ref exists. */
async function localBranchExists(exec: GitExec, branch: string): Promise<boolean> {
  try {
    await exec("git", ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]);
    return true;
  } catch (err) {
    const code = (err as { code?: unknown }).code;
    if (code === 1) return false;
    throw err;
  }
}

/** The remote-tracking ref's OID for `branch` on `remote`, or `null` when absent. */
async function resolveRemoteTrackingOid(
  exec: GitExec,
  remote: string,
  branch: string,
): Promise<string | null> {
  try {
    const { stdout } = await exec(
      "git",
      ["rev-parse", "--verify", "--quiet", `refs/remotes/${remote}/${branch}`],
    );
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Delete the remote head with the proof-bound lease, mapping the outcome — a
 * stale lease (the head moved since it was proven) maps to `kept`, and a push
 * failure degrades to `failed`.
 */
async function removeRemoteHead(
  exec: GitExec,
  remote: string,
  branch: string,
  expectedOid: string,
): Promise<RemoteHeadCleanup> {
  try {
    const outcome = await deleteRemoteBranch(exec, remote, branch, expectedOid);
    return outcome === "stale" ? { kind: "kept" } : { kind: outcome };
  } catch (err) {
    const detail =
      (err as { stderr?: string }).stderr || (err instanceof Error ? err.message : String(err));
    return { kind: "failed", detail: detail.trim() };
  }
}
