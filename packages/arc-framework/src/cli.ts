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
import { join } from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

import { runInit, buildPostInitMessage, detectInitMode } from "./commands/init.js";
import { parseArcConfig } from "./lib/config.js";
import type { IOContext, InitMode } from "./commands/init.js";
import { runUpdate, buildUpdateSummary } from "./commands/update.js";
import { runStatus, buildStatusSummary } from "./commands/status.js";
import { runDiff, buildDiffOutput } from "./commands/diff.js";
import {
  runUserSave, runUserLoad, runUserAdd, runUserPush, runUserPull,
  buildSaveSummary, buildLoadSummary,
  UserSaveError,
} from "./commands/user.js";
import { runLogAtomic, buildLogAtomicOutput } from "./commands/log.js";
import type { UserIOContext } from "./commands/user.js";
import { resolveIdentity, type GitExec, type DirEntry } from "./lib/git/index.js";
import { readManifest } from "./lib/manifest/index.js";
import { runInitPrompts } from "./prompts/init-prompts.js";
import { buildNonInteractivePrompts } from "./prompts/non-interactive.js";
import { getArcTemplatePath, getInternalTemplatePath, getRecipePath } from "./lib/paths.js";
import { getFrameworkVersion, checkLatestVersion } from "./lib/version.js";
import { formatError, UserFacingError } from "./lib/errors.js";
import type { Recipe } from "./lib/types.js";
import { ARC_CONFIG_SEGMENTS, CONFIG_KEY_PM_MODE, CONFIG_KEY_TEAM_MODE } from "./lib/constants.js";
import { listArcFiles } from "./lib/fs.js";

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
 * Write content to a git note ref on a commit, piping via stdin.
 * Uses `-F -` to read from stdin (avoids ARG_MAX limits for large manifests).
 */
async function writeGitNote(
  ref: string,
  content: string,
  commit: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("git", [
      "notes", "--ref", ref, "add", "-f", "-F", "-", commit,
    ]);
    let stderr = "";
    proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`git notes add failed (code ${code}): ${stderr}`));
    });
    proc.on("error", reject);
    proc.stdin.write(content);
    proc.stdin.end();
  });
}

/**
 * Read content from a git note ref on a commit.
 * Returns null if no note exists on the commit.
 */
async function readGitNote(
  ref: string,
  commit: string,
): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", [
      "notes", "--ref", ref, "show", commit,
    ]);
    return stdout;
  } catch {
    return null;
  }
}

/**
 * Read directory entries with name and size for user directory serialization.
 */
async function readUserDir(dirPath: string): Promise<DirEntry[]> {
  let names: string[];
  try {
    names = await readdir(dirPath);
  } catch {
    return [];
  }
  const entries: DirEntry[] = [];
  for (const name of names) {
    const s = await stat(join(dirPath, name));
    if (s.isFile()) {
      entries.push({ name, size: s.size });
    }
  }
  return entries;
}

/** Create the UserIOContext with real I/O implementations. */
function createUserIOContext(): UserIOContext {
  return {
    exec: gitExec,
    readFile: (path) => readFile(path, "utf-8"),
    writeFile: (path, content) => writeFile(path, content, "utf-8"),
    mkdir: (path, opts) => mkdir(path, opts).then(() => undefined),
    readDir: readUserDir,
    writeNote: writeGitNote,
    readNote: readGitNote,
  };
}

/**
 * Resolve identity for user commands. Requires arc.identity to be set.
 * Returns the identity string or exits with an error message.
 */
