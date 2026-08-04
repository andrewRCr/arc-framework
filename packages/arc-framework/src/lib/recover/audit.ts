/**
 * Deterministic recovery audit.
 *
 * Compares a compaction seed against freshly probed recovery state and returns
 * a structured ready/stop verdict. The audit restores ARC operating context; it
 * does not infer the volatile current action from stale meta fields.
 *
 * @module
 */
import { z } from "zod";

import type { ActiveSessionInitResult } from "../../commands/active/types.js";
import type { Probe } from "../../commands/status/types.js";
import {
  COMPACTION_SEED_LOCUS_HINT_FIELDS,
  CompactionSeedLocusHintSchema,
  deriveCompactionSeedLocusHint,
  type CompactionSeed,
} from "../compaction-seed/schema.js";
import type { DirtyStateResult } from "../git/dirty-state.js";
import {
  LoadSetAuditVerdictSchema,
  auditLoadSetManifest,
  type LoadSetAuditVerdict,
} from "../load-set/audit.js";
import type { LoadSetManifest } from "../load-set/types.js";
import type { LocusStateV1 } from "../locus/schema/index.js";
import { isIdleWorkUnitRow } from "../locus/state.js";
import {
  DRAIN_INBOX_WORKFLOW_PATH,
  DRAFT_DESIGN_WORKFLOW_PATH,
  RUN_ERRAND_WORKFLOW_PATH,
  type RecoveryLocusFrame,
} from "./locus-context.js";
import type {
  TaskListCursor,
} from "../task-list/cursor.js";
import { TaskListCursorSchema } from "../task-list/cursor.js";
import {
  TaskListCursorFileResultSchema,
  type TaskListCursorFileResult,
} from "../task-list/file-cursor.js";
import {
  defaultCommittedProgressResolver,
  type CommittedProgress,
  type CommittedProgressResolver,
} from "./committed-progress.js";

/** Stop reason categories emitted by the recovery audit. */
export const RecoveryAuditStopKindSchema = z.enum([
  "active-unresolved",
  "branch-mismatch",
  "branch-unresolved",
  "dirty-unresolved",
  "git-status-failed",
  "head-lineage-mismatch",
  "head-unresolved",
  "identity-missing",
  "load-set-unresolved",
  "load-set-drift",
  "locus-unresolved",
  "locus-hint-mismatch",
  "seed-locus-unavailable",
  "repo-root-mismatch",
  "seed-invalid",
  "seed-missing",
  "seed-unreadable",
  "dirty-path-drift",
  "task-cursor-missing",
  "task-cursor-unresolved",
  "task-cursor-malformed",
  "task-cursor-mismatch",
]);
export type RecoveryAuditStopKind = z.infer<typeof RecoveryAuditStopKindSchema>;

/** Structured stop reason for agent rendering. */
export const RecoveryAuditStopReasonSchema = z.strictObject({
  kind: RecoveryAuditStopKindSchema,
  message: z.string(),
  detail: z.unknown().optional(),
});
export type RecoveryAuditStopReason = z.infer<typeof RecoveryAuditStopReasonSchema>;

/** Dirty-file comparison carried by the audit result. */
export const RecoveryAuditDirtyFilesSchema = z.strictObject({
  expected: z.array(z.string()),
  actual: z.array(z.string()),
  pathSetMatch: z.boolean(),
  dirtyStateConsistent: z.boolean().nullable(),
  match: z.boolean(),
  explainedByCommittedProgress: z.boolean(),
}).superRefine((value, context) => {
  if (value.match !== (value.pathSetMatch && value.dirtyStateConsistent === true)) {
    context.addIssue({ code: "custom", path: ["match"], message: "match must agree with dirty comparisons" });
  }
});
export type RecoveryAuditDirtyFiles = z.infer<typeof RecoveryAuditDirtyFilesSchema>;

