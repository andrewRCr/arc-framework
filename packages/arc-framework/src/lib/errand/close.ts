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
 * refusal never removes the record. The remote branch is never deleted (the PR
 * merge owns that); only the stale local remote-tracking ref is pruned. The
 * slug-matched inbox drop is the caller's composition (file I/O over the
 * gitignored inbox) and lands only on a successful close.
 *
 * The git seams and identity are injected (three-layer architecture).
 *
 * @module
 */

import { reconcileErrandPush, type ErrandPushOutcome } from "./merge.js";
import { readErrandRecord, removeErrandRecord, type ErrandRecord } from "./record.js";
import type { ErrandRecordIO } from "./ref-tree.js";
import type { GitExec } from "../git/exec.js";

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

/** Outcome of {@link closeErrand}. */
export type CloseErrandResult =
  | { kind: "closed"; record: ErrandRecord; branchReaped: boolean; push: ErrandPushOutcome }
  | { kind: "no-record"; slug: string }
  | { kind: "unsafe-reap"; record: ErrandRecord; reason: string };

/**
 * Close an errand: reap its branch (containment-safe), remove the record, and
 * push the removal.
 *
 * Resolves the record by slug — an absent record is `no-record` (nothing to
 * close). Unless `force` is set, when the branch's commits are not provably
 * preserved it returns `unsafe-reap` without removing the record. Otherwise hops
 * off the branch if occupied, force-deletes it, prunes the stale remote-tracking
 * ref, removes the record, and pushes the removal.
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

  if (params.force !== true) {
    const safety = await assessReapSafety(io.exec, record.branch, params.base, remote);
    if (!safety.safe) return { kind: "unsafe-reap", record, reason: safety.reason };
  }

  // Hop off the branch before deleting it — `git branch -D` refuses the current branch.
  if ((await currentBranch(io.exec)) === record.branch) {
    await io.exec("git", ["switch", params.base]);
  }
  // Containment is proven, so force-delete: `-d` re-checks base-reachability,
  // which false-negatives under squash / rebase merges.
  await io.exec("git", ["branch", "-D", record.branch]);
  // Prune the now-stale remote-tracking ref, best-effort — absent when the
  // branch was never pushed (the merged-into-base safe path).
  try {
    await io.exec("git", ["update-ref", "-d", `refs/remotes/${remote}/${record.branch}`]);
  } catch {
    // No tracking ref to prune.
  }

  await removeErrandRecord(io, slug);
  const push = await reconcileErrandPush(io);

  return { kind: "closed", record, branchReaped: true, push };
}

/** Result of the containment-safety assessment. */
interface ReapSafety {
  safe: boolean;
  reason: string;
}

/**
 * Whether `branch` is safe to delete — its commits are provably preserved.
 *
 * Safe when the branch is contained in its remote upstream (pushed, so the
 * commits live on the remote) or in `base` (merged, so they live there). Both
 * cover squash / rebase / merge-commit strategies. Unsafe only when neither
 * holds — an unpushed, unmerged branch, or a squash-merge whose remote branch
 * was already deleted (commits preserved under no name git can check).
 */
async function assessReapSafety(
  exec: GitExec,
  branch: string,
  base: string,
  remote: string,
): Promise<ReapSafety> {
  const upstream = `${remote}/${branch}`;
  let upstreamExists = false;
  try {
    await exec("git", ["rev-parse", "--verify", "--quiet", upstream]);
    upstreamExists = true;
  } catch {
    // No upstream — fall through to the base-containment check.
  }
  if (upstreamExists && (await isContainedIn(exec, branch, upstream))) {
    return { safe: true, reason: "" };
  }
  if (await isContainedIn(exec, branch, base)) {
    return { safe: true, reason: "" };
  }
  return {
    safe: false,
    reason: upstreamExists
      ? `'${branch}' has commits not on its upstream or in '${base}'`
      : `'${branch}' is unmerged (not in '${base}') and unpushed — push or merge it first, or remove it manually`,
  };
}

/** Whether every commit on `branch` is reachable from `container` (empty ahead-set). */
async function isContainedIn(exec: GitExec, branch: string, container: string): Promise<boolean> {
  const { stdout } = await exec("git", ["rev-list", branch, `^${container}`]);
  return stdout.trim() === "";
}

/** The current branch name (`git rev-parse --abbrev-ref HEAD`). */
async function currentBranch(exec: GitExec): Promise<string> {
  const { stdout } = await exec("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
  return stdout.trim();
}
