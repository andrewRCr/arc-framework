/**
 * Handler for `arc start` — the polymorphic lifecycle entry verb.
 *
 * `--here` is the in-place cold-start override: scaffold a Planning meta into the
 * worktree the session is already in, via {@link runColdStart}. Otherwise the
 * handler dispatches on the named work unit's resolved lifecycle state
 * ({@link resolveStartDispatch}): an explicitly-new nonexistent name creates
 * ({@link runCreateNew}), a backlog stub graduates onto its branch
 * ({@link runGraduate}), a parked shelf resumes ({@link runResume}), and an
 * already-started or terminal WU is refused with direction.
 *
 * The handler resolves the ambient context (cwd, branch, identity), builds the
 * lifecycle index, routes, and reports.
 *
 * @module
 */

import { readdir, rm, rmdir } from "node:fs/promises";
import { basename, join } from "node:path";

import * as p from "@clack/prompts";

import {
  buildCreateNewCeremonyCommitMessage,
  buildGraduateCeremonyCommitMessage,
  resolveStartDispatch,
  runColdStart,
  runCreateNew,
  runGraduate,
  deriveColdStartWuName,
} from "../commands/start.js";
import { validateClass } from "../commands/active/types.js";
import { parseMetaRecord } from "../lib/active/meta-reader.js";
import { readConfigSettings } from "../lib/config/status-reader.js";
import type { GitExec } from "../lib/git/exec.js";
import { refreshBase } from "../lib/git/refresh-base.js";
import { isProtectedBranch } from "../lib/release/interlock-validation.js";
import { resolvePrimaryWorktreePath } from "../lib/git/worktree-roster.js";
import { renderWorktreeEntryRecipe } from "../lib/harness/worktree-entry.js";
import { getInternalTemplatePath } from "../lib/paths.js";
import { createUserIOContext } from "../lib/io-context.js";
import { ensureDir } from "../lib/template/files.js";
import { renderTrackedProjectReadinessView } from "../lib/status/project-roadmap-render.js";
import { createProjectViewRefSnapshot } from "../lib/status/project-view-ref.js";
import type { ProjectViewFs } from "../lib/status/project-view.js";
import {
  isComposedLifecycleSlugIndeterminate,
  resolveComposedLifecycleIndex,
} from "../lib/work-unit/composed-lifecycle-index.js";
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
  /** Resolved `Class` for a stub still `[TBD]` — validated, recorded by the ceremony. */
  class?: string;
  /** Explicitly create a fresh work unit when the name is absent from base. */
  new?: boolean;
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

  const { settings } = await readConfigSettings(cwd);
  const refreshedBase = await refreshBase(io.exec, settings["branch.base"]);
  let baseRef: string;
  try {
    const { stdout } = await io.exec("git", ["rev-parse", `${refreshedBase}^{commit}`], { cwd });
    baseRef = stdout.trim();
    if (baseRef === "") throw new Error("resolved an empty object id");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    p.log.error(`could not resolve the start base \`${refreshedBase}\`: ${message}`);
    process.exitCode = 1;
    return;
  }
  const baseSnapshot = await createProjectViewRefSnapshot({ cwd, exec: io.exec, ref: baseRef, slug: wuName });
  if (!baseSnapshot.ok) {
    p.log.error(baseSnapshot.reason);
    process.exitCode = 1;
    return;
  }
  const composed = await resolveComposedLifecycleIndex({
    cwd,
    fs: baseSnapshot.fs,
    oracle: {
      exec: io.exec,
      baseBranch: settings["branch.base"],
      localOnly: false,
      expandLiveOnly: true,
    },
  });
  const dispatch = resolveStartDispatch(composed.index, wuName, { create: opts.new === true });
  let armOptions = opts;
  const mintsBranch = dispatch.arm === "create-new" || dispatch.arm === "graduate";
  const explicitHereColdStart = opts.here === true && dispatch.arm === "create-new";
  if (
    mintsBranch
    && !explicitHereColdStart
    && isComposedLifecycleSlugIndeterminate(composed, wuName)
  ) {
    const reason =
      `Cannot safely start \`${wuName}\`: live lifecycle truth is indeterminate. ` +
      `Retry with a reachable origin or inspect \`arc status ${wuName} --fetch\` before starting.`;
    if (skipConfirm(opts)) {
      p.log.error(reason);
      process.exitCode = 1;
      return;
    }
    if (!(await confirmStep(`${reason} Proceed with the start anyway?`))) {
      p.log.info("Start cancelled.");
      return;
    }
    armOptions = { ...opts, yes: true };
  }

  // `--here` is the in-place opt-out, orthogonal to the resolved state: a
  // nonexistent name explicitly created with `--new` cold-starts in place (vs.
  // create-new's spawn) and a backlog stub graduates in place (vs. spawning a worktree).
  switch (dispatch.arm) {
    case "refuse":
      p.log.error(dispatch.reason);
      process.exitCode = 1;
      return;
    case "create-new":
      if (opts.here) await coldStart(name, armOptions, { io, cwd, identity });
      else await createNew(wuName, armOptions, { io, cwd, identity }, baseRef);
      return;
    case "graduate":
      await graduate(wuName, armOptions, {
        io,
        cwd,
        identity,
        baseRef,
        metaFs: baseSnapshot.fs,
        metaPath: composed.index.get(wuName)?.path,
      });
      return;
    case "resume":
      await resume(wuName, armOptions, { io, cwd, identity });
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
): Promise<{
  baseBranch: string;
  locationTemplate: string;
  postCreateScript: string;
  primaryWorktreePath: string;
  registeredHarnessDirs: string;
  repo: string;
  teamMode: boolean;
} | null> {
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
    postCreateScript: settings["worktree.post_create"],
    primaryWorktreePath,
    registeredHarnessDirs: settings["worktree.harness_dirs"],
    repo: basename(primaryWorktreePath),
    teamMode: settings["team.mode"] === "true",
  };
}

