/**
 * Top-level `arc sync` orchestrator.
 *
 * Probes worktree state, notes-push policy, and config; dispatches over the
 * 6-cell `push_interlock × notes_push × worktree-state` matrix. Routes the
 * paired cell through `runPairedPush` for worst-outcome semantics; uses
 * single-leg primitives for the remaining cells. Owns cross-cutting coherence
 * gates (partial-push surfacing, notes-vs-worktree blocking, and the
 * Reconcile-required surface on a diverged worktree) so single-leg primitives
 * stay scope-narrow.
 *
 * Authorize-by-invocation: config is honored as-is whether the orchestrator is
 * called from the handoff workflow or by the user mid-session. The contract is
 * "fire when sync runs", not "fire only at the handoff occasion".
 *
 * **Blocked-cell save invariant.** Every blocked sync cell — diverged,
 * remote-ahead, no-upstream, detached-HEAD, no-remote, remote-unavailable,
 * local-ahead/manual, and the `save+notes-blocked` cell — saves the current
 * user directory before refusing the notes push. Rebase-in-progress is the
 * one exception: save is skipped because `HEAD` is mid-step and notes
 * wouldn't follow the rewrite. The paired path's pre-push save lives inside
 * `runPairedPush`; this orchestrator only owns saves for the cells that
 * don't route through paired.
 *
 * **JSON envelope contract.** Under `--json`, every return path emits a
 * single object on stdout — runtime, dry-run, and early-error paths included.
 * Schema parity holds across runtime and `--dry-run`; `interlockState`
 * (`{pushInterlock, notesPush, syncInterlock}`) is attached once at the
 * `handleSync` boundary so per-cell builders stay focused on leg outcomes.
 * `notesPush` reports the resolved policy after non-interactive degradation,
 * not the raw config; `syncInterlock` is informational only — the
 * orchestrator does not act on it (authorize-by-invocation).
 *
 * **Worktree-push helper.** Single-leg worktree pushes in `executeSingleLeg`
 * go through {@link pushWorktreeBranch} from `lib/git/`, the same helper
 * `runPairedPush` consumes — paired and single-leg cannot diverge on the
 * underlying push call.
 *
 * **Force-push handling.** A diverged worktree is decoded by `decideMatrix`
 * as a blocked cell upstream of any push attempt. Defense-in-depth, the
 * paired flow refuses on the `force-push-required` advisory inside
 * `runPairedPush`; the single-leg notes path auto-reconciles a
 * non-fast-forward via `pushNotesWithReconcile` (lossless `git notes merge`).
 * No matrix cell auto-opts into force-push.
 *
 * @module
 */

import { access } from "node:fs/promises";

import {
  buildSaveSummary,
  runPairedPush,
  runUserSave,
  UserSaveError,
  type PairedPushNotesContext,
  type PairedPushNotesPusherResult,
  type PairedPushResult,
  type UserIOContext,
} from "../commands/user.js";
import {
  resolveAllSettings,
  type NotesPushPolicy,
  type PushInterlock,
  type SyncInterlock,
} from "../lib/config/resolved-settings.js";
import { formatError, UserFacingError } from "../lib/errors.js";
import {
  isRefusalCondition,
  runPushabilityStatus,
  type PushabilityCondition,
} from "../lib/git/index.js";
import { pushWorktreeBranch } from "../lib/git/push-worktree.js";
import { runWorktreeSyncStatus, type WorktreeSyncState } from "../lib/git/worktree-sync.js";
import { inferRecommendedSummaryLine } from "../lib/handoff/recommended-summary-line.js";
import { createUserIOContext } from "../lib/io-context.js";
import { resolveArcRoot } from "../lib/paths.js";
import type { ResolvedConfigOverride } from "../lib/config/resolve-override.js";
import { appendAuditEntry, toAuditWorkUnit } from "../lib/release/audit-log.js";
import type { AuditEntry, AuditOutcome } from "../lib/release/types.js";
import { resolveActiveWu } from "../lib/release/wu-resolution.js";
import { createSyncOutput, type SyncOutput } from "../lib/sync-output.js";
import { pushNotesWithReconcile } from "./push-recovery.js";
import {
  ARC_PROJECT_ROOT_ERROR,
  isNonInteractiveEnvironment,
  resolveUserIdentity,
} from "./shared.js";

export interface SyncOptions {
  yes?: boolean;
  dryRun?: boolean;
  json?: boolean;
}

/**
 * Snapshot of the configured interlocks at the moment `arc sync` ran. Reported
 * verbatim in the JSON envelope so downstream consumers (handoff workflow,
 * future wrapper audit log) can record the policy in effect without re-reading
 * config. Authorize-by-invocation: the orchestrator does not act on
 * `syncInterlock` — the field is informational for callers.
 *
 * Each entry carries `{ value, source }` provenance so audit-log consumers
 * can distinguish git-config overrides from yaml-configured defaults.
 *
 * `notesPush.value` is the resolved policy after non-interactive degradation;
 * `notesPush.source` reflects where the pre-degradation policy was configured
 * (so a degraded `prompt → manual` from a git-config-set `arc.notesPush=prompt`
 * still reports `source: "git-config"`).
 */
export interface InterlockState {
  pushInterlock: ResolvedConfigOverride<PushInterlock>;
  notesPush: ResolvedConfigOverride<NotesPushPolicy>;
  syncInterlock: ResolvedConfigOverride<SyncInterlock>;
}

