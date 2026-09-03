/** Exact recovery projection for forward correction substages inside public integration. */

import type { Probe } from "../../commands/status/types.js";
import type { CompactionSeed } from "../compaction-seed/schema.js";
import { auditLoadSetManifest } from "../load-set/audit.js";
import type { LoadSetManifest } from "../load-set/types.js";
import type { DerivedLocusFrame } from "../locus/derived-reader.js";
import type { SubjectMetaProjection } from "../locus/subject-meta.js";
import {
  resolveTaskListCursor,
  type TaskListCursor,
} from "../task-list/cursor.js";
import type { TaskListCursorFileResult } from "../task-list/file-cursor.js";
import {
  scanTaskListStructure,
  type TaskListStructureEvent,
  type TaskMarker,
} from "../task-list/scanner.js";
import type { RecoveryLocusFrame } from "./locus-context.js";

const PROCESS_WORKFLOW = ".arc/system/workflows/arc/process-task-loop.md";
const VERIFY_WORKFLOW = ".arc/system/workflows/arc/work-unit-lifecycle/verify-work-unit.md";
const INTEGRATE_WORKFLOW = ".arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md";

/** Closed integration-correction progressions admitted by recovery. */
export type IntegrationCorrectionTransition =
  | "public-to-task"
  | "task-to-task"
  | "task-to-verification"
  | "task-to-continuation"
  | "verification-to-public";

/** Task-list snapshots used to prove a candidate recovery progression structurally. */
export type RecoveryTaskListEvidence =
  | { readonly status: "ok"; readonly seed: string | null; readonly fresh: string }
  | { readonly status: "unavailable"; readonly message: string };

/** Checkout-bound task-list evidence resolver. */
export type RecoveryTaskListEvidenceResolver = (
  taskListPath: string,
) => Promise<RecoveryTaskListEvidence>;

/** Recovery projections consumed jointly by load-set and cursor auditing. */
export type IntegrationCorrectionProjection =
  | { readonly status: "not-applicable" }
  | { readonly status: "refused"; readonly message: string }
  | {
      readonly status: "accepted";
      readonly transition: IntegrationCorrectionTransition;
      readonly workUnit: string;
      readonly taskListPath: string;
      readonly projectedLoadSet: LoadSetManifest;
      readonly taskCursor: {
        readonly expected: TaskListCursor | null;
        readonly actual: TaskListCursorFileResult;
      } | null;
    };

interface IntegrationCorrectionInput {
  readonly seed: CompactionSeed;
  readonly derivedLocusState: Probe<DerivedLocusFrame>;
  readonly recoveryFrame: Probe<RecoveryLocusFrame>;
  readonly loadSet: Probe<LoadSetManifest>;
  readonly taskCursor?: Probe<TaskListCursorFileResult>;
  readonly resolveTaskListEvidence?: RecoveryTaskListEvidenceResolver;
}

interface ExactIntegrationContext {
  readonly workUnit: string;
  readonly context: Extract<SubjectMetaProjection, { kind: "resolved" }>;
  readonly taskListPath: string;
  readonly actualCursor: TaskListCursorFileResult;
}

interface StructuralTask {
  readonly kind: "parent" | "subtask";
  readonly id: string;
  readonly title: string;
  readonly marker: TaskMarker;
  readonly line: number;
  readonly parentId: string;
}

/**
 * Project one exact integration-correction recovery progression or refuse its incomplete shape.
 *
 * @param input - Seed state, fresh recovery projections, and checkout-bound task evidence.
 * @returns The accepted coupled projections, an exact refusal, or a not-applicable result.
 */
