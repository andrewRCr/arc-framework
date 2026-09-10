/** Evidence composition for terminal review-policy attempts. */

import { canonicalize } from "../../../lib/kernel/index.js";

import { validateReviewTarget } from "../core/gate-contract-v2.js";
import type {
  ApprovedDispositionRecordStore,
  ReviewResultReader,
} from "../core/ports.js";
import { validateApprovedDispositionRecordForResult } from
  "../core/review-result-disposition.js";
import type { ReviewResult } from "../core/review-result.js";
import type { ReviewSeverity } from "../core/review-primitives.js";
import {
  ReviewPolicyCommandRequestSchema,
  ReviewPolicyRequestSchema,
  resolveReviewPolicy,
  type ReviewPolicyCommandRequest,
  type ReviewPolicyRequest,
  type ReviewResolveEnvelope,
  type VerifiedTerminalReviewSignal,
} from "./review-policy-driver.js";

/** Trusted inputs needed to bind one command request to immutable producer evidence. */
export interface EvidenceBoundReviewPolicyDependencies {
  readonly sources: readonly string[];
  readonly maxPasses: number;
  readonly resultReader: ReviewResultReader;
  readonly dispositionStore: ApprovedDispositionRecordStore;
  readonly confirmTarget: (attemptedTarget: ReviewResult["target"])
  => Promise<ReviewResult["target"]>;
}

function requestScope(request: ReviewPolicyCommandRequest): "whole-target" | "chunked" {
  return request.scopeSelection?.mode ?? "whole-target";
}

function resultScope(result: ReviewResult): "whole-target" | "chunked" {
  return result.kind === "attested-local"
    && result.deliveryAdmission?.scopeSelection?.mode === "chunked"
    ? "chunked"
    : "whole-target";
}

function resultMatchesLaneAndSource(
  result: ReviewResult,
  request: ReviewPolicyCommandRequest,
  sourceId: string,
): boolean {
  if (request.lane === "frontline") {
    return result.kind === "frontline" && result.sourceIdentity === sourceId;
  }
  if (result.kind === "frontline") return false;
  return result.kind === "attested-local"
    ? sourceId === "delegated-agent"
    : result.sourceIdentity === sourceId;
}

function resultMatchesPolicy(
  result: ReviewResult,
  request: ReviewPolicyCommandRequest,
  maxPasses: number,
): boolean {
  if (result.kind === "frontline") {
    return result.outcome.maxPasses === maxPasses;
  }
  const requirement = result.requirement;
  return result.admission.policyVersion === requirement.policyVersion
    && canonicalize({
      obligation: requirement.obligation,
      reasons: [...requirement.reasons].sort(),
      rubricVersion: requirement.rubricVersion,
      rubricDigest: requirement.rubricDigest,
      retrigger: requirement.retrigger,
      count: requirement.count,
    }) === canonicalize({
      ...request.standardReview,
      reasons: [...request.standardReview.reasons].sort(),
    });
}

function validateTerminalResult(
  result: ReviewResult,
  request: ReviewPolicyCommandRequest,
  currentTargetInput: ReviewResult["target"],
  sourceId: string,
  operationId: string,
  maxPasses: number,
): void {
  const currentTarget = validateReviewTarget(currentTargetInput);
  if (result.producerId !== operationId) {
    throw new Error("review producer identity does not match the terminal attempt");
  }
  if (canonicalize(result.target) !== canonicalize(currentTarget)
    || result.target.headSha !== request.target.headSha) {
    throw new Error("review producer target does not match the current exact target");
  }
  if (result.kind === "hosted"
    && (result.hostedTarget.repository.toLowerCase() !== request.target.repository.toLowerCase()
      || result.hostedTarget.pullRequest !== request.target.pullRequest
      || result.hostedTarget.headSha !== request.target.headSha)) {
    throw new Error("hosted review producer target does not match the policy target");
  }
  if (!resultMatchesLaneAndSource(result, request, sourceId)) {
    throw new Error("review producer source does not match the terminal attempt");
  }
  if (result.admission.logicalPass !== request.completedPasses) {
    throw new Error("review producer logical pass does not match completed progress");
  }
  if (result.originalOutcome !== request.attempts.at(-1)?.outcome) {
    throw new Error("review producer outcome does not match the terminal attempt");
  }
  if (resultScope(result) !== requestScope(request)) {
    throw new Error("review producer scope does not match the selected scope");
  }
  if (!resultMatchesPolicy(result, request, maxPasses)) {
    throw new Error("review producer policy or rubric does not match the policy request");
  }
  if ((result.originalOutcome === "clean") !== (result.findings.length === 0)) {
    throw new Error("review producer outcome does not match its complete finding set");
  }
}

