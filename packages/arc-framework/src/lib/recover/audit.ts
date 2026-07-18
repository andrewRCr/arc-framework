/**
 * Deterministic recovery audit.
 *
 * Compares a compaction seed against freshly probed recovery state and returns
 * a structured ready/stop verdict. The audit restores ARC operating context; it
 * does not infer the volatile current action from stale meta fields.
 *
 * @module
 */

import type { ActiveSessionInitResult } from "../../commands/active/types.js";
import type { Probe } from "../../commands/status/types.js";
import type { CompactionSeed } from "../compaction-seed/schema.js";
import type { DirtyStateResult } from "../git/dirty-state.js";
import { auditLoadSetManifest, type LoadSetAuditVerdict } from "../load-set/audit.js";
import type { LoadSetManifest } from "../load-set/types.js";
import type {
  TaskListCursor,
} from "../task-list/cursor.js";
import type { TaskListCursorFileResult } from "../task-list/file-cursor.js";
import {
  defaultCommittedProgressResolver,
  type CommittedProgress,
  type CommittedProgressResolver,
} from "./committed-progress.js";

/** Stop reason categories emitted by the recovery audit. */
export type RecoveryAuditStopKind =
  | "active-unresolved"
  | "branch-mismatch"
  | "branch-unresolved"
  | "dirty-unresolved"
  | "git-status-failed"
  | "head-lineage-mismatch"
  | "head-unresolved"
  | "identity-missing"
  | "load-set-unresolved"
  | "load-set-drift"
  | "seed-invalid"
  | "seed-missing"
  | "seed-unreadable"
  | "dirty-path-drift"
  | "task-cursor-missing"
  | "task-cursor-unresolved"
  | "task-cursor-malformed"
  | "task-cursor-mismatch"
  | "planning-workflow-uncertain";

/** Structured stop reason for agent rendering. */
export interface RecoveryAuditStopReason {
  /** Machine-readable reason category. */
  kind: RecoveryAuditStopKind;
  /** Human-readable explanation. */
  message: string;
  /** Optional structured detail for the reason. */
  detail?: unknown;
}

/** Dirty-file comparison carried by the audit result. */
export interface RecoveryAuditDirtyFiles {
  expected: string[];
  actual: string[];
  pathSetMatch: boolean;
  dirtyStateConsistent: boolean | null;
  match: boolean;
  /**
   * True when the path-set differs but the difference is fully explained by
   * commits made since the seed (see {@link RecoveryAuditExplainedDrift}) — so it
   * does not contribute a stop reason.
   */
  explainedByCommittedProgress: boolean;
}

/**
 * Drift the audit classified as expected progression rather than a stop signal.
 *
 * Recorded for transparency when a drift reason was suppressed because it is
 * fully accounted for by committed work since the seed. The verdict stays binary
 * ready/stop; an explained reason simply does not push a stop.
 */
export type RecoveryAuditExplainedDrift =
  | {
    kind: "dirty-path-drift";
    message: string;
    detail: {
      /** Seed-expected dirty paths now absent because they were committed since the seed. */
      resolvedPaths: string[];
      /** The seed head those paths were committed after. */
      committedSince: string;
    };
  }
  | {
    kind: "head-advanced";
    message: string;
    detail: {
      expected: string;
      actual: string;
    };
  };

/** Branch and HEAD comparison carried by the audit result. */
export interface RecoveryAuditLocus {
  expectedBranch: string;
  actualBranch: string | null;
  branchMatch: boolean;
  expectedHead: string;
  actualHead: string | null;
  headRelation: "same" | "advanced" | "mismatch" | "unresolved";
}

/** Task-cursor comparison carried by the audit result. */
export interface RecoveryAuditTaskCursor {
  expected: TaskListCursor | null;
  actual: TaskListCursorFileResult | null;
  match: boolean;
}

/** Structured recovery audit verdict. */
export interface RecoveryAuditVerdict {
  status: "ready" | "stop";
  ready: boolean;
  stopReasons: RecoveryAuditStopReason[];
  /** Drift that was suppressed as expected progression; never gates the verdict. */
  explainedDrift: RecoveryAuditExplainedDrift[];
  loadSetAudit: LoadSetAuditVerdict | null;
  locus: RecoveryAuditLocus | null;
  dirtyFiles: RecoveryAuditDirtyFiles;
  taskCursor: RecoveryAuditTaskCursor | null;
}

