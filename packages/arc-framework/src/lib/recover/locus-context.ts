/** Recovery projection from one exact entering-checkout frame. */

import { z } from "zod";

import { resolveLoadSetManifest } from "../load-set/projection.js";
import type { LoadSetManifest } from "../load-set/types.js";
import type { DerivedCheckoutRow } from "../locus/derived-roster.js";
import type { DerivedLocusFrame } from "../locus/derived-reader.js";
import type { DerivedCheckoutSubject } from "../locus/role-derivation.js";
import {
  LocusAbsolutePathSchema,
  LocusOpaqueTextSchema,
  LocusTokenSchema,
} from "../locus/schema/index.js";
import type { TaskListCursorFileResult } from "../task-list/file-cursor.js";

/** Recovery workflow loaded for Errand sessions. */
export const RUN_ERRAND_WORKFLOW_PATH = ".arc/system/workflows/arc/supplemental/run-errand.md";

/** Recovery workflow loaded for planning-groom sessions. */
export const DRAFT_DESIGN_WORKFLOW_PATH = ".arc/system/workflows/arc/draft-design.md";

/** Recovery workflow loaded for housekeeping sessions. */
export const DRAIN_INBOX_WORKFLOW_PATH = ".arc/system/workflows/arc/supplemental/drain-inbox.md";

const WorkUnitSubjectSchema = z.strictObject({
  kind: z.literal("work-unit"),
  key: LocusOpaqueTextSchema,
});

const TransientSubjectSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("partial-errand"), key: LocusOpaqueTextSchema, claimId: z.null() }),
  z.strictObject({
    kind: z.enum(["errand", "groom", "housekeep"]),
    key: LocusOpaqueTextSchema,
    claimId: LocusTokenSchema,
  }),
]);

const RecoverySubjectSchema = z.union([WorkUnitSubjectSchema, TransientSubjectSchema]);

/** Deterministic recovery frame selected from the exact entering checkout. */
export const RecoveryLocusFrameSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("none"),
    subject: z.null(),
    checkoutPath: LocusAbsolutePathSchema,
    parentCheckoutPath: z.null(),
    workflow: z.null(),
    sessionType: z.null(),
  }),
  z.strictObject({
    kind: z.literal("resolved"),
    subject: RecoverySubjectSchema,
    checkoutPath: LocusAbsolutePathSchema,
    parentCheckoutPath: LocusAbsolutePathSchema.nullable(),
    workflow: LocusOpaqueTextSchema,
    sessionType: z.enum(["planning", "execution", "integration"]).nullable(),
  }),
]);

export type RecoveryLocusFrame = z.infer<typeof RecoveryLocusFrameSchema>;

/** Internal projection consumed by the recover envelope composer. */
export interface RecoveryLocusContext {
  frame: RecoveryLocusFrame;
  loadSet: LoadSetManifest;
  taskCursor: TaskListCursorFileResult | null;
}

/** Fail-closed error raised when the entering checkout cannot establish its role. */
export class RecoveryLocusContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecoveryLocusContextError";
  }
}

/**
 * Derive recovery workflow and context from the shared entering-checkout frame.
 *
 * @param options - Fresh derived frame plus identity-global context pointers
 * @returns The selected recovery frame, ordered load set, and task cursor
 */
export function deriveRecoveryLocusContext(options: {
  state: DerivedLocusFrame;
  identity: string | null;
  workingMemoryPath: string | null;
}): RecoveryLocusContext {
  const entering = options.state.entering;
  if (entering.kind === "unresolved") {
    throw new RecoveryLocusContextError(`Entering checkout is unresolved: ${entering.checkoutPath}`);
  }
  const row = entering.row;
  if (row.kind === "unresolved-checkout") {
    throw new RecoveryLocusContextError(`Entering checkout facts are unresolved: ${row.checkout.path}`);
  }
  if (row.kind === "work-unit" && row.subject.kind === "work-unit") {
    return workUnitContext(row, row.subject);
  }
  if (row.kind === "transient" && row.subject.kind !== "work-unit") {
    return transientContext(options, row, row.subject);
  }
  return {
    frame: RecoveryLocusFrameSchema.parse({
      kind: "none",
      subject: null,
      checkoutPath: row.checkout.path,
      parentCheckoutPath: null,
      workflow: null,
      sessionType: null,
    }),
    loadSet: baseLoadSet(options),
    taskCursor: null,
  };
}