export async function projectIntegrationCorrectionRecovery(
  input: IntegrationCorrectionInput,
): Promise<IntegrationCorrectionProjection> {
  const candidate = candidateTransition(input);
  if (candidate === null) return { status: "not-applicable" };
  const exact = exactIntegrationContext(input);
  if (exact === null) {
    return { status: "refused", message: "integration correction changed work-unit or entering-checkout context" };
  }

  if (candidate === "verification-to-public") {
    const boundary = exact.context.integrationBoundary;
    if (boundary?.locus !== "hosted-review-pending"
      || boundary.workUnit !== exact.workUnit
      || boundary.reservation.target.kind !== "delivery"
      || boundary.reservation.target.workUnitId !== exact.workUnit
      || boundary.deliveryContinuation === undefined
      || boundary.deliveryContinuation.planId !== boundary.reservation.target.planId) {
      return {
        status: "refused",
        message: "verification did not resolve to the exact Candidate-bound delivery continuation",
      };
    }
    const projectedLoadSet = replaceWorkflow(input.seed.loadSet, VERIFY_WORKFLOW, INTEGRATE_WORKFLOW);
    return projectedLoadSet === null
      ? { status: "refused", message: "verification seed load set is not the canonical integration projection" }
      : accepted(input, candidate, exact, projectedLoadSet, null);
  }

  const evidence = await resolveEvidence(input, exact.taskListPath);
  if (evidence.status === "unavailable") return { status: "refused", message: evidence.message };

  if (candidate === "public-to-task") {
    if (input.seed.uncommittedFiles.includes(exact.taskListPath)
      || evidence.seed === null
      || !provesAppendedCorrection(evidence.seed, evidence.fresh, exact.actualCursor)) {
      return { status: "refused", message: "fresh correction cursor is not a conserved appended task" };
    }
    const projectedLoadSet = enterTaskLoadSet(input.seed.loadSet, exact.taskListPath);
    return projectedLoadSet === null
      ? { status: "refused", message: "public integration seed load set is not the canonical task-entry baseline" }
      : accepted(input, candidate, exact, projectedLoadSet, {
          expected: input.seed.taskCursor,
          actual: exact.actualCursor,
        });
  }

  if (evidence.seed === null) {
    return { status: "refused", message: "seed task-list structure evidence is unavailable" };
  }
  if (!provesConservedTaskStructure(input.seed.taskCursor, evidence.seed, evidence.fresh)) {
    return {
      status: "refused",
      message: "seed task-list structure was not conserved outside the active correction closure",
    };
  }
  if (!provesClosedSeedCursor(input.seed.taskCursor, evidence.fresh, exact.actualCursor, candidate)) {
    return { status: "refused", message: "seed task was deleted, substituted, reopened, or did not advance" };
  }
  const projectedLoadSet = candidate === "task-to-task"
    ? input.seed.loadSet
    : candidate === "task-to-verification"
      ? leaveTaskForVerification(input.seed.loadSet, exact.taskListPath)
      : leaveTaskForContinuation(input.seed.loadSet, exact.taskListPath);
  return projectedLoadSet === null
    ? { status: "refused", message: "task seed load set is not the canonical verification baseline" }
    : accepted(input, candidate, exact, projectedLoadSet, {
        expected: input.seed.taskCursor,
        actual: exact.actualCursor,
      });
}

function candidateTransition(input: IntegrationCorrectionInput): IntegrationCorrectionTransition | null {
  if (input.seed.sessionType !== "integration" || !input.recoveryFrame.ok
    || input.recoveryFrame.value.kind !== "resolved"
    || input.recoveryFrame.value.sessionType !== "integration") return null;
  const before = input.seed.currentWorkflow;
  const after = input.recoveryFrame.value.workflow;
  const actual = input.taskCursor?.ok ? input.taskCursor.value : null;
  if (before === "integrate-work-unit" && after === "process-task-loop"
    && input.seed.taskCursor === null && actual?.status === "found") return "public-to-task";
  if (before === "process-task-loop" && after === "process-task-loop"
    && input.seed.taskCursor !== null && actual?.status === "found"
    && !cursorEqual(input.seed.taskCursor, actual.cursor)) return "task-to-task";
  if (before === "process-task-loop" && after === "verify-work-unit"
    && input.seed.taskCursor !== null && actual?.status === "no-open-task") return "task-to-verification";
  if (before === "process-task-loop" && after === "integrate-work-unit"
    && input.seed.taskCursor !== null && actual?.status === "no-open-task") return "task-to-continuation";
  if (before === "verify-work-unit" && after === "integrate-work-unit"
    && input.seed.taskCursor === null && actual?.status === "no-open-task") return "verification-to-public";
  return null;
}