/** Fresh recovery probe state consumed by the audit. */
export interface RecoveryAuditProbeState {
  active: Probe<ActiveSessionInitResult>;
  dirty: Probe<DirtyStateResult>;
  loadSet: Probe<LoadSetManifest>;
  taskCursor?: Probe<TaskListCursorFileResult>;
}

/** Inputs for deterministic recovery audit. */
export interface AuditRecoveryStateOptions {
  /** Seed baseline emitted before compaction. */
  seed: CompactionSeed;
  /** Fresh recovery probe state. */
  recover: RecoveryAuditProbeState;
  /** Fresh dirty-file path set from `git status --porcelain=v1 -z`. */
  freshUncommittedFiles: readonly string[];
  /** Current checkout branch (`HEAD` when detached), read at audit time. */
  freshBranch: string | null;
  /** Current resolved HEAD commit, read at audit time. */
  freshHead: string | null;
  /**
   * Resolves committed-progress evidence for explained-drift classification.
   * Injected in tests; defaults to a real git query against the current repo.
   */
  resolveCommittedProgress?: CommittedProgressResolver;
}

/** Audit fresh recovery state against the compaction seed. */
export async function auditRecoveryState(
  options: AuditRecoveryStateOptions,
): Promise<RecoveryAuditVerdict> {
  const resolveCommittedProgress = options.resolveCommittedProgress ?? defaultCommittedProgressResolver;
  const committedProgress = options.freshHead === null
    ? null
    : await resolveCommittedProgress(options.seed.head, options.freshHead);

  const stopReasons: RecoveryAuditStopReason[] = [];
  const explainedDrift: RecoveryAuditExplainedDrift[] = [];
  const locus = auditLocus(options, stopReasons, explainedDrift, committedProgress);
  const loadSetAudit = auditLoadSet(options, stopReasons);
  const dirtyFiles = auditDirtyFiles(options, stopReasons, explainedDrift, committedProgress);
  const taskCursor = auditTaskCursor(options, stopReasons);
  auditPlanningWorkflow(options, stopReasons);

  return {
    status: stopReasons.length === 0 ? "ready" : "stop",
    ready: stopReasons.length === 0,
    stopReasons,
    explainedDrift,
    loadSetAudit,
    locus,
    dirtyFiles,
    taskCursor,
  };
}

function auditLocus(
  options: AuditRecoveryStateOptions,
  stopReasons: RecoveryAuditStopReason[],
  explainedDrift: RecoveryAuditExplainedDrift[],
  committedProgress: CommittedProgress | null,
): RecoveryAuditLocus {
  const branchMatch = options.freshBranch === options.seed.branch;
  if (options.freshBranch === null) {
    stopReasons.push({
      kind: "branch-unresolved",
      message: "live checkout branch could not be resolved",
      detail: { expected: options.seed.branch, actual: null },
    });
  } else if (!branchMatch) {
    stopReasons.push({
      kind: "branch-mismatch",
      message: "live checkout branch differs from the compaction seed baseline",
      detail: { expected: options.seed.branch, actual: options.freshBranch },
    });
  }

  let headRelation: RecoveryAuditLocus["headRelation"];
  if (options.freshHead === null) {
    headRelation = "unresolved";
    stopReasons.push({
      kind: "head-unresolved",
      message: "live HEAD commit could not be resolved",
      detail: { expected: options.seed.head, actual: null },
    });
  } else if (options.freshHead === options.seed.head) {
    headRelation = "same";
  } else if (committedProgress?.advanced === true) {
    headRelation = "advanced";
    explainedDrift.push({
      kind: "head-advanced",
      message: "live HEAD advanced from the compaction seed on the same lineage",
      detail: { expected: options.seed.head, actual: options.freshHead },
    });
  } else {
    headRelation = "mismatch";
    stopReasons.push({
      kind: "head-lineage-mismatch",
      message: "live HEAD is not the seed head or a descendant of it",
      detail: { expected: options.seed.head, actual: options.freshHead },
    });
  }

  return {
    expectedBranch: options.seed.branch,
    actualBranch: options.freshBranch,
    branchMatch,
    expectedHead: options.seed.head,
    actualHead: options.freshHead,
    headRelation,
  };
}