type WorktreeAction =
  | { kind: "skip-not-configured" }
  | {
    kind: "skip-blocked-worktree";
    reason: WorktreeSyncState;
    ahead: number;
    behind: number;
    branch: string | null;
  }
  | { kind: "push"; branch: string }
  /**
   * Push the branch with `-u` to publish + set upstream in one operation.
   * Emitted when `worktreeState === "no-upstream"` and `pushInterlock !==
   * "manual"` — the matrix surfaces no-upstream as `caller-resolvable`, and
   * sync's policy is "auto-resolve when push is authorized to cascade."
   */
  | { kind: "push-with-upstream-init"; branch: string };

type NotesAction =
  | { kind: "save-only" }
  | { kind: "save+push" }
  | { kind: "save+prompt" }
  | { kind: "save+notes-blocked"; reason: WorktreeSyncState };

interface MatrixDecision {
  /** Stable cell label for output / parser consumption. */
  cellName: string;
  worktree: WorktreeAction;
  notes: NotesAction;
}

interface MatrixInput {
  pushInterlock: PushInterlock;
  notesPush: NotesPushPolicy;
  worktreeState: WorktreeSyncState;
  worktreeAhead: number;
  worktreeBehind: number;
  branch: string | null;
}

/**
 * Sync cells that map to a refused audit decision. All are pushability
 * pre-check failures — `pushability-precheck-failed` (refusal code 14)
 * covers the full set per the release-wrapper refusal taxonomy. The
 * `notes-blocked` cell is intentionally absent: its worktree leg fires
 * (proceeded), with the per-leg notes record carrying the partial state.
 * `blocked-no-upstream` is intentionally absent — sync auto-resolves
 * no-upstream when `pushInterlock !== "manual"` (cell is
 * `paired-push-with-upstream-init` and friends); under `manual`, sync
 * short-circuits to `skip-not-configured` before the block-state check,
 * so the `blocked-no-upstream` cell label is structurally unreachable.
 */
const REFUSED_SYNC_CELLS: ReadonlySet<string> = new Set([
  "blocked-diverged",
  "blocked-remote-ahead",
  "blocked-detached-head",
  "blocked-no-remote",
  "blocked-branch-gone",
  "blocked-remote-unavailable",
]);

const SYNC_REFUSAL_CODE_PUSHABILITY = 14 as const;

/**
 * Worktree states that block notes push when notes auto-push runs under a
 * manual worktree-push interlock — prevents notes from referencing commits
 * that aren't on origin.
 */
const NOTES_BLOCK_WORKTREE_STATES: ReadonlySet<WorktreeSyncState> = new Set([
  "local-ahead",
  "diverged",
  "remote-ahead",
  "no-upstream",
  "detached-head",
  "no-remote",
  "branch-gone",
  "remote-unavailable",
]);

const WORKTREE_PUSH_BLOCK_STATES: ReadonlySet<WorktreeSyncState> = new Set([
  "diverged",
  "remote-ahead",
  // "no-upstream" is intentionally absent — sync auto-resolves it via
  // `push-with-upstream-init` when `pushInterlock !== "manual"`. The
  // `NOTES_BLOCK_WORKTREE_STATES` set above keeps "no-upstream" because
  // `manual` still blocks the worktree push (via skip-not-configured),
  // and the notes-block condition there uses `pushInterlock === "manual"`
  // as its first arm.
  "detached-head",
  "no-remote",
  "branch-gone",
  "remote-unavailable",
]);

/**
 * Decide the matrix cell from probed inputs. Pure — no I/O, deterministic.
 *
 * Ordering: worktree-side decision first (push_interlock × worktree-state),
 * then notes-side (notes_push × push_interlock × worktree-state with the
 * notes-vs-worktree gate). Coherence overlays (Reconcile-required on diverged)
 * are encoded in the worktree action; the executor surfaces them and skips
 * both legs.
 */
function decideMatrix(input: MatrixInput): MatrixDecision {
  const worktree: WorktreeAction = decideWorktree(input);
  const notes: NotesAction = decideNotes(input);
  return { cellName: cellNameFor(worktree, notes), worktree, notes };
}

function decideWorktree(input: MatrixInput): WorktreeAction {
  if (input.pushInterlock === "manual") {
    return { kind: "skip-not-configured" };
  }
  if (WORKTREE_PUSH_BLOCK_STATES.has(input.worktreeState) || input.branch === null) {
    return {
      kind: "skip-blocked-worktree",
      reason: input.branch === null ? "detached-head" : input.worktreeState,
      ahead: input.worktreeAhead,
      behind: input.worktreeBehind,
      branch: input.branch,
    };
  }
  if (input.worktreeState === "no-upstream") {
    return { kind: "push-with-upstream-init", branch: input.branch };
  }
  return { kind: "push", branch: input.branch };
}

function decideNotes(input: MatrixInput): NotesAction {
  if (input.notesPush === "manual") {
    return { kind: "save-only" };
  }
  const notesBlockedByWorktree = NOTES_BLOCK_WORKTREE_STATES.has(input.worktreeState)
    && (input.pushInterlock === "manual" || WORKTREE_PUSH_BLOCK_STATES.has(input.worktreeState));
  if (input.notesPush === "on-sync") {
    return notesBlockedByWorktree
      ? { kind: "save+notes-blocked", reason: input.worktreeState }
      : { kind: "save+push" };
  }
  // notesPush === "prompt"
  return notesBlockedByWorktree
    ? { kind: "save+notes-blocked", reason: input.worktreeState }
    : { kind: "save+prompt" };
}

