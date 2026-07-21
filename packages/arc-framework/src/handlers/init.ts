/**
 * Handler for the `arc init` command.
 *
 * @module
 */

import * as p from "@clack/prompts";
import { readFile } from "node:fs/promises";

import { runInit, buildPostInitMessage, isArcInstalled } from "../commands/init.js";
import { resolveInitCommandInput, type InitCommandOptions } from "../commands/init-input.js";
import { runReconfigure, type DryRunResult } from "../commands/reconfigure.js";
import { runInitPrompts } from "../prompts/init-prompts.js";
import { loadRecipeFile } from "../lib/template/index.js";
import { readManifest } from "../lib/manifest/index.js";
import { formatError, UserFacingError } from "../lib/errors.js";
import { getArcTemplatePath, getInternalTemplatePath, getRecipePath } from "../lib/paths.js";
import { getFrameworkVersion } from "../lib/version.js";
import { createIOContext } from "../lib/io-context.js";
import { gitExec } from "../lib/io-context.js";
import {
  resolveProcessInteractionContext,
  type InteractionContext,
} from "../lib/command-input/interaction-context.js";
import type { InputResolution } from "../lib/command-input/resolution.js";
import {
  INTERNAL_DIR_SEGMENTS, MANIFEST_FILENAME,
} from "../lib/constants.js";
import {
  requireArcProjectRoot, requireGitRepo, resolveIdentityWithPrompt,
  isHandledError,
} from "./shared.js";

export type InitOptions = InitCommandOptions;

