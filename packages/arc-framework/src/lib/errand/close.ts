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
import { assessReapSafety } from "../git/branch-containment.js";
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

  const current = await currentBranch(io.exec);
  const branchPresent = await localBranchExists(io.exec, record.branch);
  if (!branchPresent && current === record.branch) {
    await io.exec("git", ["switch", params.base]);
  }

  if (params.force !== true) {
    if (!branchPresent) {
      return {
        kind: "unsafe-reap",
        record,
        reason: `'${record.branch}' is already absent locally — re-run with --force if you've verified it shipped`,
      };
    }
    const safety = await assessReapSafety(io.exec, { branch: record.branch, base: params.base, remote });
    if (!safety.safe) return { kind: "unsafe-reap", record, reason: safety.reason };
  }

  if (branchPresent) {
    // Hop off the branch before deleting it — `git branch -D` refuses the current branch.
    if (current === record.branch) {
      await io.exec("git", ["switch", params.base]);
    }
    // Containment is proven, so force-delete: `-d` re-checks base-reachability,
    // which false-negatives under squash / rebase merges.
    await io.exec("git", ["branch", "-D", record.branch]);
  }
  // Prune the now-stale remote-tracking ref, best-effort — absent when the
  // branch was never pushed (the merged-into-base safe path).
  try {
    await io.exec("git", ["update-ref", "-d", `refs/remotes/${remote}/${record.branch}`]);
  } catch {
    // No tracking ref to prune.
  }

  await removeErrandRecord(io, slug);
  const push = await reconcileErrandPush(io);

  return { kind: "closed", record, branchReaped: branchPresent, push };
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