/**
 * `(worktree=push, notes=save+notes-blocked)` is structurally unreachable.
 * `decideNotes` only emits `save+notes-blocked` when the worktree won't push
 * (`pushInterlock === "manual"` or the worktree state is in
 * `WORKTREE_PUSH_BLOCK_STATES`); in either case `decideWorktree` does not
 * return `push`. The combination has no `cellNameFor` arm and would fall
 * through to the `save-only` default if ever constructed.
 */
function cellNameFor(worktree: WorktreeAction, notes: NotesAction): string {
  if (worktree.kind === "skip-blocked-worktree") {
    return worktree.reason === "diverged" ? "blocked-diverged" : `blocked-${worktree.reason}`;
  }
  if (worktree.kind === "push" && notes.kind === "save+push") return "paired-push";
  if (worktree.kind === "push" && notes.kind === "save-only") return "worktree-only";
  if (worktree.kind === "push" && notes.kind === "save+prompt") return "worktree+notes-prompt";
  if (worktree.kind === "push-with-upstream-init" && notes.kind === "save+push") {
    return "paired-push-with-upstream-init";
  }
  if (worktree.kind === "push-with-upstream-init" && notes.kind === "save-only") {
    return "worktree-only-with-upstream-init";
  }
  if (worktree.kind === "push-with-upstream-init" && notes.kind === "save+prompt") {
    return "worktree-with-upstream-init+notes-prompt";
  }
  if (notes.kind === "save+push") return "notes-only";
  if (notes.kind === "save+prompt") return "notes-prompt";
  if (notes.kind === "save+notes-blocked") return "notes-blocked";
  return "save-only";
}

interface LegOutcomeRecord {
  action: string;
  result: "success" | "skipped" | "blocked" | "failed" | "noop" | "cancelled";
  detail?: string;
}

interface SyncOutcome {
  cell: string;
  interlockState: InterlockState;
  worktree: LegOutcomeRecord;
  save?: LegOutcomeRecord;
  notes: LegOutcomeRecord;
  exitCode: number;
  reconcile?: { ahead: number; behind: number; branch: string };
  /**
   * State-aware top-of-Confirm-Handoff line composed from the probed worktree
   * state. Non-null for the diverged cell (`**Reconcile required:** ...`);
   * null otherwise. Workflow renders verbatim above `**Sync:**`.
   */
  recommendedSummaryLine: string | null;
  /**
   * Indicator field present only in `--dry-run` envelopes. Workflow consumers
   * can detect dry-run by presence; absence implies a runtime execution.
   * Schema is otherwise identical so consumers don't need branch logic on this
   * field to read leg outcomes.
   */
  mode?: "dry-run";
}

/**
 * Inner-function return shape — interlock state, summary line, and mode are
 * attached once at the `handleSync` boundary so per-cell builders stay focused
 * on leg outcomes.
 */
type ExecutedOutcome = Omit<SyncOutcome, "interlockState" | "recommendedSummaryLine" | "mode">;

export async function handleSync(opts: SyncOptions = {}): Promise<void> {
  const output = createSyncOutput(opts.json === true);
  output.intro("arc sync");

  let identity: string;
  try {
    identity = await resolveUserIdentity();
  } catch (err) {
    if (err instanceof UserFacingError) {
      output.log.error(formatError(err));
      emitErrorEnvelope(opts, "identity-absent");
      return;
    }
    throw err;
  }

  const cwd = resolveArcRoot(process.cwd());
  if (!cwd) {
    output.log.error(ARC_PROJECT_ROOT_ERROR);
    emitErrorEnvelope(opts, "no-arc-project");
    return;
  }

  const io = createUserIOContext();
  const resolvedSettings = await resolveAllSettings({
    cwd,
    exec: io.exec,
    readFile: io.readFile,
    warn: (message) => { output.log.warn(message); },
  });
  const remoteSyncEnabled = resolvedSettings.settings["session.remote_sync"] === "enabled";
  const pushInterlock = resolvedSettings.resolved.pushInterlock.value;
  const syncInterlock = resolvedSettings.resolved.syncInterlock;
  const notesPushResolved = resolvedSettings.resolved.notesPush;

  const worktree = await runWorktreeSyncStatus({ exec: io.exec, remoteSyncEnabled });
  const branch = worktree.branch;

  let notesPush = notesPushResolved.value;
  if (notesPush === "prompt" && opts.yes === true) {
    output.log.info(
      `--yes flag detected — auto-accepting "prompt" policy (save and push notes).`,
    );
    notesPush = "on-sync";
  } else if (notesPush === "prompt" && (isNonInteractiveEnvironment() || opts.json === true)) {
    const reason = opts.json === true ? "JSON output mode" : "Non-interactive environment";
    output.log.warn(
      `${reason} detected — degrading "prompt" policy to "manual" (save only).`,
    );
    notesPush = "manual";
  }

  const interlockState: InterlockState = {
    pushInterlock: resolvedSettings.resolved.pushInterlock,
    notesPush: { value: notesPush, source: notesPushResolved.source },
    syncInterlock,
  };

  const decision = decideMatrix({
    pushInterlock,
    notesPush,
    worktreeState: worktree.state,
    worktreeAhead: worktree.ahead,
    worktreeBehind: worktree.behind,
    branch,
  });

  const recommendedSummaryLine = inferRecommendedSummaryLine({
    context: "sync-ran",
    worktreeState: worktree.state,
    ahead: worktree.ahead,
    behind: worktree.behind,
    branch,
    unpushedN: 0,
  });

  if (opts.dryRun) {
    const executed = buildDryRunOutcome(decision, branch);
    const outcome: SyncOutcome = {
      ...executed,
      interlockState,
      recommendedSummaryLine,
      mode: "dry-run",
    };
    if (opts.json === true) {
      process.stdout.write(`${JSON.stringify(outcome, null, 2)}\n`);
    } else {
      renderDryRunHuman(decision, output);
    }
    return;
  }

  const executed = await execute({
    decision,
    worktreeState: worktree.state,
    worktreeAhead: worktree.ahead,
    worktreeBehind: worktree.behind,
    branch,
    io,
    output,
    cwd,
    identity,
    yes: opts.yes === true,
  });

  const outcome: SyncOutcome = {
    ...executed,
    interlockState,
    recommendedSummaryLine,
  };

  await writeSyncAuditEntry({ cwd, identity, outcome, interlockState });

  if (opts.json === true) {
    process.stdout.write(`${JSON.stringify(outcome, null, 2)}\n`);
  } else {
    output.outro("Done.");
  }
  if (outcome.exitCode !== 0) {
    process.exitCode = outcome.exitCode;
  }
}

