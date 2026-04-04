/**
 * Handler for the `arc init` command.
 *
 * @module
 */

import * as p from "@clack/prompts";
import { readFile } from "node:fs/promises";

import { runInit, buildPostInitMessage, isArcInstalled } from "../commands/init.js";
import { runReconfigure, type DryRunResult } from "../commands/reconfigure.js";
import { buildNonInteractivePrompts } from "../prompts/non-interactive.js";
import { runInitPrompts } from "../prompts/init-prompts.js";
import { loadRecipeFile } from "../lib/template/index.js";
import { readManifest } from "../lib/manifest/index.js";
import { formatError, UserFacingError } from "../lib/errors.js";
import { getArcTemplatePath, getInternalTemplatePath, getRecipePath } from "../lib/paths.js";
import { getFrameworkVersion } from "../lib/version.js";
import { createIOContext } from "../lib/io-context.js";
import { gitExec } from "../lib/io-context.js";
import {
  INTERNAL_DIR_SEGMENTS, MANIFEST_FILENAME,
} from "../lib/constants.js";
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
  reconfigure?: boolean;
  dryRun?: boolean;
}

export async function handleInit(opts: InitOptions): Promise<void> {
  // Auto-detect CI/non-TTY and imply --yes
  if (!opts.yes && isNonInteractiveEnvironment()) {
    opts.yes = true;
    p.log.info("Non-interactive environment detected (CI or non-TTY) — using defaults.");
  }

  if (opts.dryRun && !opts.reconfigure) {
    p.log.error("--dry-run requires --reconfigure");
    process.exitCode = 1;
    return;
  }

  const cwd = process.cwd();
  const io = createIOContext();

  // --- Three-way entry branch ---
  if (opts.reconfigure) {
    await handleReconfigure(opts, cwd, io);
    return;
  }

  // --- Fresh init path ---
  p.intro(`ARC Framework v${getFrameworkVersion()} \u2502 Initialization`);

  if (!(await requireGitRepo())) return;

  p.log.message("Setting up ARC for your project...");

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
  cwd: string,
  io: IOContext,
): Promise<void> {
  p.intro(`ARC Framework v${getFrameworkVersion()} \u2502 Reconfigure${opts.dryRun ? " (dry run)" : ""}`);

  if (!(await requireGitRepo())) return;

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

  // Re-affirm role — ensures consistency even if arc.role was unset
  await io.exec("git", ["config", "--local", "arc.role", "maintainer"]);

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

  // Build new config from interactive prompts or CLI flags
  let promptResult;
  if (opts.yes) {
    promptResult = buildNonInteractiveReconfigurePrompts(currentConfig, {
      name: opts.name,
      pmMode: opts.pmMode,
      team: opts.team,
    });
  } else {
    promptResult = await runReconfigurePrompts(currentConfig);
    if (!promptResult) {
      return; // User cancelled
    }
  }

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

    const resolveRemovals = opts.yes
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
