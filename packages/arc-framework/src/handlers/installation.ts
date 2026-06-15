/**
 * Handlers for installation lifecycle commands: update, health, diff.
 *
 * @module
 */

import * as p from "@clack/prompts";
import { readFile } from "node:fs/promises";

import { runUpdate, buildUpdateSummary } from "../commands/update.js";
import { runHealth, buildHealthSummary } from "../commands/health.js";
import { runDiff, buildDiffOutput } from "../commands/diff.js";
import { loadRecipeFile } from "../lib/template/index.js";
import { readManifest } from "../lib/manifest/index.js";
import { listArcFiles } from "../lib/fs.js";
import { getArcTemplatePath, getRecipePath, getChangelogPath } from "../lib/paths.js";
import { getFrameworkVersion, checkLatestVersion } from "../lib/version.js";
import { createIOContext, execFileAsync } from "../lib/io-context.js";
import { runWithSpinner, isHandledError, requireArcProjectRoot } from "./shared.js";
import { createSyncOutput } from "../lib/sync-output.js";
import { readChangelog, filterChangelogRange, buildChangelogDisplay } from "../lib/changelog.js";

// --- Update ---

export async function handleUpdate(options: { quiet?: boolean } = {}): Promise<void> {
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
      () => runUpdate({ cwd, io: createIOContext(), templateDir, recipe }),
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

export async function handleHealth(): Promise<void> {
  p.intro("arc health");

  try {
    const cwd = requireArcProjectRoot();
    if (!cwd) return;
    // Check npm registry in parallel with health computation (non-blocking)
    const latestVersionPromise = checkLatestVersion("@arc-framework/cli");
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
        gitDiff: async (pristinePath, currentPath) => {
          try {
            const { stdout } = await execFileAsync("git", [
              "diff",
              "--no-index",
              "--",
              pristinePath,
              currentPath,
            ]);
            return stdout;
          } catch (err: unknown) {
            // git diff --no-index exits 1 when differences found — not an error
            const stdout = (err as { stdout?: string }).stdout;
            if (typeof stdout === "string") return stdout;
            throw err;
          }
        },
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