interface ExecuteContext {
  decision: MatrixDecision;
  worktreeState: WorktreeSyncState;
  worktreeAhead: number;
  worktreeBehind: number;
  branch: string | null;
  io: UserIOContext;
  output: SyncOutput;
  cwd: string;
  identity: string;
  /** `--yes` flag — auto-accepts safe-default recovery prompts; never opts into force-push. */
  yes: boolean;
}

async function execute(ctx: ExecuteContext): Promise<ExecutedOutcome> {
  const { decision } = ctx;

  const rebaseBlock = await detectRebaseSaveBlock(ctx);
  if (rebaseBlock !== null) {
    return executeRebaseBlocked(ctx);
  }

  if (decision.worktree.kind === "skip-blocked-worktree") {
    return executeBlockedWorktree(ctx, decision.worktree);
  }

  if (
    (decision.worktree.kind === "push" || decision.worktree.kind === "push-with-upstream-init")
    && decision.notes.kind === "save+push"
  ) {
    return executePaired(
      ctx,
      decision.worktree.branch,
      decision.worktree.kind === "push-with-upstream-init",
    );
  }

  return executeSingleLeg(ctx);
}

async function detectRebaseSaveBlock(
  ctx: ExecuteContext,
): Promise<PushabilityCondition | null> {
  const pushability = await runPushabilityStatus({
    exec: ctx.io.exec,
    access,
    target: "worktree",
    worktreeSyncState: ctx.worktreeState,
  });
  return pushability.conditions.find((c) => c.kind === "rebase-in-progress") ?? null;
}

function executeRebaseBlocked(ctx: ExecuteContext): ExecutedOutcome {
  ctx.output.log.warn("Save skipped: rebase in progress; complete or abort rebase before saving.");
  return {
    cell: ctx.decision.cellName,
    worktree: rebaseWorktreeRecord(ctx.decision.worktree),
    save: { action: "save", result: "skipped", detail: "rebase-in-progress" },
    notes: rebaseNotesRecord(ctx.decision.notes),
    exitCode: 1,
  };
}

function rebaseWorktreeRecord(worktree: WorktreeAction): LegOutcomeRecord {
  if (worktree.kind === "push" || worktree.kind === "push-with-upstream-init") {
    return { action: "push", result: "blocked", detail: "rebase-in-progress" };
  }
  if (worktree.kind === "skip-blocked-worktree") {
    return { action: "skip", result: "blocked", detail: worktree.reason };
  }
  return { action: "skip", result: "skipped", detail: "not-configured" };
}

function rebaseNotesRecord(notes: NotesAction): LegOutcomeRecord {
  if (notes.kind === "save-only") {
    return { action: "save", result: "skipped", detail: "rebase-in-progress" };
  }
  return { action: "push", result: "blocked", detail: "rebase-in-progress" };
}

async function executeBlockedWorktree(
  ctx: ExecuteContext,
  worktree: Extract<WorktreeAction, { kind: "skip-blocked-worktree" }>,
): Promise<ExecutedOutcome> {
  ctx.output.log.warn(worktreeBlockGuidance(worktree));
  const save = await performSave(ctx);
  const branchLabel = worktree.branch ?? ctx.branch ?? "HEAD";
  return {
    cell: ctx.decision.cellName,
    worktree: { action: "skip", result: "blocked", detail: worktree.reason },
    save,
    notes: blockedWorktreeNotesRecord(ctx.decision.notes, worktree.reason, save),
    exitCode: 1,
    ...(worktree.reason === "diverged"
      ? {
        reconcile: {
          ahead: worktree.ahead,
          behind: worktree.behind,
          branch: branchLabel,
        },
      }
      : {}),
  };
}

function blockedWorktreeNotesRecord(
  notes: NotesAction,
  reason: WorktreeSyncState,
  save: LegOutcomeRecord,
): LegOutcomeRecord {
  if (notes.kind === "save-only") {
    return {
      action: "save",
      result: save.result === "success" ? "success" : "failed",
      detail: save.detail,
    };
  }
  return {
    action: "push",
    result: "blocked",
    detail: `notes-blocked-by-worktree:${reason}`,
  };
}

