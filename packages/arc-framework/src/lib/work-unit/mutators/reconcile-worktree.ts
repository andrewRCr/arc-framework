/**
 * `reconcile-worktree` — the worktree-axis encoding mutator, including
 * execution-locus relocation.
 *
 * Two operations:
 *
 * - `spawn` — establish the WU's working tree, in one of two **placement modes**:
 *     - *fresh worktree* (default): the decomposition of the shipped
 *       `spawnWorktree` — `git worktree add -b <branch> <base>` at the
 *       `location_template`-resolved path, then the ownership marker. The
 *       fresh-meta write and `runUserOpen` are *not* part of this leg — they are
 *       lifted to `scaffold` and the user-workspace side-effect respectively, so a
 *       graduate (which relocates an existing meta in) is not clobbered by a
 *       template-meta write. Branch creation rides this leg's `-b`.
 *     - *in place* (`--here`): no new worktree — `git checkout [-b] <branch>` in
 *       the **current** worktree (`-b` to cut a fresh branch for graduate /
 *       create-new, plain checkout to re-attach an existing branch for resume). No
 *       ownership marker (ARC did not mint this worktree). This is why branch
 *       creation is `reconcile-worktree`'s in both modes, not `reconcile-branch`'s.
 * - `teardown` — `git worktree remove` (never `--force`; that stays the
 *   rollback-only path), gated on a clean worktree (`isWorktreeClean`). When the
 *   transition is tearing down the very worktree it executes from
 *   (self-teardown), the agent's process locus is hopped to the primary
 *   checkout *first* — otherwise `park@Active` / `abandon` of the current WU
 *   would saw off the branch it stands on.
 *
 * Worktree occupancy / identity is read from `git worktree list`
 * (`resolvePrimaryWorktreePath`), never from `git branch` inference. The git seam
 * and the locus-hop are injected (three-layer architecture); the ownership
 * marker is written through the shared `writeWorktreeOwnershipMarker`.
 *
 * @module
 */

import { isAbsolute, relative, resolve } from "node:path";

import type { GitExec } from "../../git/exec.js";
import { isWorktreeClean } from "../../git/worktree-cleanup.js";
import { writeWorktreeOwnershipMarker } from "../../git/worktree-marker.js";
import { resolveWorktreeLocation } from "../../git/worktree-location.js";
import { resolvePrimaryWorktreePath } from "../../git/worktree-roster.js";

/** Dependencies for {@link reconcileWorktree}. */
export interface ReconcileWorktreeContext {
  /** Git executor — runs `git worktree add` / `remove` / `list` / `status`. */
  exec: GitExec;
  /** Relocate the agent's process locus on a self-teardown. Production binds `process.chdir`. */
  chdir: (dir: string) => void;
}

/**
 * The worktree operation to perform, as a discriminated union:
 *
 * - `spawn` (fresh worktree) — create the worktree + branch at the templated path
 *   and mark it.
 * - `spawn` (`inPlace`) — place the branch in the current worktree via
 *   `git checkout [-b]`; no new worktree, no marker.
 * - `teardown` — remove `worktreePath`; `currentLocus` is the directory the
 *   transition executes from, used to detect a self-teardown.
 */
export type ReconcileWorktreeOp =
  | {
      mutation: "spawn";
      /** Fresh-worktree placement (the default). */
      inPlace?: false;
      /** Full branch to create (e.g. `plan/<name>`). */
      branch: string;
      /** Base ref the branch forks from (local ref; no fetch). */
      base: string;
      /** Resolved `worktree.location_template`. */
      locationTemplate: string;
      /** Main-worktree basename — the `{repo}` expansion. */
      repo: string;
      /** Work-unit name — drives the ownership marker. */
      wuName: string;
      /** Identity creating the worktree — the ownership marker. */
      spawningIdentity: string;
      /** Marker timestamp (epoch millis); injectable for tests. */
      now?: number;
    }
  | {
      mutation: "spawn";
      /** In-place placement: check the branch out in the current worktree, no spawn. */
      inPlace: true;
      /** Branch to place in the current worktree. */
      branch: string;
      /** `true` cuts a fresh branch (`-b`, graduate / create-new); `false` attaches an existing one (resume). */
      createBranch: boolean;
    }
  | {
      mutation: "teardown";
      /** The worktree root to remove. */
      worktreePath: string;
      /** The directory the transition runs from — a self-teardown when inside `worktreePath`. */
      currentLocus: string;
    };

/** Outcome of a {@link reconcileWorktree} call. */
export type ReconcileWorktreeResult =
  | { mutation: "spawn"; worktreePath: string; branch: string }
  | { mutation: "teardown"; worktreePath: string; locusHopped: boolean };

/**
 * Whether `locus` sits inside (or at) `worktreePath` — the self-teardown test.
 * A non-`..`, non-absolute relative path means `locus` is contained.
 */
function isSelfTeardown(worktreePath: string, locus: string): boolean {
  const rel = relative(resolve(worktreePath), resolve(locus));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/**
 * Spawn or tear down a work unit's worktree per `op`.
 *
 * Spawn (fresh) creates the worktree + branch and writes the ownership marker;
 * spawn (`inPlace`) checks the branch out in the current worktree, no marker;
 * teardown refuses a dirty worktree, hops the locus to the primary checkout when
 * removing the worktree it runs from, and removes without `--force`.
 *
 * @param ctx - Injected git seam + locus-hop.
 * @param op - The worktree mutation and its operands.
 * @returns The spawn path/branch, or the teardown path and whether the locus hopped.
 * @throws When a teardown targets a dirty worktree.
 */
export async function reconcileWorktree(
  ctx: ReconcileWorktreeContext,
  op: ReconcileWorktreeOp,
): Promise<ReconcileWorktreeResult> {
  if (op.mutation === "spawn" && op.inPlace) {
    // In place: cut/attach the branch in the current worktree — no `worktree add`,
    // no ownership marker (ARC did not mint this checkout).
    const checkout = op.createBranch ? ["checkout", "-b", op.branch] : ["checkout", op.branch];
    await ctx.exec("git", checkout);
    const { stdout } = await ctx.exec("git", ["rev-parse", "--show-toplevel"]);
    return { mutation: "spawn", worktreePath: stdout.trim(), branch: op.branch };
  }

  if (op.mutation === "spawn") {
    const worktreePath = resolveWorktreeLocation({
      template: op.locationTemplate,
      repo: op.repo,
      branch: op.branch,
    });
    await ctx.exec("git", ["worktree", "add", worktreePath, "-b", op.branch, op.base]);
    await writeWorktreeOwnershipMarker(worktreePath, {
      createdByArc: true,
      wuName: op.wuName,
      spawningIdentity: op.spawningIdentity,
      now: op.now,
    });
    return { mutation: "spawn", worktreePath, branch: op.branch };
  }

  const { worktreePath, currentLocus } = op;
  if (!(await isWorktreeClean({ exec: ctx.exec, cwd: worktreePath }))) {
    throw new Error(`refusing to tear down a dirty worktree: ${worktreePath}`);
  }

  let locusHopped = false;
  if (isSelfTeardown(worktreePath, currentLocus)) {
    const primary = await resolvePrimaryWorktreePath(ctx.exec);
    if (primary === null) {
      throw new Error(`cannot resolve the primary worktree to hop to before self-teardown of ${worktreePath}`);
    }
    ctx.chdir(primary);
    locusHopped = true;
  }

  await ctx.exec("git", ["worktree", "remove", worktreePath]);
  return { mutation: "teardown", worktreePath, locusHopped };
}
