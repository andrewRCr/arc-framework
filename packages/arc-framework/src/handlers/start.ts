/**
 * Handler for `arc start` — the polymorphic lifecycle entry verb.
 *
 * `--here` is the in-place cold-start override: scaffold a Planning meta into the
 * worktree the session is already in, via {@link runColdStart}. Otherwise the
 * handler dispatches on the named work unit's resolved lifecycle state
 * ({@link resolveStartDispatch}): a nonexistent name creates new
 * ({@link runCreateNew}), a backlog stub graduates onto its branch
 * ({@link runGraduate}), a parked shelf resumes ({@link runResume}), and an
 * already-started or terminal WU is refused with direction.
 *
 * The handler resolves the ambient context (cwd, branch, identity), builds the
 * lifecycle index, routes, and reports.
 *
 * @module
 */

import { readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";

import * as p from "@clack/prompts";

import {
  resolveStartDispatch,
  runColdStart,
  runCreateNew,
  runGraduate,
  deriveColdStartWuName,
} from "../commands/start.js";
import { parseMetaRecord } from "../lib/active/meta-reader.js";
import { readConfigSettings } from "../lib/config/status-reader.js";
import { resolvePrimaryWorktreePath } from "../lib/git/worktree-roster.js";
import { getInternalTemplatePath } from "../lib/paths.js";
import { createUserIOContext } from "../lib/io-context.js";
import { buildLifecycleIndex } from "../lib/work-unit/lifecycle-index.js";
import { buildExecutorContext } from "../lib/work-unit/executor-context.js";
import type { TransitionOutcome } from "../lib/work-unit/lifecycle-executor.js";
import { runResume } from "../lib/work-unit/verbs/park-resume.js";
import {
  isHandledError,
  isNonInteractiveEnvironment,
  requireArcProjectRoot,
  resolveCurrentBranchName,
  resolveUserIdentity,
} from "./shared.js";

export interface StartOptions {
  /** Cold-start in place (the current worktree) instead of spawning a new one. */
  here?: boolean;
  /** Spec input — issue → Origin, spec/draft artifact → Design, else passed through. */
  from?: string;
  /** Skip the confirm prompt. */
  yes?: boolean;
}

/** Whether to skip the interactive confirm — explicit `--yes` or a non-TTY environment. */
function skipConfirm(opts: StartOptions): boolean {
  return Boolean(opts.yes) || isNonInteractiveEnvironment();
}

/** Ask the operator to confirm; returns `true` to proceed, `false` to abort. */
async function confirmStep(message: string): Promise<boolean> {
  const proceed = await p.confirm({ message, initialValue: true });
  return !p.isCancel(proceed) && proceed;
}

export async function handleStart(
  name: string | undefined,
  opts: StartOptions,
): Promise<void> {
  p.intro("arc start");

  let identity: string;
  try {
    identity = await resolveUserIdentity();
  } catch (err) {
    if (isHandledError(err)) return;
    throw err;
  }

  const io = createUserIOContext();
  const cwd = requireArcProjectRoot();
  if (!cwd) return;

  // `--here` with no name: there is no slug to resolve a state against, so this
  // is unambiguously a cold-start, deriving the WU name from the current branch.
  const wuName = name?.trim();
  if (opts.here && !wuName) {
    await coldStart(name, opts, { io, cwd, identity });
    return;
  }

  // A name is required for every other path — the dispatcher resolves against it
  // (and create-new has no current branch to derive one from).
  if (!wuName) {
    p.log.error("`arc start <name>` requires a work-unit name (or `--here` to cold-start in place).");
    process.exitCode = 1;
    return;
  }

  const index = await buildLifecycleIndex({
    cwd,
    fs: { readdir: (path) => readdir(path, { withFileTypes: true }), readFile: (path) => readFile(path, "utf8") },
  });
  const dispatch = resolveStartDispatch(index, wuName);

  // `--here` is the in-place opt-out, orthogonal to the resolved state: a
  // nonexistent name cold-starts in place (vs. create-new's spawn) and a backlog
  // stub graduates in place (vs. spawning a worktree).
  switch (dispatch.arm) {
    case "refuse":
      p.log.error(dispatch.reason);
      process.exitCode = 1;
      return;
    case "create-new":
      if (opts.here) await coldStart(name, opts, { io, cwd, identity });
      else await createNew(wuName, opts, { io, cwd, identity });
      return;
    case "graduate":
      await graduate(wuName, opts, { io, cwd, identity, metaPath: index.get(wuName)?.path });
      return;
    case "resume":
      await resume(wuName, opts, { io, cwd, identity });
      return;
    // `cold-start` is reached only via `--here`, handled above.
  }
}

/** Shared ambient context the arms resolve once. */
interface ArmContext {
  io: ReturnType<typeof createUserIOContext>;
  cwd: string;
  identity: string;
}

/** Resolve `branch.base`, `worktree.location_template`, and the `{repo}` basename from config + git. */
async function resolveSpawnConfig(
  ctx: ArmContext,
): Promise<{ baseBranch: string; locationTemplate: string; repo: string; teamMode: boolean } | null> {
  const { settings } = await readConfigSettings(ctx.cwd);
  const primaryWorktreePath = await resolvePrimaryWorktreePath(ctx.io.exec);
  if (primaryWorktreePath === null) {
    p.log.error("could not resolve the primary worktree path to derive the repository name");
    process.exitCode = 1;
    return null;
  }
  return {
    baseBranch: settings["branch.base"],
    locationTemplate: settings["worktree.location_template"],
    repo: basename(primaryWorktreePath),
    teamMode: settings["team.mode"] === "true",
  };
}

/** Create-new arm — spawn a fresh worktree on a new `plan/<name>` branch. */
async function createNew(wuName: string, opts: StartOptions, ctx: ArmContext): Promise<void> {
  if (!skipConfirm(opts)) {
    if (!(await confirmStep(`Spawn a new worktree for work unit "${wuName}" on a new plan/${wuName} branch?`))) {
      p.log.info("Create-new cancelled.");
      return;
    }
  }

  const outcome = await runCreateNew(
    { io: ctx.io, internalTemplateDir: getInternalTemplatePath() },
    { worktreePath: ctx.cwd, identity: ctx.identity, name: wuName },
  );
  if (!outcome.ok) {
    p.log.error(outcome.reason);
    process.exitCode = 1;
    return;
  }

  const r = outcome.value;
  p.note(
    [
      `Work unit: ${r.wuName}`,
      `Branch:    ${r.branch}`,
      `Worktree:  ${r.worktreePath}`,
      `Meta:      ${r.worktreePath}/.arc/active/meta-${r.wuName}.md`,
    ].join("\n"),
    "Spawned",
  );
  p.outro("Done.");
}

/**
 * Graduate arm — relocate a backlog stub onto its `plan/<name>` branch (`init`
 * Path A). Spawns a dedicated worktree by default; `--here` instead cuts the
 * branch in the current checkout (no spawn), gated by the same occupancy guard.
 */
async function graduate(
  wuName: string,
  opts: StartOptions,
  ctx: ArmContext & { metaPath: string | undefined },
): Promise<void> {
  if (ctx.metaPath === undefined) {
    p.log.error(`could not resolve the backlog meta for \`${wuName}\`.`);
    process.exitCode = 1;
    return;
  }

  // Resolve the stub's recorded Class — the `class-resolved` guard refuses `[TBD]`.
  let cls: string;
  try {
    const record = parseMetaRecord(await ctx.io.readFile(join(ctx.cwd, ctx.metaPath)));
    cls = record.Class ?? "[TBD]";
  } catch {
    p.log.error(`could not read the backlog meta for \`${wuName}\`.`);
    process.exitCode = 1;
    return;
  }

  // In place (`--here`): no worktree spawned, so the spawn config (base / location
  // template / repo) isn't needed — only `team.mode` for the executor's status
  // side-effect. The branch is cut off current HEAD in this checkout.
  if (opts.here) {
    const { settings } = await readConfigSettings(ctx.cwd);
    if (!skipConfirm(opts)) {
      if (!(await confirmStep(`Graduate "${wuName}" onto a new plan/${wuName} branch in this worktree (no spawn)?`))) {
        p.log.info("Graduate cancelled.");
        return;
      }
    }
    const result = await runGraduate(
      buildExecutorContext({ ...ctx, teamMode: settings["team.mode"] === "true", internalTemplateDir: getInternalTemplatePath() }),
      { name: wuName, cls, inPlace: true },
    );
    if (result.status === "rejected") {
      p.log.error(result.reason);
      process.exitCode = 1;
      return;
    }
    p.note(
      [`Work unit: ${wuName}`, `Branch:    ${result.branch}`, `Meta:      ${result.metaPath}`].join("\n"),
      "Graduated (in place)",
    );
    reportAdvisories(result.outcome);
    p.outro("Done.");
    return;
  }

  const config = await resolveSpawnConfig(ctx);
  if (config === null) return;

  if (!skipConfirm(opts)) {
    if (!(await confirmStep(`Graduate "${wuName}" onto a new plan/${wuName} branch and spawn its worktree?`))) {
      p.log.info("Graduate cancelled.");
      return;
    }
  }

  const result = await runGraduate(
    buildExecutorContext({ ...ctx, teamMode: config.teamMode, internalTemplateDir: getInternalTemplatePath() }),
    {
      name: wuName,
      cls,
      baseBranch: config.baseBranch,
      locationTemplate: config.locationTemplate,
      repo: config.repo,
      spawningIdentity: ctx.identity,
    },
  );
  if (result.status === "rejected") {
    p.log.error(result.reason);
    process.exitCode = 1;
    return;
  }

  p.note(
    [`Work unit: ${wuName}`, `Branch:    ${result.branch}`, `Meta:      ${result.metaPath}`].join("\n"),
    "Graduated",
  );
  reportAdvisories(result.outcome);
  p.outro("Done.");
}

/**
 * Resume arm — re-attach a parked WU's preserved branch (delegates to the shipped
 * `resume` verb). Spawns a fresh worktree by default; `--here` re-attaches in the
 * current checkout (no spawn).
 */
async function resume(wuName: string, opts: StartOptions, ctx: ArmContext): Promise<void> {
  // In place (`--here`): no fresh worktree, so the spawn config isn't needed —
  // only `team.mode` for the executor's status side-effect.
  if (opts.here) {
    const { settings } = await readConfigSettings(ctx.cwd);
    if (!skipConfirm(opts)) {
      if (!(await confirmStep(`Resume parked work unit "${wuName}" — re-attach its branch in this worktree (no spawn)?`))) {
        p.log.info("Resume cancelled.");
        return;
      }
    }
    const result = await runResume(
      {
        executor: buildExecutorContext({ ...ctx, teamMode: settings["team.mode"] === "true", internalTemplateDir: getInternalTemplatePath() }),
        fs: { writeFile: (path, content) => ctx.io.writeFile(path, content) },
      },
      { name: wuName, inPlace: true },
    );
    if (result.status === "rejected") {
      p.log.error(result.reason);
      process.exitCode = 1;
      return;
    }
    p.note([`Work unit: ${wuName}`, `Meta:      ${result.metaPath}`].join("\n"), "Resumed (in place)");
    reportAdvisories(result.outcome);
    p.outro("Done.");
    return;
  }

  const config = await resolveSpawnConfig(ctx);
  if (config === null) return;

  if (!skipConfirm(opts)) {
    if (!(await confirmStep(`Resume parked work unit "${wuName}" — re-attach its branch in a fresh worktree?`))) {
      p.log.info("Resume cancelled.");
      return;
    }
  }

  const result = await runResume(
    {
      executor: buildExecutorContext({
        ...ctx,
        teamMode: config.teamMode,
        internalTemplateDir: getInternalTemplatePath(),
      }),
      fs: { writeFile: (path, content) => ctx.io.writeFile(path, content) },
    },
    { name: wuName, locationTemplate: config.locationTemplate, repo: config.repo, spawningIdentity: ctx.identity },
  );
  if (result.status === "rejected") {
    p.log.error(result.reason);
    process.exitCode = 1;
    return;
  }

  p.note([`Work unit: ${wuName}`, `Meta:      ${result.metaPath}`].join("\n"), "Resumed");
  reportAdvisories(result.outcome);
  p.outro("Done.");
}

/** Cold-start arm (`--here`) — scaffold a Planning meta into the current worktree. */
async function coldStart(
  name: string | undefined,
  opts: StartOptions,
  ctx: ArmContext,
): Promise<void> {
  const branch = await resolveCurrentBranchName(ctx.io.exec);
  if (!branch) {
    p.log.error(
      "Cannot resolve the current branch (detached HEAD?). Check out a branch before cold-starting.",
    );
    process.exitCode = 1;
    return;
  }

  // The arc-session skill confirms the gathered context before invoking, so its
  // non-interactive (no-TTY) call skips this prompt; a direct human run still gets it.
  if (!skipConfirm(opts)) {
    const previewName = deriveColdStartWuName(name, branch) ?? "(name from branch)";
    if (!(await confirmStep(`Cold-start work unit "${previewName}" on branch ${branch} in this worktree?`))) {
      p.log.info("Cold-start cancelled.");
      return;
    }
  }

  const outcome = await runColdStart(
    { io: ctx.io, internalTemplateDir: getInternalTemplatePath() },
    { worktreePath: ctx.cwd, branch, identity: ctx.identity, name, from: opts.from },
  );
  if (!outcome.ok) {
    p.log.error(outcome.reason);
    process.exitCode = 1;
    return;
  }

  const r = outcome.value;
  const lines = [
    `Work unit: ${r.wuName}`,
    `Branch:    ${r.branch}`,
    `Meta:      .arc/active/meta-${r.wuName}.md`,
  ];
  if (r.origin) lines.push(`Origin:    ${r.origin}`);
  if (r.design) lines.push(`Design:    ${r.design}`);
  if (r.passthrough) {
    lines.push(
      `Spec input (${r.passthrough.kind}): ${r.passthrough.value}`,
      "  → assess and set Origin/Design during planning",
    );
  }
  p.note(lines.join("\n"), "Cold-started");
  p.outro("Done.");
}

/** Surface any side-effect advisories (e.g. the interim ROADMAP / STATUS.USER regen lines). */
function reportAdvisories(outcome: TransitionOutcome): void {
  if (outcome.status === "ok") {
    for (const advisory of outcome.advisories) p.log.info(advisory);
  }
}
