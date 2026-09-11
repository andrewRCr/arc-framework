/** Fail-closed validation of complete-plus-incremental review coverage chains. */

import { canonicalize } from "../../../lib/kernel/index.js";

import type { ReviewResultReader } from "../core/ports.js";
import type { IncrementalReviewFindingInstruction } from
  "../core/incremental-review-scope.js";
import {
  IncrementalReviewScopeSchema,
  type IncrementalReviewScope,
} from "../core/incremental-review-scope.js";
import type { ReviewResult } from "../core/review-result.js";

/** Response evidence needed before a predecessor may support narrower review. */
export type IncrementalPredecessorResponseEvidence =
  | { readonly status: "performed"; readonly requiredFindings: readonly IncrementalReviewFindingInstruction[] }
  | { readonly status: "incomplete"; readonly requiredFindings: readonly IncrementalReviewFindingInstruction[] };

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

/**
 * Build the next exact correction scope from one responded predecessor result.
 *
 * @param input - Immutable predecessor, current head, and durable response evidence.
 * @returns An exact transitive correction scope, or null when the predecessor cannot support one.
 */
export function buildIncrementalCorrectionScope(input: {
  readonly predecessor: ReviewResult;
  readonly currentHeadSha: string;
  readonly response: IncrementalPredecessorResponseEvidence;
}): IncrementalReviewScope | null {
  const { predecessor, response } = input;
  if (predecessor.kind === "frontline" || response.status !== "performed") return null;
  const predecessorScope = predecessor.admission.correctionScope;
  const basisHeadSha = predecessor.admission.effectiveCoverage === "complete"
    ? predecessor.target.headSha
    : predecessorScope?.headSha === predecessor.target.headSha
      ? predecessorScope.basisHeadSha
      : null;
  if (basisHeadSha === null) return null;
  const inheritedFindings = predecessor.admission.effectiveCoverage === "complete"
    ? []
    : predecessorScope?.requiredFindings ?? [];
  const findingKey = ({ producerId, findingId }: {
    readonly producerId: string;
    readonly findingId: string;
  }) => canonicalize([producerId, findingId]);
  const requiredFindings = new Map<string, (typeof response.requiredFindings)[number]>();
  for (const finding of [...inheritedFindings, ...response.requiredFindings]) {
    const key = findingKey(finding);
    const existing = requiredFindings.get(key);
    if (existing !== undefined && canonicalize(existing) !== canonicalize(finding)) return null;
    requiredFindings.set(key, finding);
  }
  return IncrementalReviewScopeSchema.parse({
    schemaVersion: 1,
    predecessorProducerId: predecessor.producerId,
    predecessorHeadSha: predecessor.target.headSha,
    basisHeadSha,
    headSha: input.currentHeadSha,
    requiredFindings: [...requiredFindings.values()].sort((left, right) => (
      left.producerId.localeCompare(right.producerId)
      || left.findingId.localeCompare(right.findingId)
      || left.locus.localeCompare(right.locus)
    )),
  });
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
  | "material-finding-omitted"
  | "material-finding-mismatch";

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

function compatibleStandardPolicy(left: ReviewResult, right: ReviewResult): boolean {
  if (left.kind === "frontline" || right.kind === "frontline") {
    return left.admission.policyVersion === right.admission.policyVersion;
  }
  const project = (result: Exclude<ReviewResult, { kind: "frontline" }>) => ({
    obligation: result.requirement.obligation,
    reasons: [...result.requirement.reasons].sort(),
    rubricVersion: result.requirement.rubricVersion,
    rubricDigest: result.requirement.rubricDigest,
    retrigger: result.requirement.retrigger,
    count: result.requirement.count,
  });
  return canonicalize(project(left)) === canonicalize(project(right));
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
      readonly requiredFindings: readonly IncrementalReviewFindingInstruction[];
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
        requiredFindings: [],
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
    if (!compatibleStandardPolicy(predecessor, result)) {
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
      .catch(() => ({ status: "incomplete" as const, requiredFindings: [] }));
    if (response.status !== "performed") {
      return inadequate("response-incomplete", { producerId: predecessor.producerId });
    }
    const responseMismatch = response.requiredFindings.find(({ producerId }) => (
      producerId !== predecessor.producerId
    ));
    if (responseMismatch !== undefined) {
      return inadequate("material-finding-mismatch", {
        producerId: responseMismatch.producerId,
        findingId: responseMismatch.findingId,
      });
    }
    const nextPath = new Set(path);
    nextPath.add(scope.predecessorProducerId);
    const basis = await visit(predecessor, nextPath);
    if (basis.status !== "adequate") return basis;
    if (basis.basisHeadSha !== scope.basisHeadSha) {
      return inadequate("basis-gap", { producerId: predecessor.producerId });
    }
    const instructionKey = ({ producerId, findingId }: IncrementalReviewFindingInstruction) => (
      canonicalize([producerId, findingId])
    );
    const requiredFindings = [...basis.requiredFindings, ...response.requiredFindings];
    const instructed = new Map(scope.requiredFindings.map((finding) => [instructionKey(finding), finding]));
    const omitted = requiredFindings.find((finding) => !instructed.has(instructionKey(finding)));
    if (omitted !== undefined) {
      return inadequate("material-finding-omitted", {
        producerId: omitted.producerId,
        findingId: omitted.findingId,
      });
    }
    const mismatched = requiredFindings.find((finding) => (
      canonicalize(instructed.get(instructionKey(finding))) !== canonicalize(finding)
    ));
    if (mismatched !== undefined) {
      return inadequate("material-finding-mismatch", {
        producerId: mismatched.producerId,
        findingId: mismatched.findingId,
      });
    }
    return {
      ...basis,
      producerIds: [...basis.producerIds, result.producerId],
      requiredFindings,
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