/** Create-new arm — spawn a fresh worktree on a new `plan/<name>` branch. */
async function createNew(wuName: string, opts: StartOptions, ctx: ArmContext, baseRef: string): Promise<void> {
  if (!skipConfirm(opts)) {
    if (!(
      await confirmStep(
        `Spawn a new worktree for work unit "${wuName}" on plan/${wuName}, then commit and push the start ceremony?`,
      )
    )) {
      p.log.info("Create-new cancelled.");
      return;
    }
  }

  const outcome = await runCreateNew(
    { io: ctx.io, internalTemplateDir: getInternalTemplatePath() },
    { worktreePath: ctx.cwd, identity: ctx.identity, name: wuName, baseRef },
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
  if (r.postCreateNotice) p.log.info(r.postCreateNotice);
  const roadmap = await refreshRoadmapForStartCeremony(ctx, r.worktreePath);
  if (!roadmap.ok) {
    p.log.error(roadmap.reason);
    process.exitCode = 1;
    return;
  }
  const ceremony = await commitAndPushStartCeremony(ctx, {
    cwd: r.worktreePath,
    branch: r.branch,
    stagePaths: [`.arc/active/meta-${r.wuName}.md`, ".arc/backlog/ROADMAP.md"],
    message: buildCreateNewCeremonyCommitMessage(r.wuName),
  });
  if (!ceremony.ok) {
    p.log.error(ceremony.reason);
    process.exitCode = 1;
    return;
  }
  await stampStartSessionNotesCommit(ctx, {
    cwd: r.worktreePath,
    identity: ctx.identity,
    wuName: r.wuName,
    commit: ceremony.commit,
  });
  p.log.info(`Committed ${ceremony.commit} and pushed ${r.branch}.`);
  reportWorktreeEntryRecipe(r.worktreePath);
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
  ctx: ArmContext & { baseRef: string; metaFs: ProjectViewFs; metaPath: string | undefined },
): Promise<void> {
  if (ctx.metaPath === undefined) {
    p.log.error(`could not resolve the backlog meta for \`${wuName}\`.`);
    process.exitCode = 1;
    return;
  }

  // Resolve the stub's recorded Class — the `class-resolved` guard refuses `[TBD]`.
  let cls: string;
  try {
    const metaPath = join(ctx.cwd, ctx.metaPath);
    const baseContent = await ctx.metaFs.readFile(metaPath);
    if (opts.here) {
      let localContent: string | null = null;
      try {
        localContent = await ctx.io.readFile(metaPath);
      } catch {
        // Absence is a base disagreement too; the directed refusal below owns the diagnostic.
      }
      if (localContent !== baseContent) {
        p.log.error(
          `cannot start \`${wuName}\` in place because its backlog meta differs from the base snapshot; `
          + "sync this checkout to base or omit `--here`.",
        );
        process.exitCode = 1;
        return;
      }
    }
    const record = parseMetaRecord(baseContent);
    cls = record.Class ?? "[TBD]";
  } catch {
    p.log.error(`could not read the backlog meta for \`${wuName}\`.`);
    process.exitCode = 1;
    return;
  }

  // `--class` supplies the resolved weight for a stub still `[TBD]`, recorded by the
  // ceremony. A meta already resolved wins: a conflicting flag refuses — re-cutting
  // weight is grooming's (`arc finalize`), not the launch flag's.
  let writeClass = false;
  const flagClass = opts.class?.trim();
  if (flagClass !== undefined && flagClass !== "") {
    const validated = validateClass(flagClass);
    if (validated === "[TBD]") {
      p.log.error(`\`${flagClass}\` is not a resolved Class (expected \`Light\` | \`Heavy\` | \`Novel\`).`);
      process.exitCode = 1;
      return;
    }
    const metaClass = validateClass(cls);
    if (metaClass === "[TBD]") {
      cls = validated;
      writeClass = true;
    } else if (metaClass !== validated) {
      p.log.error(
        `--class ${validated} conflicts with the meta's recorded Class \`${cls}\` — `
        + "re-cut weight via grooming (`arc finalize`), not the launch flag.",
      );
      process.exitCode = 1;
      return;
    }
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
      buildExecutorContext({
        ...ctx,
        teamMode: settings["team.mode"] === "true",
        baseBranch: settings["branch.base"],
        internalTemplateDir: getInternalTemplatePath(),
      }),
      { name: wuName, cls, writeClass, inPlace: true },
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
    if (result.notice) p.log.info(result.notice);
    p.outro("Done.");
    return;
  }

  const config = await resolveSpawnConfig(ctx);
  if (config === null) return;

  if (!skipConfirm(opts)) {
    if (!(
      await confirmStep(
        `Graduate "${wuName}" into a spawned plan/${wuName} worktree, then commit and push the start ceremony?`,
      )
    )) {
      p.log.info("Graduate cancelled.");
      return;
    }
  }

  const result = await runGraduate(
    buildExecutorContext({
      ...ctx,
      teamMode: config.teamMode,
      baseBranch: config.baseBranch,
      internalTemplateDir: getInternalTemplatePath(),
    }),
    {
      name: wuName,
      cls,
      writeClass,
      baseBranch: ctx.baseRef,
      locationTemplate: config.locationTemplate,
      postCreateScript: config.postCreateScript,
      primaryWorktreePath: config.primaryWorktreePath,
      registeredHarnessDirs: config.registeredHarnessDirs,
      repo: config.repo,
      sourceIndex: { cwd: ctx.cwd, fs: ctx.metaFs },
      spawningIdentity: ctx.identity,
    },
  );
  if (result.status === "rejected") {
    p.log.error(result.reason);
    process.exitCode = 1;
    return;
  }

  p.note(
    [
      `Work unit: ${wuName}`,
      `Branch:    ${result.branch}`,
      ...(result.worktreePath === undefined ? [] : [`Worktree:  ${result.worktreePath}`]),
      `Meta:      ${result.metaPath}`,
    ].join("\n"),
    "Graduated",
  );
  if (result.postCreateNotice) p.log.info(result.postCreateNotice);
  reportAdvisories(result.outcome);
  if (result.notice) p.log.info(result.notice);
  if (result.worktreePath !== undefined) {
    const roadmap = await refreshRoadmapForStartCeremony(ctx, result.worktreePath);
    if (!roadmap.ok) {
      p.log.error(roadmap.reason);
      process.exitCode = 1;
      return;
    }
    const ceremony = await commitAndPushStartCeremony(ctx, {
      cwd: result.worktreePath,
      branch: result.branch,
      stagePaths: [`.arc/active/meta-${wuName}.md`, ".arc/backlog/ROADMAP.md"],
      message: buildGraduateCeremonyCommitMessage(wuName),
    });
    if (!ceremony.ok) {
      p.log.error(ceremony.reason);
      process.exitCode = 1;
      return;
    }
    await stampStartSessionNotesCommit(ctx, {
      cwd: result.worktreePath,
      identity: ctx.identity,
      wuName,
      commit: ceremony.commit,
    });
    p.log.info(`Committed ${ceremony.commit} and pushed ${result.branch}.`);
    reportWorktreeEntryRecipe(result.worktreePath);
  }
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
        executor: buildExecutorContext({
          ...ctx,
          teamMode: settings["team.mode"] === "true",
          baseBranch: settings["branch.base"],
          internalTemplateDir: getInternalTemplatePath(),
        }),
        fs: {
          writeFile: (path, content) => ctx.io.writeFile(path, content),
          mkdir: (path, opts) => ctx.io.mkdir(path, opts),
          rm: (path) => rm(path),
          readdir: (path) => readdir(path),
          rmdir: (path) => rmdir(path),
        },
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
        baseBranch: config.baseBranch,
        internalTemplateDir: getInternalTemplatePath(),
      }),
      fs: {
        writeFile: (path, content) => ctx.io.writeFile(path, content),
        mkdir: (path, opts) => ctx.io.mkdir(path, opts),
        rm: (path) => rm(path),
        readdir: (path) => readdir(path),
        rmdir: (path) => rmdir(path),
      },
    },
    {
      name: wuName,
      locationTemplate: config.locationTemplate,
      postCreateScript: config.postCreateScript,
      primaryWorktreePath: config.primaryWorktreePath,
      registeredHarnessDirs: config.registeredHarnessDirs,
      repo: config.repo,
      spawningIdentity: ctx.identity,
    },
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

  // On a protected base, cold-start cuts `plan/<name>` rather than scaffolding
  // onto the base — word the offer for it.
  const { settings } = await readConfigSettings(ctx.cwd);
  const onProtectedBase = isProtectedBranch(settings, branch);

  // The arc-session skill confirms the gathered context before invoking, so its
  // non-interactive (no-TTY) call skips this prompt; a direct human run still gets it.
  if (!skipConfirm(opts)) {
    const previewName = deriveColdStartWuName(name, branch) ?? "(name from branch)";
    const prompt = onProtectedBase
      ? `Protected base '${branch}' — cut plan/${previewName} and cold-start "${previewName}" onto it?`
      : `Cold-start work unit "${previewName}" on branch ${branch} in this worktree?`;
    if (!(await confirmStep(prompt))) {
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
    `Branch:    ${r.branch}${r.cutFromBase ? ` (cut off protected base ${r.cutFromBase})` : ""}`,
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

function reportWorktreeEntryRecipe(worktreePath: string): void {
  p.note(renderWorktreeEntryRecipe({ worktreePath }), "Next session");
}

interface StartCeremonyOptions {
  cwd: string;
  branch: string;
  stagePaths: string[];
  message: string;
}

type StartCeremonyResult =
  | { ok: true; commit: string }
  | { ok: false; reason: string };

function commitMessageArgs(message: string): string[] {
  const [subject = "", ...bodyLines] = message.trimEnd().split("\n");
  const body = bodyLines.join("\n").trim();
  return body === "" ? ["-m", subject] : ["-m", subject, "-m", body];
}

async function commitAndPushStartCeremony(
  ctx: ArmContext,
  opts: StartCeremonyOptions,
): Promise<StartCeremonyResult> {
  try {
    await ctx.io.exec("git", ["add", ...opts.stagePaths], { cwd: opts.cwd });
    await ctx.io.exec("git", ["commit", ...commitMessageArgs(opts.message)], { cwd: opts.cwd });
    const { stdout } = await ctx.io.exec("git", ["rev-parse", "--short", "HEAD"], { cwd: opts.cwd });
    const commit = stdout.trim() || "HEAD";
    try {
      await ctx.io.exec("git", ["push", "-u", "origin", opts.branch], { cwd: opts.cwd });
    } catch (err) {
      // The commit already landed; only the push failed. Surface the SHA and a
      // retry so the user resumes the push rather than re-running the ceremony.
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        reason:
          `commit ${commit} landed in ${opts.cwd}, but push failed: ${message}. ` +
          `Retry with \`git push -u origin ${opts.branch}\`.`,
      };
    }
    return { ok: true, commit };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `start ceremony commit/push failed: ${message}` };
  }
}

