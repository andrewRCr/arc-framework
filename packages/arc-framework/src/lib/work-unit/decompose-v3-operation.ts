/** One plan-bound v3 decomposition occupation, materialization, and preparation operation. */

import { z } from "zod";

import type { ProtectionMode } from "../git/write-context.js";
import type { V3DecomposeCutMap } from "./decompose-v3-schema.js";
import { createDecomposeTransitionRecord } from "./decompose-transition-record.js";
import {
  materializeV3DecomposePlan,
  type V3MaterializationResult,
  type V3MaterializerIO,
} from "./decompose-v3-materializer.js";
import type { ValidatedDecomposePlan } from "./decompose-v3-plan.js";
import type { V3DecomposeRefusalEvidence } from "./decompose-v3-refusal.js";
import {
  reportV3DecomposeResult,
  type V3DecomposeResultReport,
  type V3ExtractionReportFacts,
} from "./decompose-v3-result-report.js";
import type {
  DecomposeResultOccupationInput,
  DecomposeResultOccupationResult,
} from "./decompose-result-occupation.js";
import type { TerminalTransitionRecordWriter } from "./terminal-transition-record-writer.js";
import { resolveTransitionRecordRelativePath } from "./transition-record-store.js";

export type V3PartialPathImage =
  | { kind: "absent" }
  | {
      kind: "object";
      objectKind: string;
      mode: string;
      bytes: Uint8Array;
    };

export interface V3PartialPathPreimage {
  path: string;
  index: V3PartialPathImage;
  worktree: V3PartialPathImage;
}

export type V3PostOccupationRevalidation =
  | { status: "valid" }
  | {
      status: "refused";
      reason: string;
      locus?: string;
      evidence?: V3DecomposeRefusalEvidence;
    };

type OccupiedResult = Extract<DecomposeResultOccupationResult, { status: "occupied" }>;
type FullOccupiedResult = Extract<OccupiedResult, { protection: "full" }>;
type RefusedResult = Extract<DecomposeResultOccupationResult, { status: "refused" }>;

export interface V3DecomposeOperationInput {
  protection: ProtectionMode;
  configuredBase: string;
  plan: ValidatedDecomposePlan;
  completedMap: V3DecomposeCutMap;
}

export interface V3PartialRecoveryIO {
  capture(paths: readonly string[]): Promise<V3PartialPathPreimage[]>;
  restore(preimages: readonly V3PartialPathPreimage[]): Promise<void>;
  verify(preimages: readonly V3PartialPathPreimage[]): Promise<
    { status: "restored" } | { status: "mismatch"; path: string }
  >;
}

export interface V3DecomposeOperationDependencies {
  occupy(input: DecomposeResultOccupationInput): Promise<DecomposeResultOccupationResult>;
  revalidate(
    plan: ValidatedDecomposePlan,
    occupation: OccupiedResult,
  ): Promise<V3PostOccupationRevalidation>;
  materializer: V3MaterializerIO;
  transitionRecords: TerminalTransitionRecordWriter;
  partialRecovery?: V3PartialRecoveryIO;
  revalidateStaged?: (
    plan: ValidatedDecomposePlan,
    occupation: OccupiedResult,
  ) => Promise<V3PostOccupationRevalidation>;
}

/** Closed recovery facts preserved on an operation refusal. */
export const V3DecomposeOperationRecoverySchema = z.union([
  z.strictObject({ kind: z.literal("none") }),
  z.strictObject({
    kind: z.literal("partial-restoration"),
    status: z.literal("restored"),
    restoredPaths: z.array(z.string().min(1)),
  }),
  z.strictObject({
    kind: z.literal("partial-restoration"),
    status: z.literal("failed"),
    affectedPaths: z.array(z.string().min(1)),
    path: z.string().min(1).optional(),
  }),
  z.strictObject({
    kind: z.literal("full-candidate"),
    path: z.string().min(1),
    candidateBranch: z.string().min(1),
    expectedHead: z.string().min(1),
  }),
]);
export type V3DecomposeOperationRecovery = z.infer<
  typeof V3DecomposeOperationRecoverySchema
