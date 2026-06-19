/**
 * `fetch-prune` — the remote-tracking-ref cleanup teardown leg.
 *
 * A delete-on-merge removes the branch on the remote but leaves the stale
 * `<remote>/<branch>` remote-tracking ref lingering in the local ref namespace.
 * This leg runs `git fetch --prune <remote>` to drop every tracking ref whose
 * upstream no longer exists — the deterministic post-merge cleanup the teardown
 * verb composes after the branch delete.
 *
 * A reusable leg (alongside the merged-safe `reconcile-branch` delete) that both
 * `arc teardown` and the future `arc errand close` compose. The git seam is
 * injected (three-layer mutator architecture); the leg is a thin pass-through with
 * no branching logic, so its error policy is the composing verb's to decide.
 *
 * @module
 */

import type { GitExec } from "../../git/exec.js";

/** The default remote whose stale tracking refs are pruned. */
const DEFAULT_REMOTE = "origin";

/** Dependencies for {@link fetchPrune}. */
export interface FetchPruneContext {
  /** Git executor — runs `git fetch --prune`. */
  exec: GitExec;
}

/** Operands for {@link fetchPrune}. */
export interface FetchPruneOp {
  /** The remote whose stale tracking refs to prune (default `origin`). */
  remote?: string;
}

/**
 * Prune the remote's stale tracking refs via `git fetch --prune <remote>`.
 *
 * @param ctx - Injected git seam.
 * @param op - Optional operands (the remote to prune; defaults to `origin`).
 */
export async function fetchPrune(ctx: FetchPruneContext, op: FetchPruneOp = {}): Promise<void> {
  await ctx.exec("git", ["fetch", "--prune", op.remote ?? DEFAULT_REMOTE]);
}