/**
 * Drift the audit classified as expected progression rather than a stop signal.
 *
 * Recorded for transparency when a drift reason was suppressed because it is
 * fully accounted for by committed work since the seed. The verdict stays binary
 * ready/stop; an explained reason simply does not push a stop.
 */
export const RecoveryAuditExplainedDriftSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("dirty-path-drift"),
    message: z.string(),
    detail: z.strictObject({
      resolvedPaths: z.array(z.string()),
      committedSince: z.string(),
    }),
  }),
  z.strictObject({
    kind: z.literal("head-advanced"),
    message: z.string(),
    detail: z.strictObject({ expected: z.string(), actual: z.string() }),
  }),
]);
export type RecoveryAuditExplainedDrift = z.infer<typeof RecoveryAuditExplainedDriftSchema>;

/** Branch and HEAD comparison carried by the audit result. */
export const RecoveryAuditLocusSchema = z.strictObject({
  expectedBranch: z.string(),
  actualBranch: z.string().nullable(),
  branchMatch: z.boolean(),
  expectedHead: z.string(),
  actualHead: z.string().nullable(),
  headRelation: z.enum(["same", "advanced", "mismatch", "unresolved"]),
});
export type RecoveryAuditLocus = z.infer<typeof RecoveryAuditLocusSchema>;

/** Optional seed-locus hint compared with fresh reader authority. */
export const RecoveryAuditLocusHintSchema = z.strictObject({
  expected: CompactionSeedLocusHintSchema.nullable(),
  actual: CompactionSeedLocusHintSchema.nullable(),
  match: z.boolean(),
});
export type RecoveryAuditLocusHint = z.infer<typeof RecoveryAuditLocusHintSchema>;

/** Task-cursor comparison carried by the audit result. */
export const RecoveryAuditTaskCursorSchema = z.strictObject({
  expected: TaskListCursorSchema.nullable(),
  actual: TaskListCursorFileResultSchema.nullable(),
  match: z.boolean(),
});
export type RecoveryAuditTaskCursor = z.infer<typeof RecoveryAuditTaskCursorSchema>;

/** Structured recovery audit verdict. */
export const RecoveryAuditVerdictSchema = z.strictObject({
  status: z.enum(["ready", "stop"]),
  ready: z.boolean(),
  stopReasons: z.array(RecoveryAuditStopReasonSchema),
  explainedDrift: z.array(RecoveryAuditExplainedDriftSchema),
  loadSetAudit: LoadSetAuditVerdictSchema.nullable(),
  locus: RecoveryAuditLocusSchema.nullable(),
  locusHint: RecoveryAuditLocusHintSchema.nullable(),
  dirtyFiles: RecoveryAuditDirtyFilesSchema,
  taskCursor: RecoveryAuditTaskCursorSchema.nullable(),
}).superRefine((value, context) => {
  const ready = value.status === "ready";
  if (value.ready !== ready) {
    context.addIssue({ code: "custom", path: ["ready"], message: "ready must agree with status" });
  }
  if (ready !== (value.stopReasons.length === 0)) {
    context.addIssue({
      code: "custom",
      path: ["stopReasons"],
      message: "ready verdicts require no stop reasons; stopped verdicts require at least one",
    });
  }
});
export type RecoveryAuditVerdict = z.infer<typeof RecoveryAuditVerdictSchema>;

/** Fresh recovery probe state consumed by the audit. */
export interface RecoveryAuditProbeState {
  locusState: Probe<LocusStateV1>;
  recoveryFrame: Probe<RecoveryLocusFrame>;
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
   * Absolute root of the checkout being recovered, resolved the same way the
   * emitter resolved the seed's own root. Binds a worktree-local seed to the
   * worktree that produced it: sibling linked worktrees can legitimately share
   * a branch, head, dirty set, and load set, so nothing else distinguishes them.
   */
  freshRepoRoot: string;
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
  auditRepoRoot(options, stopReasons);
  const locus = auditLocus(options, stopReasons, explainedDrift, committedProgress);
  const locusHint = auditLocusHint(options, stopReasons);
  const loadSetAudit = auditLoadSet(options, stopReasons);
  const dirtyFiles = auditDirtyFiles(options, stopReasons, explainedDrift, committedProgress);
  const taskCursor = auditTaskCursor(options, stopReasons);

