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
import {
  checkDevBuildStaleness,
  createDevCheckDeps,
  isDevBuildRefreshCommandPath,
  refreshDevBuildAfterAction,
} from "./lib/dev-check.js";
import { withInteractionContext } from "./lib/command-input/interaction-context.js";
import { isDecomposeMachineReadableInvocation } from "./lib/work-unit/decompose-command-routing.js";
import type { InitOptions } from "./handlers/init.js";
import type { JoinOptions } from "./handlers/join.js";
import type { StartOptions } from "./handlers/start.js";
import type {
  ErrandCheckOptions,
  ErrandOpenOptions,
  ErrandLinkOptions,
  ErrandMaterializeOptions,
  ErrandLeaveOptions,
  ErrandCloseOptions,
  ErrandAbandonOptions,
  ErrandPromoteOptions,
} from "./handlers/errand.js";
import type { ErrandMergeOptions } from "./handlers/errand-merge.js";
import type { HousekeepCheckOptions } from "./handlers/housekeep.js";
import type {
  BaseDriftOptions,
  BaseMergeOptions,
  BaseSyncOptions,
} from "./handlers/base.js";
import type { PlanCheckOptions } from "./handlers/plan.js";
import type {
  DeliveryComposeOptions,
  DeliveryPlanAbandonOptions,
  DeliveryPlanFromBranchOptions,
  DeliveryPlanFromTasksOptions,
  DeliveryPlanInventorySchemaOptions,
} from "./handlers/delivery.js";
import type { DeliveryExecutionOptions } from "./handlers/delivery-execution.js";
import type { DeliveryEntryInspectOptions } from "./handlers/delivery-entry.js";
import type {
  DeliveryTransferExportOptions,
  DeliveryTransferImportOptions,
} from "./handlers/delivery-transfer.js";
import type {
  PromoteOptions,
  StubOptions,
  ParkOptions,
  ResumeOptions,
  MaterializeOptions,
  ActivateOptions,
  PublishOptions,
  ReopenOptions,
  AbandonOptions,
  ArchiveOptions,
  TeardownOptions,
  DecomposeOptions,
  AttestOptions,
} from "./handlers/lifecycle.js";
import type {
  UserInboxRemoveOptions,
  UserReconcileReferencesOptions,
  UserPushOptions,
  UserFetchOptions,
  UserCompactHandlerOptions,
  UserStatusOptions,
  UserLoadOptions,
  UserPullOptions,
} from "./handlers/user.js";
import type { ExtensionsStatusCliOptions } from "./handlers/extensions.js";
import type { ConfigStatusCliOptions, ConfigValidateCliOptions } from "./handlers/config.js";
import type {
  ActiveStatusCliOptions,
  ActiveRosterCliOptions,
  ActiveInFlightCliOptions,
} from "./handlers/active.js";
import type { StatusCliOptions } from "./handlers/status.js";
import type { LocusCliOptions } from "./handlers/locus.js";
import type { ViewCliOptions } from "./handlers/view.js";
import type { RecoverAuditOptions } from "./handlers/recover.js";
import type { SyncOptions } from "./handlers/sync.js";
import type { UserSyncOptions } from "./handlers/user-sync.js";
import type { LogStandaloneOptions } from "./handlers/log.js";
import type {
  IntegrationCheckpointOptions,
  IntegrationMergeOptions,
} from "./handlers/integration.js";
import type {
  ReviewPrePublicationOptions,
  ReviewPlanningLaneOptions,
  ReviewChangeRequestResolveOptions,
  ReviewMergeMethodResolveOptions,
  ReviewChecksAwaitOptions,
  ReviewStatusOptions,
} from "./handlers/review.js";
import type { WuReconcileOptions } from "./handlers/reconcile.js";
import type { HandleCheckCommitMessageOptions } from "./commands/check.js";
import type {
  ReleaseSetupInstallOptions,
  ReleaseSetupPrintPatternsOptions,
  ReleaseSetupUninstallOptions,
  ReleaseSetupVerifyOptions,
} from "./commands/release.js";

const program = new Command();

program
  .name("arc")
  .description("CLI for installing, updating, and managing ARC framework files")
  .option("--no-input", "Forbid prompts, presenters, editors, and ambient child-process input")
  .version(getFrameworkVersion());

// --- Checks ---

const checkCmd = program
  .command("check")
  .description("Run standalone repository checks");

program
  .command("hook-remedy-roadmap-conflict", { hidden: true })
  .action(async () => {
    await (await import("./scripts/remedy-roadmap-conflict.js")).runRoadmapConflictAutoRemedyCommand();
  });

function isDashPrefixedCheckSourceEscaped(
  rawArgs: readonly string[],
  input: readonly string[],
): boolean {
  if (input.length !== 1) return false;
  const commandIndex = rawArgs.findIndex(
    (value, index) => value === "check" && rawArgs[index + 1] === "commit-msg",
  );
  if (commandIndex === -1) return false;
  const tail = rawArgs.slice(commandIndex + 2);
  const terminator = tail.indexOf("--");
  return terminator !== -1
    && tail.length === terminator + 2
    && tail[terminator + 1] === input[0];
}

checkCmd
  .command("commit-msg")
  .description("Validate a commit message without committing")
  .usage("<file | -> [--json]")
  .argument("[input...]", "Commit-message file path, or - for stdin")
  .allowUnknownOption(true)
  .option("--json", "Emit a versioned JSON envelope")
  .action(withInteractionContext(
    { machineReadable: (opts) => opts.json === true },
    async (context, input: string[], opts: HandleCheckCommitMessageOptions) => {
      await (await import("./commands/check.js")).handleCheckCommitMessage(
        input,
        {
          ...opts,
          dashPrefixedSourceAllowed: isDashPrefixedCheckSourceEscaped(process.argv, input),
        },
        context,
      );
    },
  ));

// --- Init & Join ---

program
  .command("init")
  .description("Initialize ARC framework in the current project")
  .option("-y, --yes", "Skip prompts, use defaults")
  .option("--name <string>", "Project name")
  .option("--pm-mode <mode>", "PM mode: none, arc-in-git, external")
  .option("--tools <csv>", "Comma-separated tool list")
  .option("--identity <name>", "Personal workspace identity (fresh installation only)")
  .option("--team", "Enable team mode (requires --yes)")
  .option("--reconfigure", "Change structural settings on an existing installation")
  .option("--dry-run", "Preview reconfigure changes without applying (requires --reconfigure)")
  .action(withInteractionContext(
    { yes: "compatibility" },
    async (context, opts: InitOptions) => {
      await (await import("./handlers/init.js")).handleInit(opts, context);
    },
  ));

program
  .command("join")
  .description("Join an existing ARC project as a team member or contributor")
  .option("--contributor", "Set role to contributor (default: maintainer)")
  .option("-y, --yes", "Skip prompts, use defaults")
  .option("--tools <csv>", "Comma-separated tool list")
  .option("--identity <name>", "Personal workspace identity (fresh setup only)")
  .option("--reconfigure", "Change personal workspace settings (role, tools)")
  .action(withInteractionContext(
    { yes: "compatibility" },
    async (context, opts: JoinOptions) => {
      await (await import("./handlers/join.js")).handleJoin(opts, context);
    },
  ));

// --- Work units ---

const wu = program
  .command("wu")
  .description("Current work-unit operations");

wu
  .command("reconcile [slug]")
  .description("Plan or apply version-checked repairs owned by the current work unit")
  .option("--apply", "Apply and stage the exact reported path set")
  .option("--json", "Emit a typed JSON result")
  .action(withInteractionContext(
    { machineReadable: (opts) => opts.json === true },
    async (context, slug: string | undefined, opts: WuReconcileOptions) => {
      await (await import("./handlers/reconcile.js")).handleWuReconcile(slug, opts, context);
    },
  ));

program
  .command("start [name]")
  .description(
    "Start a work unit. Default spawns an isolated worktree on a new `plan/<name>` "
    + "branch, then commits and pushes that start ceremony; `--here` works in the current worktree instead.",
  )
  .option(
    "--here",
    "Work in the current worktree, no spawn: cold-start a fresh WU, or bring up an existing backlog stub",
  )
  .option(
    "--from <pointer-or-blurb>",
    "Spec input — issue ref → Origin, spec/draft artifact → Design, else passed through for assessment",
  )
  .option(
    "--class <value>",
    "Resolved Class (Light | Heavy | Novel) for a stub still `[TBD]` — the start ceremony records it in the meta",
  )
  .option("--new", "Create a fresh work unit when the name does not exist on the base branch")
  .option("-y, --yes", "Skip the confirm prompt; spawned starts still commit and push the ceremony")
  .action(withInteractionContext(
    { yes: "compatibility" },
    async (context, name: string | undefined, opts: StartOptions) => {
      await (await import("./handlers/start.js")).handleStart(name, opts, context);
    },
  ));

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
  .option(
    "--cohort <path>",
    "Enrol under <cohort> or <cohort>/<subcohort>: place the member in that planned-tier cohort path",
  )
  .option("--class <value>", "Initial resolved Class (Light | Heavy | Novel); omitted → `[TBD]`")
  .action(withInteractionContext(
    { yes: "none" },
    async (context, name: string | undefined, opts: StubOptions) => {
      await (await import("./handlers/lifecycle.js")).handleStub(name, opts, context);
    },
  ));

program
  .command("decompose <origin>")
  .description("Preflight, execute, extract, finish, or advance one decomposition")
  .option("--preflight", "Emit one canonical read-only v3 starter map")
  .option("--execute <cut-map>", "Stage one exact result from a canonical completed cut map")
  .option("--extract <cut-map>", "Stage one additive result while preserving the source origin")
  .option("--finish <cut-map>", "Preview source thinning after proving the additive result landed")
  .option("--apply <authority>", "Apply the exact source-thinning preview authority")
  .option("--advance-base <cut-map>", "Advance one committed candidate from its completed cut map")
  .action(withInteractionContext(
    {
      machineReadable: isDecomposeMachineReadableInvocation,
    },
    async (context, origin: string | undefined, opts: DecomposeOptions) => {
      await (await import("./handlers/lifecycle.js")).handleDecompose(origin, opts, context);
    },
  ));

