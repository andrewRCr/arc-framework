/**
 * The refusals a command that applies a change plan runs before its first write.
 *
 * `arc update` and `arc init --reconfigure` both apply a change plan over an installed project. Before either writes,
 * it refuses over uncommitted changes to the files it would write and over files already at the paths it would add.
 *
 * @module
 */

import { relative, sep } from "node:path";

import { renderTemplate, type RenderContext } from "./apply.js";
import { findOccupiedPaths, occupiedPathsError } from "./occupied.js";
import type { FileChangePlan } from "./plan.js";
import { findUncommittedPaths, plannedWritePaths, uncommittedChangesError } from "./uncommitted.js";
import type { GitExec } from "../git/index.js";
import type { ReadFileFn } from "../template/index.js";

/** What a plan's pre-write refusals read. */
export interface PlanWriteCheck {
  /** The change plan the command will apply */
  plan: FileChangePlan;
  /** The repository directory the command runs in */
  cwd: string;
  /** Absolute path to the `.arc/` directory */
  arcDir: string;
  /** Absolute path to the manifest, which the command rewrites beside the plan */
  manifestPath: string;
  /** Template rendering context for the plan's additions */
  renderCtx: RenderContext;
  exec: GitExec;
  readFile: ReadFileFn;
  /** The command applying the plan, named in each refusal */
  command: "update" | "reconfigure";
}

/**
 * Refuse a plan whose writes would land on uncommitted changes, or whose additions would replace a file already there.
 *
 * @param check - The plan and what the refusals read
 * @throws UserFacingError with code `manifest.uncommitted-changes` when a file the plan writes, or the manifest, has
 *   uncommitted changes, or `manifest.install-paths-occupied` when an addition's path already holds other content
 */
export async function refuseUnsafePlanWrites(check: PlanWriteCheck): Promise<void> {
  const { plan, cwd, arcDir, renderCtx, readFile, command } = check;
  const writePaths = [...plannedWritePaths(plan, arcDir), check.manifestPath];
  const uncommitted = await findUncommittedPaths(check.exec, cwd, writePaths);
  if (uncommitted.length > 0) {
    throw uncommittedChangesError(uncommitted, command);
  }
  const arcRoot = relative(cwd, arcDir).split(sep).join("/");
  const additions = await Promise.all(plan.additions.map(async (entry) => ({
    path: `${arcRoot}/${entry.outputPath}`,
    content: await renderTemplate(
      renderCtx.templateDir, entry.templateFile, renderCtx.tokens, renderCtx.config, renderCtx.configKeyOverrides,
      readFile,
    ),
  })));
  const occupied = await findOccupiedPaths(cwd, additions, readFile);
  if (occupied.length > 0) {
    throw occupiedPathsError(occupied, command);
  }
}