>;

export type V3DecomposeOperationResult =
  | {
      status: "staged";
      occupation: OccupiedResult;
      materialization: Extract<V3MaterializationResult, { status: "materialized" }>;
      report: V3DecomposeResultReport;
      transitionRecord: NonNullable<ReturnType<typeof createDecomposeTransitionRecord>>;
      stagedPaths: string[];
      releasePaths: string[];
    }
  | {
      status: "refused";
      stage:
        | "occupation"
        | "post-occupation-revalidation"
        | "partial-capture"
        | "materialization"
        | "transition-record"
        | "post-stage-revalidation"
        | "restoration";
      reason: string;
      locus?: string;
      evidence?: V3DecomposeRefusalEvidence;
      report?: V3DecomposeResultReport;
      recovery: V3DecomposeOperationRecovery;
    };

export interface V3ExtractionOperationInput {
  protection: ProtectionMode;
  configuredBase: string;
  origin: string;
  plan: ValidatedDecomposePlan;
  extractionFacts: V3ExtractionReportFacts;
}

export type V3ExtractionOperationDependencies = Omit<
  V3DecomposeOperationDependencies,
  "transitionRecords"
>;

export type V3ExtractionOperationResult =
  | {
      status: "staged";
      occupation: OccupiedResult;
      materialization: Extract<V3MaterializationResult, { status: "materialized" }>;
      report: V3DecomposeResultReport;
      stagedPaths: string[];
      releasePaths: string[];
    }
  | {
      status: "refused";
      stage:
        | "occupation"
        | "post-occupation-revalidation"
        | "partial-capture"
        | "materialization"
        | "post-stage-revalidation"
        | "restoration";
      reason: string;
      locus?: string;
      evidence?: V3DecomposeRefusalEvidence;
      report?: V3DecomposeResultReport;
      recovery: V3DecomposeOperationRecovery;
    };

type V3SharedOperationRefusal = Extract<V3ExtractionOperationResult, { status: "refused" }>;

interface V3SharedOperationInput {
  protection: ProtectionMode;
  configuredBase: string;
  origin: string;
  plan: ValidatedDecomposePlan;
  extractionFacts: V3ExtractionReportFacts | undefined;
}

type V3SharedOperationDependencies = Pick<
  V3DecomposeOperationDependencies,
  "occupy" | "revalidate" | "materializer" | "partialRecovery" | "revalidateStaged"
>;

interface V3PreparedOperation {
  occupation: OccupiedResult;
  materialization: Extract<V3MaterializationResult, { status: "materialized" }>;
  report: V3DecomposeResultReport;
  mutatedPaths: string[];
  authorablePaths: string[];
  recoverMutation(): Promise<V3DecomposeOperationRecovery>;
}

type V3StagedRollback = () => Promise<
  Awaited<ReturnType<TerminalTransitionRecordWriter["rollback"]>>
>;

function failureLocus(error: unknown, fallback: string): string {
  const detail = error instanceof Error ? error.message : String(error);
  return detail.trim() === "" ? fallback : detail;
}

function fullRecovery(
  plan: ValidatedDecomposePlan,
  occupation: Pick<FullOccupiedResult, "path" | "candidateBranch">,
): V3DecomposeOperationRecovery {
  return {
    kind: "full-candidate",
    path: occupation.path,
    candidateBranch: occupation.candidateBranch,
    expectedHead: plan.expectedBaseHead,
  };
}

function refusedOccupationRecovery(
  plan: ValidatedDecomposePlan,
  occupation: RefusedResult,
): V3DecomposeOperationRecovery {
  return occupation.recovery === undefined
    ? { kind: "none" }
    : fullRecovery(plan, occupation.recovery);
}

function recoveryFor(
  plan: ValidatedDecomposePlan,
  occupation: OccupiedResult,
): V3DecomposeOperationRecovery {
  return occupation.protection === "full" ? fullRecovery(plan, occupation) : { kind: "none" };
}