async function executePaired(
  ctx: ExecuteContext,
  branch: string,
  setUpstream: boolean,
): Promise<ExecutedOutcome> {
  const result = await runPairedPush({
    io: ctx.io,
    identity: ctx.identity,
    cwd: ctx.cwd,
    access,
    branch,
    worktreeSyncState: ctx.worktreeState,
    setUpstream,
    pushNotes: (context) => pairedNotesAdapter(context, ctx.output),
  });
  renderPairedResult(result, branch, ctx.output);
  return {
    cell: ctx.decision.cellName,
    worktree: pairedLegToRecord(result.worktree, "push"),
    notes: pairedNotesToRecord(result),
    exitCode: result.exitCode,
  };
}

/**
 * Notes-leg pusher delegate for `runPairedPush`. Threads the paired flow's
 * context into `pushNotesWithReconcile` so paired and single-leg pushes share
 * automatic lossless reconcile, idempotent no-op detection, and pre-check
 * refusal. Maps the notes-push outcome onto the paired result surface.
 */
async function pairedNotesAdapter(
  context: PairedPushNotesContext,
  output: SyncOutput,
): Promise<PairedPushNotesPusherResult> {
  const outcome = await pushNotesWithReconcile({
    io: context.io,
    identity: context.identity,
    cwd: context.cwd,
    access: context.access,
    worktreeBranch: context.worktreeBranch,
    output,
  });
  switch (outcome.kind) {
    case "pushed":
      return { status: "success" };
    case "noop":
      return { status: "noop" };
    case "reconciled":
      return { status: "ok-recovered", via: "merge" };
    case "no-remote":
      return { status: "no-remote" };
    case "blocked":
      return { status: "blocked", conditions: outcome.conditions };
    case "conflict":
      return { status: "failed", error: new Error(outcome.message) };
    case "failed":
      return { status: "failed", error: outcome.error };
  }
}

function pairedNotesToRecord(result: PairedPushResult): LegOutcomeRecord {
  if (result.save.status === "failed") {
    return {
      action: "save",
      result: "failed",
      detail: result.save.error.message,
    };
  }
  const notes = result.notes;
  switch (notes.status) {
    case "success":
      return { action: "save+push", result: "success" };
    case "noop":
      return { action: "save+push", result: "noop" };
    case "ok-recovered":
      return { action: "save+push", result: "success", detail: `recovered:${notes.via}` };
    case "cancelled":
      return { action: "save+push", result: "cancelled" };
    case "no-remote":
      return { action: "save+push", result: "failed", detail: "no-remote" };
    case "failed-nontty-conflict":
      return { action: "save+push", result: "failed", detail: "nontty-conflict" };
    case "blocked":
      return { action: "save+push", result: "blocked" };
    case "failed":
      return { action: "save+push", result: "failed", detail: notes.error.message };
    case "skipped":
      return { action: "skip", result: "skipped", detail: notes.reason };
  }
}

function pairedLegToRecord(
  leg: PairedPushResult["worktree"],
  action: string,
): LegOutcomeRecord {
  switch (leg.status) {
    case "success":
      return { action, result: "success" };
    case "failed":
      return { action, result: "failed", detail: leg.error.message };
    case "skipped":
      return { action: "skip", result: "skipped", detail: leg.reason };
  }
}

function renderPairedResult(
  result: PairedPushResult,
  branch: string,
  output: SyncOutput,
): void {
  for (const condition of result.conditions.filter(isRefusalCondition)) {
    output.log.error(condition.guidance);
  }
  for (const condition of result.conditions.filter(
    (c) => c.disposition === "advisory" && c.kind === "force-push-required",
  )) {
    output.log.error(condition.guidance);
  }
  if (result.save.status === "success" && result.save.result.warnings.length > 0) {
    output.note(buildSaveSummary(result.save.result), "Saved");
  } else if (result.save.status === "failed") {
    output.log.error(`Save failed: ${result.save.error.message}`);
  }
  if (result.worktree.status === "success") {
    output.log.info(`Worktree pushed: \`${branch}\``);
  } else if (result.worktree.status === "failed") {
    output.log.error(`Worktree push failed: ${result.worktree.error.message}`);
  } else if (result.worktree.reason === "save-failed") {
    output.log.warn("Worktree push skipped because the save step failed.");
  } else if (result.worktree.reason === "blocked-by-precheck") {
    output.log.warn("Worktree push skipped: blocked by pre-check.");
  }
  renderPairedNotesOutcome(result, output);
}

function renderPairedNotesOutcome(result: PairedPushResult, output: SyncOutput): void {
  const notes = result.notes;
  switch (notes.status) {
    case "success":
    case "noop":
      // pushWithInteractiveRecovery's spinner already reports the outcome.
      return;
    case "ok-recovered":
      output.log.info(`Notes pushed (recovered via ${notes.via}).`);
      return;
    case "cancelled":
      output.log.info("Notes push cancelled.");
      output.log.warn("Partial publish recorded; recover with `arc user push` (idempotent).");
      return;
    case "no-remote":
      output.log.error("No remote configured. Push requires a remote repository.");
      output.log.warn("Partial publish recorded; recover with `arc user push` (idempotent).");
      return;
    case "failed-nontty-conflict":
      output.log.warn(
        "Push rejected — local and remote notes conflict (both moved since common ancestor), "
        + "and the environment is non-interactive.",
      );
      output.log.warn("Partial publish recorded; recover with `arc user push` (idempotent).");
      return;
    case "blocked":
      for (const condition of notes.conditions.filter(isRefusalCondition)) {
        output.log.error(condition.guidance);
      }
      output.log.warn("Partial publish recorded; recover with `arc user push` (idempotent).");
      return;
    case "failed":
      output.log.error(`Notes push failed: ${notes.error.message}`);
      output.log.warn("Partial publish recorded; recover with `arc user push` (idempotent).");
      return;
    case "skipped":
      if (notes.reason === "preceding-leg-failed") {
        output.log.warn("Notes push skipped because the worktree leg failed.");
      } else if (notes.reason === "save-failed") {
        output.log.warn("Notes push skipped because the save step failed.");
      } else {
        output.log.warn("Notes push skipped: blocked by pre-check.");
      }
      return;
  }
}

