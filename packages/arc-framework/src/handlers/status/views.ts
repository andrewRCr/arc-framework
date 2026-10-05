/** User and project status views, including atomic staged ROADMAP rendering. */

import { rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { resolveAllSettings, type ResolvedSettingsResult } from "../../lib/config/resolved-settings.js";
import { projectTransientInFlightRead, readTransientInFlightIndexes } from "../../lib/errand/record.js";
import { retryTransientFileSystemRefusal } from "../../lib/fs.js";
import { assembleStatusUserView } from "../../lib/status/assemble-user-view.js";
import {
  composeProjectReadinessViewResult,
  resolveProjectReadinessRenderStamp,
  resolveProjectReadinessViewInput,
  type ProjectReadinessWarning,
} from "../../lib/status/project-view.js";
import {
  renderRoadmapFromIndexViewResult,
  resolveStagedTransitionOverlays,
  ROADMAP_PATH,
} from "../../lib/status/roadmap-regeneration-assert.js";
import { buildLifecycleIndex } from "../../lib/work-unit/lifecycle-index.js";
import { listParkedSlugs } from "../../lib/work-unit/lifecycle-resolver.js";
import { transitionOverlayCompositionInput } from "../../lib/work-unit/transition-overlay.js";
import type { StatusCliOptions } from "./input.js";
import type { SessionStatusContext } from "./session-context.js";
function writeProjectReadinessWarnings(warnings: readonly ProjectReadinessWarning[]): void {
  for (const warning of warnings) process.stderr.write(`warning: ${warning.rendered}\n`);
}

/**
 * Execute the user status mode.
 * @param context - Request-scoped I/O, identity, and personal-surface readers.
 * @param opts - Validated status options.
 * @returns Completion after writing the selected status output.
 */
export async function handleUserStatus(context: SessionStatusContext, opts: StatusCliOptions): Promise<void> {
  const { cwd, exec, io, identity, lifecycleFs } = context;
  const json = Boolean(opts.json);
  const resolved = await resolveAllSettings({ cwd, exec, readFile: io.readFile });
  const teamMode = resolved.settings["team.mode"] === "true";
  const localOnly = Boolean(opts.local) || opts.fetch === false;
  const parkedSlugs = listParkedSlugs(await buildLifecycleIndex({ cwd, fs: lifecycleFs }));
  const view = await assembleStatusUserView({
    cwd,
    exec,
    identity,
    teamMode,
    localOnly,
    baseBranch: resolved.settings["branch.base"],
    parkedSlugs,
    readFile: io.readFile,
    writeFile: io.writeFile,
    mkdir: (path, options) => io.mkdir(path, options).then(() => undefined),
  });
  if (json) {
    process.stdout.write(`${JSON.stringify(view)}\n`);
    return;
  }
  process.stdout.write(`${view.output}\n`);
  return;
}

/**
 * Execute the staged project status mode.
 * @param context - Request-scoped I/O, identity, and personal-surface readers.
 * @param opts - Validated status options.
 * @param resolved - Resolved settings for this project render.
 * @returns Completion after writing the selected status output.
 */
async function handleStagedProjectStatus(
  context: SessionStatusContext,
  opts: StatusCliOptions,
  resolved: ResolvedSettingsResult,
): Promise<void> {
  const { cwd, exec } = context;
  const json = Boolean(opts.json);
  // Render the project view from the git index — the same source the
  // pre-commit ROADMAP regen check validates against, so this render
  // produces exactly what the hook expects (staged sweep or clean tree).
  const transitionOverlays = await resolveStagedTransitionOverlays({ cwd, exec });
  const { result } = await renderRoadmapFromIndexViewResult({
    cwd,
    exec,
    baseBranch: resolved.settings["branch.base"],
    ...(transitionOverlays.length === 0
      ? {}
      : { transitionOverlays: transitionOverlays.map(transitionOverlayCompositionInput) }),
  });
  if (json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  writeProjectReadinessWarnings(result.warnings);
  if (opts.write === true) {
    // The write happens only after a successful render, via temp-then-rename in the target's
    // own directory — a failed render or interrupted write never truncates the tracked view,
    // which a shell redirect of this command's output did.
    const roadmapPath = resolve(cwd, ROADMAP_PATH);
    const temporaryPath = `${roadmapPath}.render-${process.pid}.tmp`;
    await writeFile(temporaryPath, `${result.markdown}\n`, { flag: "wx" });
    try {
      await retryTransientFileSystemRefusal(async () => {
        await rename(temporaryPath, roadmapPath);
      });
    } catch (error) {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      throw error;
    }
    process.stdout.write(`Wrote ${ROADMAP_PATH}\n`);
    return;
  }
  process.stdout.write(`${result.markdown}\n`);
  return;
}

/**
 * Execute the project status mode.
 * @param context - Request-scoped I/O, identity, and personal-surface readers.
 * @param opts - Validated status options.
 * @returns Completion after writing the selected status output.
 */
export async function handleProjectStatus(context: SessionStatusContext, opts: StatusCliOptions): Promise<void> {
  const { cwd, exec, io, identity, lifecycleFs } = context;
  const json = Boolean(opts.json);
  const resolved = await resolveAllSettings({ cwd, exec, readFile: io.readFile });
  if (opts.staged) {
    await handleStagedProjectStatus(context, opts, resolved);
    return;
  }
  const localOnly = Boolean(opts.local) || opts.fetch === false;
  const [parkedSlugs, transientRead] = await Promise.all([
    buildLifecycleIndex({ cwd, fs: lifecycleFs }).then(listParkedSlugs),
    readTransientInFlightIndexes({ exec, identity }),
  ]);
  const transient = projectTransientInFlightRead(transientRead);
  const input = await resolveProjectReadinessViewInput({
    cwd,
    fs: lifecycleFs,
    oracle: {
      exec,
      acquisitionPolicy: localOnly ? "local" : "passive-live",
      baseBranch: resolved.settings["branch.base"],
      parkedSlugs,
      errandSlugByBranch: transient.indexes.slugByBranch,
      errandRecordsComplete: transient.complete,
    },
  });
  const result = composeProjectReadinessViewResult({
    ...input,
    renderedRef: await resolveProjectReadinessRenderStamp({
      exec,
      cwd,
      scope: localOnly ? "tree + local refs" : "tree + live refs",
      liveView: "arc status --project",
    }),
  });
  if (json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  writeProjectReadinessWarnings(result.warnings);
  process.stdout.write(`${result.markdown}\n`);
  return;
}
