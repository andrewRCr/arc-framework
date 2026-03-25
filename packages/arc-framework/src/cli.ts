/**
 * ARC Framework CLI entry point.
 *
 * Registers commands (init, update, status, diff) and wires each to its
 * orchestrator. Real I/O dependencies are constructed here and injected
 * into testable command modules.
 */

import { Command } from "commander";
import * as p from "@clack/prompts";
import { readFile, writeFile, mkdir, access, chmod, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

import { runInit, buildPostInitMessage } from "./commands/init.js";
import { parseArcConfig } from "./lib/config.js";
import { loadRecipeFile } from "./lib/template/index.js";
import type { IOContext } from "./commands/init.js";
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
import { resolveIdentity, slugifyIdentity, isGitRepo, type GitExec, type DirEntry } from "./lib/git/index.js";
import { readManifest } from "./lib/manifest/index.js";
import { runInitPrompts } from "./prompts/init-prompts.js";
import { runJoinPrompts } from "./prompts/join-prompts.js";
import { runJoin } from "./commands/join.js";
import type { JoinPromptResult } from "./commands/join.js";
import { buildNonInteractivePrompts } from "./prompts/non-interactive.js";
import { validateTools } from "./lib/skills/index.js";
import { getArcTemplatePath, getInternalTemplatePath, getRecipePath } from "./lib/paths.js";
import { getFrameworkVersion, checkLatestVersion } from "./lib/version.js";
import { formatError, formatUnexpectedError, UserFacingError } from "./lib/errors.js";

import { ARC_CONFIG_SEGMENTS, CONFIG_KEY_PM_MODE } from "./lib/constants.js";
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
    chmod: (path, mode) => chmod(path, mode),
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
    proc.stdin.on("error", (err) => {
      reject(new Error(`git notes stdin write failed: ${err.message}`));
    });
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
    return stdout.trimEnd();
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
 * Throws UserFacingError if identity is not configured.
 */
async function resolveUserIdentity(): Promise<string> {
  const identity = await resolveIdentity({ exec: gitExec });
  if (!identity) {
    throw new UserFacingError({
      code: "IDENTITY_MISSING",
      whatHappened: "No identity configured.",
      why: "User commands require arc.identity to be set in git config.",
      whatToDo: "Run 'arc init' first.",
    });
  }
  return identity;
}

// --- Environment Detection ---

/**
 * Detect non-interactive environment (CI or non-TTY stdin).
 * Returns true if `--yes` behavior should be implied.
 */
function isNonInteractiveEnvironment(): boolean {
  return process.env.CI === "true" || !process.stdin.isTTY;
}

// --- Command Helpers ---

/**
 * Run an async operation with a clack spinner. Stops the spinner on success
 * or failure and re-throws errors for the caller to handle.
 */
async function runWithSpinner<T>(
  label: string,
  fn: () => Promise<T>,
  doneLabel: string,
): Promise<T> {
  const spinner = p.spinner();
  spinner.start(label);
  try {
    const result = await fn();
    spinner.stop(doneLabel);
    return result;
  } catch (err) {
    spinner.stop("Failed.");
    throw err;
  }
}

/**
 * Check if an error is a known user-facing type and display it.
 * Returns true if the error was handled (caller should return),
 * false if it's an unknown error (caller should re-throw).
 */
function isHandledError(err: unknown): boolean {
  if (err instanceof UserFacingError) {
    p.log.error(formatError(err));
    process.exitCode = 1;
    return true;
  }
  if (err instanceof UserSaveError) {
    p.log.error(err.message);
    return true;
  }
  return false;
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
    // Auto-detect CI/non-TTY and imply --yes
    if (!opts.yes && isNonInteractiveEnvironment()) {
      opts.yes = true;
      p.log.info("Non-interactive environment detected (CI or non-TTY) — using defaults.");
    }

    p.intro(`ARC Framework v${getFrameworkVersion()} \u2502 Initialization`);

    // Guard: must be inside a git repository
    if (!(await isGitRepo(gitExec))) {
      p.log.error(formatError(new UserFacingError({
        code: "GIT_MISSING",
        whatHappened: "Not inside a git repository",
        why: "ARC requires a git repository for version control and hooks.",
        whatToDo: "Run 'git init' first, then try again.",
      })));
      process.exitCode = 1;
      return;
    }

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
    const identityResult = await resolveIdentity({
      exec: gitExec,
      prompt: opts.yes ? undefined : async (message, defaultValue) => {
        const result = await p.text({
          message,
          defaultValue,
          placeholder: defaultValue,
        });
        return result;
      },
    });

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
  });

