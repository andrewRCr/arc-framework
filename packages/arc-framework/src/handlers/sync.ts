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
 * @module
 */

import { access } from "node:fs/promises";

import * as p from "@clack/prompts";

import {
  buildSaveSummary,
  runPairedPush,
  runUserSave,
  UserSaveError,
  type PairedPushResult,
  type UserIOContext,
} from "../commands/user.js";
import { readConfigSettings } from "../lib/config/status-reader.js";
import { runWorktreeSyncStatus, type WorktreeSyncState } from "../lib/git/worktree-sync.js";
import { createUserIOContext } from "../lib/io-context.js";
import { resolveSyncPushPolicy, type SyncPushPolicy } from "../lib/sync-policy.js";
import { pushWithInteractiveRecovery } from "./push-recovery.js";
import {
  isHandledError,
  isNonInteractiveEnvironment,
  requireArcProjectRoot,
  resolveUserIdentity,
} from "./shared.js";

export interface SyncOptions {
  yes?: boolean;
  dryRun?: boolean;
  json?: boolean;
}

type PushInterlock = "manual" | "on-sync";

type WorktreeAction =
  | { kind: "skip-not-configured" }
  | { kind: "skip-blocked-diverged"; ahead: number; behind: number }
  | { kind: "push"; branch: string };

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
  notesPush: SyncPushPolicy;
  worktreeState: WorktreeSyncState;
  worktreeAhead: number;
  worktreeBehind: number;
  branch: string | null;
}

/**
 * Worktree states that block notes push when notes auto-push runs under a
 * manual worktree-push interlock — prevents notes from referencing commits
 * that aren't on origin.
 */