program
  .command("rename <slug> <new-slug>")
  .description("Rename a work unit and its branch, workspace, remote, marker, and worktree identities")
  .action(withInteractionContext(
    {},
    async (context, slug: string, newSlug: string) => {
      await (await import("./handlers/lifecycle.js")).handleRename(slug, newSlug, context);
    },
  ));

program
  .command("promote [slug]")
  .description("Raise a provisional stub to planned (requires a resolved `Class`)")
  .option("--class <value>", "Resolved Class (Light | Heavy | Novel) when the stub is still `[TBD]`")
  .action(withInteractionContext(
    { yes: "none" },
    async (context, slug: string | undefined, opts: PromoteOptions) => {
      await (await import("./handlers/lifecycle.js")).handlePromote(slug, opts, context);
    },
  ));

program
  .command("demote [slug]")
  .description("Lower a planned stub back to provisional")
  .action(withInteractionContext(
    {},
    async (context, slug: string | undefined) => {
      await (await import("./handlers/lifecycle.js")).handleDemote(slug, context);
    },
  ));

program
  .command("park [slug]")
  .description("Shelve a started work unit off the active set (defaults to the current WU)")
  .option("--reason <text>", "Why the work unit is being parked (required)")
  .option("--land <commit>", "Stage an exact planning transition on a partial-protection base")
  .action(withInteractionContext(
    {},
    async (context, slug: string | undefined, opts: ParkOptions) => {
      await (await import("./handlers/lifecycle.js")).handlePark(slug, opts, context);
    },
  ));

program
  .command("resume [slug]")
  .description(
    "Re-attach a parked work unit's preserved branch. Default spawns a fresh worktree; "
    + "`--here` re-attaches in the current worktree.",
  )
  .option("--here", "Re-attach in the current worktree instead of spawning a new one")
  .action(withInteractionContext(
    {},
    async (context, slug: string | undefined, opts: ResumeOptions) => {
      await (await import("./handlers/lifecycle.js")).handleResume(slug, opts, context);
    },
  ));

program
  .command("materialize [slug]")
  .description(
    "Pick up a remote-only in-flight work unit. Default spawns a fresh worktree; "
    + "`--here` checks it out in the current worktree.",
  )
  .option("--here", "Check out in the current worktree instead of spawning a new one")
  .action(withInteractionContext(
    {},
    async (context, slug: string | undefined, opts: MaterializeOptions) => {
      await (await import("./handlers/lifecycle.js")).handleMaterialize(slug, opts, context);
    },
  ));

program
  .command("activate [slug]")
  .description("Raise a planning work unit to Active (defaults to the current WU)")
  .option("--type <type>", "Working-branch type, e.g. `feat` — composes `<type>/<slug>` (required)")
  .option("--task <task>", "First task to orient on → meta `Next Task` (required)")
  .option("--action <action>", "Next action pointer → meta `Next Action` (required)")
  .action(withInteractionContext(
    {},
    async (context, slug: string | undefined, opts: ActivateOptions) => {
      await (await import("./handlers/lifecycle.js")).handleActivate(slug, opts, context);
    },
  ));

program
  .command("deactivate [slug]")
  .description("Undo a premature activation: Active → Planning (defaults to the current WU)")
  .action(withInteractionContext(
    {},
    async (context, slug: string | undefined) => {
      await (await import("./handlers/lifecycle.js")).handleDeactivate(slug, context);
    },
  ));

program
  .command("publish [slug]")
  .description("Schedule publication for an Active work unit: Active → Integrating (defaults to the current WU)")
  .option("--last-completed <work>", "Override meta `Last Completed` (default: the task list's last completed task)")
  .option("--action <action>", "Override meta `Next Action` (default: the publication boundary's own pointer)")
  .option("--allow-advisories", "Retain every surfaced advisory-only reconcile finding and enter review")
  .option("--json", "Emit the typed publication-resume boundary as JSON")
  .action(withInteractionContext(
    { machineReadable: (opts) => opts.json === true },
    async (context, slug: string | undefined, opts: PublishOptions) => {
      await (await import("./handlers/lifecycle.js")).handlePublish(slug, opts, context);
    },
  ));

const integrateCmd = program
  .command("integrate")
  .description("Run integration checkpoint and merge procedures");

integrateCmd.action(() => {
  console.error("error: `arc integrate` is a procedure namespace; use `arc publish` to schedule publication.");
  const subcommands = integrateCmd.commands.map((command) => `arc integrate ${command.name()}`);
  console.error(
    subcommands.length > 0
      ? `Available subcommands: ${subcommands.join(", ")}.`
      : "Available subcommands: none yet.",
  );
  process.exitCode = 1;
});

integrateCmd
  .command("checkpoint <name>")
  .description("Compose one typed integration-readiness verdict")
  .requiredOption("--json", "Emit the typed checkpoint verdict as JSON")
  .action(withInteractionContext(
    { machineReadable: (opts) => opts.json === true },
    async (context, name: string, opts: IntegrationCheckpointOptions) => {
      await (await import("./handlers/integration.js")).handleIntegrationCheckpoint(name, opts, context);
    },
  ));

integrateCmd
  .command("merge <name>")
  .description("Execute one approved integration checkpoint and merge its exact head")
  .requiredOption("--checkpoint <handle>", "Opaque checkpoint handle returned by integrate checkpoint")
  .requiredOption("--json", "Emit the typed merge verdict as JSON")
  .action(withInteractionContext(
    { machineReadable: (opts) => opts.json === true },
    async (context, name: string, opts: IntegrationMergeOptions) => {
      await (await import("./handlers/integration.js")).handleIntegrationMerge(name, opts, context);
    },
  ));

program
  .command("reopen [slug]")
  .description("Withdraw an Integrating work unit back to Active (defaults to the current WU); closes its open PR")
  .option("--keep-pr", "Convert the PR to a draft instead of closing it")
  .option("--task <task>", "Return to an exact reopened task instead of Candidate preparation")
  .action(withInteractionContext(
    {},
    async (context, slug: string | undefined, opts: ReopenOptions) => {
      await (await import("./handlers/lifecycle.js")).handleReopen(slug, opts, context);
    },
  ));

program
  .command("abandon [slug]")
  .description("Destroy a pre-merge work unit (artifacts, branch, worktree) — prints the impact plan; requires --yes")
  .option("-y, --yes", "Confirm the destructive cascade (required to proceed)")
  .action(withInteractionContext(
    { yes: "authority" },
    async (context, slug: string | undefined, opts: AbandonOptions) => {
      await (await import("./handlers/lifecycle.js")).handleAbandon(slug, opts, context);
    },
  ));

program
  .command("archive [slug]")
  .description("Sweep a shipped work unit to completed/ (defaults to the current WU); computes the dated path")
  .option("--pr-url <url>", "Integration PR URL → meta `PR URL` (absent writes a placeholder + warns)")
  .option("--completed <date>", "Completion date YYYY-MM-DD → meta `Completed` (defaults to today)")
  .action(withInteractionContext(
    {},
    async (context, slug: string | undefined, opts: ArchiveOptions) => {
      await (await import("./handlers/lifecycle.js")).handleArchive(slug, opts, context);
    },
  ));

program
  .command("teardown [name]")
  .description("Evidence-backed cleanup of a retired work unit: reap refs, remove or husk its worktree, and prune")
  .option("--branch <branch>", "Reap a merged recordless chore/<slug> branch by exact name")
  .option("--husk <absolute-path>", "Replay cleanup for one exact registered detached husk")
  .option(
    "--force",
    "Compatibility spelling for evidence-backed cleanup; grants no additional authority",
  )
  .action(withInteractionContext(
    {},
    async (context, name: string | undefined, opts: TeardownOptions) => {
      await (await import("./handlers/lifecycle.js")).handleTeardown(name, opts, context);
    },
  ));

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
  .action(withInteractionContext(
    {},
    async (context, stage: string, opts: { advance?: boolean }) => {
      await (await import("./handlers/lifecycle.js")).handleSetStage(stage, opts, context);
    },
  ));

program
  .command("finalize <fire-point>")
  .description(
    "Persist a planning ceremony's finalize facts (meta `Class` / `Task List` / `Next Action`) "
    + "at its fire-point: create-spec | generate-tasks",
  )
  .option("--class <value>", "Resolved Class to persist (Light | Heavy | Novel) — required at create-spec / generate-tasks")
  .action(withInteractionContext(
    {},
    async (context, firePoint: string, opts: { class?: string }) => {
      await (await import("./handlers/lifecycle.js")).handleFinalizeStage(firePoint, opts, context);
    },
  ));

program
  .command("attest <name>")
  .description("Attest a verified work-unit Candidate while leaving lifecycle State unchanged")
  .option("--json", "Emit the typed pre-publication locus as JSON")
  .option(
    "--new-root",
    "Root a new lineage over the current fully verified subject, superseding a blocked Candidate",
  )
  .option("--scope <scope>", "Verification scope for convergence: focused | full", "full")
  .option(
    "--verification-evidence-ref <reference>",
    "Fresh verification evidence reference for a convergence attestation",
  )
  .option(
    "--expected-candidate <candidate-id>",
    "Require the blocked Candidate selected by a prior attestation refusal",
  )
  .option(
    "--expected-subject <subject-digest>",
    "Require the staged subject selected by a prior attestation refusal",
  )
  .action(withInteractionContext(
    { machineReadable: (opts) => opts.json === true },
    async (context, name: string, opts: AttestOptions) => {
      await (await import("./handlers/lifecycle.js")).handleAttest(name, opts, context);
    },
  ));