program
  .command("join")
  .description("Join an existing ARC project as a team member or contributor")
  .option("--contributor", "Set role to contributor (default: maintainer)")
  .option("-y, --yes", "Skip prompts, use defaults")
  .option("--tools <csv>", "Comma-separated tool list (requires --yes)")
  .action(async (opts: { contributor?: boolean; yes?: boolean; tools?: string }) => {
    // Auto-detect CI/non-TTY and imply --yes
    if (!opts.yes && isNonInteractiveEnvironment()) {
      opts.yes = true;
      p.log.info("Non-interactive environment detected (CI or non-TTY) — using defaults.");
    }

    p.intro(`ARC Framework v${getFrameworkVersion()} \u2502 Join Project`);

    // Guard: must be inside a git repository
    if (!(await isGitRepo(gitExec))) {
      p.log.error(formatError(new UserFacingError({
        code: "GIT_MISSING",
        whatHappened: "Not inside a git repository",
        why: "ARC requires a git repository for version control and hooks.",
        whatToDo: "Run 'git init' first, then try again.",
      })));
      process.exitCode = 1;
      return;
    }

    const cwd = process.cwd();
    const io = createIOContext();

    // Read existing config for pm.mode
    let pmMode = "none";
    try {
      const configContent = await readFile(
        join(cwd, ...ARC_CONFIG_SEGMENTS), "utf-8",
      );
      const config = parseArcConfig(configContent);
      pmMode = config[CONFIG_KEY_PM_MODE] ?? "none";
    } catch {
      // Config unreadable — will fail at runJoin's access check
    }

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
    const identityResult = await resolveIdentity({
      exec: gitExec,
      prompt: opts.yes ? undefined : async (message, defaultValue) => {
        const result = await p.text({
          message,
          defaultValue,
          placeholder: defaultValue,
        });
        return result;
      },
    });

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
  });