async function executeSingleLeg(ctx: ExecuteContext): Promise<ExecutedOutcome> {
  const { decision } = ctx;
  let worktreeRecord: LegOutcomeRecord;
  let worktreeFailed = false;

  if (decision.worktree.kind === "push" || decision.worktree.kind === "push-with-upstream-init") {
    const setUpstream = decision.worktree.kind === "push-with-upstream-init";
    const result = await pushWorktreeBranch({
      exec: ctx.io.exec,
      branch: decision.worktree.branch,
      args: setUpstream ? ["-u"] : [],
    });
    if (result.status === "success") {
      const successMsg = setUpstream
        ? `Worktree pushed with new upstream: \`${decision.worktree.branch}\``
        : `Worktree pushed: \`${decision.worktree.branch}\``;
      ctx.output.log.info(successMsg);
      worktreeRecord = { action: "push", result: "success" };
    } else {
      worktreeFailed = true;
      ctx.output.log.error(`Worktree push failed: ${result.error.message}`);
      worktreeRecord = { action: "push", result: "failed", detail: result.error.message };
    }
  } else {
    worktreeRecord = { action: "skip", result: "skipped", detail: "not-configured" };
    if (
      ctx.worktreeState === "local-ahead"
      && decision.notes.kind === "save-only"
      && ctx.branch !== null
    ) {
      ctx.output.log.info(`Worktree: ${ctx.worktreeAhead} unpushed commit(s) on \`${ctx.branch}\`.`);
    }
  }

  if (decision.notes.kind === "save+notes-blocked") {
    const save = await performSave(ctx);
    ctx.output.log.warn(reconcileGuidance(decision.notes.reason));
    return {
      cell: decision.cellName,
      worktree: worktreeRecord,
      save,
      notes: {
        action: "push",
        result: "blocked",
        detail: `notes-blocked-by-worktree:${decision.notes.reason}`,
      },
      exitCode: 1,
    };
  }

  const save = await performSave(ctx);
  if (save.result !== "success") {
    return {
      cell: decision.cellName,
      worktree: worktreeRecord,
      notes: { action: "save", result: "failed", detail: save.detail },
      exitCode: 1,
    };
  }

  if (decision.notes.kind === "save-only") {
    ctx.output.log.info("Notes saved locally; push manually with `arc user push`.");
    return {
      cell: decision.cellName,
      worktree: worktreeRecord,
      notes: { action: "save", result: "success" },
      exitCode: worktreeFailed ? 1 : 0,
    };
  }

  if (decision.notes.kind === "save+prompt") {
    if (worktreeFailed) {
      ctx.output.log.warn(
        "Worktree push failed; skipping notes prompt. Run `arc user push` after resolving.",
      );
      return {
        cell: decision.cellName,
        worktree: worktreeRecord,
        notes: { action: "save", result: "skipped", detail: "preceding-leg-failed" },
        exitCode: 1,
      };
    }
    const shouldPush = await ctx.output.confirm({
      message: "Push user notes to remote now?",
      initialValue: true,
    });
    if (ctx.output.isCancel(shouldPush) || !shouldPush) {
      ctx.output.log.info("Notes push skipped. Run `arc user push` when ready.");
      return {
        cell: decision.cellName,
        worktree: worktreeRecord,
        notes: { action: "save", result: "cancelled" },
        exitCode: 0,
      };
    }
    const notesRecord = await pushNotesLeg(ctx);
    return {
      cell: decision.cellName,
      worktree: worktreeRecord,
      notes: notesRecord,
      exitCode: notesRecord.result === "success" || notesRecord.result === "noop" ? 0 : 1,
    };
  }

  // save+push without paired routing — only reachable when worktree is push-skip
  // but notes is save+push (notes-only cell, worktree-skip not blocked).
  const notesRecord = await pushNotesLeg(ctx);
  return {
    cell: decision.cellName,
    worktree: worktreeRecord,
    notes: notesRecord,
    exitCode: notesRecord.result === "success" || notesRecord.result === "noop" ? 0 : 1,
  };
}

async function performSave(ctx: ExecuteContext): Promise<LegOutcomeRecord> {
  const spinner = ctx.output.spinner();
  spinner.start("Saving user directory...");
  try {
    const result = await runUserSave({ cwd: ctx.cwd, io: ctx.io, identity: ctx.identity });
    spinner.stop("Save complete.");
    if (result.warnings.length > 0) {
      ctx.output.note(buildSaveSummary(result), "Saved");
    }
    return { action: "save", result: "success" };
  } catch (err) {
    spinner.stop("Save failed.");
    if (err instanceof UserSaveError) {
      ctx.output.log.error(err.message);
      return { action: "save", result: "failed", detail: err.message };
    }
    throw err;
  }
}

