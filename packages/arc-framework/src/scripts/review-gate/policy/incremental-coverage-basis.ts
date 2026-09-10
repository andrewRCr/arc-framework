/** Fail-closed validation of complete-plus-incremental review coverage chains. */

import { canonicalize } from "../../../lib/kernel/index.js";

import type { ReviewResultReader } from "../core/ports.js";
import type { ReviewResult } from "../core/review-result.js";

/** Response evidence needed before a predecessor may support narrower review. */
export type IncrementalPredecessorResponseEvidence =
  | { readonly status: "performed"; readonly requiredFindingIds: readonly string[] }
  | { readonly status: "incomplete"; readonly requiredFindingIds: readonly string[] };

/** Current-target applicability result for one immutable predecessor producer. */
export type IncrementalPredecessorApplicability =
  | "applicable"
  | "review-required"
  | "unavailable";

/** Read boundaries used by the coverage-chain validator. */
export interface IncrementalCoverageBasisDependencies {
  readonly resultReader: ReviewResultReader;
  readonly readResponseEvidence: (
    predecessor: ReviewResult,
  ) => Promise<IncrementalPredecessorResponseEvidence>;
  readonly confirmApplicability: (
    predecessor: ReviewResult,
    current: ReviewResult,
  ) => Promise<IncrementalPredecessorApplicability>;
}

/** Stable fail-closed reasons returned without manufacturing coverage. */
export type IncrementalCoverageBasisFailure =
  | "missing-correction-scope"
  | "predecessor-unavailable"
  | "cycle"
  | "incompatible-lane"
  | "incompatible-repository"
  | "incompatible-lineage"
  | "incompatible-policy"
  | "basis-gap"
  | "target-mismatch"
  | "predecessor-target-mismatch"
  | "applicability-required"
  | "applicability-unavailable"
  | "response-incomplete"
  | "material-finding-omitted";

export type IncrementalCoverageBasisResult =
  | {
    readonly status: "adequate";
    readonly basisProducerId: string;
    readonly basisHeadSha: string;
    readonly producerIds: readonly string[];
  }
  | {
    readonly status: "inadequate";
    readonly reason: IncrementalCoverageBasisFailure;
    readonly producerId?: string;
    readonly findingId?: string;
  };

function inadequate(
  reason: IncrementalCoverageBasisFailure,
  detail: { readonly producerId?: string; readonly findingId?: string } = {},
): Extract<IncrementalCoverageBasisResult, { readonly status: "inadequate" }> {
  return { status: "inadequate", reason, ...detail };
}

function sameLineage(left: ReviewResult, right: ReviewResult): boolean {
  return canonicalize(left.admission.lineage) === canonicalize(right.admission.lineage);
}

function resultLane(result: ReviewResult): "frontline" | "standard" {
  return result.kind === "frontline" ? "frontline" : "standard";
}

/**
 * Resolve one result to a complete coverage root through immutable producer references.
 *
 * @param current - Fresh terminal producer whose effective coverage is being evaluated.
 * @param dependencies - Complete producer reader, response evidence, and current applicability proof.
 * @returns Adequate complete coverage or one typed reason the chain cannot close the lane/member.
 */
export async function resolveIncrementalCoverageBasis(
  current: ReviewResult,
  dependencies: IncrementalCoverageBasisDependencies,
): Promise<IncrementalCoverageBasisResult> {
  const reads = new Map<string, Promise<ReviewResult | null>>();
  const read = (producerId: string): Promise<ReviewResult | null> => {
    const existing = reads.get(producerId);
    if (existing !== undefined) return existing;
    const pending = dependencies.resultReader.readResult(producerId).catch(() => null);
    reads.set(producerId, pending);
    return pending;
  };

  type ResolvedCoverageBasis = {
      readonly status: "adequate";
      readonly basisProducerId: string;
      readonly basisHeadSha: string;
      readonly producerIds: readonly string[];
      readonly requiredFindingIds: readonly string[];
    } | Extract<IncrementalCoverageBasisResult, { readonly status: "inadequate" }>;

  const visit = async (
    result: ReviewResult,
    path: ReadonlySet<string>,
  ): Promise<ResolvedCoverageBasis> => {
    if (result.admission.effectiveCoverage === "complete") {
      return {
        status: "adequate",
        basisProducerId: result.producerId,
        basisHeadSha: result.target.headSha,
        producerIds: [result.producerId],
        requiredFindingIds: [],
      };
    }
    const scope = result.admission.correctionScope;
    if (scope === undefined) return inadequate("missing-correction-scope", { producerId: result.producerId });
    if (scope.headSha !== result.target.headSha) {
      return inadequate("target-mismatch", { producerId: result.producerId });
    }
    if (path.has(scope.predecessorProducerId)) {
      return inadequate("cycle", { producerId: scope.predecessorProducerId });
    }
    const predecessor = await read(scope.predecessorProducerId);
    if (predecessor === null) {
      return inadequate("predecessor-unavailable", { producerId: scope.predecessorProducerId });
    }
    if (predecessor.target.headSha !== scope.predecessorHeadSha) {
      return inadequate("predecessor-target-mismatch", { producerId: predecessor.producerId });
    }
    if (resultLane(predecessor) !== resultLane(result)) {
      return inadequate("incompatible-lane", { producerId: predecessor.producerId });
    }
    if (predecessor.repositoryId !== result.repositoryId) {
      return inadequate("incompatible-repository", { producerId: predecessor.producerId });
    }
    if (!sameLineage(predecessor, result)) {
      return inadequate("incompatible-lineage", { producerId: predecessor.producerId });
    }
    if (predecessor.admission.policyVersion !== result.admission.policyVersion) {
      return inadequate("incompatible-policy", { producerId: predecessor.producerId });
    }
    const applicability = await dependencies.confirmApplicability(predecessor, current)
      .catch(() => "unavailable" as const);
    if (applicability !== "applicable") {
      return inadequate(
        applicability === "review-required" ? "applicability-required" : "applicability-unavailable",
        { producerId: predecessor.producerId },
      );
    }
    const response = await dependencies.readResponseEvidence(predecessor)
      .catch(() => ({ status: "incomplete" as const, requiredFindingIds: [] }));
    if (response.status !== "performed") {
      return inadequate("response-incomplete", { producerId: predecessor.producerId });
    }
    const nextPath = new Set(path);
    nextPath.add(scope.predecessorProducerId);
    const basis = await visit(predecessor, nextPath);
    if (basis.status !== "adequate") return basis;
    if (basis.basisHeadSha !== scope.basisHeadSha) {
      return inadequate("basis-gap", { producerId: predecessor.producerId });
    }
    const requiredFindingIds = [...new Set([
      ...basis.requiredFindingIds,
      ...response.requiredFindingIds,
    ])];
    const instructed = new Set(scope.requiredFindingIds);
    const omitted = requiredFindingIds.find((findingId) => !instructed.has(findingId));
    if (omitted !== undefined) {
      return inadequate("material-finding-omitted", {
        producerId: predecessor.producerId,
        findingId: omitted,
      });
    }
    return {
      ...basis,
      producerIds: [...basis.producerIds, result.producerId],
      requiredFindingIds,
    };
  };

  const resolved = await visit(current, new Set([current.producerId]));
  if (resolved.status === "inadequate") return resolved;
  return {
    status: "adequate",
    basisProducerId: resolved.basisProducerId,
    basisHeadSha: resolved.basisHeadSha,
    producerIds: resolved.producerIds,
  };
}
