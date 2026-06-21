/**
 * Branch-containment oracle — "is this branch's work provably preserved, so
 * deleting the local branch loses nothing?"
 *
 * The single git-native safety check the branch-reap sites share: `arc errand
 * close` and the post-merge `teardown` verb (via `reconcile-branch`'s
 * merged-safe delete). A branch is safe to reap when its commits are contained
 * in its remote upstream (pushed — the work lives on the remote) or have landed
 * in `base` (merged — the work lives there).
 *
 * The base check is **merge-strategy-independent** via {@link isLandedInBase}
 * (`git cherry`, patch identity), so it holds even when the remote-tracking ref
 * is gone — the auto-delete-on-merge / pruning-pull case where a reachability or
 * upstream-only check false-negatives a fully-merged branch. The one residual it
 * cannot prove is a *multi-commit squash* (N patch-ids collapsed into one); that
 * needs `--force` or a platform PR-state signal.
 *
 * The git seam is injected (three-layer architecture).
 *
 * @module
 */

import type { GitExec } from "./exec.js";

/** The default remote whose upstream containment proves preservation. */
const DEFAULT_REMOTE = "origin";

/** Result of a reap-safety assessment. */
export interface ReapSafety {
  /** Whether the branch's commits are provably preserved (safe to delete). */
  safe: boolean;
  /** Human-readable reason when `safe` is false; empty when safe. */
  reason: string;
}

/** Operands for {@link assessReapSafety}. */
export interface AssessReapSafetyParams {
  /** The local branch tested for reap safety. */
  branch: string;
  /** The base branch a merged branch's commits have landed in. */
  base: string;
  /** The remote whose upstream containment proves preservation; defaults to `origin`. */
  remote?: string;
}

/**
 * Whether every commit on `ref` is reachable from `container` — an empty
 * ahead-set (`git rev-list ref ^container`). Exact-tip reachability: the right
 * test for the *pushed* (upstream) case, where the local tip must be preserved
 * verbatim on the remote. Any exec failure reads as not-contained (the safe
 * default).
 *
 * @param exec - Injected git executor.
 * @param ref - The branch (or commit) tested.
 * @param container - The ref it must be contained in (e.g. `origin/<branch>`).
 * @returns Whether `ref` is fully contained in `container`.
 */
export async function isContainedIn(exec: GitExec, ref: string, container: string): Promise<boolean> {
  try {
    const { stdout } = await exec("git", ["rev-list", ref, `^${container}`]);
    return stdout.trim() === "";
  } catch {
    return false;
  }
}

/**
 * Whether every commit on `branch` has landed in `base` by patch identity, via
 * `git cherry <base> <branch>`. Each output line is `+ <sha>` (a commit with no
 * patch-equivalent in `base` — unmerged) or `- <sha>` (an equivalent is already
 * there). No `+` line → every commit landed.
 *
 * This subsumes ancestry (merge-commit / fast-forward — the commits are literally
 * in `base`) and additionally catches rebase and single-commit squash (the SHA
 * differs but the patch matches). A *multi-commit* squash collapses N commits'
 * patch-ids into one, so its members cannot be matched here — that residual needs
 * `--force` or a platform PR-state signal. Any exec failure reads as not-landed
 * (the safe default).
 *
 * @param exec - Injected git executor.
 * @param branch - The branch tested for having landed.
 * @param base - The integration base its commits should have landed in.
 * @returns Whether every commit on `branch` is patch-present in `base`.
 */
export async function isLandedInBase(exec: GitExec, branch: string, base: string): Promise<boolean> {
  try {
    const { stdout } = await exec("git", ["cherry", base, branch]);
    return stdout.split("\n").every((line) => !line.startsWith("+"));
  } catch {
    return false;
  }
}

/**
 * Whether `branch` is safe to reap — its commits are provably preserved, so a
 * local delete loses nothing.
 *
 * Safe when the branch is contained in its remote upstream (`<remote>/<branch>`,
 * pushed) or has landed in `base` (merged, by any provable strategy). Unsafe
 * only when neither holds — an unpushed, unmerged branch, or a multi-commit
 * squash whose remote ref was already pruned (preserved under no name git can
 * check). The upstream leg uses exact reachability; the base leg uses patch
 * identity, so a pruned remote-tracking ref never false-negatives a merge.
 *
 * @param exec - Injected git executor.
 * @param params - The branch, base, and optional remote.
 * @returns The safety verdict and, when unsafe, a reason.
 */
export async function assessReapSafety(exec: GitExec, params: AssessReapSafetyParams): Promise<ReapSafety> {
  const { branch, base } = params;
  const remote = params.remote ?? DEFAULT_REMOTE;
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
  if (await isLandedInBase(exec, branch, base)) {
    return { safe: true, reason: "" };
  }
  return {
    safe: false,
    reason: upstreamExists
      ? `'${branch}' has commits not on its upstream or landed in '${base}'`
      : `'${branch}' is unmerged (not landed in '${base}') and unpushed — push or merge it first, or remove it manually`,
  };
}