function exactPreimages(
  paths: readonly string[],
  preimages: readonly V3PartialPathPreimage[],
): boolean {
  if (paths.length !== preimages.length) return false;
  const expected = new Set(paths);
  return preimages.every(({ path }) => expected.delete(path)) && expected.size === 0;
}

async function restorePartial(
  preimages: readonly V3PartialPathPreimage[],
  mutatedPaths: readonly string[],
  recovery: V3PartialRecoveryIO,
): Promise<V3DecomposeOperationRecovery> {
  const mutated = new Set(mutatedPaths);
  const owned = preimages.filter(({ path }) => mutated.has(path));
  if (owned.length === 0) return { kind: "none" };
  try {
    await recovery.restore(owned);
    const verified = await recovery.verify(owned);
    if (verified.status === "mismatch") {
      return {
        kind: "partial-restoration",
        status: "failed",
        affectedPaths: owned.map(({ path }) => path),
        path: verified.path,
      };
    }
    return {
      kind: "partial-restoration",
      status: "restored",
      restoredPaths: owned.map(({ path }) => path),
    };
  } catch {
    return {
      kind: "partial-restoration",
      status: "failed",
      affectedPaths: owned.map(({ path }) => path),
    };
  }
}

async function prepareV3Operation(
  input: V3SharedOperationInput,
  dependencies: V3SharedOperationDependencies,
): Promise<V3PreparedOperation | V3SharedOperationRefusal> {
  let occupation: DecomposeResultOccupationResult;
  try {
    occupation = await dependencies.occupy({
      protection: input.protection,
      configuredBase: input.configuredBase,
      origin: input.origin,
      plan: input.plan,
    });
  } catch {
    return {
      status: "refused",
      stage: "occupation",
      reason: "occupation-failed",
      recovery: { kind: "none" },
    };
  }
  if (occupation.status === "refused") {
    return {
      status: "refused",
      stage: "occupation",
      reason: occupation.reason,
      ...(occupation.locus === undefined ? {} : { locus: occupation.locus }),
      ...(occupation.evidence === undefined ? {} : { evidence: occupation.evidence }),
      recovery: refusedOccupationRecovery(input.plan, occupation),
    };
  }

  let revalidated: V3PostOccupationRevalidation;
  try {
    revalidated = await dependencies.revalidate(input.plan, occupation);
  } catch {
    revalidated = { status: "refused", reason: "post-occupation-revalidation-failed" };
  }
  if (revalidated.status === "refused") {
    return {
      status: "refused",
      stage: "post-occupation-revalidation",
      reason: revalidated.reason,
      ...(revalidated.locus === undefined ? {} : { locus: revalidated.locus }),
      ...(revalidated.evidence === undefined ? {} : { evidence: revalidated.evidence }),
      recovery: recoveryFor(input.plan, occupation),
    };
  }

  let partialPreimages: V3PartialPathPreimage[] = [];
  let partialRecovery: V3PartialRecoveryIO | undefined;
  if (occupation.protection === "partial") {
    partialRecovery = dependencies.partialRecovery;
    if (partialRecovery === undefined) {
      return {
        status: "refused",
        stage: "partial-capture",
        reason: "partial-recovery-unavailable",
        recovery: { kind: "none" },
      };
    }
    try {
      partialPreimages = await partialRecovery.capture(input.plan.allowedPaths);
    } catch {
      return {
        status: "refused",
        stage: "partial-capture",
        reason: "partial-preimage-capture-failed",
        recovery: { kind: "none" },
      };
    }
    if (!exactPreimages(input.plan.allowedPaths, partialPreimages)) {
      return {
        status: "refused",
        stage: "partial-capture",
        reason: "partial-preimage-set-mismatch",
        recovery: { kind: "none" },
      };
    }
  }

  const materialization = await materializeV3DecomposePlan(input.plan, dependencies.materializer);
  const report = reportV3DecomposeResult(input.plan, materialization, input.extractionFacts);
  if (materialization.status === "refused") {
    let recovery: V3DecomposeOperationRecovery;
    if (occupation.protection === "partial") {
      if (partialRecovery === undefined) throw new Error("partial recovery dependency lost after capture");
      recovery = await restorePartial(partialPreimages, materialization.appliedPaths, partialRecovery);
    } else {
      recovery = fullRecovery(input.plan, occupation);
    }
    const restorationFailureLocus = recovery.kind === "partial-restoration"
      && recovery.status === "failed"
      ? recovery.path ?? recovery.affectedPaths[0] ?? materialization.path
      : null;
    return {
      status: "refused",
      stage: restorationFailureLocus === null
        ? "materialization"
        : "restoration",
      reason: restorationFailureLocus === null
        ? materialization.reason
        : "partial-restoration-failed",
      locus: restorationFailureLocus === null
        ? materialization.path
        : restorationFailureLocus,
      ...(materialization.evidence === undefined ? {} : { evidence: materialization.evidence }),
      report,
      recovery,
    };
  }

  const mutatedPaths = materialization.paths
    .filter(({ disposition }) => disposition === "applied")
    .map(({ path }) => path);
  return {
    occupation,
    materialization,
    report,
    mutatedPaths,
    authorablePaths: materialization.paths.map(({ path }) => path),
    recoverMutation: async () => {
      if (occupation.protection === "full") return fullRecovery(input.plan, occupation);
      if (partialRecovery === undefined) {
        throw new Error("partial recovery dependency lost after capture");
      }
      return await restorePartial(partialPreimages, mutatedPaths, partialRecovery);
    },
  };
}

