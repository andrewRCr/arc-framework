/**
 * ARC Framework CLI entry point.
 *
 * Pure Commander wiring — registers commands and connects each to its handler.
 * Command logic lives in `src/handlers/`, orchestrators in `src/commands/`,
 * and I/O adapters in `src/lib/io-context.ts`.
 */

import { fileURLToPath } from "node:url";

import { Command, Option } from "commander";

import { getFrameworkVersion } from "./lib/version.js";
import { formatUnexpectedError } from "./lib/errors.js";
import { checkDevBuildStaleness, createDevCheckDeps } from "./lib/dev-check.js";
import { handleInit } from "./handlers/init.js";
import { handleJoin } from "./handlers/join.js";
import { handleStart, type StartOptions } from "./handlers/start.js";
import {
  handleErrandCheck,
  type ErrandCheckOptions,
} from "./handlers/errand.js";
import { handleHousekeepCheck, type HousekeepCheckOptions } from "./handlers/housekeep.js";
import { handleUpdate, handleHealth, handleDiff } from "./handlers/lifecycle.js";
import {
  handleUserAdd, handleUserClose, handleUserOpen, handleUserSave, handleUserLoad, handleUserPush, handleUserFetch, handleUserPull, handleUserStatus,
} from "./handlers/user.js";
import { handleExtensionsStatus } from "./handlers/extensions.js";
import { handleConfigStatus } from "./handlers/config.js";
import { handleActiveStatus, handleActiveRoster, handleActiveInFlight } from "./handlers/active.js";
import { handleStatus } from "./handlers/status.js";
import { handleSync } from "./handlers/sync.js";
import { handleUserSync } from "./handlers/user-sync.js";
import { handleLogStandalone } from "./handlers/log.js";
import {
  handleReleaseCommit,
  handleReleaseOptIn,
  handleReleaseOptOut,
  handleReleasePush,
  handleReleaseSetupInstall,
  handleReleaseSetupPrintPatterns,
  handleReleaseSetupUninstall,
  handleReleaseSetupVerify,
  handleReleaseStatus,
} from "./commands/release.js";

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

// --- Work units ---

program
  .command("start [name]")
  .description(
    "Start a work unit. Default spawns an isolated worktree on a new `plan/<name>` "
    + "branch; `--here` cold-starts into the current worktree instead.",
  )
  .option("--here", "Cold-start in place: scaffold into the current worktree instead of spawning a new one")
  .option(
    "--from <pointer-or-blurb>",
    "Spec input — issue ref → Origin, spec/draft artifact → Design, else passed through for assessment",
  )
  .option("-y, --yes", "Skip the confirm prompt")
  .action((name: string | undefined, opts: StartOptions) => handleStart(name, opts));

const errand = program
  .command("errand")
  .description("Errand operations. `check` reports which in-flight work units touch a target path.");

errand
  .command("check")
  .description("Report which in-flight work units touch the target path(s) — advisory, never blocks")
  .option("--target <paths...>", "Target path(s) the errand will edit (prefix-matched)")
  .option("--local", "Skip the oracle's network read; check local refs only (alias: --no-fetch)")
  .option("--no-fetch", "Skip the oracle's network read; check local refs only")
  .option("--json", "Emit overlap facts as JSON (for skill consumption)")
  .action((opts: ErrandCheckOptions) => handleErrandCheck(opts));

const housekeep = program
  .command("housekeep")
  .description(
    "Between-WU drain operations. `check` classifies the write context (base-branch vs. "
    + "work-unit branch) so the drain's base-branch-write precondition is enforced mechanically.",
  );

housekeep
  .command("check")
  .description("Classify the write context — base-branch (proceed), WU branch (relocate), or degenerate (refuse)")
  .option("--json", "Emit the write-context classification as JSON (for skill consumption)")
  .action((opts: HousekeepCheckOptions) => handleHousekeepCheck(opts));

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
  .command("open <wu-name>")
  .description("Open per-WU user workspace subdir (seeds SESSION-NOTES.md from template)")
  .action(handleUserOpen);

userCmd
  .command("close <wu-name>")
  .description("Close per-WU user workspace subdir (removes user/{identity}/<wu-name>/ recursively)")
  .action(handleUserClose);

userCmd
  .command("save")
  .description("Save user directory to user notes on HEAD")
  .action(handleUserSave);

userCmd
  .command("load")
  .description("Restore user directory from user notes")
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

activeCmd
  .command("roster")
  .description("Emit the cross-worktree in-flight work-unit roster (concurrency-advisory data input)")
  .option("--json", "Emit the typed result as JSON")
  .action(handleActiveRoster);

activeCmd
  .command("in-flight")
  .description("Emit the oracle-backed in-flight set — your work units and errands across worktrees and machines")
  .option("--local", "Skip the network read; derive from local refs (alias: --no-fetch)")
  .option("--no-fetch", "Skip the network read; derive from local refs")
  .option("--json", "Emit the typed result as JSON")
  .action(handleActiveInFlight);

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
  .addOption(
    new Option(
      "--user",
      "Render the in-flight-mine view (STATUS.USER) — your work units in flight across worktrees",
    ).conflicts(["session-init", "session-handoff"]),
  )
  .option("--local", "With --user: skip the network read; render from local refs (alias: --no-fetch)")
  .option("--no-fetch", "With --user: skip the network read; render from local refs")
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

// --- Release ---

const releaseCmd = program
  .command("release")
  .description(
    "Release wrappers — refuse on validation failure, audit-log every invocation",
  );