const candidate = program
  .command("candidate")
  .description("Resolve Candidate lineage transitions");

const candidateApplicability = candidate
  .command("applicability")
  .description("Classify and bind Candidate applicability");

candidateApplicability
  .command("resolve <name> <input>")
  .description("Re-derive and bind one exact applicability selection")
  .action(withInteractionContext(
    { machineReadable: () => true },
    async (context, name: string, input: string) => {
      await (await import("./handlers/candidate.js")).handleCandidateApplicabilityResolve(name, input, context);
    },
  ));

program
  .command("repoint-design <event>")
  .description(
    "Advance the current work unit's design pointer (meta `Design`) at a planning event: "
    + "draft-created | spec-finalized",
  )
  .action(withInteractionContext(
    {},
    async (context, event: string) => {
      await (await import("./handlers/lifecycle.js")).handleRepointDesign(event, context);
    },
  ));

const errand = program
  .command("errand")
  .description("Open, preserve, resume, complete, or inspect an Errand lifecycle.");

errand
  .command("check")
  .description("Report which in-flight work units touch the target path(s) — advisory, never blocks")
  .option("--target <paths...>", "Target path(s) the errand will edit (prefix-matched)")
  .option("--local", "Skip the oracle's network read; check local refs only (alias: --no-fetch)")
  .option("--no-fetch", "Skip the oracle's network read; check local refs only")
  .option("--json", "Emit overlap facts as JSON (for skill consumption)")
  .action(withInteractionContext(
    { machineReadable: (opts) => opts.json === true },
    async (context, opts: ErrandCheckOptions) => {
      await (await import("./handlers/errand.js")).handleErrandCheck(opts, context);
    },
  ));

errand
  .command("open <slug>")
  .description("Open an errand in the free primary or a provisioned transient worktree")
  .option("--intent <text>", "Free-text statement of the errand's concern (default: the slug)")
  .option("--from-inbox <entry-title>", "Adopt a USER-INBOX capture (its bold title): inbox-origin record, dropped at close")
  .option("--inbox-title-file <path>", "Read the capture's inner bold title from a UTF-8 file, or - for stdin")
  .option("--inbox-entry-file <path>", "Compatibility alias of --inbox-title-file")
  .option("--json", "Emit the producer-validated mutation result")
  .action(withInteractionContext(
    { machineReadable: (opts) => opts.json === true },
    async (context, slug: string, opts: ErrandOpenOptions) => {
      await (await import("./handlers/errand.js")).handleErrandOpen(slug, opts, context);
    },
  ));

errand
  .command("link <slug>")
  .description("Link an in-flight errand to a USER-INBOX capture so close/promote can drop it")
  .option("--from-inbox <entry-title>", "USER-INBOX capture bold title to associate with the errand")
  .option("--inbox-title-file <path>", "Read the capture's inner bold title from a UTF-8 file, or - for stdin")
  .option("--inbox-entry-file <path>", "Compatibility alias of --inbox-title-file")
  .option("--json", "Emit the producer-validated mutation result")
  .action(withInteractionContext(
    { machineReadable: (opts) => opts.json === true },
    async (context, slug: string, opts: ErrandLinkOptions) => {
      await (await import("./handlers/errand.js")).handleErrandLink(slug, opts, context);
    },
  ));

errand
  .command("leave <slug>")
  .description("Preserve an Errand tail and close its local occupancy")
  .addOption(new Option("--state <state>", "Tail state")
    .choices(["paused", "awaiting-merge"])
    .makeOptionMandatory())
  .option("--confirm-foreign-generation <generation>", "Confirm the exact foreign Errand generation")
  .option("--json", "Emit the producer-validated mutation result")
  .action(withInteractionContext(
    { machineReadable: (opts) => opts.json === true },
    async (context, slug: string, opts: ErrandLeaveOptions) => {
      await (await import("./handlers/errand.js")).handleErrandLeave(slug, opts, context);
    },
  ));

errand
  .command("materialize <slug>")
  .description("Materialize an exact remote-only Errand generation in an ARC-owned checkout")
  .option("--claim-id <claim-id>", "Require the selected Errand claim generation")
  .option("--expected-head <oid>", "Require the selected retained head")
  .option("--json", "Emit the producer-validated mutation result")
  .action(withInteractionContext(
    { machineReadable: (opts) => opts.json === true },
    async (context, slug: string, opts: ErrandMaterializeOptions) => {
      await (await import("./handlers/errand.js")).handleErrandMaterialize(slug, opts, context);
    },
  ));

errand
  .command("merge <slug> <input>")
  .description("Merge one exact approved Errand target through the typed terminal operation")
  .option("--json", "Emit the typed terminal result")
  .action(withInteractionContext(
    { machineReadable: (opts) => opts.json === true },
    async (context, slug: string, input: string, opts: ErrandMergeOptions) => {
      await (await import("./handlers/errand-merge.js")).handleErrandMerge(slug, input, opts, context);
    },
  ));

errand
  .command("close <slug>")
  .description("Complete an Errand, release its exact occupancy, and drop its originating inbox capture")
  .option("--confirm-foreign-generation <generation>", "Confirm the exact foreign Errand generation")
  .option("--json", "Emit the producer-validated mutation result")
  .action(withInteractionContext(
    { machineReadable: (opts) => opts.json === true },
    async (context, slug: string, opts: ErrandCloseOptions) => {
      await (await import("./handlers/errand.js")).handleErrandClose(slug, opts, context);
    },
  ));

errand
  .command("abandon <slug>")
  .description("Abandon a safely preserved Errand and retain its inbox capture")
  .option("--confirm-foreign-generation <generation>", "Confirm the exact foreign Errand generation")
  .option("--json", "Emit the producer-validated mutation result")
  .action(withInteractionContext(
    { machineReadable: (opts) => opts.json === true },
    async (context, slug: string, opts: ErrandAbandonOptions) => {
      await (await import("./handlers/errand.js")).handleErrandAbandon(slug, opts, context);
    },
  ));

errand
  .command("promote <slug>")
  .description("Promote an Errand to a receipt-backed work unit and settle its exact identity")
  .option("--name <name>", "The new work-unit name (meta filename + branch leaf); defaults to the slug")
  .option("--type <type>", "WU branch nature-type prefixing the name (default: feat)")
  .option("--floor <floor>", "Which floor the errand crossed: derivation | scale (required)")
  .option("--priority <priority>", "WU priority for the minted meta")
  .option("--class <class>", "WU Class for the minted meta")
  .option("--confirm-foreign-generation <generation>", "Confirm the exact foreign Errand generation")
  .option("--json", "Emit the producer-validated mutation result")
  .action(withInteractionContext(
    { machineReadable: (opts) => opts.json === true },
    async (context, slug: string, opts: ErrandPromoteOptions) => {
      await (await import("./handlers/errand.js")).handleErrandPromote(slug, opts, context);
    },
  ));

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
  .action(withInteractionContext(
    { machineReadable: (opts) => opts.json === true },
    async (context, opts: HousekeepCheckOptions) => {
      await (await import("./handlers/housekeep.js")).handleHousekeepCheck(opts, context);
    },
  ));

const baseCmd = program
  .command("base")
  .description("Local integration-base operations");

baseCmd
  .command("drift")
  .description("Analyze current branch drift from a freshly fetched integration base")
  .option("--json", "Emit the typed base-drift analysis as JSON")
  .action(withInteractionContext(
    { machineReadable: (opts) => opts.json === true },
    async (context, opts: BaseDriftOptions) => {
      await (await import("./handlers/base.js")).handleBaseDrift(opts, context);
    },
  ));

baseCmd
  .command("merge")
  .description("Merge one checkpointed base revision append-only")
  .requiredOption("--expected-base <oid>", "Exact base revision approved by the checkpoint")
  .requiredOption("--expected-head <oid>", "Exact Candidate head approved by the checkpoint")
  .option("--regenerate-roadmap", "Apply the checkpoint-authorized ROADMAP-only conflict remedy")
  .requiredOption("--json", "Emit the typed merge outcome as JSON")
  .action(withInteractionContext(
    { machineReadable: (opts) => opts.json === true },
    async (context, opts: BaseMergeOptions) => {
      await (await import("./handlers/base.js")).handleBaseMerge(opts, context);
    },
  ));

baseCmd
  .command("sync")
  .description("Safely fast-forward the local base from any worktree")
  .option("--json", "Emit the typed synchronization outcome as JSON")
  .action(withInteractionContext(
    { machineReadable: (opts) => opts.json === true },
    async (context, opts: BaseSyncOptions) => {
      await (await import("./handlers/base.js")).handleBaseSync(opts, context);
    },
  ));

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
  .action(withInteractionContext(
    { machineReadable: (opts) => opts.json === true },
    async (context, opts: PlanCheckOptions) => {
      await (await import("./handlers/plan.js")).handlePlanCheck(opts, context);
    },
  ));

const delivery = program
  .command("delivery")
  .description("Author, compose, and manage delivery plans");

const deliveryAuthoring = delivery.command("authoring").description("Resolve deterministic authoring locators");
deliveryAuthoring.command("locate").description("Resolve exact candidate refs and detached gate paths")
  .argument("<input>", "Strict JSON request path, or - for standard input").option("--json", "Emit the strict verb result as JSON")
  .action(withInteractionContext({ machineReadable: () => true }, async (context, input: string, opts: DeliveryExecutionOptions) => {
    await (await import("./handlers/delivery-execution.js")).handleDeliveryExecution("authoring-locate", { ...opts, input }, context);
  }));