async function revalidatePreparedV3Operation(
  input: V3SharedOperationInput,
  dependencies: V3SharedOperationDependencies,
  prepared: V3PreparedOperation,
  rollback?: V3StagedRollback,
): Promise<{ status: "valid" } | V3SharedOperationRefusal> {
  if (dependencies.revalidateStaged === undefined) return { status: "valid" };

  let stagedValidation: V3PostOccupationRevalidation;
  try {
    stagedValidation = await dependencies.revalidateStaged(input.plan, prepared.occupation);
  } catch {
    stagedValidation = { status: "refused", reason: "post-stage-revalidation-failed" };
  }
  if (stagedValidation.status === "valid") return stagedValidation;

  let rollbackResult: Awaited<ReturnType<TerminalTransitionRecordWriter["rollback"]>> | null = null;
  if (rollback !== undefined) {
    try {
      rollbackResult = await rollback();
    } catch (error) {
      rollbackResult = {
        status: "unavailable",
        diagnostic: failureLocus(error, "transition record rollback failed"),
      };
    }
  }
  const recovery = await prepared.recoverMutation();
  const rollbackFailureLocus = rollbackResult?.status === "unavailable"
    ? rollbackResult.diagnostic
    : null;
  const restorationFailed = recovery.kind === "partial-restoration"
    && recovery.status === "failed";
  return {
    status: "refused",
    stage: rollbackFailureLocus !== null
      || restorationFailed
      ? "restoration"
      : "post-stage-revalidation",
    reason: rollbackFailureLocus !== null
      ? "transition-record-rollback-failed"
      : restorationFailed ? "partial-restoration-failed" : stagedValidation.reason,
    ...(rollbackFailureLocus !== null
      ? { locus: rollbackFailureLocus }
      : restorationFailed
        ? { locus: recovery.path ?? recovery.affectedPaths[0] ?? "partial restoration" }
        : stagedValidation.locus === undefined ? {} : { locus: stagedValidation.locus }),
    ...(stagedValidation.evidence === undefined ? {} : { evidence: stagedValidation.evidence }),
    report: prepared.report,
    recovery,
  };
}

/**
 * Execute one authenticated plan without consulting any authority resolver after revalidation.
 *
 * Occupation and the post-occupation gate run before the canonical materializer can write.
 * Partial compensation receives only paths that this invocation actually changed.
 */
