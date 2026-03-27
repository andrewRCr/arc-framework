/**
 * Handler for the `arc join` command.
 *
 * @module
 */

import * as p from "@clack/prompts";

import { runJoin } from "../commands/join.js";
import type { JoinPromptResult } from "../commands/join.js";
import { runJoinPrompts } from "../prompts/join-prompts.js";
import { validateTools } from "../lib/skills/index.js";
import { formatError, UserFacingError } from "../lib/errors.js";
import { getArcTemplatePath, getInternalTemplatePath } from "../lib/paths.js";
import { getFrameworkVersion } from "../lib/version.js";
import { createIOContext } from "../lib/io-context.js";
import {
  isNonInteractiveEnvironment, requireGitRepo, resolveIdentityWithPrompt,
  isHandledError, readPmMode,
} from "./shared.js";

export interface JoinOptions {
  contributor?: boolean;
  yes?: boolean;
  tools?: string;
}

export async function handleJoin(opts: JoinOptions): Promise<void> {
  // Auto-detect CI/non-TTY and imply --yes
  if (!opts.yes && isNonInteractiveEnvironment()) {
    opts.yes = true;
    p.log.info("Non-interactive environment detected (CI or non-TTY) — using defaults.");
  }

  p.intro(`ARC Framework v${getFrameworkVersion()} \u2502 Join Project`);

  if (!(await requireGitRepo())) return;

  const cwd = process.cwd();
  const io = createIOContext();
  const pmMode = await readPmMode(cwd);

  // Build prompts from flags or interactive prompts
  let prompts: JoinPromptResult;
  if (opts.yes) {
    const tools = opts.tools
      ? opts.tools.split(",").map((t) => t.trim()).filter(Boolean)
      : [];
    if (tools.length > 0) {
      validateTools(tools);
    }
    prompts = {
      role: opts.contributor ? "contributor" : "maintainer",
      tools,
    };
    if (!opts.tools) {
      p.log.info("No agent tools selected (use --tools to specify).");
    }
  } else {
    const result = await runJoinPrompts({ contributor: opts.contributor });
    if (!result) {
      return;
    }
    prompts = result;
  }

  // Identity resolution — interactive prompt only when not in --yes mode
  const identityResult = await resolveIdentityWithPrompt(!opts.yes);

  // In --yes mode, identity must be resolvable without prompts
  if (opts.yes && !identityResult) {
    p.log.error(formatError(new UserFacingError({
      code: "IDENTITY_MISSING",
      whatHappened: "Cannot resolve identity in non-interactive mode",
      why: "Neither arc.identity nor user.name is set in git config.",
      whatToDo: "Set git config user.name, or pass an identity via git config arc.identity.",
    })));
    process.exitCode = 1;
    return;
  }

  const templateDir = getArcTemplatePath();

  const spinner = p.spinner();
  spinner.start("Setting up developer workspace...");

  try {
    const result = await runJoin({
      cwd,
      io,
      templateDir,
      internalTemplateDir: getInternalTemplatePath(),
      prompts,
      identityResult,
      pmMode,
    });

    spinner.stop("Workspace setup complete.");

    const lines: string[] = [];
    lines.push(`Joined as ${result.role}.`);
    if (result.tools.length > 0) {
      lines.push("");
      lines.push(
        "Next: Restart your AI tool so the new /arc-resume skill is available, then run it.",
      );
    }
    p.note(lines.join("\n"), "What's next");
  } catch (err) {
    spinner.stop("Setup failed.");
    if (isHandledError(err)) return;
    throw err;
  }

  p.outro("Done.");
}