deliveryAuthoring.command("rematerialize").description("Prepare one exact private candidate ref and detached gate pair")
  .argument("<input>", "Strict JSON request path, or - for standard input").option("--json", "Emit the strict verb result as JSON")
  .action(withInteractionContext({ machineReadable: () => true }, async (context, input: string, opts: DeliveryExecutionOptions) => {
    await (await import("./handlers/delivery-execution.js")).handleDeliveryExecution("authoring-rematerialize", { ...opts, input }, context);
  }));
deliveryAuthoring.command("rebind").description("Bind one clean detached authoring head to its candidate ref")
  .argument("<input>", "Strict JSON request path, or - for standard input").option("--json", "Emit the strict verb result as JSON")
  .action(withInteractionContext({ machineReadable: () => true }, async (context, input: string, opts: DeliveryExecutionOptions) => {
    await (await import("./handlers/delivery-execution.js")).handleDeliveryExecution("authoring-rebind", { ...opts, input }, context);
  }));

delivery.command("closeout").description("Reap completed delivery residue and retire its exact records")
  .argument("<input>", "Strict JSON request path, or - for standard input").option("--json", "Emit the strict verb result as JSON")
  .action(withInteractionContext({ machineReadable: () => true }, async (context, input: string, opts: DeliveryExecutionOptions) => {
    await (await import("./handlers/delivery-execution.js")).handleDeliveryExecution("closeout", { ...opts, input }, context);
  }));

delivery.command("entry").description("Inspect the operator-invoked delivery entry route")
  .command("inspect").description("Read authoritative delivery intent and binding facts")
  .option("--input <path>", "Strict attended judgment JSON path, or - for standard input")
  .option("--json", "Emit the strict entry route as JSON")
  .action(withInteractionContext(
    { machineReadable: () => true },
    async (context, opts: DeliveryEntryInspectOptions) => {
      await (await import("./handlers/delivery-entry.js")).handleDeliveryEntryInspect(opts, context);
    },
  ));

const deliveryEligibility = delivery.command("eligibility").description("Validate one exact delivery candidate chain");
deliveryEligibility.command("prepare").description("Pin and validate the authored candidate chain")
  .argument("<input>", "Strict JSON request path, or - for standard input").option("--json", "Emit the strict verb result as JSON")
  .action(withInteractionContext({ machineReadable: () => true }, async (context, input: string, opts: DeliveryExecutionOptions) => {
    await (await import("./handlers/delivery-execution.js")).handleDeliveryExecution("eligibility-prepare", { ...opts, input }, context);
  }));
deliveryEligibility.command("close").description("Close the post-gate eligibility observation window")
  .argument("<input>", "Strict JSON request path, or - for standard input").option("--json", "Emit the strict verb result as JSON")
  .action(withInteractionContext({ machineReadable: () => true }, async (context, input: string, opts: DeliveryExecutionOptions) => {
    await (await import("./handlers/delivery-execution.js")).handleDeliveryExecution("eligibility-close", { ...opts, input }, context);
  }));
delivery.command("publish").description("Publish exact member refs and open or adopt every change request")
  .argument("<input>", "Strict JSON request path, or - for standard input").option("--json", "Emit the strict verb result as JSON")
  .action(withInteractionContext({ machineReadable: () => true }, async (context, input: string, opts: DeliveryExecutionOptions) => {
    await (await import("./handlers/delivery-execution.js")).handleDeliveryExecution("publish", { ...opts, input }, context);
  }));
const deliveryNative = delivery.command("native").description("Compose optional host-native stack presentation");
deliveryNative.command("observe").description("Observe exact native registration without mutation")
  .argument("<input>", "Strict JSON request path, or - for standard input").option("--json", "Emit the strict verb result as JSON")
  .action(withInteractionContext({ machineReadable: () => true }, async (context, input: string, opts: DeliveryExecutionOptions) => {
    await (await import("./handlers/delivery-execution.js")).handleDeliveryExecution("native-observe", { ...opts, input }, context);
  }));
deliveryNative.command("link").description("Optionally register an already-materialized exact chain")
  .argument("<input>", "Strict JSON request path, or - for standard input").option("--json", "Emit the strict verb result as JSON")
  .action(withInteractionContext({ machineReadable: () => true }, async (context, input: string, opts: DeliveryExecutionOptions) => {
    await (await import("./handlers/delivery-execution.js")).handleDeliveryExecution("native-link", { ...opts, input }, context);
  }));
deliveryNative.command("unlink").description("Remove native presentation before sequential delivery")
  .argument("<input>", "Strict JSON request path, or - for standard input").option("--json", "Emit the strict verb result as JSON")
  .action(withInteractionContext({ machineReadable: () => true }, async (context, input: string, opts: DeliveryExecutionOptions) => {
    await (await import("./handlers/delivery-execution.js")).handleDeliveryExecution("native-unlink", { ...opts, input }, context);
  }));
deliveryNative.command("land-select").description("Select the native or unlinked landing arm from fresh facts")
  .argument("<input>", "Strict JSON request path, or - for standard input").option("--json", "Emit the strict verb result as JSON")
  .action(withInteractionContext({ machineReadable: () => true }, async (context, input: string, opts: DeliveryExecutionOptions) => {
    await (await import("./handlers/delivery-execution.js")).handleDeliveryExecution("native-land-select", { ...opts, input }, context);
  }));
deliveryNative.command("land-prepare").description("Validate and reserve one exact native landing set")
  .argument("<input>", "Strict JSON request path, or - for standard input").option("--json", "Emit the strict verb result as JSON")
  .action(withInteractionContext({ machineReadable: () => true }, async (context, input: string, opts: DeliveryExecutionOptions) => {
    await (await import("./handlers/delivery-execution.js")).handleDeliveryExecution("native-land-prepare", { ...opts, input }, context);
  }));
deliveryNative.command("land-submit").description("Submit one freshly authorized native landing effect")
  .argument("<input>", "Strict JSON request path, or - for standard input").option("--json", "Emit the strict verb result as JSON")
  .action(withInteractionContext({ machineReadable: () => true }, async (context, input: string, opts: DeliveryExecutionOptions) => {
    await (await import("./handlers/delivery-execution.js")).handleDeliveryExecution("native-land-submit", { ...opts, input }, context);
  }));
deliveryNative.command("land-status").description("Poll and reconcile one persisted native landing identity")
  .argument("<input>", "Strict JSON request path, or - for standard input").option("--json", "Emit the strict verb result as JSON")
  .action(withInteractionContext({ machineReadable: () => true }, async (context, input: string, opts: DeliveryExecutionOptions) => {
    await (await import("./handlers/delivery-execution.js")).handleDeliveryExecution("native-land-status", { ...opts, input }, context);
  }));
const deliveryRefresh = delivery.command("refresh")
  .description("Plan, execute, or adopt one provider-refreshed suffix");
deliveryRefresh.command("plan").description("Plan the exact operator-refreshed registered suffix")
  .argument("<input>", "Strict JSON request path, or - for standard input").option("--json", "Emit the strict verb result as JSON")
  .action(withInteractionContext({ machineReadable: () => true }, async (context, input: string, opts: DeliveryExecutionOptions) => {
    await (await import("./handlers/delivery-execution.js")).handleDeliveryExecution("refresh-plan", { ...opts, input }, context);
  }));
deliveryRefresh.command("execute").description("Prepare and publish one provider-native suffix refresh")
  .argument("<input>", "Strict JSON request path, or - for standard input").option("--json", "Emit the strict verb result as JSON")
  .action(withInteractionContext({ machineReadable: () => true }, async (context, input: string, opts: DeliveryExecutionOptions) => {
    await (await import("./handlers/delivery-execution.js")).handleDeliveryExecution("refresh-execute", { ...opts, input }, context);
  }));
deliveryRefresh.command("adopt").description("Observe, prove, and adopt one externally refreshed suffix")
  .argument("<input>", "Strict JSON request path, or - for standard input").option("--json", "Emit the strict verb result as JSON")
  .action(withInteractionContext({ machineReadable: () => true }, async (context, input: string, opts: DeliveryExecutionOptions) => {
    await (await import("./handlers/delivery-execution.js")).handleDeliveryExecution("refresh-adopt", { ...opts, input }, context);
  }));
const deliveryReviewFix = delivery.command("review-fix")
  .description("Route and publish one approved delivery-member review fix");
deliveryReviewFix.command("continue").description("Resume the exact delivery review-fix continuation")
  .argument("<input>", "Strict JSON request path, or - for standard input").option("--json", "Emit the strict verb result as JSON")
  .action(withInteractionContext({ machineReadable: () => true }, async (context, input: string, opts: DeliveryExecutionOptions) => {
    await (await import("./handlers/delivery-execution.js")).handleDeliveryExecution("review-fix-continue", { ...opts, input }, context);
  }));
deliveryReviewFix.command("plan").description("Select linked publication or complete rematerialization")
  .argument("<input>", "Strict JSON request path, or - for standard input").option("--json", "Emit the strict verb result as JSON")
  .action(withInteractionContext({ machineReadable: () => true }, async (context, input: string, opts: DeliveryExecutionOptions) => {
    await (await import("./handlers/delivery-execution.js")).handleDeliveryExecution("review-fix-plan", { ...opts, input }, context);
  }));
deliveryReviewFix.command("publish").description("Publish one selected member before provider-native suffix refresh")
  .argument("<input>", "Strict JSON request path, or - for standard input").option("--json", "Emit the strict verb result as JSON")
  .action(withInteractionContext({ machineReadable: () => true }, async (context, input: string, opts: DeliveryExecutionOptions) => {
    await (await import("./handlers/delivery-execution.js")).handleDeliveryExecution("review-fix-publish", { ...opts, input }, context);
  }));