async function pushNotesLeg(ctx: ExecuteContext): Promise<LegOutcomeRecord> {
  const outcome = await pushNotesWithReconcile({
    io: ctx.io,
    identity: ctx.identity,
    cwd: ctx.cwd,
    access,
    worktreeBranch: ctx.branch ?? undefined,
    output: ctx.output,
  });
  switch (outcome.kind) {
    case "pushed":
      return { action: "push", result: "success" };
    case "reconciled":
      return { action: "push", result: "success", detail: "recovered:merge" };
    case "noop":
      return { action: "push", result: "noop" };
    case "no-remote":
      ctx.output.log.error("No remote configured. Push requires a remote repository.");
      return { action: "push", result: "failed", detail: "no-remote" };
    case "blocked":
      for (const condition of outcome.conditions.filter(isRefusalCondition)) {
        ctx.output.log.error(condition.guidance);
      }
      return { action: "push", result: "blocked" };
    case "conflict":
      ctx.output.log.error(outcome.message);
      return { action: "push", result: "failed", detail: "conflict" };
    case "failed":
      ctx.output.log.error(`Notes push failed: ${outcome.error.message}`);
      return { action: "push", result: "failed" };
  }
}

/**
 * Write one audit-log entry for a completed sync execution. Sidecar to the
 * orchestrator: per the release-wrapper failure-mode split, schema
 * violations throw (programmer error surfaced at test time) and I/O
 * failures swallow into `{ ok: false }` inside `appendAuditEntry` — neither
 * propagates back to the caller, so an unwritable audit log can never
 * mask a successful or refused sync. Identity-absent / no-arc-project /
 * dry-run paths skip this write upstream.
 */
async function writeSyncAuditEntry(args: {
  cwd: string;
  identity: string;
  outcome: SyncOutcome;
  interlockState: InterlockState;
}): Promise<void> {
  const wu = await resolveActiveWu({ cwd: args.cwd });
  const wuAudit = wu.status === "resolved" ? toAuditWorkUnit(wu) : null;
  const refused = REFUSED_SYNC_CELLS.has(args.outcome.cell);

  const auditOutcome: AuditOutcome = {
    kind: "sync",
    cell: args.outcome.cell,
    worktree: encodeLegToken(args.outcome.worktree),
    notes: encodeLegToken(args.outcome.notes),
    exitCode: args.outcome.exitCode,
  };

  const entry: AuditEntry = {
    schemaVersion: 1,
    timestamp: new Date().toISOString(),
    command: "sync",
    args: [],
    wu: wuAudit,
    interlockState: { command: "sync", ...args.interlockState },
    decision: refused ? "refused" : "proceeded",
    refusalCode: refused ? SYNC_REFUSAL_CODE_PUSHABILITY : null,
    outcome: auditOutcome,
  };

  await appendAuditEntry({ cwd: args.cwd, identity: args.identity, entry });
}

/**
 * Compress a `LegOutcomeRecord` into the audit-entry string-token shape:
 * `action:result` when no detail, `action:result:detail` when set. Detail
 * may itself contain colons (e.g., `notes-blocked-by-worktree:diverged`);
 * readers split on the first two colons and treat the remainder as
 * detail payload.
 */
function encodeLegToken(record: LegOutcomeRecord): string {
  return record.detail !== undefined
    ? `${record.action}:${record.result}:${record.detail}`
    : `${record.action}:${record.result}`;
}

/**
 * Emit the early-return envelope for handler paths where matrix execution
 * never started (identity unresolved, cwd not under an ARC project).
 *
 * `cell: "none"` signals the absence of a matrix decision; `reason` discriminates
 * the path. Under `--json`, writes a single JSON object to stdout to keep the
 * machine-readable contract intact (every return path emits an envelope). In
 * human mode, the upstream `output.log.error` already surfaced the diagnostic;
 * no envelope is written.
 *
 * `process.exitCode = 1` fires regardless of mode so callers detect the
 * non-zero status without parsing the envelope.
 */
function emitErrorEnvelope(
  opts: SyncOptions,
  reason: "identity-absent" | "no-arc-project",
): void {
  process.exitCode = 1;
  if (opts.json === true) {
    const envelope = { cell: "none", reason };
    process.stdout.write(`${JSON.stringify(envelope, null, 2)}\n`);
  }
}

/**
 * Build the dry-run envelope from the matrix decision alone — no I/O.
 *
 * Schema parity with runtime: same `cell`, same `LegOutcomeRecord` shape on
 * each leg, `reconcile` populated for diverged blocked cells, `save` present
 * when the runtime path would have fired a separate save record (blocked-
 * worktree and notes-blocked cells consolidate save into a separate field;
 * other cells fold save into the notes/paired flow).
 *
 * Leg `result` is uniformly `"skipped"` with `detail: "dry-run"` since no leg
 * actually executes. Action labels are predicted from the decision so
 * consumers can read "what would have happened" without re-inspecting the
 * matrix decision.
 */
