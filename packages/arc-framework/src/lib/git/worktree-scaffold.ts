/**
 * Worktree scaffolding primitives — one shared writer behind two entry points.
 *
 * {@link scaffoldIntoWorktree} writes the managed meta, the per-WU
 * SESSION-NOTES seed, and the conditional ownership marker into an existing
 * worktree root. {@link spawnWorktree} wraps it with `git worktree add`: it
 * creates the branch + worktree first, then scaffolds. A cold-start caller
 * enters a worktree it did not create and calls {@link scaffoldIntoWorktree}
 * directly — no `git worktree add` — passing `createdByArc: false` so no
 * marker is written (cleanup there stays advisory).
 *
 * The git/fs mechanics live here (testable) rather than in agent workflow
 * bash. The originating session is never disturbed: the primitives write to
 * the target root and never change the working directory.
 *
 * @module
 */

import { join } from "node:path";

import { runUserOpen } from "../../commands/user/open.js";
import type { UserIOContext } from "../../commands/user/types.js";
import { renderMetaFile, type MetaFieldOverrides } from "../active/meta-reader.js";
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
 * Parameters for {@link scaffoldIntoWorktree}. Unlike {@link SpawnWorktreeParams}
 * these carry no worktree-*creation* inputs (no base/location/repo): the target
 * worktree already exists. {@link spawnWorktree} builds this shape after running
 * `git worktree add`; a cold-start caller builds it for the worktree it entered.
 */
export interface ScaffoldWorktreeParams {
  /** Target worktree root — already created (by spawn, a tool, or a manual `git worktree add`). */
  worktreePath: string;
  /** Branch the worktree is on — the meta `Branch` value. */
  branch: string;
  /** Work-unit name — drives the meta filename, H1, and user subdir. */
  wuName: string;
  /** Identity owning the WU — meta `Owner`, the marker, and the user subdir. */
  spawningIdentity: string;
  /** Initial meta `State`; defaults to `Planning`. */
  initialState?: string;
  /** Meta `Next Action` seed; defaults to a generic planning kickoff. */
  nextAction?: string;
  /** Parsed external reference (issue / URL) → meta `Origin`. Cold-start spec-input. */
  origin?: string;
  /** Parsed ARC-owned artifact (spec / plan-doc) → meta `Design`. Cold-start spec-input. */
  design?: string;
  /** Whether ARC created the worktree (gates the ownership marker); defaults to `true`. */
  createdByArc?: boolean;
  /** Forward-compat tier hint — accepted, not branched on. */
  tier?: string;
  /** Forward-compat type hint — accepted, not branched on. */
  type?: string;
  /** Marker timestamp (epoch millis); injectable for tests. */
  now?: number;
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
    await scaffoldIntoWorktree(ctx, {
      worktreePath,
      branch,
      wuName: params.wuName,
      spawningIdentity: params.spawningIdentity,
      initialState: lifePhase.initialState,
      nextAction: params.nextAction,
      createdByArc: params.createdByArc,
      tier: params.tier,
      type: params.type,
      now: params.now,
    });
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
 * Write the meta, seed SESSION-NOTES, and write the conditional ownership
 * marker into an existing worktree root — no `git worktree add`. Factored from
 * worktree creation so the cold-start (use-existing) path can scaffold a
 * worktree it did not create; {@link spawnWorktree} reuses it after creating
 * the worktree.
 *
 * The marker is gated by `createdByArc` (default `true`): a spawn writes it, a
 * cold-start into an externally-created worktree passes `false` and no marker
 * lands (cleanup stays advisory). `origin` / `design`, when supplied, populate
 * the meta's `Origin` / `Design` fields from parsed spec input; absent fields
 * render at their declared defaults.
 *
 * @param ctx - I/O context and template directory.
 * @param params - Target worktree root, branch, and scaffold inputs.
 */
export async function scaffoldIntoWorktree(
  ctx: SpawnWorktreeContext,
  params: ScaffoldWorktreeParams,
): Promise<void> {
  const activeDir = join(params.worktreePath, ".arc", "active");
  await ensureDir(activeDir, ctx.io.mkdir);

  const overrides: MetaFieldOverrides = {
    State: params.initialState ?? PLANNING_LIFE_PHASE.initialState,
    Owner: params.spawningIdentity,
    Branch: params.branch,
    "Next Action": params.nextAction ?? DEFAULT_NEXT_ACTION,
  };
  if (params.origin !== undefined) overrides.Origin = params.origin;
  if (params.design !== undefined) overrides.Design = params.design;

  await ctx.io.writeFile(
    join(activeDir, `meta-${params.wuName}.md`),
    renderMetaFile(params.wuName, overrides),
  );

  await runUserOpen({
    cwd: params.worktreePath,
    io: ctx.io,
    identity: params.spawningIdentity,
    wuName: params.wuName,
    internalTemplateDir: ctx.internalTemplateDir,
  });

  await writeWorktreeOwnershipMarker(params.worktreePath, {
    createdByArc: params.createdByArc ?? true,
    wuName: params.wuName,
    spawningIdentity: params.spawningIdentity,
    now: params.now,
  });
}