deliveryReviewFix.command("acknowledge").description("Consume one completed review-fix verification continuation")
  .argument("<input>", "Strict JSON request path, or - for standard input").option("--json", "Emit the strict verb result as JSON")
  .action(withInteractionContext({ machineReadable: () => true }, async (context, input: string, opts: DeliveryExecutionOptions) => {
    await (await import("./handlers/delivery-execution.js")).handleDeliveryExecution("review-fix-acknowledge", { ...opts, input }, context);
  }));
delivery.command("position").description("Derive the exact current delivery position")
  .argument("<input>", "Strict JSON request path, or - for standard input").option("--json", "Emit the strict verb result as JSON")
  .action(withInteractionContext({ machineReadable: () => true }, async (context, input: string, opts: DeliveryExecutionOptions) => {
    await (await import("./handlers/delivery-execution.js")).handleDeliveryExecution("position", { ...opts, input }, context);
  }));
const deliveryLand = delivery.command("land").description("Prepare and apply one attended member landing");
deliveryLand.command("prepare").description("Prepare one exact landing presentation")
  .argument("<input>", "Strict JSON request path, or - for standard input").option("--json", "Emit the strict verb result as JSON")
  .action(withInteractionContext({ machineReadable: () => true }, async (context, input: string, opts: DeliveryExecutionOptions) => {
    await (await import("./handlers/delivery-execution.js")).handleDeliveryExecution("land-prepare", { ...opts, input }, context);
  }));
deliveryLand.command("apply").description("Apply one freshly authorized landing")
  .argument("<input>", "Strict JSON request path, or - for standard input").option("--json", "Emit the strict verb result as JSON")
  .action(withInteractionContext({ machineReadable: () => true }, async (context, input: string, opts: DeliveryExecutionOptions) => {
    await (await import("./handlers/delivery-execution.js")).handleDeliveryExecution("land-apply", { ...opts, input }, context);
  }));
delivery.command("reconcile").description("Reconcile one persisted delivery operation")
  .argument("<input>", "Strict JSON request path, or - for standard input").option("--json", "Emit the strict verb result as JSON")
  .action(withInteractionContext({ machineReadable: () => true }, async (context, input: string, opts: DeliveryExecutionOptions) => {
    await (await import("./handlers/delivery-execution.js")).handleDeliveryExecution("reconcile", { ...opts, input }, context);
  }));
delivery.command("rewrite").description("Rewrite one reviewed suffix member by exact lease")
  .argument("<input>", "Strict JSON request path, or - for standard input").option("--json", "Emit the strict verb result as JSON")
  .action(withInteractionContext({ machineReadable: () => true }, async (context, input: string, opts: DeliveryExecutionOptions) => {
    await (await import("./handlers/delivery-execution.js")).handleDeliveryExecution("rewrite", { ...opts, input }, context);
  }));
delivery.command("rematerialize").description("Reclose and rewrite one complete reviewed suffix")
  .argument("<input>", "Strict JSON request path, or - for standard input").option("--json", "Emit the strict verb result as JSON")
  .action(withInteractionContext({ machineReadable: () => true }, async (context, input: string, opts: DeliveryExecutionOptions) => {
    await (await import("./handlers/delivery-execution.js")).handleDeliveryExecution("rematerialize", { ...opts, input }, context);
  }));
delivery.command("teardown").description("Retire one proven-landed member ref while retaining its binding")
  .argument("<input>", "Strict JSON request path, or - for standard input").option("--json", "Emit the strict verb result as JSON")
  .action(withInteractionContext({ machineReadable: () => true }, async (context, input: string, opts: DeliveryExecutionOptions) => {
    await (await import("./handlers/delivery-execution.js")).handleDeliveryExecution("teardown", { ...opts, input }, context);
  }));
delivery.command("top-remedy").description("Apply one explicitly selected terminal request remedy")
  .argument("<input>", "Strict JSON request path, or - for standard input").option("--json", "Emit the strict verb result as JSON")
  .action(withInteractionContext({ machineReadable: () => true }, async (context, input: string, opts: DeliveryExecutionOptions) => {
    await (await import("./handlers/delivery-execution.js")).handleDeliveryExecution("top-remedy", { ...opts, input }, context);
  }));

delivery
  .command("compose")
  .description("Validate the outstanding authoring map and publish its delivery plan")
  .option("--landed-prefix <json>", "Fresh plan-ordered landed deliverable ID JSON array")
  .option("--json", "Emit the typed composition result as JSON")
  .action(withInteractionContext(
    { machineReadable: (opts) => opts.json === true },
    async (context, opts: DeliveryComposeOptions) => {
      await (await import("./handlers/delivery.js")).handleDeliveryCompose(opts, context);
    },
  ));

const deliveryPlan = delivery
  .command("plan")
  .description("Create or abandon transient delivery-plan authoring state");

const deliveryPlanInventory = deliveryPlan
  .command("inventory")
  .description("Inspect delivery-plan design-inventory authoring contracts");

deliveryPlanInventory
  .command("schema")
  .description("Emit the registered strict design-inventory input schema")
  .option("--json", "Emit the schema through the typed delivery command envelope")
  .action(withInteractionContext(
    { machineReadable: (opts) => opts.json === true },
    async (_context, opts: DeliveryPlanInventorySchemaOptions) => {
      (await import("./handlers/delivery.js")).handleDeliveryPlanInventorySchema(opts);
    },
  ));

deliveryPlan
  .command("from-tasks")
  .description("Create a delivery authoring map from the active task list")
  .option("--design-inventory <json-path>", "Strict design inventory JSON path")
  .option("--task-list <path>", "Explicit repository-relative task-list path")
  .option("--json", "Emit the typed authoring result as JSON")
  .action(withInteractionContext(
    { machineReadable: (opts) => opts.json === true },
    async (context, opts: DeliveryPlanFromTasksOptions) => {
      await (await import("./handlers/delivery.js")).handleDeliveryPlanFromTasks(opts, context);
    },
  ));

deliveryPlan
  .command("from-branch")
  .description("Create a delivery authoring map from a branch contribution")
  .option("--design-inventory <json-path>", "Strict design inventory JSON path")
  .option("--base <commit-ish>", "Selected base line (defaults to the configured base)")
  .option("--head <commit-ish>", "Branch head (defaults to HEAD)")
  .option("--json", "Emit the typed authoring result as JSON")
  .action(withInteractionContext(
    { machineReadable: (opts) => opts.json === true },
    async (context, opts: DeliveryPlanFromBranchOptions) => {
      await (await import("./handlers/delivery.js")).handleDeliveryPlanFromBranch(opts, context);
    },
  ));

deliveryPlan
  .command("abandon")
  .description("Delete the outstanding authoring map idempotently")
  .option("--json", "Emit the typed abandonment result as JSON")
  .action(withInteractionContext(
    { machineReadable: (opts) => opts.json === true },
    async (context, opts: DeliveryPlanAbandonOptions) => {
      await (await import("./handlers/delivery.js")).handleDeliveryPlanAbandon(opts, context);
    },
  ));

const deliveryTransfer = delivery
  .command("transfer")
  .description("Transfer exact delivery plan and state records between clones");

deliveryTransfer
  .command("export")
  .description("Export the active work unit's exact delivery plan and state")
  .option("--output <path>", "Write the transfer bundle to a new file")
  .option("--json", "Emit the typed export result as JSON")
  .action(withInteractionContext(
    { machineReadable: (opts) => opts.json === true },
    async (context, opts: DeliveryTransferExportOptions) => {
      await (await import("./handlers/delivery-transfer.js")).handleDeliveryTransferExport(opts, context);
    },
  ));

deliveryTransfer
  .command("import")
  .description("Import an exact delivery plan and state for the active work unit")
  .option("--input <path>", "Read the transfer bundle from a file")
  .option("--json", "Emit the typed import result as JSON")
  .action(withInteractionContext(
    { machineReadable: (opts) => opts.json === true },
    async (context, opts: DeliveryTransferImportOptions) => {
      await (await import("./handlers/delivery-transfer.js")).handleDeliveryTransferImport(opts, context);
    },
  ));

// --- Lifecycle ---

program
  .command("update")
  .description("Update ARC framework files to the latest version")
  .option("-q, --quiet", "Suppress changelog output")
  .action(withInteractionContext(
    {},
    async (context, opts: { quiet?: boolean }) => {
      await (await import("./handlers/installation.js")).handleUpdate(opts, context);
    },
  ));

program
  .command("health")
  .description("Show health of installed ARC framework files")
  .action(async () => {
    await (await import("./handlers/installation.js")).handleHealth();
  });

program
  .command("diff")
  .description("Show differences between installed and latest framework files")
  .action(async () => {
    await (await import("./handlers/installation.js")).handleDiff();
  });

// --- User ---

const userCmd = program
  .command("user")
  .description(
    "Manage ARC user directory and portability — see also `arc sync` for the cross-concern orchestrator",
  );

userCmd
  .command("add <identity>")
  .description("Create a user directory for a team member")
  .action(withInteractionContext(
    {},
    async (context, identity: string) => {
      await (await import("./handlers/user.js")).handleUserAdd(identity, context);
    },
  ));

userCmd
  .command("open <wu-name>")
  .description("Open per-WU user workspace subdir (seeds SESSION-NOTES.md from template)")
  .action(withInteractionContext(
    {},
    async (context, wuName: string) => {
      await (await import("./handlers/user.js")).handleUserOpen(wuName, context);
    },
  ));

userCmd
  .command("close <wu-name>")
  .description("Close per-WU user workspace subdir (removes user/{identity}/<wu-name>/ recursively)")
  .action(async (wuName: string) => {
    await (await import("./handlers/user.js")).handleUserClose(wuName);
  });