function exactIntegrationContext(input: IntegrationCorrectionInput): ExactIntegrationContext | null {
  const workUnit = input.seed.activeWorkUnit;
  if (workUnit === null || !input.derivedLocusState.ok || !input.recoveryFrame.ok
    || input.recoveryFrame.value.kind !== "resolved"
    || input.recoveryFrame.value.subject.kind !== "work-unit"
    || input.recoveryFrame.value.subject.key !== workUnit
    || input.recoveryFrame.value.checkoutPath !== input.seed.locus.checkoutPath
    || input.recoveryFrame.value.parentCheckoutPath !== input.seed.locus.parentCheckoutPath) return null;
  const entering = input.derivedLocusState.value.entering;
  if (entering.kind !== "selected" || entering.row.kind !== "work-unit"
    || entering.row.checkout.path !== input.seed.locus.checkoutPath
    || entering.row.parentCheckoutPath !== input.seed.locus.parentCheckoutPath
    || entering.row.subject.kind !== "work-unit" || entering.row.subject.key !== workUnit
    || entering.row.lifecycleLocation !== "active" || entering.row.context === null
    || entering.row.context.sessionType !== "integration"
    || entering.row.context.workflow !== input.recoveryFrame.value.workflow
    || entering.row.context.metaPath !== input.seed.metaPath
    || entering.row.context.taskListPath === null
    || entering.row.context.taskCursor === null
    || (candidateTransition(input) === "task-to-continuation"
      && entering.row.context.workUnitStage !== "delivery-correction")
    || !input.taskCursor?.ok
    || !taskCursorResultEqual(entering.row.context.taskCursor, input.taskCursor.value)
    || !input.loadSet.ok
    || auditLoadSetManifest({
      baseline: entering.row.context.loadSet,
      fresh: input.loadSet.value,
    }).diverged) return null;
  return {
    workUnit,
    context: entering.row.context,
    taskListPath: entering.row.context.taskListPath,
    actualCursor: input.taskCursor.value,
  };
}

