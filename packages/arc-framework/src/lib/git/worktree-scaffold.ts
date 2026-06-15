/**
 * Worktree scaffolding — the shared meta + SESSION-NOTES writer for a work-unit
 * worktree.
 *
 * {@link scaffoldIntoWorktree} writes the managed meta, the per-WU
 * SESSION-NOTES seed, and the conditional ownership marker into an existing
 * worktree root — never running `git worktree add` itself. Both `start` entry
 * paths build on it: create-new cuts the worktree via the
 * `reconcile-worktree.spawn` leg (which writes the ARC-created marker), then
 * scaffolds with `createdByArc: false` so this pass keeps that marker; a
 * cold-start enters a worktree it did not create and scaffolds directly, also
 * `createdByArc: false`, so no marker is written (cleanup there stays advisory).
 *
 * The git/fs mechanics live here (testable) rather than in agent workflow
 * bash. The originating session is never disturbed: it writes to the target
 * root and never changes the working directory.
 *
 * @module
 */

import { join } from "node:path";

import { runUserOpen } from "../../commands/user/open.js";
import type { UserIOContext } from "../../commands/user/types.js";
import { renderMetaFile, type MetaFieldOverrides } from "../active/meta-reader.js";
import { ensureDir } from "../template/files.js";
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

/**
 * Parameters for {@link scaffoldIntoWorktree}. These carry no
 * worktree-*creation* inputs (no base/location/repo): the target worktree
 * already exists. Create-new builds this shape after the `reconcile-worktree.spawn`
 * leg cuts the worktree; a cold-start caller builds it for the worktree it entered.
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
