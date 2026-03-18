/**
 * ARC Framework CLI entry point.
 *
 * Registers commands (init, update, status, diff) and wires each to its
 * orchestrator. Real I/O dependencies are constructed here and injected
 * into testable command modules.
 */

import { Command } from "commander";
import * as p from "@clack/prompts";
import { readFile, writeFile, mkdir, access, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { runInit, buildPostInitMessage } from "./commands/init.js";
import type { IOContext } from "./commands/init.js";
import { runUpdate, buildUpdateSummary } from "./commands/update.js";
import { runStatus, buildStatusSummary } from "./commands/status.js";
import { runDiff, buildDiffOutput } from "./commands/diff.js";
import { runInitPrompts } from "./prompts/init-prompts.js";
import { buildNonInteractivePrompts } from "./prompts/non-interactive.js";
import { resolveIdentity } from "./lib/identity.js";
import { getArcTemplatePath, getInternalTemplatePath } from "./lib/paths.js";
import { getFrameworkVersion, checkLatestVersion } from "./lib/version.js";
import { readManifest } from "./lib/manifest.js";
import { formatError } from "./lib/errors.js";
import { UserFacingError } from "./lib/errors.js";
import type { GitExec } from "./lib/git.js";
import type { Recipe } from "./lib/types.js";

// --- Real I/O Adapters ---

const execFileAsync = promisify(execFile);

/** Real git executor wrapping child_process.execFile. */
const gitExec: GitExec = async (cmd, args) => {
  const { stdout, stderr } = await execFileAsync(cmd, args);
  return { stdout: stdout.trimEnd(), stderr };
};

/** Real IOContext using node:fs/promises. */
function createIOContext(): IOContext {
  return {
    readFile: (path) => readFile(path, "utf-8"),
    writeFile: (path, content) => writeFile(path, content, "utf-8"),
    mkdir: (path, opts) => mkdir(path, opts).then(() => undefined),
    access: (path) => access(path),
    exec: gitExec,
  };
}

/**
 * Recursively list files under a directory, returning paths relative to it.
 * Skips the `.pristine/` directory (internal baseline, not user-facing).
 */
async function listArcFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  async function walk(current: string): Promise<void> {
    let entries: string[];
    try {
      entries = await readdir(current);
    } catch {
      return; // Directory doesn't exist
    }
    for (const entry of entries) {
      const fullPath = join(current, entry);
      const relPath = relative(dir, fullPath);
      // Skip .pristine directory
      if (relPath === ".pristine" || relPath.startsWith(".pristine/")) continue;
      // Skip user/{identity}/ directories (gitignored personal workspace)
      if (/^user\/[^/]+\//.test(relPath)) continue;
      const s = await stat(fullPath);
      if (s.isDirectory()) {
        await walk(fullPath);
      } else {
        results.push(relPath);
      }
    }
  }
  await walk(dir);
  return results;
}

// --- CLI Program ---

const program = new Command();

program
  .name("arc")
  .description("CLI for installing, updating, and managing ARC framework files")
  .version(getFrameworkVersion());

program
  .command("init")
  .description("Initialize ARC framework in the current project")
  .option("-y, --yes", "Skip prompts, use defaults")
  .option("--name <string>", "Project name (requires --yes)")
  .option("--pm-mode <mode>", "PM mode: none, arc-in-git, external (requires --yes)")
  .option("--tools <csv>", "Comma-separated tool list (requires --yes)")
  .action(async (opts: { yes?: boolean; name?: string; pmMode?: string; tools?: string }) => {
    p.intro("arc init");

    // Build prompts from flags or interactive prompts
    let prompts;
    if (opts.yes) {
      prompts = buildNonInteractivePrompts({
        cwd: process.cwd(),
        name: opts.name,
        pmMode: opts.pmMode,
        tools: opts.tools,
      });
      if (!opts.tools) {
        p.log.info("No agent tools selected (use --tools to specify).");
      }
    } else {
      prompts = await runInitPrompts(process.cwd());
      if (!prompts) {
        return; // User cancelled — runInitPrompts handles exit
      }
    }

    // Identity resolution (with clack prompt adapter)
    const identityResult = await resolveIdentity({
      exec: gitExec,
      prompt: async (message, defaultValue) => {
        const result = await p.text({
          message,
          defaultValue,
          placeholder: defaultValue,
        });
        return result;
      },
    });

    // Load recipe
    const templateDir = getArcTemplatePath();
    const recipeContent = await readFile(
      new URL("../../init-recipe.json", import.meta.url),
      "utf-8",
    );
    const recipe: Recipe = JSON.parse(recipeContent) as Recipe;

    // Run init with progress feedback
    const spinner = p.spinner();
    spinner.start("Installing ARC framework...");

    const result = await runInit({
      cwd: process.cwd(),
      io: createIOContext(),
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

    // Post-init message
    p.note(buildPostInitMessage(result), "What's next");

    p.outro("Done.");
  });

program
  .command("update")
  .description("Update ARC framework files to the latest version")
  .action(async () => {
    p.intro("arc update");

    // Load recipe
    const templateDir = getArcTemplatePath();
    const recipeContent = await readFile(
      new URL("../../init-recipe.json", import.meta.url),
      "utf-8",
    );
    const recipe: Recipe = JSON.parse(recipeContent) as Recipe;

    const spinner = p.spinner();
    spinner.start("Updating ARC framework files...");

    try {
      const result = await runUpdate({
        cwd: process.cwd(),
        io: createIOContext(),
        templateDir,
        recipe,
      });

      spinner.stop("Update complete.");

      p.note(buildUpdateSummary(result), "Update summary");

      if (result.conflicts.length > 0) {
        p.log.warn("Resolve conflicts before committing.");
      }
    } catch (err) {
      spinner.stop("Update failed.");
      if (err instanceof UserFacingError) {
        p.log.error(formatError(err));
        return;
      }
      throw err;
    }

    p.outro("Done.");
  });

program
  .command("status")
  .description("Show status of installed ARC framework files")
  .action(async () => {
    p.intro("arc status");

    try {
      const cwd = process.cwd();
      // Check npm registry in parallel with status computation (non-blocking)
      const latestVersionPromise = checkLatestVersion("@arc-framework/cli");
      const result = await runStatus({
        cwd,
        io: {
          readFile: (path) => readFile(path, "utf-8"),
          readManifest: (path) => readManifest(path),
          readdir: (arcDir) => listArcFiles(arcDir),
        },
        frameworkVersion: getFrameworkVersion(),
        latestVersion: await latestVersionPromise,
      });

      p.note(buildStatusSummary(result), "Status");

      if (result.updateAvailable) {
        p.log.warn("Run 'arc update' to apply framework changes.");
      }
    } catch (err) {
      if (err instanceof UserFacingError) {
        p.log.error(formatError(err));
        return;
      }
      throw err;
    }

    p.outro("Done.");
  });

program
  .command("diff")
  .description("Show differences between installed and latest framework files")
  .action(async () => {
    p.intro("arc diff");

    try {
      const result = await runDiff({
        cwd: process.cwd(),
        io: {
          readFile: (path) => readFile(path, "utf-8"),
          readManifest: (path) => readManifest(path),
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
      if (err instanceof UserFacingError) {
        p.log.error(formatError(err));
        return;
      }
      throw err;
    }

    p.outro("Done.");
  });

program.parse();
