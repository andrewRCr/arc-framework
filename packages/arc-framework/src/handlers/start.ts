/**
 * Handler for `arc start`. Resolves the ambient context (worktree root, current
 * branch, identity), runs the cold-start orchestrator, and reports.
 *
 * Today only the `--here` (cold-start / use-existing) mode is wired; bare
 * `arc start <name>` (create-new) is not yet available and errors with a
 * pointer to `--here`.
 *
 * @module
 */

import * as p from "@clack/prompts";

import { runColdStart, deriveColdStartWuName } from "../commands/start.js";
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
  /** Cold-start into the current worktree (the only mode available today). */
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

  if (!opts.here) {
    p.log.error(
      "Create-new mode is not yet available. Use `--here` to cold-start a work unit "
      + "in the current worktree.",
    );
    process.exitCode = 1;
    return;
  }

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