type RefreshRoadmapResult = { ok: true } | { ok: false; reason: string };

async function refreshRoadmapForStartCeremony(
  ctx: ArmContext,
  cwd: string,
): Promise<RefreshRoadmapResult> {
  try {
    const { settings } = await readConfigSettings(cwd);
    const exec: GitExec = (cmd, args, opts) => ctx.io.exec(cmd, args, { cwd, ...opts });
    const fs = {
      readFile: (p: string) => ctx.io.readFile(p),
      readdir: (p: string) => readdir(p, { withFileTypes: true }),
    };
    const view = await renderTrackedProjectReadinessView({
      cwd,
      exec,
      fs,
      baseBranch: settings["branch.base"],
    });
    const dir = join(cwd, ".arc", "backlog");
    await ensureDir(dir, ctx.io.mkdir);
    await ctx.io.writeFile(join(dir, "ROADMAP.md"), view.endsWith("\n") ? view : `${view}\n`);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `ROADMAP regen failed: ${message}` };
  }
}

async function stampStartSessionNotesCommit(
  ctx: ArmContext,
  opts: { cwd: string; identity: string; wuName: string; commit: string },
): Promise<void> {
  const notesPath = join(opts.cwd, ".arc", "user", opts.identity, opts.wuName, "SESSION-NOTES.md");
  try {
    const content = await ctx.io.readFile(notesPath);
    const next = content.replace(
      /\*\*Commit at Handoff:\*\*\s+`[^`]+`/u,
      `**Commit at Handoff:** \`${opts.commit}\``,
    );
    if (next !== content) await ctx.io.writeFile(notesPath, next);
  } catch {
    // Best-effort: the tracked ceremony is complete; a missing gitignored seed is
    // a degraded resume aid, not a failed start.
  }
}