userCmd
  .command("inbox-mark-execute-bound")
  .description("Atomically mark and order the complete execute-bound USER-INBOX queue as JSON")
  .usage("<file | ->")
  .argument("<input>", "Versioned JSON request file, or - for stdin")
  .addHelpText("after", '\nRequest JSON:\n  {"schemaVersion":1,"orderedTitles":["First","Second"]}\n')
  .action(withInteractionContext(
    { machineReadable: () => true },
    async (context, input: string) => {
      await (await import("./handlers/user.js")).handleUserInboxMarkExecuteBound(input, context);
    },
  ));

userCmd
  .command("inbox-remove [slug]")
  .description("Drop the title-matched USER-INBOX entry (idempotent — no-op when absent)")
  .option("--inbox-title-file <path>", "Read the capture's inner bold title from a UTF-8 file, or - for stdin")
  .option("--inbox-entry-file <path>", "Compatibility alias of --inbox-title-file")
  .action(withInteractionContext(
    {},
    async (context, slug: string | undefined, opts: UserInboxRemoveOptions) => {
      await (await import("./handlers/user.js")).handleUserInboxRemove(slug, opts, context);
    },
  ));

userCmd
  .command("save")
  .description("Save user directory to user notes on HEAD")
  .action(async () => {
    await (await import("./handlers/user.js")).handleUserSave();
  });

userCmd
  .command("load")
  .description("Restore user directory from user notes")
  .option("-y, --yes", "Skip overwrite confirmation prompts")
  .action(withInteractionContext(
    { yes: "compatibility" },
    async (context, opts: UserLoadOptions) => {
      await (await import("./handlers/user.js")).handleUserLoad(opts, context);
    },
  ));

userCmd
  .command("push")
  .description("Push user notes to remote")
  .option("--force", "Force-push even when remote and local notes conflict")
  .action(withInteractionContext(
    {},
    async (context, opts: UserPushOptions) => {
      await (await import("./handlers/user.js")).handleUserPush(opts, context);
    },
  ));

userCmd
  .command("fetch")
  .description("Fetch user notes from remote")
  .option("--identity <name>", "Pull another developer's notes instead of your own")
  .action(withInteractionContext(
    {},
    async (context, opts: UserFetchOptions) => {
      await (await import("./handlers/user.js")).handleUserFetch(opts, context);
    },
  ));

userCmd
  .command("pull")
  .description("Fetch user notes from remote and restore them to disk")
  .option("--identity <name>", "Pull another developer's notes instead of your own")
  .option("-y, --yes", "Skip overwrite confirmation prompts")
  .action(withInteractionContext(
    { yes: "authority" },
    async (context, opts: UserPullOptions) => {
      await (await import("./handlers/user.js")).handleUserPull(opts, context);
    },
  ));

userCmd
  .command("compact")
  .description("Compact user notes history to a retained snapshot baseline")
  .option("--json", "Emit the typed result as JSON")
  .action(withInteractionContext(
    { machineReadable: (opts) => opts.json === true },
    async (context, opts: UserCompactHandlerOptions) => {
      await (await import("./handlers/user.js")).handleUserCompact(opts, context);
    },
  ));

userCmd
  .command("status")
  .description("Inspect local, remote, and on-disk user sync state (includes worktree-drift qualifier)")
  .option("--offline", "Skip remote and worktree probes; inspect only local snapshot vs disk")
  .option("--all", "List all remote user-note identities when a remote is available")
  .option("--session-init", "Render a non-destructive remote probe summary for session-init")
  .option("--verbose", "Render the full ref/disk/working-files three-tier detail block (default: collapsed)")
  .option("--json", "Emit the typed result as JSON")
  .action(withInteractionContext(
    { machineReadable: (opts) => opts.json === true || opts.sessionInit === true },
    async (context, opts: UserStatusOptions) => {
      await (await import("./handlers/user.js")).handleUserStatus(opts, context);
    },
  ));

userCmd
  .command("reconcile-references")
  .description("Inspect or apply protection-aware managed user-reference repairs")
  .option("--apply", "Apply exact managed USER-INBOX repairs under the notes lock")
  .option("--json", "Emit the typed result as JSON")
  .action(withInteractionContext(
    { machineReadable: (opts) => opts.json === true },
    async (context, opts: UserReconcileReferencesOptions) => {
      await (await import("./handlers/user.js")).handleUserReconcileReferences(opts, context);
    },
  ));

userCmd
  .command("sync")
  .description("Direction-aware notes-only sync — push, pull, or prompt on conflict")
  .option("-y, --yes", "Skip overwrite confirmation prompts")
  .action(withInteractionContext(
    { yes: "authority" },
    async (context, opts: UserSyncOptions) => {
      await (await import("./handlers/user-sync.js")).handleUserSync(opts, context);
    },
  ));

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
  .action(withInteractionContext(
    { machineReadable: (opts) => opts.json === true || opts.sessionInit === true },
    async (_context, opts: ExtensionsStatusCliOptions) => {
      await (await import("./handlers/extensions.js")).handleExtensionsStatus(opts);
    },
  ));

// --- Config ---

const configCmd = program
  .command("config")
  .description("Inspect ARC configuration state");

configCmd
  .command("status")
  .description("Show arc-config.yml settings (agent-consumable; hooks.* excluded)")
  .option("--session-init", "Emit the init-gating subset consumed by session-init")
  .option("--json", "Emit the typed result as JSON")
  .action(withInteractionContext(
    { machineReadable: (opts) => opts.json === true || opts.sessionInit === true },
    async (_context, opts: ConfigStatusCliOptions) => {
      await (await import("./handlers/config.js")).handleConfigStatus(opts);
    },
  ));

configCmd
  .command("validate")
  .description("Validate arc-config.yml settings")
  .option("--file <path>", "Validate an explicitly selected configuration file")
  .action(async (opts: ConfigValidateCliOptions) => {
    await (await import("./handlers/config.js")).handleConfigValidate(opts);
  });

// --- Active ---

const activeCmd = program
  .command("active")
  .description("Inspect ARC active work state");

activeCmd
  .command("status")
  .description("Enumerate in-flight work units and their status-file fields")
  .option("--session-init", "Emit resolved path / null / candidate list for session-init")
  .option("--json", "Emit the typed result as JSON")
  .action(withInteractionContext(
    { machineReadable: (opts) => opts.json === true || opts.sessionInit === true },
    async (context, opts: ActiveStatusCliOptions) => {
      await (await import("./handlers/active.js")).handleActiveStatus(opts, context);
    },
  ));

activeCmd
  .command("roster")
  .description("Emit the cross-worktree in-flight work-unit roster (concurrency-advisory data input)")
  .option("--json", "Emit the typed result as JSON")
  .action(withInteractionContext(
    { machineReadable: (opts) => opts.json === true },
    async (context, opts: ActiveRosterCliOptions) => {
      await (await import("./handlers/active.js")).handleActiveRoster(opts, context);
    },
  ));

activeCmd
  .command("in-flight")
  .description("Emit the oracle-backed in-flight set — your work units and errands across worktrees and machines")
  .option("--local", "Skip the network read; derive from local refs (alias: --no-fetch)")
  .option("--no-fetch", "Skip the network read; derive from local refs")
  .option("--json", "Emit the typed result as JSON")
  .action(withInteractionContext(
    { machineReadable: (opts) => opts.json === true },
    async (context, opts: ActiveInFlightCliOptions) => {
      await (await import("./handlers/active.js")).handleActiveInFlight(opts, context);
    },
  ));

// --- View ---

program
  .command("view")
  .description("Render an artifact from the current ARC work context")
  .argument(
    "[kind]",
    "Artifact kind: tasks | spec | draft | meta | notes | cohort | session-notes | working-memory | inbox",
  )
  .option("--project", "With inbox: render the shared project inbox")
  .option("--current", "With tasks: render only the current task region")
  .option("--for <slug>", "Override ambient context with the named work-unit slug")
  .action(withInteractionContext(
    {},
    async (context, kind: string | undefined, opts: ViewCliOptions) => {
      await (await import("./handlers/view.js")).handleView(kind, opts, context);
    },
  ));

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
    ).conflicts(["session-init", "session-handoff", "recover", "project"]),
  )
  .addOption(
    new Option(
      "--project",
      "Render the live project status view",
    ).conflicts(["session-init", "session-handoff", "recover", "user"]),
  )
  .option("--fetch", "With status <slug>: upgrade the local-default query with live remote membership")
  .option("--local", "With --user/--project: skip the live-default network read (slug queries are local by default)")
  .option("--no-fetch", "With --user/--project: skip the live-default network read (slug queries are local by default)")
  .option("--staged", "With --project: render tree inputs from the git index (matches the pre-commit ROADMAP regen check)")
  .option("--write", "With --project --staged: write the rendered view to the tracked ROADMAP atomically")
  .addOption(
    new Option(
      "--write-compaction-seed",
      "With --session-init: write the machine-local compaction recovery seed",
    ).conflicts(["recover", "session-handoff", "user", "project"]),
  )
  .option("--json", "Emit the typed result as JSON")
  .action(withInteractionContext(
    {
      machineReadable: (opts) => opts.json === true
        || opts.sessionInit === true
        || opts.sessionHandoff === true
        || opts.recover === true,
    },
    async (context, slug: string | undefined, opts: StatusCliOptions) => {
      await (await import("./handlers/status.js")).handleStatus(slug, opts, context);
    },
  ));

// --- Locus ---

program
  .command("locus")
  .description("Inspect the local checkout and session locus roster")
  .option("--json", "Emit one typed session locus envelope as JSON")
  .action(async (opts: LocusCliOptions) => {
    await (await import("./handlers/locus.js")).handleLocus(opts);
  });

// --- Recover ---

const recoverCmd = program
  .command("recover")
  .description("Recovery support commands for harness compaction");

