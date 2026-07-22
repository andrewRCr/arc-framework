/** Recovery-frame projection from one reader-validated locus state. */

import { z } from "zod";

import { resolveLoadSetManifest } from "../load-set/projection.js";
import type { LoadSetManifest } from "../load-set/types.js";
import type { TaskListCursorFileResult } from "../task-list/file-cursor.js";
import {
  LocusDigestSchema,
  LocusOpaqueTextSchema,
  type LocusIdentityV1,
  type LocusRowV1,
  type LocusStateV1,
} from "../locus/schema/index.js";

const RecoveryLocusFrameResolvedSchema = z.strictObject({
  kind: z.literal("resolved"),
  workflow: LocusOpaqueTextSchema,
  sessionType: LocusOpaqueTextSchema.nullable(),
  activeRecordId: LocusDigestSchema,
  parentRecordId: LocusDigestSchema.nullable(),
});

/** Deterministic workflow frame selected from the shared locus graph. */
export const RecoveryLocusFrameSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("none"),
    workflow: z.null(),
    sessionType: z.null(),
  }),
  RecoveryLocusFrameResolvedSchema,
  z.strictObject({
    kind: z.literal("legacy-errand"),
    workflow: z.literal("run-errand"),
    sessionType: z.enum(["planning", "execution", "integration"]),
    slug: LocusOpaqueTextSchema,
    branch: LocusOpaqueTextSchema,
    returnBranch: LocusOpaqueTextSchema,
  }),
]);

export type RecoveryLocusFrame = z.infer<typeof RecoveryLocusFrameSchema>;

/** Internal projection consumed by the recover envelope composer. */
export interface RecoveryLocusContext {
  frame: RecoveryLocusFrame;
  loadSet: LoadSetManifest;
  taskCursor: TaskListCursorFileResult | null;
}

/** Fail-closed error raised when a public locus snapshot is internally inconsistent. */
export class RecoveryLocusContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecoveryLocusContextError";
  }
}

/**
 * Derive recovery workflow and context from the reader-owned current verdict.
 *
 * @param options - Fresh locus state plus identity-global context pointers.
 * @returns The selected recovery frame, ordered load set, and task cursor.
 */
export function deriveRecoveryLocusContext(options: {
  state: LocusStateV1;
  identity: string | null;
  workingMemoryPath: string | null;
}): RecoveryLocusContext {
  const { state } = options;
  if (state.current.kind === "ambiguous") {
    throw new RecoveryLocusContextError(
      `Current locus is ambiguous: ${state.current.recordIds.join(", ")}`,
    );
  }
  if (state.current.kind === "none") {
    refuseUnresolvedResidue(state);
    return {
      frame: { kind: "none", workflow: null, sessionType: null },
      loadSet: baseLoadSet(options),
      taskCursor: null,
    };
  }

  const current = state.current;
  if (
    state.recovery.kind !== "resume"
    || state.recovery.activeRecordId !== current.activeRecordId
    || state.recovery.parentRecordId !== current.parentRecordId
  ) {
    throw new RecoveryLocusContextError("Current and recovery locus tokens do not match");
  }

  const active = exactRow(state.roster.rows, current.activeRecordId, "active");
  assertActiveRow(active);
  const sessionHome = current.sessionHomeRecordId === null
    ? null
    : exactRow(state.roster.rows, current.sessionHomeRecordId, "session-home");
  if (
    sessionHome !== null
    && (sessionHome.checkoutPath === null || sessionHome.checkoutPath !== active.lease?.sessionHomePath)
  ) {
    throw new RecoveryLocusContextError("Selected lease does not match the session-home row");
  }

  const parent = current.parentRecordId === null
    ? null
    : exactRow(state.roster.rows, current.parentRecordId, "parent");
  assertParentEdge(active, parent, current.sessionHomeRecordId);

  if (active.role?.kind === "work-unit") {
    const derived = requireWorkUnitProjection(active, "active");
    return {
      frame: RecoveryLocusFrameSchema.parse({
        kind: "resolved",
        workflow: recoveryWorkflowForWorkUnit(derived),
        sessionType: derived.sessionType,
        activeRecordId: current.activeRecordId,
        parentRecordId: null,
      }),
      loadSet: derived.loadSet,
      taskCursor: derived.taskCursor,
    };
  }

  assertTransientIdentity(active);
  const parentDerived = parent === null ? null : requireWorkUnitProjection(parent, "parent");
  const workflow = transientWorkflow(active);
  const loadSet = appendRecoveryWorkflow(
    parentDerived?.loadSet ?? baseLoadSet(options),
    workflow.path,
  );
  return {
    frame: RecoveryLocusFrameSchema.parse({
      kind: "resolved",
      workflow: workflow.name,
      sessionType: parentDerived?.sessionType ?? null,
      activeRecordId: current.activeRecordId,
      parentRecordId: current.parentRecordId,
    }),
    loadSet,
    taskCursor: parentDerived?.taskCursor ?? null,
  };
}

