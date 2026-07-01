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
  handleErrandOpen,
  handleErrandClose,
  handleErrandRetire,
  handleErrandPromote,
  type ErrandCheckOptions,
  type ErrandOpenOptions,
  type ErrandCloseOptions,
  type ErrandPromoteOptions,
} from "./handlers/errand.js";
import { handleHousekeepCheck, type HousekeepCheckOptions } from "./handlers/housekeep.js";
import { handlePlanCheck, type PlanCheckOptions } from "./handlers/plan.js";
import { handleUpdate, handleHealth, handleDiff } from "./handlers/installation.js";
import {
  handleStub,
  handleDecompose,
  handlePromote,
  handleDemote,
  handlePark,
  handleResume,
  handleActivate,
  handleDeactivate,
  handleIntegrate,
  handleReopen,
  handleAbandon,
  handleArchive,
  handleTeardown,
  handleSetStage,
  handleFinalizeStage,
  handleRepointDesign,
  type StubOptions,
  type ParkOptions,
  type ResumeOptions,
  type ActivateOptions,
  type IntegrateOptions,
  type ReopenOptions,
  type AbandonOptions,
  type ArchiveOptions,
  type TeardownOptions,
  type DecomposeOptions,
} from "./handlers/lifecycle.js";
import {
  handleUserAdd, handleUserClose, handleUserInboxRemove, handleUserOpen, handleUserSave, handleUserLoad, handleUserPush, handleUserFetch, handleUserPull, handleUserStatus,
} from "./handlers/user.js";
import { handleExtensionsStatus } from "./handlers/extensions.js";
import { handleConfigStatus } from "./handlers/config.js";
import { handleActiveStatus, handleActiveRoster, handleActiveInFlight } from "./handlers/active.js";
import { handleStatus } from "./handlers/status.js";
import { handleRecoverAudit, type RecoverAuditOptions } from "./handlers/recover.js";
import { handleSync, type SyncOptions } from "./handlers/sync.js";
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
    + "branch; `--here` works in the current worktree instead.",
  )
  .option(
    "--here",
    "Work in the current worktree, no spawn: cold-start a fresh WU, or bring up an existing backlog stub",
  )
  .option(
    "--from <pointer-or-blurb>",
    "Spec input — issue ref → Origin, spec/draft artifact → Design, else passed through for assessment",
  )
  .option("-y, --yes", "Skip the confirm prompt")
  .action((name: string | undefined, opts: StartOptions) => handleStart(name, opts));

// --- Lifecycle verbs (top-level peers of `arc start`) ---
// Each takes an optional positional so a bare invocation reaches the handler's
// candidate-list surface; slug-required verbs refuse a missing target there.

program
  .command("stub [name]")
  .description("Create a new backlog work unit at a committed tier (provisional | planned)")
  .option("--commitment <tier>", "Committed backlog tier: `provisional` or `planned` (required)")
  .option("--priority <priority>", "Work-unit priority, e.g. `P1` (required)")
  .option("--origin <ref>", "External reference (issue / URL) → meta `Origin`")
  .option("--design <ref>", "Design artifact (spec / draft) → meta `Design`")
  .option("--cohort <slug>", "Enrol under a cohort: place at backlog/planned/<cohort>/<name>/ + set meta `Cohort` (planned-tier, single member)")
  .action((name: string | undefined, opts: StubOptions) => handleStub(name, opts));

program
  .command("decompose <origin>")
  .description("Split a work unit into a cohort of members per a structured cut-map file")
  .option("--cut-map <file>", "Path to the cut-map file (JSON) — members, edges, distribution, dispositions (required)")
  .action((origin: string | undefined, opts: DecomposeOptions) => handleDecompose(origin, opts));

program
  .command("promote [slug]")
  .description("Raise a provisional stub to planned (requires a resolved `Class`)")
  .action((slug: string | undefined) => handlePromote(slug));

program
  .command("demote [slug]")
  .description("Lower a planned stub back to provisional")
  .action((slug: string | undefined) => handleDemote(slug));

program
  .command("park [slug]")
  .description("Shelve a started work unit off the active set (defaults to the current WU)")
  .option("--reason <text>", "Why the work unit is being parked (required)")
  .action((slug: string | undefined, opts: ParkOptions) => handlePark(slug, opts));