releaseCmd
  .command("commit")
  .description(
    "Wrapper around `git commit` — applies the release-mode validation cascade",
  )
  .allowUnknownOption(true)
  .argument("[args...]", "Arguments forwarded to `git commit`")
  .action(async (args: string[]) => {
    await handleReleaseCommit({ args });
  });

releaseCmd
  .command("push")
  .description(
    "Wrapper around `git push` — applies the release-mode push validation cascade",
  )
  .allowUnknownOption(true)
  .argument("[args...]", "Arguments forwarded to `git push`")
  .action(async (args: string[]) => {
    await handleReleasePush({ args });
  });

releaseCmd
  .command("opt-in")
  .description(
    "Record per-developer opt-in for release-mode wrappers (writes local git config `arc.releaseOptedIn = true`)",
  )
  .action(async () => {
    await handleReleaseOptIn();
  });

releaseCmd
  .command("opt-out")
  .description(
    "Record per-developer opt-out for release-mode wrappers (writes local git config `arc.releaseOptedIn = false`)",
  )
  .action(async () => {
    await handleReleaseOptOut();
  });

releaseCmd
  .command("status")
  .description("Show resolved release-mode opt-in and interlock state")
  .option("--json", "Emit a schemaVersion 2 JSON envelope")
  .action(async (opts: { json?: boolean }) => {
    await handleReleaseStatus({ json: opts.json });
  });

const setupCmd = releaseCmd
  .command("setup")
  .description("Set up release-wrapper harness integration");

setupCmd
  .command("install")
  .description("Set up release-wrapper harness integration")
  .option("--harness <name>", "Harness name for single-harness install flow")
  .addOption(
    new Option("--mode <mode>", "Harness mode")
      .choices(["default-prompt", "bypass"]),
  )
  .option("--json", "Emit a schemaVersion 1 JSON envelope")
  .action(async (opts: { harness?: string; mode?: string; json?: boolean }) => {
    await handleReleaseSetupInstall(opts);
  });

setupCmd
  .command("print-patterns")
  .description("Print release-wrapper allowlist patterns for a harness")
  .option("--harness <name>", "Harness name: claude-code, codex, or agent-adaptive")
  .addOption(
    new Option("--format <format>", "Output format")
      .choices(["harness", "raw"])
      .default("harness"),
  )
  .action((opts: { harness?: string; format?: string }) => {
    handleReleaseSetupPrintPatterns(opts);
  });

setupCmd
  .command("uninstall")
  .description("Remove release-wrapper harness integration")
  .option("--harness <name>", "Harness name for single-harness uninstall flow")
  .option("--json", "Emit a schemaVersion 1 JSON envelope")
  .action(async (opts: { harness?: string; json?: boolean }) => {
    await handleReleaseSetupUninstall(opts);
  });

setupCmd
  .command("verify")
  .description("Report recorded release-wrapper setup posture")
  .option("--harness <name>", "Filter verification report to a harness")
  .action(async (opts: { harness?: string }) => {
    await handleReleaseSetupVerify(opts);
  });

// --- Log ---

const logCmd = program
  .command("log")
  .description("Browse ARC commit history");

logCmd
  .command("standalone")
  .description("Show off-WU standalone commits")
  .option("--since <date>", "Show commits after date (e.g., 2026-03-01)")
  .option("--author <name>", "Filter by author")
  .option("--limit <n>", "Maximum number of commits (default: 50)", parseInt)
  .option("--all", "Show all matching commits (no limit)")
  .option(
    "--category <category>",
    "Filter by standalone category (maintenance|planning|documentation|refactor)",
  )
  .action(handleLogStandalone);

// --- Dev-mode stale-build guard (self-hosting only) ---

program.hook("preAction", (_thisCommand, actionCommand) => {
  const verdict = checkDevBuildStaleness(
    createDevCheckDeps(fileURLToPath(import.meta.url)),
  );
  if (verdict.kind === "skip" || verdict.kind === "fresh") return;

  const distAgeText = verdict.distAge === null
    ? "dist/cli.js missing"
    : `dist/cli.js built ${formatAge(verdict.distAge)} ago`;
  const baseMsg
    = `arc dev build is stale (${verdict.newestSrc} changed `
    + `${formatAge(verdict.srcAge)} ago; ${distAgeText}).`;

  if (isHandoffCritical(actionCommand)) {
    const cmdPath = formatCommandPath(actionCommand);
    process.stderr.write(
      `error: ${baseMsg} Refusing \`${cmdPath}\` against stale dist; `
      + "run `npm run build`, then retry.\n",
    );
    process.exit(1);
  }

  process.stderr.write(
    `warn: ${baseMsg} Run \`npm run build\` before relying on output.\n`,
  );
});

function isHandoffCritical(cmd: Command): boolean {
  const name = cmd.name();
  const parentName = cmd.parent?.name();
  if (parentName === "arc" && name === "sync") return true;
  if (parentName === "user" && (name === "save" || name === "push" || name === "sync")) return true;
  if (parentName === "release" && (name === "commit" || name === "push")) return true;
  if (parentName === "arc" && name === "status") {
    const opts = cmd.opts();
    if (opts.json === true && (opts.sessionInit === true || opts.sessionHandoff === true)) {
      return true;
    }
  }
  return false;
}

function formatCommandPath(cmd: Command): string {
  const parts: string[] = [];
  let cur: Command | null = cmd;
  while (cur !== null) {
    parts.unshift(cur.name());
    cur = cur.parent;
  }
  return parts.join(" ");
}

function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86_400)}d`;
}

// --- Entry ---

program.parseAsync().catch((err: unknown) => {
  console.error(formatUnexpectedError(err));
  process.exitCode = 1;
});