function recoveryWorkflowForWorkUnit(
  derived: NonNullable<LocusRowV1["derived"]> & { workflow: string },
): string {
  if (derived.sessionType !== "planning") return derived.workflow;
  if (derived.stage === null) {
    throw new RecoveryLocusContextError("Selected planning work-unit projection has no stage");
  }
  return derived.stage;
}

function refuseUnresolvedResidue(state: LocusStateV1): void {
  const residue = state.roster.rows.find((row) =>
    row.kind === "managed-role"
    && row.frame === "residue"
    && (row.lease?.state === "dead" || row.lease?.state === "unknown"));
  if (state.recovery.kind !== "none" || residue !== undefined) {
    throw new RecoveryLocusContextError(
      residue?.lease?.state === "unknown"
        ? "Current locus has unknown lease residue"
        : "Current locus has dead or unresolved residue",
    );
  }
}

function exactRow(
  rows: readonly LocusRowV1[],
  recordId: string,
  label: string,
): LocusRowV1 {
  const matches = rows.filter((row) => row.recordId === recordId);
  if (matches.length !== 1 || matches[0] === undefined) {
    throw new RecoveryLocusContextError(
      `Expected one ${label} row for ${recordId}; found ${matches.length}`,
    );
  }
  return matches[0];
}

function assertActiveRow(row: LocusRowV1): void {
  if (
    row.kind !== "managed-role"
    || row.checkoutPath === null
    || row.role === null
    || row.lease === null
    || row.lease.state !== "live"
    || row.frame !== "active"
    || row.diagnostics.length > 0
  ) {
    throw new RecoveryLocusContextError("Selected active locus row is not a live managed projection");
  }
}

function assertParentEdge(
  active: LocusRowV1,
  parent: LocusRowV1 | null,
  sessionHomeRecordId: string | null,
): void {
  const parentPath = active.role?.parentCheckoutPath ?? null;
  if (parent === null) {
    if (parentPath !== null) {
      throw new RecoveryLocusContextError("Selected transient row has an unresolved parent path");
    }
    if (active.role?.kind === "work-unit" && sessionHomeRecordId !== active.recordId) {
      throw new RecoveryLocusContextError("Selected work-unit row is not its session home");
    }
    return;
  }
  if (
    active.role?.kind === "work-unit"
    || parent.kind !== "managed-role"
    || parent.role?.kind !== "work-unit"
    || parent.checkoutPath !== parentPath
    || parent.lease?.state !== "live"
    || parent.frame !== "suspended"
    || parent.diagnostics.length > 0
    || sessionHomeRecordId !== parent.recordId
  ) {
    throw new RecoveryLocusContextError("Selected parent row does not match the active transient edge");
  }
}

function requireWorkUnitProjection(
  row: LocusRowV1,
  label: string,
): NonNullable<LocusRowV1["derived"]> & {
  workflow: string;
  loadSet: LoadSetManifest;
} {
  if (
    row.role?.kind !== "work-unit"
    || row.derived === null
    || row.derived.workflow === null
    || row.derived.loadSet === null
  ) {
    throw new RecoveryLocusContextError(`Selected ${label} work-unit projection is incomplete`);
  }
  return {
    ...row.derived,
    workflow: row.derived.workflow,
    loadSet: row.derived.loadSet,
  };
}

function assertTransientIdentity(row: LocusRowV1): void {
  const role = row.role;
  if (role === null || role.kind === "work-unit") return;
  const identityRequired = role.subject.kind === "errand" || role.subject.kind === "groom";
  if (!identityRequired) {
    if (row.identity !== null) {
      throw new RecoveryLocusContextError("Identity-free transient unexpectedly joined an identity");
    }
    return;
  }
  if (row.identity === null || !identityMatches(row.identity, role.subject)) {
    throw new RecoveryLocusContextError("Selected transient identity does not match its role generation");
  }
}

function identityMatches(
  identity: LocusIdentityV1,
  subject: NonNullable<LocusRowV1["role"]>["subject"],
): boolean {
  const expectedKind = subject.kind === "groom" ? "groom" : "errand";
  return identity.kind === expectedKind
    && identity.key === subject.key
    && identity.claimId === subject.claimId;
}

function transientWorkflow(row: LocusRowV1): { name: string; path: string } {
  switch (row.role?.kind) {
    case "errand":
      return {
        name: "run-errand",
        path: ".arc/system/workflows/arc/supplemental/run-errand.md",
      };
    case "groom":
      return {
        name: "draft-design",
        path: ".arc/system/workflows/arc/draft-design.md",
      };
    case "housekeep":
      return {
        name: "drain-inbox",
        path: ".arc/system/workflows/arc/supplemental/drain-inbox.md",
      };
    default:
      throw new RecoveryLocusContextError(`Unsupported recovery role: ${row.role?.kind ?? "missing"}`);
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