function workUnitContext(
  row: DerivedCheckoutRow,
  subject: Extract<DerivedCheckoutSubject, { kind: "work-unit" }>,
): RecoveryLocusContext {
  const context = requireWorkUnitContext(row, "entering");
  return {
    frame: RecoveryLocusFrameSchema.parse({
      kind: "resolved",
      subject,
      checkoutPath: row.checkout.path,
      parentCheckoutPath: null,
      workflow: recoveryWorkflowForWorkUnit(context),
      sessionType: context.sessionType,
    }),
    loadSet: context.loadSet,
    taskCursor: context.taskCursor,
  };
}

function transientContext(
  options: { state: DerivedLocusFrame; identity: string | null; workingMemoryPath: string | null },
  row: DerivedCheckoutRow,
  subject: Exclude<DerivedCheckoutSubject, { kind: "work-unit" }>,
): RecoveryLocusContext {
  const parent = resolveParentWorkUnit(options.state.roster, row.parentCheckoutPath);
  const workflow = transientWorkflow(subject);
  return {
    frame: RecoveryLocusFrameSchema.parse({
      kind: "resolved",
      subject,
      checkoutPath: row.checkout.path,
      parentCheckoutPath: row.parentCheckoutPath,
      workflow: workflow.name,
      sessionType: parent?.sessionType ?? null,
    }),
    loadSet: appendRecoveryWorkflow(parent?.loadSet ?? baseLoadSet(options), workflow.path),
    taskCursor: parent?.taskCursor ?? null,
  };
}

function resolveParentWorkUnit(
  rows: readonly DerivedCheckoutRow[],
  parentCheckoutPath: string | null,
): (NonNullable<DerivedCheckoutRow["context"]> & { workflow: string }) | null {
  if (parentCheckoutPath === null) return null;
  const matches = rows.filter((row) => row.checkout.path === parentCheckoutPath);
  const parent = matches.length === 1 ? matches[0] : undefined;
  if (parent === undefined
    || parent.kind !== "work-unit"
    || parent.subject.kind !== "work-unit"
    || parent.diagnostics.length > 0
    || parent.context === null
    || parent.context.workflow === null) return null;
  return { ...parent.context, workflow: parent.context.workflow };
}

function requireWorkUnitContext(
  row: DerivedCheckoutRow,
  label: string,
): NonNullable<DerivedCheckoutRow["context"]> & { workflow: string } {
  if (row.context === null || row.context.workflow === null) {
    throw new RecoveryLocusContextError(`Selected ${label} work-unit projection is incomplete`);
  }
  return { ...row.context, workflow: row.context.workflow };
}

function recoveryWorkflowForWorkUnit(
  context: NonNullable<DerivedCheckoutRow["context"]> & { workflow: string },
): string {
  if (context.sessionType !== "planning") return context.workflow;
  if (context.stage === null) {
    throw new RecoveryLocusContextError("Selected planning work-unit projection has no stage");
  }
  return context.stage;
}

function transientWorkflow(
  subject: Exclude<DerivedCheckoutSubject, { kind: "work-unit" }>,
): { name: string; path: string } {
  switch (subject.kind) {
    case "errand":
    case "partial-errand":
      return { name: "run-errand", path: RUN_ERRAND_WORKFLOW_PATH };
    case "groom":
      return { name: "draft-design", path: DRAFT_DESIGN_WORKFLOW_PATH };
    case "housekeep":
      return { name: "drain-inbox", path: DRAIN_INBOX_WORKFLOW_PATH };
  }
}

function baseLoadSet(options: {
  identity: string | null;
  workingMemoryPath: string | null;
}): LoadSetManifest {
  return resolveLoadSetManifest({
    identity: options.identity,
    workingMemoryPath: options.workingMemoryPath,
    activeWorkUnit: null,
    metaPath: null,
    sessionType: null,
    planningStage: null,
    taskListPath: null,
    activeExtensions: [],
    cohortDocPath: null,
  });
}

/** Append one governing recovery workflow without duplicating an existing entry. */
export function appendRecoveryWorkflow(loadSet: LoadSetManifest, path: string): LoadSetManifest {
  if (loadSet.entries.some((entry) => entry.path === path)) return loadSet;
  return {
    manifestVersion: loadSet.manifestVersion,
    entries: [...loadSet.entries, { path, readMode: { kind: "full" } }],
  };
}