function auditLoadSet(
  options: AuditRecoveryStateOptions,
  stopReasons: RecoveryAuditStopReason[],
): LoadSetAuditVerdict | null {
  if (!options.recover.loadSet.ok) {
    stopReasons.push({
      kind: "load-set-unresolved",
      message: options.recover.loadSet.error.message,
      detail: options.recover.loadSet.error,
    });
    return null;
  }

  const verdict = auditLoadSetManifest({
    baseline: options.seed.loadSet,
    fresh: options.recover.loadSet.value,
  });
  if (verdict.diverged) {
    stopReasons.push({
      kind: "load-set-drift",
      message: "fresh recovery load-set diverges from the compaction seed baseline",
      detail: verdict.diff,
    });
  }
  return verdict;
}

function auditDirtyFiles(
  options: AuditRecoveryStateOptions,
  stopReasons: RecoveryAuditStopReason[],
  explainedDrift: RecoveryAuditExplainedDrift[],
  committedProgress: CommittedProgress | null,
): RecoveryAuditDirtyFiles {
  const expected = normalizePaths(options.seed.uncommittedFiles);
  const actual = normalizePaths(options.freshUncommittedFiles);
  const pathSetMatch = arraysEqual(expected, actual);
  const dirtyProbeState = options.recover.dirty.ok ? options.recover.dirty.value.state : null;
  const dirtyProbeContradiction = dirtyProbeState !== null
    && (
      (dirtyProbeState === "clean" && actual.length > 0)
      || (dirtyProbeState === "dirty" && actual.length === 0)
    );
  const dirtyStateConsistent = options.recover.dirty.ok ? !dirtyProbeContradiction : null;

  // Path drift is "explained" only when the working tree is a strict subset of the
  // seed's expected set, and every seed-expected path now absent left the dirty set
  // by being committed since the seed head (HEAD advanced past it). Any unexpected
  // new dirt, an uncommitted disappearance, or a dirty-state contradiction is not
  // committed progress and stays a genuine stop.
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  const nowMissing = expected.filter((path) => !actualSet.has(path));
  const newDirt = actual.filter((path) => !expectedSet.has(path));
  const explainedByCommittedProgress = !pathSetMatch
    && !dirtyProbeContradiction
    && newDirt.length === 0
    && nowMissing.length > 0
    && committedProgress !== null
    && committedProgress.advanced
    && nowMissing.every((path) => committedProgress.files.has(path));

  const match = pathSetMatch && dirtyStateConsistent === true;

  if (!options.recover.dirty.ok) {
    stopReasons.push({
      kind: "dirty-unresolved",
      message: options.recover.dirty.error.message,
      detail: options.recover.dirty.error,
    });
  }
  if ((!pathSetMatch || dirtyProbeContradiction) && !explainedByCommittedProgress) {
    stopReasons.push({
      kind: "dirty-path-drift",
      message: dirtyProbeContradiction
        ? dirtyProbeContradictionMessage(dirtyProbeState)
        : "fresh dirty-file path set differs from the compaction seed baseline",
      detail: {
        expected,
        actual,
        dirty: options.recover.dirty.ok ? options.recover.dirty.value : null,
      },
    });
  } else if (explainedByCommittedProgress) {
    explainedDrift.push({
      kind: "dirty-path-drift",
      message:
        "seed-expected dirty files are absent because they were committed since the seed; drift is expected progression",
      detail: {
        resolvedPaths: nowMissing,
        committedSince: options.seed.head,
      },
    });
  }

  return { expected, actual, pathSetMatch, dirtyStateConsistent, match, explainedByCommittedProgress };
}