const severityRank = {
  minor: 1,
  major: 2,
  critical: 3,
} as const satisfies Record<ReviewSeverity, number>;

function greaterSeverity(left: ReviewSeverity | null, right: ReviewSeverity): ReviewSeverity {
  return left === null || severityRank[right] > severityRank[left] ? right : left;
}

async function deriveVerifiedTerminalSignal(
  result: ReviewResult,
  operationId: string,
  dispositionStore: ApprovedDispositionRecordStore,
): Promise<VerifiedTerminalReviewSignal> {
  if (result.originalOutcome === "clean") {
    return {
      reviewOperationId: operationId,
      confirmedFindingCount: 0,
      maxConfirmedSeverity: null,
      coverageAdequate: result.admission.effectiveCoverage === "complete",
    };
  }
  const record = await dispositionStore.readDispositionRecord(operationId);
  if (record === null) {
    throw new Error("terminal findings producer has no approved disposition record");
  }
  const approved = validateApprovedDispositionRecordForResult(record, result);
  let confirmedFindingCount = 0;
  let maxConfirmedSeverity: ReviewSeverity | null = null;
  for (const finding of approved.approvedDisposition.dispositionSet.findings) {
    if (finding.sourceVerification !== "verified") continue;
    confirmedFindingCount += 1;
    maxConfirmedSeverity = greaterSeverity(maxConfirmedSeverity, finding.verifiedSeverity);
  }
  return {
    reviewOperationId: operationId,
    confirmedFindingCount,
    maxConfirmedSeverity,
    coverageAdequate: result.admission.effectiveCoverage === "complete",
  };
}

/**
 * Bind a policy request after replacing a caller's terminal assertion with validated producer evidence.
 *
 * @param input - External command request containing only producer references for terminal attempts.
 * @param dependencies - Current target, configured policy, and repository-bound evidence readers.
 * @returns Internal reducer input containing only the verified signal derived from those records.
 */
export async function bindReviewPolicyEvidence(
  input: unknown,
  dependencies: EvidenceBoundReviewPolicyDependencies,
): Promise<ReviewPolicyRequest> {
  const request = ReviewPolicyCommandRequestSchema.parse(input);
  const lastAttempt = request.attempts.at(-1);
  if (lastAttempt === undefined
    || (lastAttempt.outcome !== "clean" && lastAttempt.outcome !== "findings")) {
    return ReviewPolicyRequestSchema.parse({
      ...request,
      sources: dependencies.sources,
      maxPasses: dependencies.maxPasses,
    });
  }
  const result = await dependencies.resultReader.readResult(lastAttempt.reviewOperationId);
  const currentTarget = await dependencies.confirmTarget(result.target);
  validateTerminalResult(
    result,
    request,
    currentTarget,
    lastAttempt.sourceId,
    lastAttempt.reviewOperationId,
    dependencies.maxPasses,
  );
  const verifiedTerminalSignal = await deriveVerifiedTerminalSignal(
    result,
    lastAttempt.reviewOperationId,
    dependencies.dispositionStore,
  );
  return ReviewPolicyRequestSchema.parse({
    ...request,
    sources: dependencies.sources,
    maxPasses: dependencies.maxPasses,
    verifiedTerminalSignal,
  });
}

/**
 * Resolve policy after replacing a caller's terminal assertion with validated producer evidence.
 *
 * @param input - External command request containing only producer references for terminal attempts.
 * @param dependencies - Current target, configured policy, and repository-bound evidence readers.
 * @returns The pure policy transition derived from the immutable producer and approved findings.
 */
export async function resolveEvidenceBoundReviewPolicy(
  input: unknown,
  dependencies: EvidenceBoundReviewPolicyDependencies,
): Promise<ReviewResolveEnvelope> {
  return resolveReviewPolicy(await bindReviewPolicyEvidence(input, dependencies));
}