const NOTES_BLOCK_WORKTREE_STATES: ReadonlySet<WorktreeSyncState> = new Set([
  "local-ahead",
  "diverged",
  "remote-ahead",
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
  if (input.pushInterlock === "manual" || input.branch === null) {
    return { kind: "skip-not-configured" };
  }
  if (input.worktreeState === "diverged") {
    return {
      kind: "skip-blocked-diverged",
      ahead: input.worktreeAhead,
      behind: input.worktreeBehind,
    };
  }
  return { kind: "push", branch: input.branch };
}

function decideNotes(input: MatrixInput): NotesAction {
  if (input.notesPush === "manual") {
    return { kind: "save-only" };
  }
  const notesBlockedByWorktree = input.pushInterlock === "manual"
    && NOTES_BLOCK_WORKTREE_STATES.has(input.worktreeState);
  if (input.notesPush === "always") {
    return notesBlockedByWorktree
      ? { kind: "save+notes-blocked", reason: input.worktreeState }
      : { kind: "save+push" };
  }
  // notesPush === "prompt"
  return notesBlockedByWorktree
    ? { kind: "save+notes-blocked", reason: input.worktreeState }
    : { kind: "save+prompt" };
}

function cellNameFor(worktree: WorktreeAction, notes: NotesAction): string {
  if (worktree.kind === "skip-blocked-diverged") return "blocked-diverged";
  if (worktree.kind === "push" && notes.kind === "save+push") return "paired-push";
  if (worktree.kind === "push" && notes.kind === "save-only") return "worktree-only";
  if (worktree.kind === "push" && notes.kind === "save+prompt") return "worktree+notes-prompt";
  if (worktree.kind === "push" && notes.kind === "save+notes-blocked") return "worktree-push+notes-blocked";
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
  worktree: LegOutcomeRecord;
  notes: LegOutcomeRecord;
  exitCode: number;
  reconcile?: { ahead: number; behind: number; branch: string };
}

export async function handleSync(opts: SyncOptions = {}): Promise<void> {
  if (!opts.json) p.intro("arc sync");

  let identity: string;
  try {
    identity = await resolveUserIdentity();
  } catch (err) {
    if (isHandledError(err)) return;
    throw err;
  }

  const cwd = requireArcProjectRoot();
  if (!cwd) return;

  const io = createUserIOContext();
  const { settings } = await readConfigSettings(cwd);
  const pushInterlock: PushInterlock =
    settings["session.push_interlock"] === "on-sync" ? "on-sync" : "manual";
  const remoteSyncEnabled = settings["session.remote_sync"] === "enabled";

  const [worktree, syncPushResolved, branch] = await Promise.all([
    runWorktreeSyncStatus({ exec: io.exec, remoteSyncEnabled }),
    resolveSyncPushPolicy({
      exec: io.exec,
      readFile: io.readFile,
      cwd,
      warn: (message) => { p.log.warn(message); },
    }),
    resolveCurrentBranch(io),
  ]);

  let notesPush = syncPushResolved.policy;
  if (notesPush === "prompt" && isNonInteractiveEnvironment()) {
    p.log.warn(
      'Non-interactive environment detected — degrading "prompt" policy to "manual" (save only).',
    );
    notesPush = "manual";
  }

  const decision = decideMatrix({
    pushInterlock,
    notesPush,
    worktreeState: worktree.state,
    worktreeAhead: worktree.ahead,
    worktreeBehind: worktree.behind,
    branch,
  });

  if (opts.dryRun) {
    renderDryRun(decision, worktree, branch, opts.json === true);
    return;
  }

  const outcome = await execute({
    decision,
    worktreeState: worktree.state,
    worktreeAhead: worktree.ahead,
    worktreeBehind: worktree.behind,
    branch,
    io,
    cwd,
    identity,
  });

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(outcome, null, 2)}\n`);
  } else {
    p.outro("Done.");
  }
  if (outcome.exitCode !== 0) {
    process.exitCode = outcome.exitCode;
  }
}

async function resolveCurrentBranch(io: UserIOContext): Promise<string | null> {
  try {
    const { stdout } = await io.exec("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
    const trimmed = stdout.trim();
    return trimmed === "" || trimmed === "HEAD" ? null : trimmed;
  } catch {
    return null;
  }
}

interface ExecuteContext {
  decision: MatrixDecision;
  worktreeState: WorktreeSyncState;
  worktreeAhead: number;
  worktreeBehind: number;
  branch: string | null;
  io: UserIOContext;
  cwd: string;
  identity: string;
}

async function execute(ctx: ExecuteContext): Promise<SyncOutcome> {
  const { decision, branch } = ctx;

  if (decision.worktree.kind === "skip-blocked-diverged") {
    const branchLabel = branch ?? "HEAD";
    p.log.warn(
      `Reconcile required: \`${branchLabel}\` diverged from origin/${branchLabel} `
      + `(${decision.worktree.ahead} ahead, ${decision.worktree.behind} behind). `
      + "Manual rebase or merge needed before pushing.",
    );
    return {
      cell: decision.cellName,
      worktree: { action: "skip", result: "blocked", detail: "diverged" },
      notes: { action: "skip", result: "blocked", detail: "diverged" },
      exitCode: 1,
      reconcile: {
        ahead: decision.worktree.ahead,
        behind: decision.worktree.behind,
        branch: branchLabel,
      },
    };
  }

  if (decision.worktree.kind === "push" && decision.notes.kind === "save+push") {
    return executePaired(ctx, decision.worktree.branch);
  }

  return executeSingleLeg(ctx);
}

async function executePaired(ctx: ExecuteContext, branch: string): Promise<SyncOutcome> {
  const result = await runPairedPush({
    io: ctx.io,
    identity: ctx.identity,
    cwd: ctx.cwd,
    access,
    branch,
    worktreeSyncState: ctx.worktreeState,
  });
  renderPairedResult(result, branch);
  return {
    cell: ctx.decision.cellName,
    worktree: pairedLegToRecord(result.worktree, "push"),
    notes: pairedNotesToRecord(result),
    exitCode: result.exitCode,
  };
}

