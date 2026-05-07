/**
 * Handler for the `arc join` command.
 *
 * @module
 */

import * as p from "@clack/prompts";
import { unlink, rmdir } from "node:fs/promises";

import { runJoin, runJoinReconfigure, buildPostJoinMessage } from "../commands/join.js";
import type { JoinPromptResult } from "../commands/join.js";
import { runJoinPrompts } from "../prompts/join-prompts.js";
import { validateTools } from "../lib/skills/index.js";
import { formatError, UserFacingError } from "../lib/errors.js";
import { getArcTemplatePath, getInternalTemplatePath } from "../lib/paths.js";
import { getFrameworkVersion } from "../lib/version.js";
import { createIOContext } from "../lib/io-context.js";
import { gitExec } from "../lib/io-context.js";
import { readConfigSettings } from "../lib/config/status-reader.js";
import {
  isNonInteractiveEnvironment, requireArcProjectRoot, requireGitRepo, resolveIdentityWithPrompt,
  isHandledError,
} from "./shared.js";

export interface JoinOptions {
  contributor?: boolean;
  yes?: boolean;
  tools?: string;
  reconfigure?: boolean;
}

export async function handleJoin(opts: JoinOptions): Promise<void> {
  // Auto-detect CI/non-TTY and imply --yes
  if (!opts.yes && isNonInteractiveEnvironment()) {
    opts.yes = true;
    p.log.info("Non-interactive environment detected (CI or non-TTY) — using defaults.");
  }

  if (opts.reconfigure) {
    await handleJoinReconfigure(opts);
    return;
  }

  p.intro(`ARC Framework v${getFrameworkVersion()} \u2502 Join Project`);

  if (!(await requireGitRepo())) return;

  const cwd = requireArcProjectRoot();
  if (!cwd) return;
  const io = createIOContext();
  const { settings } = await readConfigSettings(cwd);
  const pmMode = settings["pm.mode"];

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

    p.note(buildPostJoinMessage(result), "What's next");
  } catch (err) {
    spinner.stop("Setup failed.");
    if (isHandledError(err)) return;
    throw err;
  }

  p.outro("Done.");
}

// --- Join Reconfigure path ---

async function handleJoinReconfigure(opts: JoinOptions): Promise<void> {
  p.intro(`ARC Framework v${getFrameworkVersion()} \u2502 Reconfigure Workspace`);

  if (!(await requireGitRepo())) return;

  const cwd = requireArcProjectRoot();
  if (!cwd) return;
  const io = createIOContext();

  // Read current role from git config
  let currentRole: "maintainer" | "contributor" = "maintainer";
  try {
    const result = await gitExec("git", ["config", "--get", "arc.role"]);
    const val = result.stdout.trim();
    if (val === "contributor") currentRole = "contributor";
  } catch {
    // Not set — default to maintainer
  }

  // Read current tools from git config
  let currentTools: string[] = [];
  try {
    const result = await gitExec("git", ["config", "--get", "arc.tools"]);
    const val = result.stdout.trim();
    if (val) {
      currentTools = val.split(",").map((t) => t.trim()).filter(Boolean);
    }
  } catch {
    // Not set — default to empty
  }

  // Build new prompts with current values as defaults
  let prompts: JoinPromptResult;
  if (opts.yes) {
    const tools = opts.tools
      ? opts.tools.split(",").map((t) => t.trim()).filter(Boolean)
      : currentTools;
    if (tools.length > 0) {
      validateTools(tools);
    }
    prompts = {
      role: opts.contributor ? "contributor" : currentRole,
      tools,
    };
  } else {
    const result = await runJoinPrompts({
      contributor: opts.contributor,
      currentRole,
      currentTools,
    });
    if (!result) {
      return;
    }
    prompts = result;
  }

  // No-change detection
  if (
    prompts.role === currentRole &&
    prompts.tools.length === currentTools.length &&
    prompts.tools.every((t) => currentTools.includes(t))
  ) {
    p.log.info("Nothing to change — all settings match the current configuration.");
    p.outro("Done.");
    return;
  }

  const templateDir = getArcTemplatePath();

  const spinner = p.spinner();
  spinner.start("Reconfiguring workspace...");

  try {
    const result = await runJoinReconfigure({
      cwd,
      io,
      templateDir,
      prompts,
      previousTools: currentTools,
      removeIO: { access: io.access, unlink, rmdir },
    });

    spinner.stop("Workspace reconfiguration complete.");

    const parts: string[] = [];
    if (result.role !== currentRole) {
      parts.push(`Role: ${currentRole} → ${result.role}`);
    }
    if (result.removedSkills.length > 0) {
      parts.push(`${result.removedSkills.length} old skill(s) removed`);
    }
    if (result.tools.length > 0) {
      parts.push(`Skills generated for: ${result.tools.join(", ")}`);
    }

    if (parts.length > 0) {
      p.log.info(parts.join("\n"));
    }

    if (result.tools.length > 0) {
      p.note("Restart your AI tool so updated skills are available.", "What's next");
    }
  } catch (err) {
    spinner.stop("Reconfiguration failed.");
    if (isHandledError(err)) return;
    throw err;
  }

  p.outro("Done.");
}