export async function executeV3DecomposeOperation(
  input: V3DecomposeOperationInput,
  dependencies: V3DecomposeOperationDependencies,
): Promise<V3DecomposeOperationResult> {
  const sharedInput: V3SharedOperationInput = {
    protection: input.protection,
    configuredBase: input.configuredBase,
    origin: input.completedMap.machine.source.origin,
    plan: input.plan,
    extractionFacts: undefined,
  };
  const prepared = await prepareV3Operation(sharedInput, dependencies);
  if ("status" in prepared) return prepared;

  const transitionRecord = createDecomposeTransitionRecord(input.completedMap);
  if (transitionRecord === null) {
    const recovery = await prepared.recoverMutation();
    const restorationFailureLocus = recovery.kind === "partial-restoration"
      && recovery.status === "failed"
      ? recovery.path ?? recovery.affectedPaths[0] ?? "partial restoration"
      : null;
    return {
      status: "refused",
      stage: restorationFailureLocus === null
        ? "transition-record"
        : "restoration",
      reason: restorationFailureLocus === null
        ? "transition-record-projection-invalid"
        : "partial-restoration-failed",
      ...(restorationFailureLocus === null ? {} : { locus: restorationFailureLocus }),
      report: prepared.report,
      recovery,
    };
  }
  let recorded: Awaited<ReturnType<TerminalTransitionRecordWriter["record"]>>;
  try {
    recorded = await dependencies.transitionRecords.record(transitionRecord);
  } catch (error) {
    recorded = {
      status: "unavailable",
      diagnostic: failureLocus(error, "transition record write failed"),
    };
  }
  if (recorded.status !== "recorded") {
    const recovery = await prepared.recoverMutation();
    const restorationFailed = recovery.kind === "partial-restoration"
      && recovery.status === "failed";
    return {
      status: "refused",
      stage: restorationFailed
        ? "restoration"
        : "transition-record",
      reason: restorationFailed
        ? "partial-restoration-failed"
        : recorded.status === "origin-occupied"
          ? "transition-record-origin-occupied"
          : "transition-record-write-failed",
      ...(restorationFailed
        ? { locus: recovery.path ?? prepared.mutatedPaths[0] ?? "partial restoration" }
        : recorded.status === "unavailable" ? { locus: recorded.diagnostic } : {}),
      report: prepared.report,
      recovery,
    };
  }

  const stagedValidation = await revalidatePreparedV3Operation(
    sharedInput,
    dependencies,
    prepared,
    async () => await dependencies.transitionRecords.rollback(transitionRecord),
  );
  if (stagedValidation.status === "refused") return stagedValidation;

  return {
    status: "staged",
    occupation: prepared.occupation,
    materialization: prepared.materialization,
    report: prepared.report,
    transitionRecord,
    stagedPaths: [
      ...prepared.mutatedPaths,
      resolveTransitionRecordRelativePath(transitionRecord.origin),
    ],
    releasePaths: [
      ...prepared.authorablePaths,
      resolveTransitionRecordRelativePath(transitionRecord.origin),
    ],
  };
}

/**
 * Execute one additive extraction plan without creating retirement history.
 *
 * @param input - Exact plan, surviving origin, and authored extraction report facts.
 * @param dependencies - Occupation, revalidation, materialization, and bounded recovery seams.
 * @returns One staged additive result or a closed refusal with exact recovery.
 */
export async function executeV3ExtractionOperation(
  input: V3ExtractionOperationInput,
  dependencies: V3ExtractionOperationDependencies,
): Promise<V3ExtractionOperationResult> {
  const sharedInput: V3SharedOperationInput = {
    protection: input.protection,
    configuredBase: input.configuredBase,
    origin: input.origin,
    plan: input.plan,
    extractionFacts: input.extractionFacts,
  };
  const prepared = await prepareV3Operation(sharedInput, dependencies);
  if ("status" in prepared) return prepared;

  const stagedValidation = await revalidatePreparedV3Operation(sharedInput, dependencies, prepared);
  if (stagedValidation.status === "refused") return stagedValidation;

  return {
    status: "staged",
    occupation: prepared.occupation,
    materialization: prepared.materialization,
    report: prepared.report,
    stagedPaths: prepared.mutatedPaths,
    releasePaths: prepared.authorablePaths,
  };
}
