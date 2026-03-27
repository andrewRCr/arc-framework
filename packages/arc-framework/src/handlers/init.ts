/**
 * Handler for the `arc init` command.
 *
 * @module
 */

import * as p from "@clack/prompts";
import { readFile } from "node:fs/promises";

import { runInit, buildPostInitMessage } from "../commands/init.js";
import { buildNonInteractivePrompts } from "../prompts/non-interactive.js";
import { runInitPrompts } from "../prompts/init-prompts.js";
import { loadRecipeFile } from "../lib/template/index.js";
import { formatError, UserFacingError } from "../lib/errors.js";
import { getArcTemplatePath, getInternalTemplatePath, getRecipePath } from "../lib/paths.js";
import { getFrameworkVersion } from "../lib/version.js";
import { createIOContext } from "../lib/io-context.js";
import {
  isNonInteractiveEnvironment, requireGitRepo, resolveIdentityWithPrompt,
  isHandledError,
} from "./shared.js";

export interface InitOptions {
  yes?: boolean;
  name?: string;
  pmMode?: string;
  tools?: string;
  team?: boolean;
}

export async function handleInit(opts: InitOptions): Promise<void> {
  // Auto-detect CI/non-TTY and imply --yes
  if (!opts.yes && isNonInteractiveEnvironment()) {
    opts.yes = true;
    p.log.info("Non-interactive environment detected (CI or non-TTY) — using defaults.");
  }

  p.intro(`ARC Framework v${getFrameworkVersion()} \u2502 Initialization`);

  if (!(await requireGitRepo())) return;

  p.log.message("Setting up ARC for your project...");

  const cwd = process.cwd();
  const io = createIOContext();

  // Build prompts from flags or interactive prompts
  let prompts;
  if (opts.yes) {
    prompts = buildNonInteractivePrompts({
      cwd,
      name: opts.name,
      pmMode: opts.pmMode,
      tools: opts.tools,
      team: opts.team,
    });
    if (!opts.tools) {
      p.log.info("No agent tools selected (use --tools to specify).");
    }
  } else {
    prompts = await runInitPrompts(cwd);
    if (!prompts) {
      return;
    }
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

  // Load recipe
  const templateDir = getArcTemplatePath();
  const recipe = await loadRecipeFile(getRecipePath(), (f) => readFile(f, "utf-8"));

  // Run init with progress feedback
  const spinner = p.spinner();
  spinner.start("Installing ARC framework...");

  try {
    const result = await runInit({
      cwd,
      io,
      templateDir,
      internalTemplateDir: getInternalTemplatePath(),
      recipe,
      prompts,
      identityResult,
    });

    if (!result) {
      spinner.stop("Installation cancelled.");
      return;
    }

    spinner.stop("Installation complete.");
    p.note(buildPostInitMessage(result), "What's next");
  } catch (err) {
    spinner.stop("Setup failed.");
    if (isHandledError(err)) return;
    throw err;
  }

  p.outro("Done.");
}