function dirtyProbeContradictionMessage(state: DirtyStateResult["state"]): string {
  return state === "clean"
    ? "fresh dirty-file path set contradicts the clean dirty-state probe"
    : "fresh dirty-file path set contradicts the dirty-state probe reporting dirty";
}

function auditTaskCursor(
  options: AuditRecoveryStateOptions,
  stopReasons: RecoveryAuditStopReason[],
): RecoveryAuditTaskCursor | null {
  if (!requiresTaskCursor(options)) return null;

  const expected = options.seed.taskCursor;
  const actualSlot = options.recover.taskCursor;
  const actual = actualSlot?.ok ? actualSlot.value : null;

  if (expected === null) {
    stopReasons.push({
      kind: "task-cursor-missing",
      message: "seed has no task-list cursor for a recovery state that requires one",
    });
  }

  if (actualSlot === undefined || !actualSlot.ok) {
    stopReasons.push({
      kind: "task-cursor-unresolved",
      message: actualSlot?.ok === false
        ? actualSlot.error.message
        : "fresh recovery probe did not resolve a task-list cursor",
      detail: actualSlot?.ok === false ? actualSlot.error : undefined,
    });
    return { expected, actual, match: false };
  }

  if (actualSlot.value.status === "malformed") {
    stopReasons.push({
      kind: "task-cursor-malformed",
      message: actualSlot.value.error.message,
      detail: actualSlot.value.error,
    });
    return { expected, actual, match: false };
  }

  if (actualSlot.value.status === "missing") {
    stopReasons.push({
      kind: "task-cursor-unresolved",
      message: `fresh recovery probe could not read task list: ${actualSlot.value.path}`,
      detail: actualSlot.value,
    });
    return { expected, actual, match: false };
  }

  if (actualSlot.value.status === "no-open-task") {
    stopReasons.push({
      kind: "task-cursor-unresolved",
      message: "fresh recovery probe found no open task-list checkbox",
    });
    return { expected, actual, match: false };
  }

  const actualCursor = actualSlot.value.cursor;
  if (expected === null) {
    return { expected, actual, match: false };
  }

  const match = cursorEqual(expected, actualCursor);
  if (!match) {
    stopReasons.push({
      kind: "task-cursor-mismatch",
      message: "fresh task-list cursor differs from the compaction seed baseline",
      detail: { expected, actual: actualCursor },
    });
  }
  return { expected, actual, match };
}

function auditPlanningWorkflow(
  options: AuditRecoveryStateOptions,
  stopReasons: RecoveryAuditStopReason[],
): void {
  if (!options.recover.active.ok) {
    stopReasons.push({
      kind: "active-unresolved",
      message: options.recover.active.error.message,
      detail: options.recover.active.error,
    });
    return;
  }

  const sessionType = options.recover.active.value.sessionType ?? options.seed.sessionType;
  if (sessionType === "planning") {
    stopReasons.push({
      kind: "planning-workflow-uncertain",
      message: "planning-stage recovery needs the harness summary or user direction; Current Workflow is soft after compaction",
    });
  }
}

function requiresTaskCursor(options: AuditRecoveryStateOptions): boolean {
  const freshSessionType = options.recover.active.ok
    ? options.recover.active.value.sessionType
    : null;
  if (
    options.seed.sessionType === "execution"
    || freshSessionType === "execution"
    || options.seed.taskCursor !== null
  ) {
    return true;
  }
  if (freshSessionType === "planning") return false;

  const freshCursor = options.recover.taskCursor;
  if (freshCursor === undefined) return options.seed.sessionType === "integration" || freshSessionType === "integration";
  if (!freshCursor.ok) return true;
  return freshCursor.value.status !== "no-open-task";
}

function normalizePaths(paths: readonly string[]): string[] {
  return [...new Set(paths)].sort((a, b) => a.localeCompare(b));
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function cursorEqual(left: TaskListCursor, right: TaskListCursor): boolean {
  return cursorItemEqual(left.section, right.section) && cursorItemEqual(left.leaf, right.leaf);
}

function cursorItemEqual(
  left: TaskListCursor["section"],
  right: TaskListCursor["section"],
): boolean {
  return left.id === right.id
    && left.title === right.title
    && left.lineHint === right.lineHint;
}