program
  .command("resume [slug]")
  .description(
    "Re-attach a parked work unit's preserved branch. Default spawns a fresh worktree; "
    + "`--here` re-attaches in the current worktree.",
  )
  .option("--here", "Re-attach in the current worktree instead of spawning a new one")
  .action((slug: string | undefined, opts: ResumeOptions) => handleResume(slug, opts));

program
  .command("activate [slug]")
  .description("Raise a planning work unit to Active (defaults to the current WU)")
  .option("--type <type>", "Working-branch type, e.g. `feat` — composes `<type>/<slug>` (required)")
  .option("--task <task>", "First task to orient on → meta `Next Task` (required)")
  .option("--action <action>", "Next action pointer → meta `Next Action` (required)")
  .action((slug: string | undefined, opts: ActivateOptions) => handleActivate(slug, opts));

program
  .command("deactivate [slug]")
  .description("Undo a premature activation: Active → Planning (defaults to the current WU)")
  .action((slug: string | undefined) => handleDeactivate(slug));

program
  .command("integrate [slug]")
  .description("Open review on an Active work unit: Active → Integrating (defaults to the current WU); marks phase entry, not the merge")
  .option("--last-completed <work>", "Work being submitted for review → meta `Last Completed` (required)")
  .option("--action <action>", "Next action pointer (e.g. `open the PR`) → meta `Next Action` (required)")
  .action((slug: string | undefined, opts: IntegrateOptions) => handleIntegrate(slug, opts));

program
  .command("reopen [slug]")
  .description("Withdraw an Integrating work unit back to Active (defaults to the current WU); closes its open PR")
  .option("--keep-pr", "Convert the PR to a draft instead of closing it")
  .action((slug: string | undefined, opts: ReopenOptions) => handleReopen(slug, opts));

program
  .command("abandon [slug]")
  .description("Destroy a pre-merge work unit (artifacts, branch, worktree) — prints the impact plan; requires --yes")
  .option("-y, --yes", "Confirm the destructive cascade (required to proceed)")
  .action((slug: string | undefined, opts: AbandonOptions) => handleAbandon(slug, opts));

program
  .command("archive [slug]")
  .description("Sweep a shipped work unit to completed/ (defaults to the current WU); computes the dated path")
  .option("--pr-url <url>", "Integration PR URL → meta `PR URL` (absent writes a placeholder + warns)")
  .option("--completed <date>", "Completion date YYYY-MM-DD → meta `Completed` (defaults to today)")
  .action((slug: string | undefined, opts: ArchiveOptions) => handleArchive(slug, opts));

program
  .command("teardown [name]")
  .description("Post-merge cleanup of a shipped work unit: reap the merged branch, remove the worktree, prune stale refs")
  .option(
    "--force",
    "Force-tear down a retired/parked origin (unmerged branch): accept non-completed/ arc-state; caller asserts conservation",
  )
  .action((name: string | undefined, opts: TeardownOptions) => handleTeardown(name, opts));

program
  .command("set-stage <stage>")
  .description(
    "Set the current work unit's planning-stage pointer (meta `Current Workflow`): "
    + "draft-design | create-spec | generate-tasks",
  )
  .option(
    "--advance",
    "Advance to <stage> at a stage boundary: also reset `Next Action` to the `[begin current workflow]` sentinel",
  )
  .action((stage: string, opts: { advance?: boolean }) => handleSetStage(stage, opts));

program
  .command("finalize <fire-point>")
  .description(
    "Persist a planning ceremony's finalize facts (meta `Class` / `Task List` / `Next Action`) "
    + "at its fire-point: create-spec | generate-tasks | verify",
  )
  .option("--class <value>", "Resolved Class to persist (Light | Heavy | Novel) — required at create-spec / generate-tasks")
  .action((firePoint: string, opts: { class?: string }) => handleFinalizeStage(firePoint, opts));

program
  .command("repoint-design <event>")
  .description(
    "Advance the current work unit's design pointer (meta `Design`) at a planning event: "
    + "draft-created | spec-finalized",
  )
  .action((event: string) => handleRepointDesign(event));

const errand = program
  .command("errand")
  .description("Errand operations. `open` launches an errand; `check` reports in-flight overlap.");

errand
  .command("check")
  .description("Report which in-flight work units touch the target path(s) — advisory, never blocks")
  .option("--target <paths...>", "Target path(s) the errand will edit (prefix-matched)")
  .option("--local", "Skip the oracle's network read; check local refs only (alias: --no-fetch)")
  .option("--no-fetch", "Skip the oracle's network read; check local refs only")
  .option("--json", "Emit overlap facts as JSON (for skill consumption)")
  .action((opts: ErrandCheckOptions) => handleErrandCheck(opts));

