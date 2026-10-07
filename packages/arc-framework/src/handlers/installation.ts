/**
 * Handlers for installation lifecycle commands: update, health, diff.
 *
 * @module
 */

import * as p from "../lib/terminal.js";
import { readFile } from "node:fs/promises";
import { execa } from "execa";

import { runUpdate, buildUpdateSummary } from "../commands/update.js";
import { runHealth, buildHealthSummary } from "../commands/health.js";
import { runDiff, buildDiffOutput } from "../commands/diff.js";
import { loadRecipeFile } from "../lib/template/index.js";
import { readManifest } from "../lib/manifest/index.js";
import { listArcFiles } from "../lib/fs.js";
import { getArcTemplatePath, getRecipePath, getChangelogPath } from "../lib/paths.js";
import { getFrameworkVersion, checkLatestVersion } from "../lib/version.js";
import { createIOContext } from "../lib/io-context.js";
import { MAX_GIT_OUTPUT_BYTES } from "../lib/git/process-executor.js";
import { normalizeGitRejection } from "../lib/git/process-error.js";
import { runWithSpinner, isHandledError, requireArcProjectRoot } from "./shared.js";
import { createSyncOutput } from "../lib/sync-output.js";
import { readChangelog, filterChangelogRange, buildChangelogDisplay } from "../lib/changelog.js";
import { declareInteractionSite, type CommandInputDeclaration } from "../lib/command-input/declaration.js";
import type { InteractionContext } from "../lib/command-input/interaction-context.js";

/** Terminal-process policy owned by the update adapter. */
export const installationCommandInputPolicyDeclarations = [{
  commandPath: "update", aliases: [], sites: [declareInteractionSite(
    { file: "handlers/installation.ts", kind: "subprocess", callee: "execa", occurrence: 1 },
    {
      acquisition: "subprocess", schemaOwnership: "none", cancellation: "not-applicable",
      automation: { noInput: "disable-terminal-input", flags: [], acceptedSyntax: [] },
      mutationBoundary: "update subprocess boundary", subprocess: "terminal-prompts",
    },
  )],
}] satisfies readonly CommandInputDeclaration[];

// --- Update ---

export async function handleUpdate(
  options: { quiet?: boolean } = {},
  interaction?: InteractionContext,
): Promise<void> {
  p.intro("arc update");

  const output = createSyncOutput(false);
  const templateDir = getArcTemplatePath();
  const recipe = await loadRecipeFile(getRecipePath(), (f) => readFile(f, "utf-8"));

  try {
    const cwd = requireArcProjectRoot();
    if (!cwd) return;
    const result = await runWithSpinner(
      output,
      "Updating ARC framework files...",
      () => runUpdate({ cwd, io: createIOContext(interaction?.subprocess), templateDir, recipe }),
      "Update complete.",
    );

    p.note(buildUpdateSummary(result), "Update summary");

    if (result.conflicts.length > 0) {
      p.log.warn("Resolve conflicts before committing.");
    }

    if (!options.quiet && result.previousVersion !== result.currentVersion) {
      const changelog = await readChangelog(getChangelogPath());
      if (changelog) {
        const range = filterChangelogRange(changelog, result.previousVersion, result.currentVersion);
        const display = buildChangelogDisplay(range);
        if (display) {
          p.note(display, "What's new");
          if (range.hasBreaking) {
            p.log.warn("This update includes breaking changes — review the details above.");
          }
        }
      }
    }
  } catch (err) {
    if (isHandledError(err)) return;
    throw err;
  }

  p.outro("Done.");
}

// --- Health ---

/**
 * Resolve the optional registry-derived version shown by `arc health`.
 *
 * @param environment - Process environment controlling production composition.
 * @param requestLatestVersion - Registry request boundary.
 * @returns The latest version when checked, or `null` when unavailable.
 */
export function resolveHealthLatestVersion(
  environment: NodeJS.ProcessEnv,
  requestLatestVersion: () => Promise<string | null>,
): Promise<string | null> {
  if (environment.ARC_DISABLE_UPDATE_CHECKS === "1") return Promise.resolve(null);
  return requestLatestVersion();
}

export async function handleHealth(): Promise<void> {
  p.intro("arc health");

  try {
    const cwd = requireArcProjectRoot();
    if (!cwd) return;
    // Resolve the optional registry version in parallel with health computation.
    const latestVersionPromise = resolveHealthLatestVersion(
      process.env,
      () => checkLatestVersion("@arc-framework/cli"),
    );
    const result = await runHealth({
      cwd,
      io: {
        readFile: (path) => readFile(path, "utf-8"),
        readManifest: (path) => readManifest(path, (p) => readFile(p, "utf-8")),
        readdir: (arcDir) => listArcFiles(arcDir),
      },
      frameworkVersion: getFrameworkVersion(),
      latestVersion: await latestVersionPromise,
    });

    p.note(buildHealthSummary(result), "Health");

    if (result.updateAvailable) {
      p.log.warn("Run 'arc update' to apply framework changes.");
    }
  } catch (err) {
    if (isHandledError(err)) return;
    throw err;
  }

  p.outro("Done.");
}

// --- Diff ---

export async function handleDiff(): Promise<void> {
  p.intro("arc diff");

  try {
    const cwd = requireArcProjectRoot();
    if (!cwd) return;
    const result = await runDiff({
      cwd,
      io: {
        readFile: (path) => readFile(path, "utf-8"),
        readManifest: (path) => readManifest(path, (p) => readFile(p, "utf-8")),
        gitDiff: realGitDiff,
      },
    });

    const output = buildDiffOutput(result);
    if (result.totalChanged > 0 || result.errors.length > 0) {
      p.log.message(output);
    } else {
      p.log.success(output);
    }
  } catch (err) {
    if (isHandledError(err)) return;
    throw err;
  }

  p.outro("Done.");
}

/**
 * Run `git diff --no-index`, retaining exit 1 as domain data.
 *
 * @param pristinePath - Pristine file to compare.
 * @param currentPath - Current file to compare.
 * @param command - Git executable; injectable for process-boundary tests.
 * @returns The rendered diff, or an empty string when the files match.
 */
export async function realGitDiff(
  pristinePath: string,
  currentPath: string,
  command = "git",
): Promise<string> {
  const args = ["diff", "--no-index", "--", pristinePath, currentPath];
  const result = await execa(command, args, {
    reject: false,
    stripFinalNewline: false,
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
  });
  if (!result.failed || result.exitCode === 1) return result.stdout;
  throw normalizeGitRejection(result, { command, args });
}