recoverCmd
  .command("audit")
  .description("Audit the latest compaction seed against fresh recovery state")
  .option("--seed-path <path>", "Use an exact adapter-supplied compaction seed path")
  .option("--json", "Emit the typed result as JSON")
  .action(withInteractionContext(
    { machineReadable: (opts) => opts.json === true },
    async (context, opts: RecoverAuditOptions) => {
      await (await import("./handlers/recover.js")).handleRecoverAudit(opts, context);
    },
  ));

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
  .action(withInteractionContext(
    { yes: "authority", machineReadable: (opts) => opts.json === true },
    async (context, opts: SyncOptions) => {
      await (await import("./handlers/sync.js")).handleSync(opts, undefined, context);
    },
  ));

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
  .action(withInteractionContext(
    {},
    async (context, args: string[]) => {
      await (await import("./commands/release.js")).handleReleaseCommit({ args }, context);
    },
  ));

releaseCmd
  .command("push")
  .description(
    "Wrapper around `git push` — applies the release-mode push validation cascade",
  )
  .allowUnknownOption(true)
  .argument("[args...]", "Arguments forwarded to `git push`")
  .action(withInteractionContext(
    {},
    async (context, args: string[]) => {
      await (await import("./commands/release.js")).handleReleasePush({ args }, context);
    },
  ));

releaseCmd
  .command("opt-in")
  .description(
    "Record per-developer opt-in for release-mode wrappers (writes local git config `arc.releaseOptedIn = true`)",
  )
  .action(async () => {
    await (await import("./commands/release.js")).handleReleaseOptIn();
  });

releaseCmd
  .command("opt-out")
  .description(
    "Record per-developer opt-out for release-mode wrappers (writes local git config `arc.releaseOptedIn = false`)",
  )
  .action(async () => {
    await (await import("./commands/release.js")).handleReleaseOptOut();
  });

releaseCmd
  .command("status")
  .description("Show resolved release-mode opt-in and interlock state")
  .option("--json", "Emit a schemaVersion 2 JSON envelope")
  .action(withInteractionContext(
    { machineReadable: (opts) => opts.json === true },
    async (context, opts: { json?: boolean }) => {
      await (await import("./commands/release.js")).handleReleaseStatus({ json: opts.json }, context);
    },
  ));

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
  .addOption(
    new Option("--idempotency-action <action>", "Existing-install action")
      .choices(["exit", "re-verify", "update-markers", "add-harness"]),
  )
  .option("-y, --yes", "Acknowledge the release-wrapper trust shift")
  .option("--workflow-verified", "Attest that the harness setup workflow was verified")
  .option("--json", "Emit a schemaVersion 1 JSON envelope")
  .action(withInteractionContext(
    { yes: "authority", machineReadable: (opts) => opts.json === true },
    async (context, opts: ReleaseSetupInstallOptions) => {
      await (await import("./commands/release.js")).handleReleaseSetupInstall(opts, context);
    },
  ));

setupCmd
  .command("print-patterns")
  .description("Print release-wrapper allowlist patterns for a harness")
  .option("--harness <name>", "Harness name: claude-code, codex, or agent-adaptive")
  .addOption(
    new Option("--format <format>", "Output format")
      .choices(["harness", "raw"])
      .default("harness"),
  )
  .action(async (opts: ReleaseSetupPrintPatternsOptions) => {
    (await import("./commands/release.js")).handleReleaseSetupPrintPatterns(opts);
  });

setupCmd
  .command("uninstall")
  .description("Remove release-wrapper harness integration")
  .option("--harness <name>", "Harness name for single-harness uninstall flow")
  .option("--cleanup-verified", "Attest that canonical harness entries were removed")
  .option("--json", "Emit a schemaVersion 1 JSON envelope")
  .action(withInteractionContext(
    { machineReadable: (opts) => opts.json === true },
    async (context, opts: ReleaseSetupUninstallOptions) => {
      await (await import("./commands/release.js")).handleReleaseSetupUninstall(opts, context);
    },
  ));

setupCmd
  .command("verify")
  .description("Report recorded release-wrapper setup posture")
  .option("--harness <name>", "Filter verification report to a harness")
  .action(withInteractionContext(
    {},
    async (context, opts: ReleaseSetupVerifyOptions) => {
      await (await import("./commands/release.js")).handleReleaseSetupVerify(opts, context);
    },
  ));

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
    "Filter by standalone category (maintenance|planning|documentation|refactor|code review)",
  )
  .action(async (opts: LogStandaloneOptions) => {
    await (await import("./handlers/log.js")).handleLogStandalone(opts);
  });

// --- Merge ---

const mergeCmd = program
  .command("merge")
  .description("Merge-control operations");

const mergeLockCmd = mergeCmd
  .command("lock")
  .description("Resolve and transition the host merge lock");

const mergeLockResolveHelp = JSON.stringify({
  schemaVersion: 1,
  treeRoot: "/absolute/checkout",
});
const mergeLockTransitionHelp = JSON.stringify({
  schemaVersion: 1,
  treeRoot: "/absolute/checkout",
  target: { repository: "owner/repo", pullRequest: 123, headSha: "0".repeat(40) },
  vehicle: { kind: "errand", slug: "example" },
});

mergeLockCmd
  .command("resolve")
  .description("Resolve how a pull request should open as JSON")
  .usage("<file | ->")
  .argument("<input>", "Versioned JSON request file, or - for stdin")
  .addHelpText("after", `\nRequest JSON:\n  ${mergeLockResolveHelp}\n`)
  .action(async (input: string) => {
    await (await import("./handlers/review.js")).handleMergeLockResolve(input);
  });

mergeLockCmd
  .command("hold")
  .description("Lock one exact-head pull request as JSON")
  .usage("<file | ->")
  .argument("<input>", "Versioned JSON request file, or - for stdin")
  .addHelpText("after", `\nErrand request JSON:\n  ${mergeLockTransitionHelp}\n`)
  .action(async (input: string) => {
    await (await import("./handlers/review.js")).handleMergeLockHold(input);
  });

mergeLockCmd
  .command("release")
  .description("Unlock one exact-head pull request as JSON")
  .usage("<file | ->")
  .argument("<input>", "Versioned JSON request file, or - for stdin")
  .addHelpText("after", `\nErrand request JSON:\n  ${mergeLockTransitionHelp}\n`)
  .action(async (input: string) => {
    await (await import("./handlers/review.js")).handleMergeLockRelease(input);
  });

// --- Review ---

const reviewCmd = program
  .command("review")
  .description("Resolve and execute review workflows");

reviewCmd
  .command("change-request")
  .description("Exact-head change-request operations")
  .command("resolve")
  .description("Resolve the host disposition for one exact head")
  .requiredOption("--head-ref <branch>", "Proposed branch name")
  .requiredOption("--head-sha <oid>", "Exact Git object ID for the proposed head")
  .option("--require-remote", "Require the remote branch to match the exact head")
  .requiredOption("--json", "Emit a typed JSON result")
  .action(withInteractionContext(
    { machineReadable: (opts) => opts.json === true },
    async (context, options: ReviewChangeRequestResolveOptions) => {
      await (await import("./handlers/review.js")).handleReviewChangeRequestResolve(options, context);
    },
  ));

reviewCmd
  .command("status")
  .description("Resolve exact-target review, check, and base status")
  .option("--target <target-ref>", "JSON targetRef emitted by review change-request resolve")
  .option("--work-unit <slug>", "Resolve the live stacked-delivery review continuation")
  .option("--ceiling-override <override>", "Exact JSON consequence approving one additional review pass")
  .option("--coverage <coverage>", "Requested hosted coverage (complete or incremental)")
  .option("--source <source-id>", "Explicit standard-review source for this work-unit status invocation")
  .requiredOption("--json", "Emit a typed JSON result")
  .action(withInteractionContext(
    { machineReadable: (opts) => opts.json === true },
    async (context, options: ReviewStatusOptions) => {
      await (await import("./handlers/review.js")).handleReviewStatus(options, context);
    },
  ));

reviewCmd
  .command("terminus")
  .description("Explicit review-terminus operations")
  .command("accept")
  .description("Accept one exact delivery-member Owner terminus as JSON")
  .usage("<file | ->")
  .argument("<input>", "Versioned JSON request file, or - for stdin")
  .addHelpText(
    "after",
    '\nContinuation:\n  Submit the returned terminusAction with one added field:\n  '
      + '{"judgment":{"mode":"owner-accepted"}}\n',
  )
  .action(withInteractionContext(
    { machineReadable: true },
    async (context, input: string) => {
      await (await import("./handlers/review.js")).handleReviewTerminusAccept(input, context);
    },
  ));

reviewCmd
  .command("merge-method")
  .description("Configured merge-method operations")
  .command("resolve")
  .description("Validate the configured method against live repository policy")
  .option(
    "--stack-position <position>",
    "Merge-method stack position (non-delivery, intermediate, or top)",
    "non-delivery",
  )
  .requiredOption("--json", "Emit a typed JSON result")
  .action(async (options: ReviewMergeMethodResolveOptions) => {
    await (await import("./handlers/review.js")).handleReviewMergeMethodResolve(options);
  });

reviewCmd
  .command("checks")
  .description("Required status-check operations")
  .command("await")
  .description("Await required checks on one exact pull-request head")
  .requiredOption("--repository <owner/repo>", "Exact repository coordinates")
  .requiredOption("--pull-request <number>", "Pull-request number")
  .requiredOption("--head-sha <oid>", "Exact 40-hex pull-request head")
  .option("--timeout-ms <milliseconds>", "Bounded wait duration", "300000")
  .option("--poll-interval-ms <milliseconds>", "Initial polling interval", "5000")
  .requiredOption("--json", "Emit a typed JSON result")
  .action(async (options: ReviewChecksAwaitOptions) => {
    await (await import("./handlers/review.js")).handleReviewChecksAwait(options);
  });