async function resolveEvidence(
  input: IntegrationCorrectionInput,
  taskListPath: string,
): Promise<RecoveryTaskListEvidence> {
  if (input.resolveTaskListEvidence === undefined) {
    return { status: "unavailable", message: "task-list progression evidence resolver is unavailable" };
  }
  try {
    return await input.resolveTaskListEvidence(taskListPath);
  } catch (error) {
    return {
      status: "unavailable",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

function accepted(
  input: IntegrationCorrectionInput,
  transition: IntegrationCorrectionTransition,
  exact: ExactIntegrationContext,
  projectedLoadSet: LoadSetManifest,
  taskCursor: Extract<IntegrationCorrectionProjection, { status: "accepted" }>["taskCursor"],
): IntegrationCorrectionProjection {
  if (!input.loadSet.ok || auditLoadSetManifest({
    baseline: projectedLoadSet,
    fresh: input.loadSet.value,
  }).diverged) {
    return {
      status: "refused",
      message: "integration correction load set contains unrelated drift",
    };
  }
  return {
    status: "accepted",
    transition,
    workUnit: exact.workUnit,
    taskListPath: exact.taskListPath,
    projectedLoadSet,
    taskCursor,
  };
}

function enterTaskLoadSet(seed: LoadSetManifest, taskListPath: string): LoadSetManifest | null {
  if (seed.entries.some((entry) => entry.readMode.kind === "partial-strategic")) return null;
  return replaceExactEntry(seed, INTEGRATE_WORKFLOW, [
    { path: taskListPath, readMode: { kind: "partial-strategic" } },
    { path: PROCESS_WORKFLOW, readMode: { kind: "full" } },
  ]);
}

function leaveTaskForVerification(seed: LoadSetManifest, taskListPath: string): LoadSetManifest | null {
  const partial = seed.entries.filter((entry) => entry.readMode.kind === "partial-strategic");
  if (partial.length !== 1 || partial[0]?.path !== taskListPath) return null;
  const withoutTask = {
    manifestVersion: seed.manifestVersion,
    entries: seed.entries.filter((entry) => entry !== partial[0]),
  };
  return replaceWorkflow(withoutTask, PROCESS_WORKFLOW, VERIFY_WORKFLOW);
}

function leaveTaskForContinuation(seed: LoadSetManifest, taskListPath: string): LoadSetManifest | null {
  const partial = seed.entries.filter((entry) => entry.readMode.kind === "partial-strategic");
  if (partial.length !== 1 || partial[0]?.path !== taskListPath) return null;
  const withoutTask = {
    manifestVersion: seed.manifestVersion,
    entries: seed.entries.filter((entry) => entry !== partial[0]),
  };
  return replaceWorkflow(withoutTask, PROCESS_WORKFLOW, INTEGRATE_WORKFLOW);
}

function replaceWorkflow(seed: LoadSetManifest, before: string, after: string): LoadSetManifest | null {
  return replaceExactEntry(seed, before, [{ path: after, readMode: { kind: "full" } }]);
}

function replaceExactEntry(
  seed: LoadSetManifest,
  path: string,
  replacement: LoadSetManifest["entries"],
): LoadSetManifest | null {
  const matches = seed.entries.filter((entry) => entry.path === path && entry.readMode.kind === "full");
  if (matches.length !== 1) return null;
  return {
    manifestVersion: seed.manifestVersion,
    entries: seed.entries.flatMap((entry) => entry === matches[0] ? replacement : [entry]),
  };
}

function provesAppendedCorrection(
  seedContent: string,
  freshContent: string,
  actual: TaskListCursorFileResult,
): boolean {
  const seedCursor = resolveTaskListCursor(seedContent);
  const freshCursor = resolveTaskListCursor(freshContent);
  if (seedCursor.status !== "no-open-task" || freshCursor.status !== "found"
    || actual.status !== "found" || !cursorEqual(freshCursor.cursor, actual.cursor)) return false;
  const oldTasks = structuralTasks(seedContent);
  const newTasks = structuralTasks(freshContent);
  if (oldTasks === null || newTasks === null) return false;
  const oldById = uniqueTasks(oldTasks);
  const newById = uniqueTasks(newTasks);
  if (oldById === null || newById === null || oldById.has(actual.cursor.leaf.id)) return false;
  const conserved = oldTasks.map((task) => newById.get(task.id));
  if (conserved.some((task) => task === undefined)) return false;
  const conservedTasks = conserved.filter((task): task is StructuralTask => task !== undefined);
  if (!strictlyIncreasing(conservedTasks.map((task) => task.line))) return false;
  for (const oldTask of oldTasks) {
    const freshTask = newById.get(oldTask.id);
    if (freshTask === undefined || freshTask.kind !== oldTask.kind || freshTask.title !== oldTask.title
      || freshTask.parentId !== oldTask.parentId) return false;
    const allowedParentReopen = oldTask.kind === "parent"
      && oldTask.id === actual.cursor.section.id
      && oldTask.marker === "x"
      && freshTask.marker === " ";
    if (freshTask.marker !== oldTask.marker && !allowedParentReopen) return false;
  }
  const appended = newTasks.filter((task) => !oldById.has(task.id));
  const freshLeaf = newById.get(actual.cursor.leaf.id);
  return freshLeaf !== undefined
    && appended[0]?.id === freshLeaf.id
    && freshLeaf.parentId === actual.cursor.section.id;
}

function provesClosedSeedCursor(
  expected: TaskListCursor | null,
  freshContent: string,
  actual: TaskListCursorFileResult,
  transition: "task-to-task" | "task-to-verification" | "task-to-continuation",
): boolean {
  if (expected === null) return false;
  const tasks = structuralTasks(freshContent);
  const projected = resolveTaskListCursor(freshContent);
  if (tasks === null || !taskCursorResultEqual(projected, actual)) return false;
  const byId = uniqueTasks(tasks);
  if (byId === null) return false;
  const section = byId.get(expected.section.id);
  const leaf = byId.get(expected.leaf.id);
  if (section?.kind !== "parent" || section.title !== expected.section.title
    || leaf === undefined || leaf.title !== expected.leaf.title || leaf.marker !== "x"
    || leaf.parentId !== expected.section.id) return false;
  if (transition === "task-to-verification" || transition === "task-to-continuation") {
    return actual.status === "no-open-task";
  }
  if (actual.status !== "found") return false;
  const next = byId.get(actual.cursor.leaf.id);
  return next !== undefined && next.line > leaf.line;
}

function provesConservedTaskStructure(
  expected: TaskListCursor | null,
  seedContent: string,
  freshContent: string,
): boolean {
  if (expected === null) return false;
  const seedTasks = structuralTasks(seedContent);
  const freshTasks = structuralTasks(freshContent);
  if (seedTasks === null || freshTasks === null) return false;
  const seedById = uniqueTasks(seedTasks);
  const freshById = uniqueTasks(freshTasks);
  if (seedById === null || freshById === null) return false;
  const seedSection = seedById.get(expected.section.id);
  const seedLeaf = seedById.get(expected.leaf.id);
  const freshSection = freshById.get(expected.section.id);
  const freshLeaf = freshById.get(expected.leaf.id);
  if (seedSection?.kind !== "parent" || seedSection.title !== expected.section.title
    || seedLeaf === undefined || seedLeaf.title !== expected.leaf.title || seedLeaf.marker !== " "
    || freshSection?.kind !== "parent" || freshLeaf === undefined || freshLeaf.marker !== "x") return false;

  const conserved = seedTasks.map((task) => freshById.get(task.id));
  if (conserved.some((task) => task === undefined)) return false;
  const conservedTasks = conserved.filter((task): task is StructuralTask => task !== undefined);
  if (!strictlyIncreasing(conservedTasks.map((task) => task.line))) return false;

  const parentCascadeAllowed = expected.section.id !== expected.leaf.id
    && seedSection.marker === " "
    && freshSection.marker === "x"
    && freshTasks.every((task) => task.kind !== "subtask"
      || task.parentId !== expected.section.id
      || task.marker !== " ");
  for (const seedTask of seedTasks) {
    const freshTask = freshById.get(seedTask.id);
    if (freshTask === undefined || freshTask.kind !== seedTask.kind
      || freshTask.title !== seedTask.title || freshTask.parentId !== seedTask.parentId) return false;
    if (freshTask.marker === seedTask.marker) continue;
    const activeLeafClosed = seedTask.id === expected.leaf.id
      && seedTask.marker === " "
      && freshTask.marker === "x";
    const parentCascadeClosed = seedTask.id === expected.section.id && parentCascadeAllowed;
    if (!activeLeafClosed && !parentCascadeClosed) return false;
  }

  return freshTasks.every((task) => seedById.has(task.id) || task.line > freshLeaf.line);
}

function structuralTasks(content: string): StructuralTask[] | null {
  const scan = scanTaskListStructure(content);
  if (scan.status === "malformed") return null;
  const tasks: StructuralTask[] = [];
  let parentId: string | null = null;
  for (const event of scan.events) {
    if (event.type === "parent") {
      parentId = event.item.id;
      tasks.push(fromEvent(event, parentId));
    } else if (event.type === "subtask" && parentId !== null) {
      tasks.push(fromEvent(event, parentId));
    } else if (event.type === "phase" || event.type === "section") {
      parentId = null;
    }
  }
  return tasks;
}

function fromEvent(
  event: Extract<TaskListStructureEvent, { type: "parent" | "subtask" }>,
  parentId: string,
): StructuralTask {
  return {
    kind: event.type,
    id: event.item.id,
    title: event.item.title,
    marker: event.marker,
    line: event.line,
    parentId,
  };
}

function uniqueTasks(tasks: readonly StructuralTask[]): Map<string, StructuralTask> | null {
  const result = new Map<string, StructuralTask>();
  for (const task of tasks) {
    if (result.has(task.id)) return null;
    result.set(task.id, task);
  }
  return result;
}

function strictlyIncreasing(values: readonly number[]): boolean {
  return values.every((value, index) => index === 0 || value > (values[index - 1] ?? value));
}

function taskCursorResultEqual(left: TaskListCursorFileResult, right: TaskListCursorFileResult): boolean {
  if (left.status !== right.status) return false;
  if (left.status === "found" && right.status === "found") return cursorEqual(left.cursor, right.cursor);
  if (left.status === "malformed" && right.status === "malformed") {
    return left.error.line === right.error.line && left.error.message === right.error.message;
  }
  if (left.status === "missing" && right.status === "missing") return left.path === right.path;
  return true;
}

function cursorEqual(left: TaskListCursor, right: TaskListCursor): boolean {
  return itemEqual(left.section, right.section) && itemEqual(left.leaf, right.leaf);
}

function itemEqual(left: TaskListCursor["section"], right: TaskListCursor["section"]): boolean {
  return left.id === right.id && left.title === right.title && left.lineHint === right.lineHint;
}