  return {
    status: stopReasons.length === 0 ? "ready" : "stop",
    ready: stopReasons.length === 0,
    stopReasons,
    explainedDrift,
    loadSetAudit,
    locus,
    locusHint,
    dirtyFiles,
    taskCursor,
  };
}

function auditRepoRoot(
  options: AuditRecoveryStateOptions,
  stopReasons: RecoveryAuditStopReason[],
): void {
  if (options.freshRepoRoot === options.seed.repoRoot) return;
  stopReasons.push({
    kind: "repo-root-mismatch",
    message: "compaction seed was emitted for a different repository root",
    detail: { expected: options.seed.repoRoot, actual: options.freshRepoRoot },
  });
}

function auditLocusHint(
  options: AuditRecoveryStateOptions,
  stopReasons: RecoveryAuditStopReason[],
): RecoveryAuditLocusHint {
  const expected = options.seed.locus ?? null;
  if (!options.recover.locusState.ok) {
    stopReasons.push({
      kind: "locus-unresolved",
      message: options.recover.locusState.error.message,
      detail: options.recover.locusState.error,
    });
    return { expected, actual: null, match: false };
  }
  if (!options.recover.recoveryFrame.ok) {
    stopReasons.push({
      kind: "locus-unresolved",
      message: options.recover.recoveryFrame.error.message,
      detail: options.recover.recoveryFrame.error,
    });
    return { expected, actual: null, match: false };
  }

  // An `unavailable` disposition binds in neither direction: the producer could
  // not establish its own generation, so no fresh state proves correspondence.
  if (expected === null && options.seed.locusAbsence === "unavailable") {
    stopReasons.push({
      kind: "seed-locus-unavailable",
      message: "compaction seed recorded that its session locus generation could not be established",
    });
    return { expected: null, actual: null, match: false };
  }

  const state = options.recover.locusState.value;
  const frame = options.recover.recoveryFrame.value;
  if (frame.kind === "none") {
    if (state.current.kind !== "none" || expected !== null) {
      stopReasons.push({
        kind: "locus-unresolved",
        message: expected === null
          ? "fresh recovery frame does not match the current session locus verdict"
          : "seed session locus hint has no fresh current session locus",
        detail: { expected, current: state.current, frame },
      });
      return { expected, actual: null, match: false };
    }
    return { expected: null, actual: null, match: true };
  }

  if (state.current.kind === "none") {
    const rows = state.roster.rows.filter((row) => row.recordId === frame.activeRecordId);
    if (
      expected === null
      && frame.parentRecordId === null
      && rows.length === 1
      && rows[0] !== undefined
      && isIdleWorkUnitRow(rows[0])
    ) {
      return { expected: null, actual: null, match: true };
    }
    stopReasons.push({
      kind: "locus-unresolved",
      message: "fresh recovery frame does not match the current checkout role",
      detail: { expected, current: state.current, frame },
    });
    return { expected, actual: null, match: false };
  }

  if (
    state.current.kind !== "resolved"
    || frame.activeRecordId !== state.current.activeRecordId
    || frame.parentRecordId !== state.current.parentRecordId
  ) {
    stopReasons.push({
      kind: "locus-unresolved",
      message: "fresh recovery frame does not match the current session locus verdict",
      detail: { current: state.current, frame },
    });
    return { expected, actual: null, match: false };
  }

  const actual = deriveCompactionSeedLocusHint({ ok: true, value: state });
  if (actual === null) {
    stopReasons.push({
      kind: "locus-unresolved",
      message: "fresh current session locus does not resolve one live record and lease generation",
      detail: { current: state.current },
    });
    return { expected, actual: null, match: false };
  }
  if (expected === null) {
    // A producer that recorded `none` positively attested there was no generation,
    // so one that is live now is a state change the seed cannot vouch for. Only a
    // pre-model seed, which recorded no disposition at all, keeps the permissive read.
    if (options.seed.locusAbsence === "none") {
      stopReasons.push({
        kind: "locus-hint-mismatch",
        message: "compaction seed recorded no current session locus generation, but one is live now",
        detail: { expected: null, actual },
      });
      return { expected: null, actual, match: false };
    }
    return { expected: null, actual, match: true };
  }

  const mismatchedFields = COMPACTION_SEED_LOCUS_HINT_FIELDS
    .filter((field) => expected[field] !== actual[field]);
  if (mismatchedFields.length > 0) {
    stopReasons.push({
      kind: "locus-hint-mismatch",
      message: "fresh session locus generation differs from the compaction seed hint",
      detail: { expected, actual, mismatchedFields },
    });
    return { expected, actual, match: false };
  }
  return { expected, actual, match: true };
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

  let verdict = auditLoadSetManifest({
    baseline: options.seed.loadSet,
    fresh: options.recover.loadSet.value,
  });
  if (verdict.diverged) {
    const compatibilityWorkflowPath = recoveryCompatibilityWorkflowPath(options);
    const compatibilityLoadSet = compatibilityWorkflowPath === null
      ? null
      : withoutTrailingFullWorkflow(options.recover.loadSet.value, compatibilityWorkflowPath);
    if (compatibilityLoadSet !== null) {
      verdict = auditLoadSetManifest({ baseline: options.seed.loadSet, fresh: compatibilityLoadSet });
    }
  }
  if (verdict.diverged) {
    stopReasons.push({
      kind: "load-set-drift",
      message: "fresh recovery load-set diverges from the compaction seed baseline",
      detail: verdict.diff,
    });
  }
  return verdict;
}