program
  .command("update")
  .description("Update ARC framework files to the latest version")
  .action(async () => {
    p.intro("arc update");

    // Load recipe
    const templateDir = getArcTemplatePath();
    const recipe = await loadRecipeFile(getRecipePath(), (f) => readFile(f, "utf-8"));

    try {
      const result = await runWithSpinner(
        "Updating ARC framework files...",
        () => runUpdate({ cwd: process.cwd(), io: createIOContext(), templateDir, recipe }),
        "Update complete.",
      );

      p.note(buildUpdateSummary(result), "Update summary");

      if (result.conflicts.length > 0) {
        p.log.warn("Resolve conflicts before committing.");
      }
    } catch (err) {
      if (isHandledError(err)) return;
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
          readManifest: (path) => readManifest(path, (p) => readFile(p, "utf-8")),
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
      if (isHandledError(err)) return;
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
  });

// --- User subcommand ---

const userCmd = program
  .command("user")
  .description("Manage ARC user directory and portability");

userCmd
  .command("add <identity>")
  .description("Create a user directory for a team member")
  .action(async (rawIdentity: string) => {
    p.intro("arc user add");

    // Sanitize identity to prevent path traversal from raw CLI input
    const identity = slugifyIdentity(rawIdentity);
    if (!identity) {
      p.log.error("Invalid identity — must contain at least one alphanumeric character.");
      return;
    }
    if (identity !== rawIdentity) {
      p.log.info(`Identity normalized to: ${identity}`);
    }

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

    try {
      await runWithSpinner(
        `Creating user directory for ${identity}...`,
        () => runUserAdd({ cwd, io, identity, internalTemplateDir: getInternalTemplatePath(), pmMode }),
        `User directory created for ${identity}.`,
      );
    } catch (err) {
      if (isHandledError(err)) return;
      throw err;
    }

    p.outro("Done.");
  });

userCmd
  .command("save")
  .description("Save user directory to a git note on HEAD")
  .action(async () => {
    p.intro("arc user save");

    let identity: string;
    try {
      identity = await resolveUserIdentity();
    } catch (err) {
      if (isHandledError(err)) return;
      throw err;
    }
    const io = createUserIOContext();

    try {
      const result = await runWithSpinner(
        "Saving user directory...",
        () => runUserSave({ cwd: process.cwd(), io, identity }),
        "Save complete.",
      );
      p.note(buildSaveSummary(result), "Saved");

      if (result.warnings.length > 0) {
        p.log.warn("Some files were skipped (see details above).");
      }
    } catch (err) {
      if (isHandledError(err)) return;
      throw err;
    }

    p.outro("Done.");
  });

userCmd
  .command("load")
  .description("Restore user directory from a git note")
  .action(async () => {
    p.intro("arc user load");

    let identity: string;
    try {
      identity = await resolveUserIdentity();
    } catch (err) {
      if (isHandledError(err)) return;
      throw err;
    }
    const io = createUserIOContext();
    const spinner = p.spinner();
    spinner.start("Loading user directory...");

    let result;
    try {
      result = await runUserLoad({
        cwd: process.cwd(),
        io,
        identity,
      });
    } catch (err) {
      spinner.stop("Load failed.");
      if (err instanceof UserFacingError) {
        p.log.error(formatError(err));
        return;
      }
      throw err;
    }

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

    let identity: string;
    try {
      identity = await resolveUserIdentity();
    } catch (err) {
      if (isHandledError(err)) return;
      throw err;
    }
    const io = createUserIOContext();

    try {
      await runWithSpinner("Pushing user notes...", () => runUserPush({ io, identity }), "Push complete.");
    } catch (err) {
      if (isHandledError(err)) return;
      throw err;
    }

    p.outro("Done.");
  });

userCmd
  .command("pull")
  .description("Fetch user notes from remote")
  .action(async () => {
    p.intro("arc user pull");

    let identity: string;
    try {
      identity = await resolveUserIdentity();
    } catch (err) {
      if (isHandledError(err)) return;
      throw err;
    }
    const io = createUserIOContext();

    try {
      await runWithSpinner("Pulling user notes...", () => runUserPull({ io, identity }), "Pull complete.");
    } catch (err) {
      if (isHandledError(err)) return;
      throw err;
    }

    p.outro("Done.");
  });

// --- Sync sugar ---

program
  .command("sync")
  .description("Save and push user directory (or --load to pull and restore)")
  .option("--load", "Pull and load instead of save and push")
  .action(async (opts: { load?: boolean }) => {
    p.intro("arc sync");

    let identity: string;
    try {
      identity = await resolveUserIdentity();
    } catch (err) {
      if (isHandledError(err)) return;
      throw err;
    }
    const io = createUserIOContext();
    const cwd = process.cwd();

    if (opts.load) {
      // Pull + load
      const spinner = p.spinner();
      spinner.start("Pulling user notes...");
      try {
        await runUserPull({ io, identity });
        spinner.stop("Pull complete.");
      } catch (err) {
        spinner.stop("Pull failed.");
        const msg = err instanceof Error ? err.message : String(err);
        p.log.error(`Failed to pull user notes: ${msg}`);
        return;
      }

      const loadSpinner = p.spinner();
      loadSpinner.start("Loading user directory...");
      try {
        const result = await runUserLoad({ cwd, io, identity });

        if (!result) {
          loadSpinner.stop("No note found.");
          p.log.warn("No saved user directory found on HEAD or recent ancestors.");
          return;
        }

        loadSpinner.stop("Load complete.");
        p.note(buildLoadSummary(result), "Loaded");
      } catch (err) {
        loadSpinner.stop("Load failed.");
        const msg = err instanceof Error ? err.message : String(err);
        p.log.error(`Failed to load user directory: ${msg}`);
        return;
      }
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
      try {
        await runUserPush({ io, identity });
        pushSpinner.stop("Push complete.");
      } catch (err) {
        pushSpinner.stop("Push failed.");
        const msg = err instanceof Error ? err.message : String(err);
        p.log.error(`Failed to push user notes: ${msg}`);
        p.log.warn("User directory was saved locally — push manually with 'arc user push'.");
        return;
      }
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
  .option("--limit <n>", "Maximum number of commits (default: 50)", parseInt)
  .option("--all", "Show all matching commits (no limit)")
  .option("--work-unit <name>", "Filter by work unit name (matches atomic-{name})")
  .action(async (opts: { since?: string; author?: string; limit?: number; all?: boolean; workUnit?: string }) => {
    try {
      const result = await runLogAtomic({
        exec: gitExec,
        since: opts.since,
        author: opts.author,
        limit: opts.limit,
        all: opts.all,
        workUnit: opts.workUnit,
      });

      const output = buildLogAtomicOutput(result);
      p.log.message(output);
    } catch (err) {
      if (isHandledError(err)) return;
      throw err;
    }
  });

program.parseAsync().catch((err: unknown) => {
  console.error(formatUnexpectedError(err));
  process.exitCode = 1;
});
