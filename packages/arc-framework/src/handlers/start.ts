/**
 * Handler for `arc start`. Resolves the ambient context (worktree root, current
 * branch, identity), dispatches to one of two modes, and reports.
 *
 * Default (bare `arc start <name>`) is create-new: spawn an isolated worktree on
 * a new `plan/<name>` branch via {@link runCreateNew}. `--here` is the in-place
 * override (cold-start / use-existing): scaffold into the worktree the session is
 * already in via {@link runColdStart}.
 *
 * @module
 */

import * as p from "@clack/prompts";

import { runColdStart, runCreateNew, deriveColdStartWuName } from "../commands/start.js";
import { getInternalTemplatePath } from "../lib/paths.js";
import { createUserIOContext } from "../lib/io-context.js";
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

  // Create-new (default): spawn a fresh worktree on a new plan/ branch. Requires
  // an explicit name — unlike cold-start there is no current branch to derive one.
  if (!opts.here) {
    const wuName = name?.trim();
    if (!wuName) {
      p.log.error("Create-new mode requires a work-unit name: `arc start <name>`.");
      process.exitCode = 1;
      return;
    }

    if (!opts.yes && !isNonInteractiveEnvironment()) {
      const proceed = await p.confirm({
        message: `Spawn a new worktree for work unit "${wuName}" on a new plan/${wuName} branch?`,
        initialValue: true,
      });
      if (p.isCancel(proceed) || !proceed) {
        p.log.info("Create-new cancelled.");
        return;
      }
    }

    const outcome = await runCreateNew(
      { io, internalTemplateDir: getInternalTemplatePath() },
      { worktreePath: cwd, identity, name },
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
    return;
  }

  const branch = await resolveCurrentBranchName(io.exec);
  if (!branch) {
    p.log.error(
      "Cannot resolve the current branch (detached HEAD?). Check out a branch before cold-starting.",
    );
    process.exitCode = 1;
    return;
  }

  // The arc-session skill confirms the gathered context with the user before
  // invoking, so its non-interactive (no-TTY) call skips this prompt; a direct
  // human run in a terminal still gets it.
  if (!opts.yes && !isNonInteractiveEnvironment()) {
    const previewName = deriveColdStartWuName(name, branch) ?? "(name from branch)";
    const proceed = await p.confirm({
      message: `Cold-start work unit "${previewName}" on branch ${branch} in this worktree?`,
      initialValue: true,
    });
    if (p.isCancel(proceed) || !proceed) {
      p.log.info("Cold-start cancelled.");
      return;
    }
  }

  const outcome = await runColdStart(
    { io, internalTemplateDir: getInternalTemplatePath() },
    { worktreePath: cwd, branch, identity, name, from: opts.from },
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