function recoveryCompatibilityWorkflowPath(options: AuditRecoveryStateOptions): string | null {
  if (!options.recover.recoveryFrame.ok) return null;
  const frame = options.recover.recoveryFrame.value;
  if (frame.kind !== "resolved"
    || options.seed.locus !== undefined
    || options.seed.locusAbsence !== undefined
    || !options.recover.locusState.ok) return null;

  const state = options.recover.locusState.value;
  if (state.current.kind !== "resolved"
    || state.current.activeRecordId !== frame.activeRecordId
    || state.current.parentRecordId !== frame.parentRecordId) return null;
  const rows = state.roster.rows.filter((row) => row.recordId === frame.activeRecordId);
  const row = rows.length === 1 ? rows[0] : undefined;
  if (row === undefined
    || row.kind !== "managed-role"
    || row.frame !== "active"
    || row.lease?.state !== "live"
    || row.role === null
    || row.diagnostics.length > 0) return null;

  const workflow = row.role.kind === "errand"
    ? { name: "run-errand", path: RUN_ERRAND_WORKFLOW_PATH }
    : row.role.kind === "groom"
      ? { name: "draft-design", path: DRAFT_DESIGN_WORKFLOW_PATH }
      : row.role.kind === "housekeep"
        ? { name: "drain-inbox", path: DRAIN_INBOX_WORKFLOW_PATH }
        : null;
  return workflow !== null && frame.workflow === workflow.name ? workflow.path : null;
}

function withoutTrailingFullWorkflow(
  loadSet: LoadSetManifest,
  workflowPath: string,
): LoadSetManifest | null {
  const last = loadSet.entries.at(-1);
  if (last?.path !== workflowPath
    || last.readMode.kind !== "full") return null;
  return { manifestVersion: loadSet.manifestVersion, entries: loadSet.entries.slice(0, -1) };
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

function requiresTaskCursor(options: AuditRecoveryStateOptions): boolean {
  const freshSessionType = options.recover.recoveryFrame.ok
    && options.recover.recoveryFrame.value.kind !== "none"
    ? options.recover.recoveryFrame.value.sessionType
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