reviewCmd
  .command("readiness")
  .description("Validate exact-head lifecycle readiness as JSON")
  .usage("<file | ->")
  .argument("<input>", "Versioned JSON request file, or - for stdin")
  .action(async (input: string) => {
    await (await import("./handlers/review.js")).handleReviewReadiness(input);
  });

reviewCmd
  .command("planning-lane <base> <head>")
  .description("Classify an exact Git change for planning clearance")
  .option("--repository <path>", "Repository containing both exact commits")
  .action(async (base: string, head: string, opts: ReviewPlanningLaneOptions) => {
    await (await import("./handlers/review.js")).handleReviewPlanningLane(base, head, opts);
  });

const planningGroomingResolveHelp = JSON.stringify({
  schemaVersion: 1,
  target: {
    baseRef: "main",
    diffBaseSha: "0".repeat(40),
    headSha: "1".repeat(40),
  },
  routingFacts: {
    contentKind: "documentation",
    reviewRisk: "routine",
    changeDeterminacy: "atomic",
    ownership: "self",
    surfaceAuthority: "planning-grooming",
  },
});

reviewCmd
  .command("planning-grooming")
  .description("Transient planning-grooming review applicability")
  .command("resolve")
  .description("Resolve exact planning-grooming review exemption as JSON")
  .usage("[file | -] [--schema]")
  .argument("[input]", "Versioned JSON request file, or - for stdin")
  .option("--schema", "Print the registered public request schema bundle")
  .addHelpText("after", `\nRequest JSON:\n  ${planningGroomingResolveHelp}\n`)
  .action(withInteractionContext(
    { machineReadable: true },
    async (context, input: string | undefined, opts: { schema?: boolean }) => {
      if (opts.schema === true) {
        (await import("./handlers/review.js")).handleReviewRequestSchema(
          "review-planning-grooming-resolve-request",
          input,
        );
        return;
      }
      await (await import("./handlers/review.js")).handleReviewPlanningGroomingResolve(input ?? "", {}, context);
    },
  ));

reviewCmd
  .command("resolve")
  .description("Resolve the next configured review-policy action as JSON")
  .usage("<file | ->")
  .argument("<input>", "Versioned JSON request file, or - for stdin")
  .action(async (input: string) => {
    await (await import("./handlers/review.js")).handleReviewResolve(input);
  });

const frontlineCmd = reviewCmd
  .command("frontline")
  .description("Frontline pre-publication review operations");

frontlineCmd
  .command("resolve")
  .description("Resolve explicit change-set facts and one-run intent as JSON")
  .usage("<file | ->")
  .argument("<input>", "Versioned JSON request file, or - for stdin")
  .action(async (input: string) => {
    await (await import("./handlers/review.js")).handleReviewFrontlineResolve(input);
  });

frontlineCmd
  .command("run")
  .description("Execute one exact-target frontline review as JSON")
  .usage("[file | -] [--schema]")
  .argument("[input]", "Versioned JSON request file, or - for stdin")
  .option("--schema", "Print the registered public request schema bundle")
  .action(withInteractionContext(
    { machineReadable: true },
    async (context, input: string | undefined, opts: { schema?: boolean }) => {
      if (opts.schema === true) {
        (await import("./handlers/review.js")).handleReviewRequestSchema("review-frontline-run-request", input);
        return;
      }
      await (await import("./handlers/review.js")).handleReviewFrontlineRun(input ?? "", {}, context);
    },
  ));

const hostedCmd = reviewCmd
  .command("hosted")
  .description("Hosted pull-request review operations");

hostedCmd
  .command("request")
  .description("Request one hosted pull-request review as JSON")
  .usage("<file | ->")
  .argument("<input>", "Versioned JSON request file, or - for stdin")
  .addHelpText(
    "after",
    "\nContinuation:\n  Submit the emitted action unchanged to `arc review hosted await -`.\n",
  )
  .action(async (input: string) => {
    await (await import("./handlers/review.js")).handleReviewHostedRequest(input);
  });

hostedCmd
  .command("await")
  .description("Await one requested hosted pull-request review as JSON")
  .usage("<file | ->")
  .argument("<input>", "Versioned JSON request file, or - for stdin")
  .addHelpText(
    "after",
    "\nPending continuation:\n  Submit the emitted action unchanged to this command.\n",
  )
  .action(async (input: string) => {
    await (await import("./handlers/review.js")).handleReviewHostedAwait(input);
  });

hostedCmd
  .command("settle")
  .description("Reply to and resolve one hosted review finding as JSON")
  .usage("<file | ->")
  .argument("<input>", "Versioned JSON request file, or - for stdin")
  .action(async (input: string) => {
    await (await import("./handlers/review.js")).handleReviewHostedSettle(input);
  });

reviewCmd
  .command("chunking")
  .description("Exact-target review chunking operations")
  .command("resolve")
  .description("Resolve one immutable target's chunking recommendation as JSON")
  .usage("[file | -] [--schema]")
  .argument("[input]", "Versioned JSON request file, or - for stdin")
  .option("--schema", "Print the registered public request schema bundle")
  .action(async (input: string | undefined, opts: { schema?: boolean }) => {
    if (opts.schema === true) {
      (await import("./handlers/review.js")).handleReviewRequestSchema("review-chunking-resolve-request", input);
      return;
    }
    await (await import("./handlers/review.js")).handleReviewChunkingResolve(input ?? "");
  });

const localReviewCmd = reviewCmd
  .command("local")
  .description("Local immutable-source review operations");

localReviewCmd
  .command("prepare")
  .description("Derive and prepare one immutable local review as JSON")
  .usage("<file | ->")
  .argument("<input>", "Versioned JSON request file, or - for stdin")
  .action(async (input: string) => {
    await (await import("./handlers/review.js")).handleReviewLocalPrepare(input);
  });

localReviewCmd
  .command("attest")
  .description("Attest one normalized local review result as JSON")
  .usage("<file | ->")
  .argument("<input>", "Versioned JSON request file, or - for stdin")
  .action(async (input: string) => {
    await (await import("./handlers/review.js")).handleReviewLocalAttest(input);
  });

localReviewCmd
  .command("resume")
  .description("Resume one durable local review as JSON")
  .usage("<file | ->")
  .argument("<input>", "Versioned JSON request file, or - for stdin")
  .action(async (input: string) => {
    await (await import("./handlers/review.js")).handleReviewLocalResume(input);
  });

reviewCmd
  .command("respond")
  .description("Prepare or persist one source-bound review disposition set as JSON")
  .usage("<file | ->")
  .argument("<input>", "Versioned JSON request file, or - for stdin")
  .action(async (input: string) => {
    await (await import("./handlers/review.js")).handleReviewRespond(input);
  });

reviewCmd
  .command("reduce")
  .description("Reduce one durable review operation as JSON")
  .usage("<file | ->")
  .argument("<input>", "Versioned JSON request file, or - for stdin")
  .action(async (input: string) => {
    await (await import("./handlers/review.js")).handleReviewReduce(input);
  });

reviewCmd
  .command("pre-publication <name>")
  .description("Resolve one work unit's typed pre-publication review procedure as JSON")
  .option("--self-review <state>", "Report completed author self-review: settled")
  .option("--change-set <file | ->", "Change-set routing facts as JSON; omitted routes as unestablished")
  .option(
    "--lanes <file | ->",
    "Per-lane review scope, frontline invocation, and approved ceiling override as JSON",
  )
  .option("--resume <token>", "Replay the exact prior pre-publication judgment inputs")
  .requiredOption("--json", "Emit a typed JSON result")
  .action(withInteractionContext(
    { machineReadable: () => true },
    async (context, name: string, options: ReviewPrePublicationOptions) => {
      await (await import("./handlers/review.js")).handleReviewPrePublication(name, options, {}, context);
    },
  ));

// --- Dev-mode stale-build guard (self-hosting only) ---

let devBuildRefreshEligible = false;

program.hook("preAction", (_thisCommand, actionCommand) => {
  const verdict = checkDevBuildStaleness(
    createDevCheckDeps(fileURLToPath(import.meta.url)),
  );
  if (verdict.kind === "skip") return;
  if (verdict.kind === "fresh") {
    devBuildRefreshEligible = isDevBuildRefreshCommandPath(formatCommandPath(actionCommand));
    return;
  }

  const distAgeText = verdict.distAge === null
    ? "dist/cli.js missing"
    : `dist/cli.js built ${formatAge(verdict.distAge)} ago`;
  const staleCause = verdict.basis === "content-hash"
    ? "source content differs from the build stamp"
    : `${verdict.newestSrc} changed ${formatAge(verdict.srcAge)} ago`;
  const baseMsg = `arc dev build is stale (${staleCause}; ${distAgeText}).`;

  // Sole exception: the compaction-seed write. A seed produced by stale logic
  // is revalidated when recovery reads it, so it beats no seed. The option is
  // declared on `status` alone, so this needs no command-name test.
  const opts: Record<string, unknown> = actionCommand.opts();
  if (opts.writeCompactionSeed === true) {
    process.stderr.write(
      `warn: ${baseMsg} Run \`npm run build:fast\` before relying on output.\n`,
    );
    return;
  }

  const cmdPath = formatCommandPath(actionCommand);
  process.stderr.write(
    `error: ${baseMsg} Refusing \`${cmdPath}\` against stale dist; `
    + "run `npm run build:fast`, then retry.\n",
  );
  process.exit(1);
});

program.hook("postAction", async () => {
  if (!devBuildRefreshEligible) return;
  const result = await refreshDevBuildAfterAction(fileURLToPath(import.meta.url));
  if (result.kind === "not-required") return;
  if (result.kind === "refreshed") {
    process.stderr.write("info: refreshed the arc dev build after bundled source changed.\n");
    return;
  }
  process.stderr.write(
    `error: arc could not refresh the dev build (${result.message}); run \`${result.command}\` before continuing.\n`,
  );
  process.exitCode = 1;
});

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