async function resolveUserIdentity(): Promise<string> {
  const identity = await resolveIdentity({ exec: gitExec });
  if (!identity) {
    p.log.error("No identity configured. Run 'arc init' first.");
    process.exit(1);
  }
  return identity;
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
  .option("--team", "Enable team mode (requires --yes)")
  .action(async (opts: { yes?: boolean; name?: string; pmMode?: string; tools?: string; team?: boolean }) => {
    p.intro("arc init");

    const cwd = process.cwd();
    const io = createIOContext();

    // Detect mode before prompts — join mode shows fewer prompts
    const mode: InitMode = await detectInitMode(cwd, (path) => access(path));

    // For join mode, read existing config to populate project-level values
    let existingConfig: Record<string, string> = {};
    if (mode === "join") {
      try {
        const configContent = await readFile(
          join(cwd, ...ARC_CONFIG_SEGMENTS), "utf-8",
        );
        existingConfig = parseArcConfig(configContent);
      } catch {
        // Config unreadable — fall back to defaults
      }
      p.log.info("Existing ARC installation detected — running join mode.");
    }

    // Build prompts from flags or interactive prompts
    let prompts;
    if (opts.yes) {
      prompts = buildNonInteractivePrompts({
        cwd,
        name: opts.name,
        pmMode: mode === "join" ? (existingConfig[CONFIG_KEY_PM_MODE] ?? "none") : opts.pmMode,
        tools: opts.tools,
        team: mode === "join" ? (existingConfig[CONFIG_KEY_TEAM_MODE] === "true") : opts.team,
      });
      if (!opts.tools) {
        p.log.info("No agent tools selected (use --tools to specify).");
      }
    } else {
      if (mode === "join") {
        // Join mode: only tools prompt — project config already established
        prompts = await runInitPrompts(cwd, "join");
        if (!prompts) {
          return;
        }
        // Populate project-level values from existing config
        prompts.pm_mode = existingConfig[CONFIG_KEY_PM_MODE] ?? "none";
        prompts.team_mode = existingConfig[CONFIG_KEY_TEAM_MODE] === "true";
        prompts.project_name = existingConfig["project.name"] ?? "";
      } else {
        prompts = await runInitPrompts(cwd);
        if (!prompts) {
          return; // User cancelled — runInitPrompts handles exit
        }
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
    const recipeContent = await readFile(getRecipePath(), "utf-8");
    const recipe: Recipe = JSON.parse(recipeContent) as Recipe;

    // Run init with progress feedback
    const spinner = p.spinner();
    spinner.start(mode === "join" ? "Setting up developer workspace..." : "Installing ARC framework...");

    const result = await runInit({
      cwd,
      io,
      templateDir,
      internalTemplateDir: getInternalTemplatePath(),
      recipe,
      mode,
      prompts,
      identityResult,
    });

    if (!result) {
      spinner.stop("Installation cancelled.");
      return;
    }

    spinner.stop(mode === "join" ? "Workspace setup complete." : "Installation complete.");

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
    const recipeContent = await readFile(getRecipePath(), "utf-8");
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
        process.exitCode = 1;
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
        process.exitCode = 1;
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
        process.exitCode = 1;
        return;
      }
      throw err;
    }

    p.outro("Done.");
  });

// --- User subcommand ---

const userCmd = program
  .command("user")
  .description("Manage ARC user directory and portability");

userCmd
  .command("add <identity>")
  .description("Create a user directory for a team member")
  .action(async (identity: string) => {
    p.intro("arc user add");

    const cwd = process.cwd();
    const io = createUserIOContext();

    // Read pm.mode from arc-config.yml
    let pmMode = "none";
    try {
      const configContent = await readFile(
        join(cwd, ...ARC_CONFIG_SEGMENTS), "utf-8",
      );
      const config = parseArcConfig(configContent);
      pmMode = config[CONFIG_KEY_PM_MODE] ?? "none";
    } catch {
      // Config unreadable — use default
    }

    const spinner = p.spinner();
    spinner.start(`Creating user directory for ${identity}...`);

    await runUserAdd({
      cwd,
      io,
      identity,
      internalTemplateDir: getInternalTemplatePath(),
      pmMode,
    });

    spinner.stop(`User directory created for ${identity}.`);
    p.outro("Done.");
  });

userCmd
  .command("save")
  .description("Save user directory to a git note on HEAD")
  .action(async () => {
    p.intro("arc user save");

    const identity = await resolveUserIdentity();
    const io = createUserIOContext();
    const spinner = p.spinner();
    spinner.start("Saving user directory...");

    try {
      const result = await runUserSave({
        cwd: process.cwd(),
        io,
        identity,
      });

      spinner.stop("Save complete.");
      p.note(buildSaveSummary(result), "Saved");

      if (result.warnings.length > 0) {
        p.log.warn("Some files were skipped (see details above).");
      }
    } catch (err) {
      spinner.stop("Save failed.");
      if (err instanceof UserSaveError) {
        p.log.error(err.message);
        return;
      }
      throw err;
    }

    p.outro("Done.");
  });

userCmd
  .command("load")
  .description("Restore user directory from a git note")
  .action(async () => {
    p.intro("arc user load");

    const identity = await resolveUserIdentity();
    const io = createUserIOContext();
    const spinner = p.spinner();
    spinner.start("Loading user directory...");

    const result = await runUserLoad({
      cwd: process.cwd(),
      io,
      identity,
    });

    if (!result) {
      spinner.stop("No note found.");
      p.log.warn("No saved user directory found on HEAD or recent ancestors.");
      return;
    }

    spinner.stop("Load complete.");
    p.note(buildLoadSummary(result), "Loaded");

    p.outro("Done.");
  });

userCmd
  .command("push")
  .description("Push user notes to remote")
  .action(async () => {
    p.intro("arc user push");

    const identity = await resolveUserIdentity();
    const io = createUserIOContext();
    const spinner = p.spinner();
    spinner.start("Pushing user notes...");

    await runUserPush({ io, identity });

    spinner.stop("Push complete.");
    p.outro("Done.");
  });

userCmd
  .command("pull")
  .description("Fetch user notes from remote")
  .action(async () => {
    p.intro("arc user pull");

    const identity = await resolveUserIdentity();
    const io = createUserIOContext();
    const spinner = p.spinner();
    spinner.start("Pulling user notes...");

    await runUserPull({ io, identity });

    spinner.stop("Pull complete.");
    p.outro("Done.");
  });

// --- Sync sugar ---

program
  .command("sync")
  .description("Save and push user directory (or --load to pull and restore)")
  .option("--load", "Pull and load instead of save and push")
  .action(async (opts: { load?: boolean }) => {
    p.intro("arc sync");

    const identity = await resolveUserIdentity();
    const io = createUserIOContext();
    const cwd = process.cwd();

    if (opts.load) {
      // Pull + load
      const spinner = p.spinner();
      spinner.start("Pulling user notes...");
      await runUserPull({ io, identity });
      spinner.stop("Pull complete.");

      const loadSpinner = p.spinner();
      loadSpinner.start("Loading user directory...");
      const result = await runUserLoad({ cwd, io, identity });

      if (!result) {
        loadSpinner.stop("No note found.");
        p.log.warn("No saved user directory found on HEAD or recent ancestors.");
        return;
      }

      loadSpinner.stop("Load complete.");
      p.note(buildLoadSummary(result), "Loaded");
    } else {
      // Save + push
      const spinner = p.spinner();
      spinner.start("Saving user directory...");

      try {
        const result = await runUserSave({ cwd, io, identity });
        spinner.stop("Save complete.");

        if (result.warnings.length > 0) {
          p.note(buildSaveSummary(result), "Saved");
        }
      } catch (err) {
        spinner.stop("Save failed.");
        if (err instanceof UserSaveError) {
          p.log.error(err.message);
          return;
        }
        throw err;
      }

      const pushSpinner = p.spinner();
      pushSpinner.start("Pushing user notes...");
      await runUserPush({ io, identity });
      pushSpinner.stop("Push complete.");
    }

    p.outro("Done.");
  });

// --- Log subcommand ---

const logCmd = program
  .command("log")
  .description("Browse ARC commit history");

logCmd
  .command("atomic")
  .description("Show atomic task commits")
  .option("--since <date>", "Show commits after date (e.g., 2026-03-01)")
  .option("--author <name>", "Filter by author")
  .option("--limit <n>", "Maximum number of commits", parseInt)
  .option("--work-unit <name>", "Filter by work unit name (matches atomic-{name})")
  .action(async (opts: { since?: string; author?: string; limit?: number; workUnit?: string }) => {
    try {
      const result = await runLogAtomic({
        exec: gitExec,
        since: opts.since,
        author: opts.author,
        limit: opts.limit,
        workUnit: opts.workUnit,
      });

      const output = buildLogAtomicOutput(result);
      p.log.message(output);
    } catch (err) {
      if (err instanceof UserFacingError) {
        p.log.error(formatError(err));
        process.exitCode = 1;
        return;
      }
      throw err;
    }
  });

program.parse();
