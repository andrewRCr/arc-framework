/**
 * Deterministic recovery audit.
 *
 * Compares a compaction seed against freshly probed recovery state and returns
 * a structured ready/stop verdict. The audit restores ARC operating context; it
 * does not infer the volatile current action from stale meta fields.
 *
 * @module
 */
import { posix } from "node:path";
import { z } from "zod";

import type { Probe } from "../../commands/status/types.js";
import {
  COMPACTION_SEED_LOCUS_HINT_FIELDS,
  CompactionSeedLocusHintSchema,
  deriveCompactionSeedLocusHint,
  type CompactionSeed,
} from "../compaction-seed/schema.js";
import type { DirtyStateResult } from "../git/dirty-state.js";
import { resolveArcPath } from "../layout/index.js";
import {
  LoadSetAuditDiffSchema,
  LoadSetAuditVerdictSchema,
  LoadSetPathDriftSchema,
  auditLoadSetManifest,
  type LoadSetAuditVerdict,
} from "../load-set/audit.js";
import type { LoadSetManifest } from "../load-set/types.js";
import type { DerivedLocusFrame } from "../locus/derived-reader.js";
import type { RecoveryLocusFrame } from "./locus-context.js";
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
import {
  projectIntegrationCorrectionRecovery,
  type IntegrationCorrectionProjection,
  type RecoveryTaskListEvidenceResolver,
} from "./integration-correction.js";

