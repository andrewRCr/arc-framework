/**
 * ARC Framework CLI entry point.
 *
 * Pure Commander wiring — registers commands and connects each to its handler.
 * Command logic lives in `src/handlers/`, orchestrators in `src/commands/`,
 * and I/O adapters in `src/lib/io-context.ts`.
 */

import { Command, Option } from "commander";

import { getFrameworkVersion } from "./lib/version.js";
import { formatUnexpectedError } from "./lib/errors.js";
import { handleInit } from "./handlers/init.js";
import { handleJoin } from "./handlers/join.js";
import { handleUpdate, handleHealth, handleDiff } from "./handlers/lifecycle.js";
import {
  handleUserAdd, handleUserSave, handleUserLoad, handleUserPush, handleUserFetch, handleUserPull, handleUserStatus,
} from "./handlers/user.js";
import { handleExtensionsStatus } from "./handlers/extensions.js";
import { handleConfigStatus } from "./handlers/config.js";
import { handleActiveStatus } from "./handlers/active.js";
import { handleStatus } from "./handlers/status.js";
import { handleSync } from "./handlers/sync.js";
import { handleUserSync } from "./handlers/user-sync.js";
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
  .command("health")
  .description("Show health of installed ARC framework files")
  .action(handleHealth);

program
  .command("diff")
  .description("Show differences between installed and latest framework files")
  .action(handleDiff);

// --- User ---

const userCmd = program
  .command("user")
  .description(
    "Manage ARC user directory and portability — see also `arc sync` for the cross-concern orchestrator",
  );

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
  .option("--force", "Force-push even when remote and local notes conflict")
  .action(handleUserPush);

userCmd
  .command("fetch")
  .description("Fetch user notes from remote")
  .option("--identity <name>", "Pull another developer's notes instead of your own")
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
  .description("Inspect local, remote, and on-disk user sync state (includes worktree-drift qualifier)")
  .option("--offline", "Skip remote and worktree probes; inspect only local snapshot vs disk")
  .option("--all", "List all remote user-note identities when a remote is available")
  .option("--session-init", "Render a non-destructive remote probe summary for session-init")
  .option("--verbose", "Render the full ref/disk/working-files three-tier detail block (default: collapsed)")
  .option("--json", "Emit the typed result as JSON")
  .action(handleUserStatus);

userCmd
  .command("sync")
  .description("Direction-aware notes-only sync — push, pull, or prompt on conflict")
  .option("-y, --yes", "Skip overwrite confirmation prompts")
  .option("--max-walk <n>", "Max ancestors to walk when searching for a note (default: 1000)", parseInt)
  .action(handleUserSync);

// --- Extensions ---

const extensionsCmd = program
  .command("extensions")
  .description("Inspect ARC extensions state");

extensionsCmd
  .command("status")
  .description("Show active/inactive extensions and orphaned references")
  .option("--session-init", "Emit the active-extensions list consumed by session-init")
  .option("--all", "Include the full orphan-reference detail list")
  .option("--json", "Emit the typed result as JSON")
  .action(handleExtensionsStatus);

// --- Config ---

const configCmd = program
  .command("config")
  .description("Inspect ARC configuration state");

configCmd
  .command("status")
  .description("Show arc-config.yml settings (agent-consumable; hooks.* excluded)")
  .option("--session-init", "Emit the init-gating subset consumed by session-init")
  .option("--json", "Emit the typed result as JSON")
  .action(handleConfigStatus);

// --- Active ---

const activeCmd = program
  .command("active")
  .description("Inspect ARC active work state");

activeCmd
  .command("status")
  .description("Enumerate in-flight work units and their status-file fields")
  .option("--session-init", "Emit resolved path / null / candidate list for session-init")
  .option("--json", "Emit the typed result as JSON")
  .action(handleActiveStatus);

// --- Status (composite) ---

program
  .command("status")
  .description("Composite probe: identity + user-sync + extensions + config + active state")
  .addOption(
    new Option(
      "--session-init",
      "Emit the session-init-scoped subset for harness consumption",
    ).conflicts("session-handoff"),
  )
  .addOption(
    new Option(
      "--session-handoff",
      "Emit the session-handoff envelope for arc-handoff",
    ).conflicts("session-init"),
  )
  .option("--json", "Emit the typed result as JSON")
  .action(handleStatus);

// --- Sync (orchestrator) ---

program
  .command("sync")
  .description(
    "Synchronize the configured concerns — worktree push, user-notes push, "
    + "per `push_interlock` and `notes_push` config",
  )
  .option(
    "-y, --yes",
    "Auto-accept safe-default prompts (push notes; merge on conflict). "
    + "Force-push is never auto-selected.",
  )
  .option("--dry-run", "Print the matrix decision without invoking either leg")
  .option("--json", "Emit the structured result as JSON")
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
