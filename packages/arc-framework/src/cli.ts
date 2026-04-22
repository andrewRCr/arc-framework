/**
 * ARC Framework CLI entry point.
 *
 * Pure Commander wiring — registers commands and connects each to its handler.
 * Command logic lives in `src/handlers/`, orchestrators in `src/commands/`,
 * and I/O adapters in `src/lib/io-context.ts`.
 */

import { Command } from "commander";

import { getFrameworkVersion } from "./lib/version.js";
import { formatUnexpectedError } from "./lib/errors.js";
import { handleInit } from "./handlers/init.js";
import { handleJoin } from "./handlers/join.js";
import { handleUpdate, handleStatus, handleDiff } from "./handlers/lifecycle.js";
import {
  handleUserAdd, handleUserSave, handleUserLoad, handleUserPush, handleUserFetch, handleUserPull, handleUserStatus,
} from "./handlers/user.js";
import { handleSync } from "./handlers/sync.js";
import { handleLogAtomic } from "./handlers/log.js";

const program = new Command();

program
  .name("arc")
  .description("CLI for installing, updating, and managing ARC framework files")
  .version(getFrameworkVersion());

// --- Init & Join ---

program
  .command("init")
  .description("Initialize ARC framework in the current project")
  .option("-y, --yes", "Skip prompts, use defaults")
  .option("--name <string>", "Project name (requires --yes)")
  .option("--pm-mode <mode>", "PM mode: none, arc-in-git, external (requires --yes)")
  .option("--tools <csv>", "Comma-separated tool list (requires --yes)")
  .option("--team", "Enable team mode (requires --yes)")
  .option("--reconfigure", "Change structural settings on an existing installation")
  .option("--dry-run", "Preview reconfigure changes without applying (requires --reconfigure)")
  .action(handleInit);

program
  .command("join")
  .description("Join an existing ARC project as a team member or contributor")
  .option("--contributor", "Set role to contributor (default: maintainer)")
  .option("-y, --yes", "Skip prompts, use defaults")
  .option("--tools <csv>", "Comma-separated tool list (requires --yes)")
  .option("--reconfigure", "Change personal workspace settings (role, tools)")
  .action(handleJoin);

// --- Lifecycle ---

program
  .command("update")
  .description("Update ARC framework files to the latest version")
  .option("-q, --quiet", "Suppress changelog output")
  .action(handleUpdate);

program
  .command("status")
  .description("Show status of installed ARC framework files")
  .action(handleStatus);

program
  .command("diff")
  .description("Show differences between installed and latest framework files")
  .action(handleDiff);

// --- User ---

const userCmd = program
  .command("user")
  .description("Manage ARC user directory and portability");

userCmd
  .command("add <identity>")
  .description("Create a user directory for a team member")
  .action(handleUserAdd);

userCmd
  .command("save")
  .description("Save user directory to a git note on HEAD")
  .action(handleUserSave);

userCmd
  .command("load")
  .description("Restore user directory from a git note")
  .option("-y, --yes", "Skip overwrite confirmation prompts")
  .option("--max-walk <n>", "Max ancestors to walk when searching for a note (default: 1000)", parseInt)
  .action(handleUserLoad);

userCmd
  .command("push")
  .description("Push user notes to remote")
  .option("--force", "Force-push even when remote has diverged")
  .action(handleUserPush);

userCmd
  .command("fetch")
  .description("Fetch user notes from remote")
  .option("--identity <name>", "Pull another developer's notes instead of your own")
  .option("-y, --yes", "Skip overwrite confirmation prompts")
  .action(handleUserFetch);

userCmd
  .command("pull")
  .description("Fetch user notes from remote and restore them to disk")
  .option("--identity <name>", "Pull another developer's notes instead of your own")
  .option("-y, --yes", "Skip overwrite confirmation prompts")
  .option("--max-walk <n>", "Max ancestors to walk when searching for a note (default: 1000)", parseInt)
  .action(handleUserPull);

userCmd
  .command("status")
  .description("Inspect local, remote, and on-disk user sync state")
  .option("--offline", "Skip the remote probe and inspect only local snapshot vs disk")
  .option("--all", "List all remote user-note identities when a remote is available")
  .option("--session-init", "Render a non-destructive remote probe summary for session-init")
  .action(handleUserStatus);

// --- Sync ---

program
  .command("sync")
  .description("Synchronize user directory with remote notes")
  .option("-y, --yes", "Skip overwrite confirmation prompts")
  .option("--max-walk <n>", "Max ancestors to walk when searching for a note (default: 1000)", parseInt)
  .action(handleSync);

// --- Log ---

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
  .action(handleLogAtomic);

// --- Entry ---

program.parseAsync().catch((err: unknown) => {
  console.error(formatUnexpectedError(err));
  process.exitCode = 1;
});
