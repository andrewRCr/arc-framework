/** One plan-bound v3 decomposition occupation, materialization, and preparation operation. */

import type { ProtectionMode } from "../git/write-context.js";
import type { V3DecomposeCutMap } from "./decompose-v3-schema.js";
import { createDecomposeTransitionRecord } from "./decompose-transition-record.js";
import {
  materializeV3DecomposePlan,
  type V3MaterializationResult,
  type V3MaterializerIO,
} from "./decompose-v3-materializer.js";
import type { ValidatedDecomposePlan } from "./decompose-v3-plan.js";
import {
  reportV3DecomposeResult,
  type V3DecomposeResultReport,
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
  | { status: "refused"; reason: string };

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

export type V3DecomposeOperationRecovery =
  | { kind: "none" }
  | {
      kind: "partial-restoration";
      status: "restored";
      restoredPaths: string[];
    }
  | {
      kind: "partial-restoration";
      status: "failed";
      affectedPaths: string[];
      path?: string;
    }
  | {
      kind: "full-candidate";
      path: string;
      candidateBranch: string;
      expectedHead: string;
    };

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
      report?: V3DecomposeResultReport;
      recovery: V3DecomposeOperationRecovery;
    };

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
  let occupation: DecomposeResultOccupationResult;
  try {
    occupation = await dependencies.occupy({
      protection: input.protection,
      configuredBase: input.configuredBase,
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
  const report = reportV3DecomposeResult(input.plan, materialization);
  if (materialization.status === "refused") {
    let recovery;
    if (occupation.protection === "partial") {
      if (partialRecovery === undefined) throw new Error("partial recovery dependency lost after capture");
      recovery = await restorePartial(
        partialPreimages,
        materialization.appliedPaths,
        partialRecovery,
      );
    } else {
      recovery = fullRecovery(input.plan, occupation);
    }
    return {
      status: "refused",
      stage: recovery.kind === "partial-restoration" && recovery.status === "failed"
        ? "restoration"
        : "materialization",
      reason: materialization.reason,
      report,
      recovery,
    };
  }

  const mutatedPaths = materialization.paths
    .filter(({ disposition }) => disposition === "applied")
    .map(({ path }) => path);
  const authorablePaths = materialization.paths.map(({ path }) => path);
  const recoverMutation = async (): Promise<V3DecomposeOperationRecovery> => {
    if (occupation.protection === "full") return fullRecovery(input.plan, occupation);
    if (partialRecovery === undefined) {
      throw new Error("partial recovery dependency lost after capture");
    }
    return await restorePartial(partialPreimages, mutatedPaths, partialRecovery);
  };
  const transitionRecord = createDecomposeTransitionRecord(input.completedMap);
  if (transitionRecord === null) {
    const recovery = await recoverMutation();
    return {
      status: "refused",
      stage: recovery.kind === "partial-restoration" && recovery.status === "failed"
        ? "restoration"
        : "transition-record",
      reason: "transition-record-projection-invalid",
      report,
      recovery,
    };
  }
  let recorded: Awaited<ReturnType<TerminalTransitionRecordWriter["record"]>>;
  try {
    recorded = await dependencies.transitionRecords.record(transitionRecord);
  } catch {
    recorded = { status: "unavailable", diagnostic: "transition record write failed" };
  }
  if (recorded.status !== "recorded") {
    const recovery = await recoverMutation();
    return {
      status: "refused",
      stage: recovery.kind === "partial-restoration" && recovery.status === "failed"
        ? "restoration"
        : "transition-record",
      reason: recorded.status === "origin-occupied"
        ? "transition-record-origin-occupied"
        : recorded.diagnostic,
      report,
      recovery,
    };
  }

  if (dependencies.revalidateStaged !== undefined) {
    let stagedValidation: V3PostOccupationRevalidation;
    try {
      stagedValidation = await dependencies.revalidateStaged(input.plan, occupation);
    } catch {
      stagedValidation = { status: "refused", reason: "post-stage-revalidation-failed" };
    }
    if (stagedValidation.status === "refused") {
      const recordRollback = await dependencies.transitionRecords.rollback(transitionRecord);
      const recovery = await recoverMutation();
      return {
        status: "refused",
        stage: recordRollback.status === "unavailable"
          || (recovery.kind === "partial-restoration" && recovery.status === "failed")
          ? "restoration"
          : "post-stage-revalidation",
        reason: stagedValidation.reason
          + (recordRollback.status === "unavailable" ? `; ${recordRollback.diagnostic}` : ""),
        report,
        recovery,
      };
    }
  }

  return {
    status: "staged",
    occupation,
    materialization,
    report,
    transitionRecord,
    stagedPaths: [
      ...mutatedPaths,
      resolveTransitionRecordRelativePath(transitionRecord.origin),
    ],
    releasePaths: [
      ...authorablePaths,
      resolveTransitionRecordRelativePath(transitionRecord.origin),
    ],
  };
}
