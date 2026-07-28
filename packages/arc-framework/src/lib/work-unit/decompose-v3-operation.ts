/** One plan-bound v3 decomposition occupation, materialization, and preparation operation. */

import type { ProtectionMode } from "../git/write-context.js";
import type { V3SourceArtifactEntry, V3DecomposeCutMap } from "./decompose-v3-schema.js";
import {
  createV3DecomposePreparation,
  type CreateV3DecomposePreparationInput,
  type CreateV3DecomposePreparationResult,
  type V3DecomposePreparation,
} from "./decompose-v3-preparation.js";
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
  sourceArtifactInventory: V3SourceArtifactEntry[];
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
  partialRecovery?: V3PartialRecoveryIO;
  prepare?: (
    input: CreateV3DecomposePreparationInput,
  ) => CreateV3DecomposePreparationResult;
  persist?: (
    preparation: V3DecomposePreparation,
  ) => Promise<{ status: "persisted" } | { status: "refused"; reason: string }>;
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
      candidateOwnership: FullOccupiedResult["candidateOwnership"];
      retry: { kind: "retry"; planId: string };
      discard: { kind: "discard"; origin: string; cutMapDigest: string };
    };

export type V3DecomposeOperationResult =
  | {
      status: "prepared";
      occupation: OccupiedResult;
      materialization: Extract<V3MaterializationResult, { status: "materialized" }>;
      report: V3DecomposeResultReport;
      preparation: V3DecomposePreparation;
    }
  | {
      status: "refused";
      stage:
        | "occupation"
        | "post-occupation-revalidation"
        | "partial-capture"
        | "materialization"
        | "preparation"
        | "persistence"
        | "restoration";
      reason: string;
      report?: V3DecomposeResultReport;
      recovery: V3DecomposeOperationRecovery;
    };

function fullRecovery(
  plan: ValidatedDecomposePlan,
  occupation: Pick<FullOccupiedResult, "path" | "candidateOwnership">,
): V3DecomposeOperationRecovery {
  return {
    kind: "full-candidate",
    path: occupation.path,
    candidateOwnership: occupation.candidateOwnership,
    retry: { kind: "retry", planId: plan.planId },
    discard: {
      kind: "discard",
      origin: plan.prospectiveOverlay.origin,
      cutMapDigest: plan.cutMapDigest,
    },
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
  if (occupation.protection === "partial") {
    if (dependencies.partialRecovery === undefined) {
      return {
        status: "refused",
        stage: "partial-capture",
        reason: "partial-recovery-unavailable",
        recovery: { kind: "none" },
      };
    }
    try {
      partialPreimages = await dependencies.partialRecovery.capture(input.plan.allowedPaths);
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
    const recovery = occupation.protection === "partial"
      ? await restorePartial(
          partialPreimages,
          materialization.appliedPaths,
          dependencies.partialRecovery as V3PartialRecoveryIO,
        )
      : fullRecovery(input.plan, occupation);
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

  const prepare = dependencies.prepare ?? createV3DecomposePreparation;
  let prepared: CreateV3DecomposePreparationResult;
  try {
    prepared = prepare({
      completedMap: input.completedMap,
      sourceArtifactInventory: input.sourceArtifactInventory,
      candidateOwnership: occupation.candidateOwnership,
      plan: input.plan,
    });
  } catch {
    prepared = { status: "rejected", reason: "preparation-failed" };
  }
  if (prepared.status === "rejected") {
    const mutatedPaths = materialization.paths
      .filter(({ disposition }) => disposition === "applied")
      .map(({ path }) => path);
    const recovery = occupation.protection === "partial"
      ? await restorePartial(
          partialPreimages,
          mutatedPaths,
          dependencies.partialRecovery as V3PartialRecoveryIO,
        )
      : fullRecovery(input.plan, occupation);
    return {
      status: "refused",
      stage: recovery.kind === "partial-restoration" && recovery.status === "failed"
        ? "restoration"
        : "preparation",
      reason: prepared.reason,
      report,
      recovery,
    };
  }

  if (dependencies.persist !== undefined) {
    let persisted: { status: "persisted" } | { status: "refused"; reason: string };
    try {
      persisted = await dependencies.persist(prepared.preparation);
    } catch {
      persisted = { status: "refused", reason: "preparation-persistence-failed" };
    }
    if (persisted.status === "refused") {
      const mutatedPaths = materialization.paths
        .filter(({ disposition }) => disposition === "applied")
        .map(({ path }) => path);
      const recovery = occupation.protection === "partial"
        ? await restorePartial(
            partialPreimages,
            mutatedPaths,
            dependencies.partialRecovery as V3PartialRecoveryIO,
          )
        : fullRecovery(input.plan, occupation);
      return {
        status: "refused",
        stage: recovery.kind === "partial-restoration" && recovery.status === "failed"
          ? "restoration"
          : "persistence",
        reason: persisted.reason,
        report,
        recovery,
      };
    }
  }

  return {
    status: "prepared",
    occupation,
    materialization,
    report,
    preparation: prepared.preparation,
  };
}