export async function handleInit(
  opts: InitOptions,
  suppliedContext?: InteractionContext,
): Promise<void> {
  const context = suppliedContext ?? resolveProcessInteractionContext({
    noInput: false,
    machineReadable: false,
    yes: opts.yes === true ? "compatibility" : "absent",
  });

  const cwd = process.cwd();
  const io = createIOContext(context.subprocess);

  // --- Three-way entry branch ---
  if (opts.reconfigure) {
    await handleReconfigure(opts, cwd, io, context);
    return;
  }

  // --- Fresh init path ---
  p.intro(`ARC Framework v${getFrameworkVersion()} \u2502 Initialization`);

  if (!(await requireGitRepo())) return;

  p.log.message("Setting up ARC for your project...");

  const input = await resolveInitCommandInput({
    options: opts,
    cwd,
    context,
    prompt: async (supplied) => {
      const result = await runInitPrompts(cwd, {
        name: supplied.projectName,
        tools: supplied.tools,
        pmMode: supplied.pmMode,
        teamMode: supplied.teamMode,
      });
      return result === null ? null : {
        projectName: result.project_name,
        tools: result.tools,
        pmMode: result.pm_mode,
        teamMode: result.team_mode,
      };
    },
    resolveIdentity: resolveIdentityWithPrompt,
  });
  if (input.kind !== "resolved") {
    reportInputFailure(input);
    return;
  }
  const prompts = {
    project_name: input.value.projectName,
    tools: input.value.tools,
    pm_mode: input.value.pmMode,
    team_mode: input.value.teamMode,
  };
  const identityResult = input.value.identity ?? null;

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

function reportInputFailure(input: Exclude<InputResolution<unknown>, { kind: "resolved" }>): void {
  if (input.kind === "cancelled") return;
  if (input.kind === "unavailable") {
    if (input.missing.some((item) => item.name === "identity")) {
      p.log.error("IDENTITY_MISSING: Could not resolve identity in non-interactive mode. Pass --identity <name>.");
      process.exitCode = 1;
      return;
    }
    const detail = input.missing.map((item) => {
      const syntax = item.acceptedSyntax.length === 0 ? "" : ` (${item.acceptedSyntax.join(" or ")})`;
      return `${item.name}${syntax}`;
    }).join(", ");
    p.log.error(`Missing required input: ${detail}`);
  } else {
    p.log.error(input.issues.map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`).join("\n"));
  }
  process.exitCode = 1;
}

// --- Reconfigure path ---

import type { IOContext } from "../commands/init.js";
import { join } from "node:path";
import {
  runReconfigurePrompts,
  buildReconfigureConfig,
  buildNonInteractiveReconfigurePrompts,
  isNoChange,
} from "../prompts/reconfigure-prompts.js";
import {
  resolveRemovalsInteractive,
  resolveRemovalsNonInteractive,
} from "../prompts/removal-prompts.js";

async function handleReconfigure(
  opts: InitOptions,
  startDir: string,
  io: IOContext,
  context: InteractionContext,
): Promise<void> {
  p.intro(`ARC Framework v${getFrameworkVersion()} \u2502 Reconfigure${opts.dryRun ? " (dry run)" : ""}`);

  if (!(await requireGitRepo())) return;
  const cwd = requireArcProjectRoot(startDir);
  if (!cwd) return;

  // Require existing installation
  if (!(await isArcInstalled(cwd, io.access))) {
    p.log.error(formatError(new UserFacingError({
      code: "NOT_INSTALLED",
      whatHappened: "Cannot reconfigure — ARC is not installed",
      why: "The --reconfigure flag requires an existing ARC installation.",
      whatToDo: "Run 'arc init' first to install ARC, then use --reconfigure to change settings.",
    })));
    process.exitCode = 1;
    return;
  }

  // Role gate: require maintainer (or unset)
  let role: string | undefined;
  try {
    const result = await gitExec("git", ["config", "--get", "arc.role"]);
    role = result.stdout.trim() || undefined;
  } catch {
    // Not set — treated as maintainer
  }

  if (role === "contributor") {
    p.log.error(formatError(new UserFacingError({
      code: "ROLE_FORBIDDEN",
      whatHappened: "Contributors cannot reconfigure project settings",
      why: "The --reconfigure flag changes project-wide settings stored in the manifest. Only maintainers can change these.",
      whatToDo: "Ask a maintainer to run 'arc init --reconfigure', or change your role with 'arc join'.",
    })));
    process.exitCode = 1;
    return;
  }

  // Read current manifest to get install_config
  const internalDir = join(cwd, ".arc", ...INTERNAL_DIR_SEGMENTS);
  const manifestPath = join(internalDir, MANIFEST_FILENAME);
  let manifest;
  try {
    manifest = await readManifest(manifestPath, io.readFile);
  } catch (err) {
    p.log.error(formatError(err instanceof UserFacingError ? err : new UserFacingError({
      code: "MANIFEST_INVALID",
      whatHappened: "The manifest file is invalid",
      why: (err as Error).message,
      whatToDo: "Run 'arc init' to recreate the manifest, or fix the JSON manually.",
    })));
    process.exitCode = 1;
    return;
  }
  if (!manifest) {
    p.log.error(formatError(new UserFacingError({
      code: "MANIFEST_MISSING",
      whatHappened: "Manifest not found",
      why: "Expected .arc/system/.internal/manifest.json to exist.",
      whatToDo: "Run 'arc init' to recreate the installation.",
    })));
    process.exitCode = 1;
    return;
  }

  const currentConfig = manifest.install_config;

  const resolvedInput = await resolveInitCommandInput({
    options: opts,
    cwd,
    context,
    current: {
      projectName: currentConfig.project_name,
      pmMode: currentConfig.pm_mode,
      teamMode: currentConfig.team_mode ?? false,
    },
    prompt: async (supplied) => {
      const result = await runReconfigurePrompts(currentConfig, {
        projectName: supplied.projectName,
        pmMode: supplied.pmMode,
        teamMode: supplied.teamMode,
      });
      return result === null ? null : {
        projectName: result.project_name,
        tools: currentConfig.tools,
        pmMode: result.pm_mode,
        teamMode: result.team_mode,
      };
    },
    resolveIdentity: () => Promise.resolve(null),
  });
  if (resolvedInput.kind !== "resolved") {
    reportInputFailure(resolvedInput);
    return;
  }
  const promptResult = buildNonInteractiveReconfigurePrompts(currentConfig, {
    name: resolvedInput.value.projectName,
    pmMode: resolvedInput.value.pmMode,
    team: resolvedInput.value.teamMode,
  });

  // Re-affirm role only after every input for this mutation phase has resolved.
  await io.exec("git", ["config", "--local", "arc.role", "maintainer"]);

  // No-change detection
  if (isNoChange(promptResult, currentConfig)) {
    p.log.info("Nothing to change — all settings match the current configuration.");
    p.outro("Done.");
    return;
  }

  const newConfig = buildReconfigureConfig(promptResult, currentConfig);

  // Load recipe
  const templateDir = getArcTemplatePath();
  const recipe = await loadRecipeFile(getRecipePath(), (f) => readFile(f, "utf-8"));

  // Run reconfigure
  const spinner = p.spinner();
  spinner.start("Reconfiguring ARC framework...");

  // Cancellation sentinel for interactive removal prompts
  const cancelledSymbol = Symbol("removal-cancelled");

  try {

    const resolveRemovals = context.interaction === "forbidden"
      ? (removals: import("../lib/manifest/plan.js").PlannedRemoval[]) =>
          Promise.resolve(resolveRemovalsNonInteractive(removals))
      : async (removals: import("../lib/manifest/plan.js").PlannedRemoval[]) => {
          spinner.stop("File changes detected.");
          const decisions = await resolveRemovalsInteractive(removals);
          if (!decisions) {
            // eslint-disable-next-line @typescript-eslint/only-throw-error -- sentinel for clack cancellation flow
            throw cancelledSymbol;
          }
          spinner.start("Applying changes...");
          return decisions;
        };

    const result = await runReconfigure({
      cwd,
      io,
      templateDir,
      recipe,
      newInstallConfig: newConfig,
      resolveRemovals: opts.dryRun ? undefined : resolveRemovals,
      dryRun: opts.dryRun,
    });

    if ("dryRun" in result) {
      spinner.stop("Dry run complete — no changes applied.");
      formatDryRunReport(result);
    } else {
      spinner.stop("Reconfiguration complete.");

      // Summary
      const parts: string[] = [];
      if (result.updated > 0) parts.push(`${result.updated} updated`);
      if (result.added.length > 0) parts.push(`${result.added.length} added`);
      if (result.removed.length > 0) parts.push(`${result.removed.length} removed`);
      if (result.unchanged > 0) parts.push(`${result.unchanged} unchanged`);
      if (result.skipped > 0) parts.push(`${result.skipped} skipped`);
      if (result.conflicts.length > 0) parts.push(`${result.conflicts.length} conflicts`);

      if (parts.length > 0) {
        p.log.info(parts.join(", "));
      }

      if (result.conflicts.length > 0) {
        p.log.warn("Conflicts require manual resolution:");
        for (const path of result.conflicts) {
          p.log.warn(`  .arc/${path}`);
        }
      }

      if (result.keptForReview.length > 0) {
        p.log.info("Kept for review (may contain your changes):");
        for (const path of result.keptForReview) {
          p.log.info(`  .arc/${path}`);
        }
      }

      if (result.keptByUser.length > 0) {
        p.log.info("Kept on disk (removed from ARC tracking):");
        for (const path of result.keptByUser) {
          p.log.info(`  .arc/${path}`);
        }
      }
    }
  } catch (err) {
    if (err === cancelledSymbol) {
      p.cancel("Reconfigure cancelled.");
      return;
    }
    spinner.stop("Reconfiguration failed.");
    if (isHandledError(err)) return;
    throw err;
  }

  p.outro("Done.");
}

// --- Dry-run report formatting ---

function formatDryRunReport(result: DryRunResult): void {
  const hasChanges =
    result.wouldAdd.length > 0 ||
    result.wouldRemove.length > 0 ||
    result.wouldMerge.length > 0;

  if (!hasChanges) {
    p.log.info("Nothing would change.");
    return;
  }

  if (result.wouldAdd.length > 0) {
    p.log.info(`Would add ${result.wouldAdd.length} file(s):`);
    for (const f of result.wouldAdd) {
      p.log.info(`  + .arc/${f.outputPath}`);
    }
  }

  if (result.wouldRemove.length > 0) {
    p.log.info(`Would remove ${result.wouldRemove.length} file(s):`);
    for (const f of result.wouldRemove) {
      p.log.info(`  - .arc/${f.outputPath} (${f.classification})`);
    }
  }

  if (result.wouldMerge.length > 0) {
    p.log.info(`Would re-render ${result.wouldMerge.length} file(s):`);
    for (const f of result.wouldMerge) {
      p.log.info(`  ~ .arc/${f.outputPath}`);
    }
  }
}
