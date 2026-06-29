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
  TaskListCursorResult,
} from "../task-list/cursor.js";

/** Stop reason categories emitted by the recovery audit. */
export type RecoveryAuditStopKind =
  | "active-unresolved"
  | "dirty-unresolved"
  | "git-status-failed"
  | "identity-missing"
  | "load-set-unresolved"
  | "load-set-drift"
  | "seed-invalid"
  | "seed-missing"
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
  match: boolean;
}

/** Task-cursor comparison carried by the audit result. */
export interface RecoveryAuditTaskCursor {
  expected: TaskListCursor | null;
  actual: TaskListCursorResult | null;
  match: boolean;
}

/** Structured recovery audit verdict. */
export interface RecoveryAuditVerdict {
  status: "ready" | "stop";
  ready: boolean;
  stopReasons: RecoveryAuditStopReason[];
  loadSetAudit: LoadSetAuditVerdict | null;
  dirtyFiles: RecoveryAuditDirtyFiles;
  taskCursor: RecoveryAuditTaskCursor | null;
}

/** Fresh recovery probe state consumed by the audit. */
export interface RecoveryAuditProbeState {
  active: Probe<ActiveSessionInitResult>;
  dirty: Probe<DirtyStateResult>;
  loadSet: Probe<LoadSetManifest>;
  taskCursor?: Probe<TaskListCursorResult>;
}

/** Inputs for deterministic recovery audit. */
export interface AuditRecoveryStateOptions {
  /** Seed baseline emitted before compaction. */
  seed: CompactionSeed;
  /** Fresh recovery probe state. */
  recover: RecoveryAuditProbeState;
  /** Fresh dirty-file path set from `git status --porcelain=v1 -z`. */
  freshUncommittedFiles: readonly string[];
}

/** Audit fresh recovery state against the compaction seed. */
export function auditRecoveryState(options: AuditRecoveryStateOptions): RecoveryAuditVerdict {
  const stopReasons: RecoveryAuditStopReason[] = [];
  const loadSetAudit = auditLoadSet(options, stopReasons);
  const dirtyFiles = auditDirtyFiles(options, stopReasons);
  const taskCursor = auditTaskCursor(options, stopReasons);
  auditPlanningWorkflow(options, stopReasons);

  return {
    status: stopReasons.length === 0 ? "ready" : "stop",
    ready: stopReasons.length === 0,
    stopReasons,
    loadSetAudit,
    dirtyFiles,
    taskCursor,
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
): RecoveryAuditDirtyFiles {
  const expected = normalizePaths(options.seed.uncommittedFiles);
  const actual = normalizePaths(options.freshUncommittedFiles);
  const match = arraysEqual(expected, actual);
  const dirtyProbeContradiction = options.recover.dirty.ok
    && options.recover.dirty.value.state === "clean"
    && actual.length > 0;

  if (!options.recover.dirty.ok) {
    stopReasons.push({
      kind: "dirty-unresolved",
      message: options.recover.dirty.error.message,
      detail: options.recover.dirty.error,
    });
  }
  if (!match || dirtyProbeContradiction) {
    stopReasons.push({
      kind: "dirty-path-drift",
      message: dirtyProbeContradiction
        ? "fresh dirty-file path set contradicts the clean dirty-state probe"
        : "fresh dirty-file path set differs from the compaction seed baseline",
      detail: {
        expected,
        actual,
        dirty: options.recover.dirty.ok ? options.recover.dirty.value : null,
      },
    });
  }

  return { expected, actual, match };
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
      message: "seed has no task-list cursor for an execution recovery",
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
  return options.seed.sessionType === "execution" || freshSessionType === "execution";
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
