/**
 * Spawn scaffolding primitive — creates a new worktree (branch + worktree),
 * then scaffolds the managed meta, the per-WU SESSION-NOTES seed, and the
 * ownership marker into the new worktree's root.
 *
 * The git/fs mechanics live here (testable) rather than in agent workflow
 * bash. The scaffolding step (meta + seed + marker into a given root) is
 * factored from worktree creation so a use-existing caller can reuse it
 * without `git worktree add`. The originating session is never disturbed: the
 * primitive writes to the resolved target root and never changes the working
 * directory.
 *
 * @module
 */

import { join } from "node:path";

import { runUserOpen } from "../../commands/user/open.js";
import type { UserIOContext } from "../../commands/user/types.js";
import { renderMetaFile } from "../active/meta-reader.js";
import { ensureDir } from "../template/files.js";
import type { GitExec } from "./exec.js";
import { resolveWorktreeLocation } from "./worktree-location.js";
import { writeWorktreeOwnershipMarker } from "./worktree-marker.js";

/** Life-phase shaping for the scaffolded branch + meta. */
export interface WorktreeLifePhase {
  /** Branch prefix, e.g. `plan/`. */
  branchPrefix: string;
  /** Initial meta `State` value, e.g. `Planning`. */
  initialState: string;
}

/** Default life phase: a planning branch (`plan/`) and `Planning` state. */
const PLANNING_LIFE_PHASE: WorktreeLifePhase = { branchPrefix: "plan/", initialState: "Planning" };

/** Meta `Next Action` used when the caller supplies none. */
const DEFAULT_NEXT_ACTION = "Begin planning.";

/** Dependencies for {@link spawnWorktree}. */
export interface SpawnWorktreeContext {
  /** I/O context carrying the git executor and filesystem ops (also handed to the SESSION-NOTES seed). */
  io: UserIOContext;
  /** Internal template directory for the SESSION-NOTES seed; production passes `getInternalTemplatePath()`. */
  internalTemplateDir: string;
}

/** Parameters for {@link spawnWorktree}. */
export interface SpawnWorktreeParams {
  /** Work-unit name — drives the branch, meta filename, H1, and user subdir. */
  wuName: string;
  /** Identity creating the worktree — meta `Owner`, the marker, and the user subdir. */
  spawningIdentity: string;
  /** Base ref the new branch forks from — the resolved `branch.base` (local ref; no fetch). */
  baseBranch: string;
  /** Worktree location template — the resolved `worktree.location_template`. */
  locationTemplate: string;
  /** Main-worktree directory basename — the `{repo}` expansion. */
  repo: string;
  /** Meta `Next Action` seed; defaults to a generic planning kickoff. */
  nextAction?: string;
  /** Life-phase shaping; defaults to a planning branch + `Planning` state. */
  lifePhase?: WorktreeLifePhase;
  /** Whether ARC created the worktree (gates the ownership marker); defaults to `true`. */
  createdByArc?: boolean;
  /** Forward-compat tier hint — accepted, not branched on. */
  tier?: string;
  /** Forward-compat type hint — accepted, not branched on. */
  type?: string;
  /** Marker timestamp (epoch millis); injectable for tests. */
  now?: number;
}

/** Outcome of a successful spawn. */
export interface SpawnWorktreeResult {
  /** Resolved filesystem path of the new worktree. */
  worktreePath: string;
  /** Branch created for the worktree. */
  branch: string;
}

/**
 * Create a new worktree for a work unit and scaffold its initial state.
 *
 * Runs `git worktree add <path> -b <branch> <base>` (the branch forks from the
 * resolved base, not the spawning HEAD), then writes the Planning meta, seeds
 * SESSION-NOTES, and writes the ownership marker into the new root. The
 * originating worktree is untouched — no working-directory change.
 *
 * @param ctx - I/O context and template directory.
 * @param params - Work-unit identity, base, location template, and scaffold inputs.
 * @returns The resolved worktree path and the branch created.
 */
export async function spawnWorktree(
  ctx: SpawnWorktreeContext,
  params: SpawnWorktreeParams,
): Promise<SpawnWorktreeResult> {
  const lifePhase = params.lifePhase ?? PLANNING_LIFE_PHASE;
  const branch = `${lifePhase.branchPrefix}${params.wuName}`;
  const worktreePath = resolveWorktreeLocation({
    template: params.locationTemplate,
    repo: params.repo,
    branch,
  });

  await ctx.io.exec("git", ["worktree", "add", worktreePath, "-b", branch, params.baseBranch]);

  try {
    await scaffoldIntoWorktree(ctx, worktreePath, branch, lifePhase, params);
  } catch (err) {
    // Post-add failure: roll back so no partial, unmarked worktree survives for
    // the cleanup machinery to misclassify. The original failure is what surfaces.
    await rollbackWorktree(ctx.io.exec, worktreePath, branch);
    throw err;
  }

  return { worktreePath, branch };
}

/**
 * Best-effort rollback of a partially-scaffolded spawn: force-remove the new
 * worktree and delete its branch. Errors here are swallowed so the original
 * scaffold failure surfaces as the thrown cause rather than a rollback error.
 */
async function rollbackWorktree(
  exec: GitExec,
  worktreePath: string,
  branch: string,
): Promise<void> {
  try {
    await exec("git", ["worktree", "remove", "--force", worktreePath]);
    await exec("git", ["branch", "-D", branch]);
  } catch {
    // Best-effort — the original scaffold failure is the one worth surfacing.
  }
}

/**
 * Write the meta, seed SESSION-NOTES, and write the ownership marker into an
 * existing worktree root. Factored from worktree creation so a use-existing
 * caller can scaffold without `git worktree add`.
 */
async function scaffoldIntoWorktree(
  ctx: SpawnWorktreeContext,
  worktreePath: string,
  branch: string,
  lifePhase: WorktreeLifePhase,
  params: SpawnWorktreeParams,
): Promise<void> {
  const activeDir = join(worktreePath, ".arc", "active");
  await ensureDir(activeDir, ctx.io.mkdir);
  await ctx.io.writeFile(
    join(activeDir, `meta-${params.wuName}.md`),
    renderMetaFile(params.wuName, {
      State: lifePhase.initialState,
      Owner: params.spawningIdentity,
      Branch: branch,
      "Next Action": params.nextAction ?? DEFAULT_NEXT_ACTION,
    }),
  );

  await runUserOpen({
    cwd: worktreePath,
    io: ctx.io,
    identity: params.spawningIdentity,
    wuName: params.wuName,
    internalTemplateDir: ctx.internalTemplateDir,
  });

  await writeWorktreeOwnershipMarker(worktreePath, {
    createdByArc: params.createdByArc ?? true,
    wuName: params.wuName,
    spawningIdentity: params.spawningIdentity,
    now: params.now,
  });
}
