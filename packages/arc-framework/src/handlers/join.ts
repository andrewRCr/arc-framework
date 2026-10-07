/**
 * Handler for the `arc join` command.
 *
 * @module
 */

import * as p from "@clack/prompts";
import { joinIdentityPromptSite } from "../prompts/identity-prompt-sites.js";
import { unlink, rmdir } from "node:fs/promises";

import { runJoin, runJoinReconfigure, buildPostJoinMessage } from "../commands/join.js";
import type { JoinPromptResult } from "../commands/join.js";
import { resolveJoinCommandInput, type JoinCommandOptions } from "../commands/join-input.js";
import { runJoinPrompts } from "../prompts/join-prompts.js";
import { getArcTemplatePath, getInternalTemplatePath } from "../lib/paths.js";
import { getFrameworkVersion } from "../lib/version.js";
import { createIOContext } from "../lib/io-context.js";
import {
  resolveProcessInteractionContext,
  type InteractionContext,
} from "../lib/command-input/interaction-context.js";
import type { InputResolution } from "../lib/command-input/resolution.js";
import {
  requireArcProjectRoot, requireGitRepo, resolveIdentityWithPrompt,
  isHandledError,
} from "./shared.js";

export type JoinOptions = JoinCommandOptions;

export async function handleJoin(opts: JoinOptions, suppliedContext?: InteractionContext): Promise<void> {
  const context = suppliedContext ?? resolveProcessInteractionContext({
    noInput: false,
    machineReadable: false,
    yes: opts.yes === true ? "compatibility" : "absent",
  });
  const io = createIOContext(context.subprocess);

  if (opts.reconfigure) {
    await handleJoinReconfigure(opts, context);
    return;
  }

  p.intro(`ARC Framework v${getFrameworkVersion()} \u2502 Join Project`);

  if (!(await requireGitRepo(io.exec))) return;

  const cwd = requireArcProjectRoot();
  if (!cwd) return;
  const input = await resolveJoinCommandInput({
    options: opts,
    context,
    prompt: async (supplied) => runJoinPrompts(context, {
      suppliedRole: supplied.role,
      suppliedTools: supplied.tools,
    }),
    resolveIdentity: () => resolveIdentityWithPrompt(joinIdentityPromptSite, context, io.exec),
  });
  if (input.kind !== "resolved") {
    reportJoinInputFailure(input);
    return;
  }
  const prompts: JoinPromptResult = { role: input.value.role, tools: input.value.tools };
  const identityResult = input.value.identity ?? null;

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

function reportJoinInputFailure(input: Exclude<InputResolution<unknown>, { kind: "resolved" }>): void {
  if (input.kind === "cancelled") return;
  if (input.kind === "unavailable") {
    p.log.error(`Missing required input: ${input.missing.map((item) => {
      const syntax = item.acceptedSyntax.length === 0 ? "" : ` (${item.acceptedSyntax.join(" or ")})`;
      return `${item.name}${syntax}`;
    }).join(", ")}`);
  } else {
    p.log.error(input.issues.map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`).join("\n"));
  }
  process.exitCode = 1;
}

// --- Join Reconfigure path ---

async function handleJoinReconfigure(opts: JoinOptions, context: InteractionContext): Promise<void> {
  p.intro(`ARC Framework v${getFrameworkVersion()} \u2502 Reconfigure Workspace`);
  const io = createIOContext(context.subprocess);

  if (!(await requireGitRepo(io.exec))) return;

  const cwd = requireArcProjectRoot();
  if (!cwd) return;

  // Read current role from git config
  let currentRole: "maintainer" | "contributor" = "maintainer";
  try {
    const result = await io.exec("git", ["config", "--get", "arc.role"]);
    const val = result.stdout.trim();
    if (val === "contributor") currentRole = "contributor";
  } catch {
    // Not set — default to maintainer
  }

  // Read current tools from git config
  let currentTools: string[] = [];
  try {
    const result = await io.exec("git", ["config", "--get", "arc.tools"]);
    const val = result.stdout.trim();
    if (val) {
      currentTools = val.split(",").map((t) => t.trim()).filter(Boolean);
    }
  } catch {
    // Not set — default to empty
  }

  const input = await resolveJoinCommandInput({
    options: opts,
    context,
    prompt: async (supplied) => runJoinPrompts(context, {
      suppliedRole: supplied.role,
      suppliedTools: supplied.tools,
      currentRole,
      currentTools,
    }),
  });
  if (input.kind !== "resolved") {
    reportJoinInputFailure(input);
    return;
  }
  const prompts: JoinPromptResult = { role: input.value.role, tools: input.value.tools };

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