function pairedNotesToRecord(result: PairedPushResult): LegOutcomeRecord {
  if (result.save.status === "failed") {
    return {
      action: "save",
      result: "failed",
      detail: result.save.error.message,
    };
  }
  return pairedLegToRecord(result.notes, "save+push");
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

function renderPairedResult(result: PairedPushResult, branch: string): void {
  for (const condition of result.conditions.filter((c) => c.disposition === "block")) {
    p.log.error(condition.guidance);
  }
  if (result.save.status === "success" && result.save.result.warnings.length > 0) {
    p.note(buildSaveSummary(result.save.result), "Saved");
  } else if (result.save.status === "failed") {
    p.log.error(`Save failed: ${result.save.error.message}`);
  }
  if (result.worktree.status === "success") {
    p.log.info(`Worktree pushed: \`${branch}\``);
  } else if (result.worktree.status === "failed") {
    p.log.error(`Worktree push failed: ${result.worktree.error.message}`);
  } else if (result.worktree.reason === "save-failed") {
    p.log.warn("Worktree push skipped because the save step failed.");
  } else if (result.worktree.reason === "blocked-by-precheck") {
    p.log.warn("Worktree push skipped: blocked by pre-check.");
  }
  if (result.notes.status === "success") {
    p.log.info("Notes pushed.");
  } else if (result.notes.status === "failed") {
    p.log.error(`Notes push failed: ${result.notes.error.message}`);
    p.log.warn("Partial publish recorded; recover with `arc user push` (idempotent).");
  } else if (result.notes.reason === "preceding-leg-failed") {
    p.log.warn("Notes push skipped because the worktree leg failed.");
  } else if (result.notes.reason === "save-failed") {
    p.log.warn("Notes push skipped because the save step failed.");
  } else {
    p.log.warn("Notes push skipped: blocked by pre-check.");
  }
}

async function executeSingleLeg(ctx: ExecuteContext): Promise<SyncOutcome> {
  const { decision } = ctx;
  let worktreeRecord: LegOutcomeRecord;
  let worktreeFailed = false;

  if (decision.worktree.kind === "push") {
    try {
      await ctx.io.exec("git", ["push", "origin", decision.worktree.branch]);
      p.log.info(`Worktree pushed: \`${decision.worktree.branch}\``);
      worktreeRecord = { action: "push", result: "success" };
    } catch (err) {
      worktreeFailed = true;
      const msg = err instanceof Error ? err.message : String(err);
      p.log.error(`Worktree push failed: ${msg}`);
      worktreeRecord = { action: "push", result: "failed", detail: msg };
    }
  } else {
    worktreeRecord = { action: "skip", result: "skipped", detail: "not-configured" };
    if (
      ctx.worktreeState === "local-ahead"
      && decision.notes.kind === "save-only"
      && ctx.branch !== null
    ) {
      p.log.info(`Worktree: ${ctx.worktreeAhead} unpushed commit(s) on \`${ctx.branch}\`.`);
    }
  }

  if (decision.notes.kind === "save+notes-blocked") {
    const saveOk = await performSave(ctx);
    p.log.warn(reconcileGuidance(decision.notes.reason));
    return {
      cell: decision.cellName,
      worktree: worktreeRecord,
      notes: {
        action: "save",
        result: saveOk ? "blocked" : "failed",
        detail: `notes-blocked-by-worktree:${decision.notes.reason}`,
      },
      exitCode: 1,
    };
  }

  const saveOk = await performSave(ctx);
  if (!saveOk) {
    return {
      cell: decision.cellName,
      worktree: worktreeRecord,
      notes: { action: "save", result: "failed" },
      exitCode: 1,
    };
  }

  if (decision.notes.kind === "save-only") {
    p.log.info("Notes saved locally; push manually with `arc user push`.");
    return {
      cell: decision.cellName,
      worktree: worktreeRecord,
      notes: { action: "save", result: "success" },
      exitCode: worktreeFailed ? 1 : 0,
    };
  }

  if (decision.notes.kind === "save+prompt") {
    if (worktreeFailed) {
      p.log.warn(
        "Worktree push failed; skipping notes prompt. Run `arc user push` after resolving.",
      );
      return {
        cell: decision.cellName,
        worktree: worktreeRecord,
        notes: { action: "save", result: "skipped", detail: "preceding-leg-failed" },
        exitCode: 1,
      };
    }
    const shouldPush = await p.confirm({
      message: "Push user notes to remote now?",
      initialValue: true,
    });
    if (p.isCancel(shouldPush) || !shouldPush) {
      p.log.info("Notes push skipped. Run `arc user push` when ready.");
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

async function performSave(ctx: ExecuteContext): Promise<boolean> {
  const spinner = p.spinner();
  spinner.start("Saving user directory...");
  try {
    const result = await runUserSave({ cwd: ctx.cwd, io: ctx.io, identity: ctx.identity });
    spinner.stop("Save complete.");
    if (result.warnings.length > 0) {
      p.note(buildSaveSummary(result), "Saved");
    }
    return true;
  } catch (err) {
    spinner.stop("Save failed.");
    if (err instanceof UserSaveError) {
      p.log.error(err.message);
      return false;
    }
    throw err;
  }
}

async function pushNotesLeg(ctx: ExecuteContext): Promise<LegOutcomeRecord> {
  const result = await pushWithInteractiveRecovery({
    io: ctx.io,
    identity: ctx.identity,
    cwd: ctx.cwd,
    access,
    worktreeBranch: ctx.branch ?? undefined,
  });
  switch (result.kind) {
    case "ok":
      return { action: "push", result: "success" };
    case "ok-recovered":
      return { action: "push", result: "success", detail: `recovered:${result.via}` };
    case "noop":
      return { action: "push", result: "noop" };
    case "cancelled":
      p.log.info("Notes push cancelled. Run `arc user push` when ready.");
      return { action: "push", result: "cancelled" };
    case "no-remote":
      p.log.error("No remote configured. Push requires a remote repository.");
      return { action: "push", result: "failed", detail: "no-remote" };
    case "blocked":
      for (const condition of result.conditions.filter((c) => c.disposition === "block")) {
        p.log.error(condition.guidance);
      }
      return { action: "push", result: "blocked" };
    case "failed":
      p.log.error(
        `Notes push failed: ${result.error instanceof Error ? result.error.message : String(result.error)}`,
      );
      return { action: "push", result: "failed" };
    case "failed-nontty-conflict":
      p.log.warn(
        "Push rejected — notes conflict and the environment is non-interactive. "
        + "Re-run `arc sync` in a terminal to resolve.",
      );
      return { action: "push", result: "failed", detail: "nontty-conflict" };
  }
}

function renderDryRun(
  decision: MatrixDecision,
  worktree: { state: WorktreeSyncState; ahead: number; behind: number },
  branch: string | null,
  json: boolean,
): void {
  if (json) {
    process.stdout.write(`${JSON.stringify({
      mode: "dry-run",
      cell: decision.cellName,
      worktree: { state: worktree.state, ahead: worktree.ahead, behind: worktree.behind, branch },
      decision,
    }, null, 2)}\n`);
    return;
  }
  p.log.info(`Matrix decision: ${decision.cellName}`);
  p.log.info(`Worktree: ${describeWorktreeAction(decision.worktree)}`);
  p.log.info(`Notes:    ${describeNotesAction(decision.notes)}`);
  p.log.info("dry-run: no pushes will fire.");
  p.outro("Done.");
}

function describeWorktreeAction(action: WorktreeAction): string {
  switch (action.kind) {
    case "push":
      return `push origin ${action.branch}`;
    case "skip-not-configured":
      return "skip (push_interlock: manual)";
    case "skip-blocked-diverged":
      return `skip (diverged: ${action.ahead} ahead, ${action.behind} behind)`;
  }
}

function reconcileGuidance(state: WorktreeSyncState): string {
  switch (state) {
    case "diverged":
      return (
        "Notes push blocked: worktree diverged from origin. "
        + "Manual rebase or merge needed before pushing notes. "
        + "(worktree state: diverged)"
      );
    case "remote-ahead":
      return (
        "Notes push blocked: origin is ahead of worktree. "
        + "Fast-forward (`git pull --ff-only`) before pushing notes. "
        + "(worktree state: remote-ahead)"
      );
    default:
      return (
        "Notes push blocked: push the worktree first, then `arc user push`. "
        + `(worktree state: ${state})`
      );
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