errand
  .command("open <slug>")
  .description("Open an errand: mint the record, cut a nature-typed branch, and occupy it in place")
  .option("--type <type>", "Branch nature-type: fix | chore | refactor | hotfix (default: chore)")
  .option("--intent <text>", "Free-text statement of the errand's concern (default: the slug)")
  .option("--from-inbox <entry-title>", "Adopt a USER-INBOX capture (its title): inbox-origin record, dropped at close")
  .action((slug: string, opts: ErrandOpenOptions) => handleErrandOpen(slug, opts));

errand
  .command("close <slug>")
  .description("Close an errand: reap the branch (containment-safe), remove the record, drop the inbox capture")
  .option("--force", "Bypass the containment check — reap even when the commits can't be proven preserved")
  .action((slug: string, opts: ErrandCloseOptions) => handleErrandClose(slug, opts));

errand
  .command("retire <slug>")
  .description("Retire a promoted errand's record (the renamed branch survives as the work-unit branch)")
  .action((slug: string) => handleErrandRetire(slug));

errand
  .command("promote <slug>")
  .description("Promote an errand to a work unit: rename the branch, mint the meta, retire the record")
  .option("--name <name>", "The new work-unit name (meta filename + branch leaf); defaults to the slug")
  .option("--type <type>", "WU branch nature-type prefixing the name (default: feat)")
  .option("--floor <floor>", "Which floor the errand crossed: derivation | scale (required)")
  .option("--priority <priority>", "WU priority for the minted meta")
  .option("--class <class>", "WU Class for the minted meta")
  .action((slug: string, opts: ErrandPromoteOptions) => handleErrandPromote(slug, opts));

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

const plan = program
  .command("plan")
  .description(
    "Planning-entry operations. `check` classifies the write context before drafting (committable "
    + "→ proceed, else redirect to start / stub / errand) so a draft never lands where it can't commit.",
  );

plan
  .command("check")
  .description("Classify the planning-entry route — committable (proceed) or not (redirect to start / stub / errand)")
  .option("--name <slug>", "The design's WU-name slug — gates the draft-presence check")
  .option("--json", "Emit the planning-entry route as JSON (for skill consumption)")
  .action((opts: PlanCheckOptions) => handlePlanCheck(opts));

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
  .command("inbox-remove <slug>")
  .description("Drop the slug-matched USER-INBOX entry (title-keyed in v1; idempotent — no-op when absent)")
  .action(handleUserInboxRemove);

userCmd
  .command("save")
  .description("Save user directory to user notes on HEAD")
  .action(handleUserSave);

userCmd
  .command("load")
  .description("Restore user directory from user notes")
  .option("-y, --yes", "Skip overwrite confirmation prompts")
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
  .argument(
    "[slug]",
    "Resolve one work unit's lifecycle state — (phase, location), derived enum, predicates, and dep-edge states",
  )
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
    ).conflicts(["session-init", "recover"]),
  )
  .addOption(
    new Option(
      "--recover",
      "Emit the lean recover envelope for compaction recovery",
    ).conflicts(["session-init", "session-handoff", "user"]),
  )
  .addOption(
    new Option(
      "--user",
      "Render the in-flight-mine view (STATUS.USER) — your work units in flight across worktrees",
    ).conflicts(["session-init", "session-handoff", "recover"]),
  )
  .option("--local", "With --user: skip the network read; render from local refs (alias: --no-fetch)")
  .option("--no-fetch", "With --user: skip the network read; render from local refs")
  .addOption(
    new Option(
      "--write-compaction-seed",
      "With --session-init: write the machine-local compaction recovery seed",
    ).conflicts(["recover", "session-handoff", "user"]),
  )
  .option("--json", "Emit the typed result as JSON")
  .action(handleStatus);

// --- Recover ---

const recoverCmd = program
  .command("recover")
  .description("Recovery support commands for harness compaction");

recoverCmd
  .command("audit")
  .description("Audit the latest compaction seed against fresh recovery state")
  .option("--json", "Emit the typed result as JSON")
  .action((opts: RecoverAuditOptions) => handleRecoverAudit(opts));

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
  // Call explicitly with only the parsed options — Commander otherwise passes
  // the Command instance as a second arg, which would collide with the
  // injectable `output` parameter.
  .action((opts: SyncOptions) => handleSync(opts));

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