/** Stop reason categories emitted by the recovery audit. */
export const RecoveryAuditStopKindSchema = z.enum([
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
  "repo-root-mismatch",
  "seed-invalid",
  "seed-locus-unresolved",
  "seed-missing",
  "seed-unreadable",
  "dirty-path-drift",
  "task-cursor-missing",
  "task-cursor-unresolved",
  "task-cursor-malformed",
  "task-cursor-mismatch",
  "integration-correction-unresolved",
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
  z.strictObject({
    kind: z.literal("load-set-archival-relocation"),
    message: z.string(),
    detail: z.strictObject({
      slug: z.string(),
      pathDrifts: z.array(LoadSetPathDriftSchema),
    }),
  }),
  z.strictObject({
    kind: z.literal("load-set-prepublication-projection"),
    message: z.string(),
    detail: z.strictObject({
      slug: z.string(),
      diff: LoadSetAuditDiffSchema,
    }),
  }),
  z.strictObject({
    kind: z.literal("integration-correction-progression"),
    message: z.string(),
    detail: z.strictObject({
      workUnit: z.string(),
      transition: z.enum([
        "public-to-task",
        "task-to-task",
        "task-to-verification",
        "task-to-continuation",
        "verification-to-public",
      ]),
    }),
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

/** Required checkout-local seed hint compared with fresh reader authority. */
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
  derivedLocusState: Probe<DerivedLocusFrame>;
  recoveryFrame: Probe<RecoveryLocusFrame>;
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
  /** Resolves exact seed/fresh task-list text in the recovery checkout. */
  resolveTaskListEvidence?: RecoveryTaskListEvidenceResolver;
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
  const integrationCorrection = await projectIntegrationCorrectionRecovery({
    seed: options.seed,
    derivedLocusState: options.recover.derivedLocusState,
    recoveryFrame: options.recover.recoveryFrame,
    loadSet: options.recover.loadSet,
    taskCursor: options.recover.taskCursor,
    resolveTaskListEvidence: options.resolveTaskListEvidence,
  });
  if (integrationCorrection.status === "refused") {
    stopReasons.push({
      kind: "integration-correction-unresolved",
      message: integrationCorrection.message,
    });
  } else if (integrationCorrection.status === "accepted") {
    explainedDrift.push({
      kind: "integration-correction-progression",
      message: "public integration advanced through one exact corrective substage",
      detail: {
        workUnit: integrationCorrection.workUnit,
        transition: integrationCorrection.transition,
      },
    });
  }
  auditRepoRoot(options, stopReasons);
  const locus = auditLocus(options, stopReasons, explainedDrift, committedProgress);
  const locusHint = auditLocusHint(options, stopReasons);
  const loadSetAudit = auditLoadSet(options, stopReasons, explainedDrift, integrationCorrection);
  const dirtyFiles = auditDirtyFiles(options, stopReasons, explainedDrift, committedProgress);
  const taskCursor = auditTaskCursor(options, stopReasons, integrationCorrection);

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
  const expected = options.seed.locus;
  if (!options.recover.derivedLocusState.ok) {
    stopReasons.push({
      kind: "locus-unresolved",
      message: options.recover.derivedLocusState.error.message,
      detail: options.recover.derivedLocusState.error,
    });
    return { expected, actual: null, match: false };
  }
  const actual = deriveCompactionSeedLocusHint({ ok: true, value: options.recover.derivedLocusState.value });
  if (actual === null) {
    stopReasons.push({
      kind: "locus-unresolved",
      message: "fresh entering checkout does not resolve recovery facts",
    });
    return { expected, actual: null, match: false };
  }
  const entering = options.recover.derivedLocusState.value.entering;
  if (entering.kind === "selected" && entering.row.kind === "unresolved-checkout") {
    stopReasons.push({
      kind: "locus-unresolved",
      message: `Entering checkout facts remain unresolved: ${entering.row.checkout.path}`,
      detail: {
        checkoutPath: entering.row.checkout.path,
        diagnostics: entering.row.diagnostics,
      },
    });
    return { expected, actual, match: false };
  }
  if (!options.recover.recoveryFrame.ok) {
    stopReasons.push({
      kind: "locus-unresolved",
      message: options.recover.recoveryFrame.error.message,
      detail: options.recover.recoveryFrame.error,
    });
    return { expected, actual, match: false };
  }

  const frame = options.recover.recoveryFrame.value;

  if (frame.checkoutPath !== actual.checkoutPath
    || frame.parentCheckoutPath !== actual.parentCheckoutPath) {
    stopReasons.push({
      kind: "locus-unresolved",
      message: "fresh recovery frame does not match the entering checkout facts",
      detail: { actual, frame },
    });
    return { expected, actual, match: false };
  }

  const mismatchedFields = COMPACTION_SEED_LOCUS_HINT_FIELDS
    .filter((field) => expected[field] !== actual[field]);
  if (mismatchedFields.length > 0) {
    stopReasons.push({
      kind: "locus-hint-mismatch",
      message: "fresh checkout-local recovery facts differ from the compaction seed hint",
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
  explainedDrift: RecoveryAuditExplainedDrift[],
  integrationCorrection: IntegrationCorrectionProjection,
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
  const archivalRelocation = archivedIntegrationRelocation(options, verdict);
  const prepublicationProjection = candidatePrepublicationProjection(options, verdict);
  if (verdict.diverged && archivalRelocation === null && prepublicationProjection === null
    && integrationCorrection.status !== "accepted") {
    stopReasons.push({
      kind: "load-set-drift",
      message: "fresh recovery load-set diverges from the compaction seed baseline",
      detail: verdict.diff,
    });
  } else if (archivalRelocation !== null) {
    explainedDrift.push({
      kind: "load-set-archival-relocation",
      message: "the integrating work unit's exact meta moved from active to its completed archive",
      detail: archivalRelocation,
    });
  } else if (prepublicationProjection !== null) {
    explainedDrift.push({
      kind: "load-set-prepublication-projection",
      message: "the Candidate boundary replaced the old execution recovery context with prepublication",
      detail: prepublicationProjection,
    });
  }
  return verdict;
}

function candidatePrepublicationProjection(
  options: AuditRecoveryStateOptions,
  verdict: LoadSetAuditVerdict,
): { slug: string; diff: LoadSetAuditVerdict["diff"] } | null {
  const slug = options.seed.activeWorkUnit;
  if (slug === null
    || options.seed.sessionType !== "execution"
    || options.seed.currentWorkflow !== "verify-work-unit"
    || options.seed.taskCursor !== null
    || !verdict.diverged
    || !options.recover.loadSet.ok
    || !options.recover.recoveryFrame.ok
    || !options.recover.derivedLocusState.ok) return null;
  const recoveryFrame = options.recover.recoveryFrame.value;
  const entering = options.recover.derivedLocusState.value.entering;
  if (recoveryFrame.kind !== "resolved"
    || recoveryFrame.subject.kind !== "work-unit"
    || recoveryFrame.subject.key !== slug
    || recoveryFrame.sessionType !== "prepublication"
    || recoveryFrame.workflow !== "prepare-work-unit"
    || entering.kind !== "selected"
    || entering.row.kind !== "work-unit"
    || entering.row.subject.kind !== "work-unit"
    || entering.row.subject.key !== slug
    || entering.row.lifecycleLocation !== "active"
    || entering.row.context === null
    || entering.row.context.integrationBoundary === null
    || entering.row.context.taskCursor?.status !== "no-open-task") return null;

  const workflowRoot = resolveArcPath({ kind: "procedure-root", family: "workflows" });
  const verifyPath = posix.join(workflowRoot, "arc/work-unit-lifecycle/verify-work-unit.md");
  const preparePath = posix.join(workflowRoot, "arc/work-unit-lifecycle/prepare-work-unit.md");
  if (options.seed.loadSet.entries.some((entry) => entry.readMode.kind === "partial-strategic")
    || options.seed.loadSet.entries.filter((entry) => entry.path === verifyPath).length !== 1) return null;
  const projected = {
    manifestVersion: options.seed.loadSet.manifestVersion,
    entries: options.seed.loadSet.entries.flatMap((entry) => {
      if (entry.path === verifyPath) return [{ path: preparePath, readMode: { kind: "full" as const } }];
      return [entry];
    }),
  };
  if (auditLoadSetManifest({ baseline: projected, fresh: options.recover.loadSet.value }).diverged) return null;
  return { slug, diff: verdict.diff };
}

function archivedIntegrationRelocation(
  options: AuditRecoveryStateOptions,
  verdict: LoadSetAuditVerdict,
): { slug: string; pathDrifts: LoadSetAuditVerdict["diff"]["pathDrifts"] } | null {
  const slug = options.seed.activeWorkUnit;
  if (slug === null || options.seed.sessionType !== "integration" || !verdict.diverged) return null;
  if (!options.recover.recoveryFrame.ok) return null;
  const recoveryFrame = options.recover.recoveryFrame.value;
  if (recoveryFrame.kind !== "resolved"
    || recoveryFrame.subject.kind !== "work-unit"
    || recoveryFrame.subject.key !== slug
    || recoveryFrame.sessionType !== "integration"
    || recoveryFrame.workflow !== "integrate-work-unit") return null;
  if (!options.recover.derivedLocusState.ok) return null;
  const entering = options.recover.derivedLocusState.value.entering;
  if (entering.kind !== "selected"
    || entering.row.kind !== "work-unit"
    || entering.row.subject.kind !== "work-unit"
    || entering.row.subject.key !== slug
    || entering.row.lifecycleLocation !== "completed"
    || entering.row.context === null) return null;

  const diff = verdict.diff;
  if (diff.manifestVersion !== null
    || diff.membership.added.length > 0
    || diff.membership.removed.length > 0
    || diff.readModeChanges.length > 0
    || diff.pathDrifts.length !== 1) return null;
  const drift = diff.pathDrifts[0];
  if (drift === undefined) return null;
  const expected = `.arc/active/meta-${slug}.md`;
  const escapedSlug = slug.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const actualPattern = new RegExp(
    `^\\.arc/completed/[^/]+/\\d+_${escapedSlug}/meta-${escapedSlug}\\.md$`,
    "u",
  );
  if (options.seed.metaPath !== expected
    || drift.expected.path !== expected
    || !actualPattern.test(drift.actual.path)
    || entering.row.context.metaPath !== drift.actual.path
    || drift.expected.readMode.kind !== "full"
    || drift.actual.readMode.kind !== "full") return null;
  return { slug, pathDrifts: diff.pathDrifts };
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
  integrationCorrection: IntegrationCorrectionProjection,
): RecoveryAuditTaskCursor | null {
  if (integrationCorrection.status === "accepted" && integrationCorrection.taskCursor !== null) {
    return { ...integrationCorrection.taskCursor, match: true };
  }
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
  const freshCursor = options.recover.taskCursor;
  if (options.seed.sessionType === "execution"
    && options.seed.currentWorkflow === "verify-work-unit"
    && options.seed.taskCursor === null
    && freshSessionType === "execution"
    && options.recover.recoveryFrame.ok
    && options.recover.recoveryFrame.value.kind !== "none"
    && options.recover.recoveryFrame.value.workflow === "verify-work-unit"
    && freshCursor?.ok
    && freshCursor.value.status === "no-open-task") return false;
  if (freshSessionType === "prepublication"
    && options.seed.taskCursor === null
    && freshCursor?.ok
    && freshCursor.value.status === "no-open-task") return false;
  if (
    options.seed.sessionType === "execution"
    || freshSessionType === "execution"
    || options.seed.taskCursor !== null
  ) {
    return true;
  }
  if (freshSessionType === "planning") return false;

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