function buildDryRunOutcome(
  decision: MatrixDecision,
  branch: string | null,
): ExecutedOutcome {
  const worktreeAction =
    decision.worktree.kind === "push" || decision.worktree.kind === "push-with-upstream-init"
      ? "push"
      : "skip";
  const fireSeparateSave =
    decision.worktree.kind === "skip-blocked-worktree"
    || decision.notes.kind === "save+notes-blocked";

  const reconcile =
    decision.worktree.kind === "skip-blocked-worktree" && decision.worktree.reason === "diverged"
      ? {
        ahead: decision.worktree.ahead,
        behind: decision.worktree.behind,
        branch: decision.worktree.branch ?? branch ?? "HEAD",
      }
      : undefined;

  return {
    cell: decision.cellName,
    worktree: { action: worktreeAction, result: "skipped", detail: "dry-run" },
    ...(fireSeparateSave ? { save: { action: "save", result: "skipped", detail: "dry-run" } } : {}),
    notes: { action: dryRunNotesAction(decision), result: "skipped", detail: "dry-run" },
    exitCode: 0,
    ...(reconcile ? { reconcile } : {}),
  };
}

/**
 * Predict the notes-leg `action` label a runtime execution would have
 * recorded. Mirrors the runtime conventions: paired flows record `save+push`
 * (paired helper consolidates), single-leg flows record `push` for the
 * notes-only / save+prompt cells, `save` for save-only and cancelled prompts,
 * and `push` for blocked notes refusals.
 */
function dryRunNotesAction(decision: MatrixDecision): string {
  switch (decision.notes.kind) {
    case "save-only":
      return "save";
    case "save+notes-blocked":
      return "push";
    case "save+prompt":
      return "push";
    case "save+push":
      return decision.worktree.kind === "push" ? "save+push" : "push";
  }
}

function renderDryRunHuman(decision: MatrixDecision, output: SyncOutput): void {
  output.log.info(`Matrix decision: ${decision.cellName}`);
  output.log.info(`Worktree: ${describeWorktreeAction(decision.worktree)}`);
  output.log.info(`Notes:    ${describeNotesAction(decision.notes)}`);
  output.log.info("dry-run: no pushes will fire.");
  output.outro("Done.");
}

function describeWorktreeAction(action: WorktreeAction): string {
  switch (action.kind) {
    case "push":
      return `push origin ${action.branch}`;
    case "push-with-upstream-init":
      return `push -u origin ${action.branch}`;
    case "skip-not-configured":
      return "skip (push_interlock: manual)";
    case "skip-blocked-worktree":
      return `skip (${action.reason}: ${action.ahead} ahead, ${action.behind} behind)`;
  }
}

function worktreeBlockGuidance(
  action: Extract<WorktreeAction, { kind: "skip-blocked-worktree" }>,
): string {
  const branch = action.branch ?? "HEAD";
  switch (action.reason) {
    case "diverged":
      return `Reconcile required: \`${branch}\` diverged from origin/${branch} `
        + `(${action.ahead} ahead, ${action.behind} behind). `
        + "Manual rebase or merge needed before pushing.";
    case "remote-ahead":
      return `Worktree push blocked: origin/${branch} is ahead. `
        + "Fast-forward (`git pull --ff-only`) before pushing.";
    case "no-upstream":
      return `Worktree push blocked: set upstream first with \`git push -u origin ${branch}\`.`;
    case "detached-head":
      return "Worktree push blocked: HEAD is detached. Check out a branch first.";
    case "no-remote":
      return "Worktree push blocked: no `origin` remote is configured.";
    case "remote-unavailable":
      return "Worktree push blocked: origin is unavailable. Retry when the remote is reachable.";
    case "branch-gone":
      return `Worktree push blocked: upstream branch deleted on origin. `
        + `Recreate the branch or remove the stale worktree before pushing.`;
    default:
      return `Worktree push blocked: worktree state is ${action.reason}.`;
  }
}

function reconcileGuidance(state: WorktreeSyncState): string {
  const prefix = "Notes saved locally; push deferred.";
  switch (state) {
    case "diverged":
      return `${prefix} Worktree diverged from origin — reconcile (rebase or merge) `
        + "before notes can publish.";
    case "remote-ahead":
      return `${prefix} Worktree behind origin (remote-ahead) — fast-forward `
        + "(`git pull --ff-only`) before notes can publish.";
    case "local-ahead":
      return `${prefix} Worktree local-ahead under \`pushInterlock: manual\` — push `
        + "(`arc release push` or `git push`) or raise `pushInterlock` to enable cascade.";
    case "no-upstream":
      return `${prefix} Branch has no upstream under \`pushInterlock: manual\` — push with `
        + "`-u` (`git push -u origin <branch>`) or raise `pushInterlock` to enable auto-init.";
    case "detached-head":
      return `${prefix} HEAD is detached — check out a branch before notes can publish.`;
    case "no-remote":
      return `${prefix} No \`origin\` remote configured — set up a remote before notes can publish.`;
    case "remote-unavailable":
      return `${prefix} Origin unavailable — retry when reachable.`;
    case "branch-gone":
      return `${prefix} Upstream branch deleted on origin — recreate it, retarget the `
        + "branch, or remove the stale worktree before notes can publish.";
    case "clean":
    case "skipped":
      // Defensive — reconcileGuidance only fires on save+notes-blocked, which
      // requires `state ∈ NOTES_BLOCK_WORKTREE_STATES`. `clean` and `skipped`
      // are structurally outside that set; this arm preserves total-function
      // shape without inventing user-facing text for a state the path can't
      // actually reach.
      return `${prefix} Worktree state: ${state}.`;
  }
}

function describeNotesAction(action: NotesAction): string {
  switch (action.kind) {
    case "save-only":
      return "save only";
    case "save+push":
      return "save and push";
    case "save+prompt":
      return "save, prompt before push";
    case "save+notes-blocked":
      return `save; notes push blocked (worktree ${action.reason})`;
  }
}
