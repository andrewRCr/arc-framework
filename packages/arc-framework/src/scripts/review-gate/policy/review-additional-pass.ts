/** Exact Owner authorization for another standard pass after convergence. */

import { z } from "zod";
import type { ReviewAttempt } from "./review-policy-attempt.js";
import type { ReviewPolicyRequest } from "./review-policy-driver.js";

import { GitObjectIdSchema, ReviewIdentifierSchema, ReviewCanonicalDigestSchema } from "../core/gate-contract-v2-schema.js";
import { CompletedReviewPassCountSchema, ReviewPassSchema } from "../core/review-pass.js";

export const ReviewPolicyTargetSchema = z.strictObject({
  repository: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u),
  pullRequest: z.int().positive().nullable(),
  headSha: GitObjectIdSchema,
}).readonly();

export const ReviewAdditionalPassAuthorizationSchema = z.strictObject({
  target: ReviewPolicyTargetSchema,
  lane: z.literal("standard"),
  precedingProducerId: ReviewIdentifierSchema,
  completedPasses: CompletedReviewPassCountSchema,
  nextPass: ReviewPassSchema,
  decisionKey: ReviewCanonicalDigestSchema.optional(),
}).readonly();
export type ReviewAdditionalPassAuthorization = z.infer<typeof ReviewAdditionalPassAuthorizationSchema>;

function sameReviewTarget(
  left: z.infer<typeof ReviewPolicyTargetSchema>,
  right: z.infer<typeof ReviewPolicyTargetSchema>,
): boolean {
  return left.repository.toLowerCase() === right.repository.toLowerCase()
    && left.pullRequest === right.pullRequest
    && left.headSha === right.headSha;
}

function convergedSignal(signal: { coverageAdequate: boolean; materialFix: boolean } | undefined): boolean {
  return signal !== undefined && signal.coverageAdequate && !signal.materialFix;
}

/** Retain an immutable additional-pass predecessor independently of successor source eligibility. */
export function verifiedAdditionalPassPredecessor(request: {
  attempts: readonly ReviewAttempt[];
  additionalPassAuthorization?: { precedingProducerId: string };
  verifiedTerminalSignal?: { reviewOperationId: string };
}): ReviewAttempt | undefined {
  const terminal = request.attempts.at(-1);
  return request.additionalPassAuthorization !== undefined
    && (terminal?.outcome === "clean" || terminal?.outcome === "findings")
    && request.verifiedTerminalSignal?.reviewOperationId === terminal.reviewOperationId
    ? terminal : undefined;
}

type FixCheckSuccessorRequest = Pick<ReviewPolicyRequest, "lane" | "attempts" | "verifiedTerminalSignal"
  | "standardReview" | "nextPassContext" | "chosenCoverage">;

/** Recognize a verified clean incremental result that still requires its complete final successor. */
export function isCleanFixCheckCompleteSuccessor(request: FixCheckSuccessorRequest): boolean {
  const terminal = request.attempts.at(-1);
  const signal = request.verifiedTerminalSignal;
  return request.lane === "standard" && terminal?.outcome === "clean"
    && signal?.reviewOperationId === terminal.reviewOperationId
    && signal.effectiveCoverage === "incremental" && !signal.materialFix
    && request.standardReview.retrigger === "full-final"
    && request.nextPassContext?.convergence === "converged" && !request.nextPassContext.responseDue
    && request.chosenCoverage !== "incremental"
    && (request.chosenCoverage === "complete" || request.nextPassContext.incremental === null);
}

/**
 * Validate an elective pass against the exact latest converged producer and pass count.
 *
 * @param input - Live policy target, progress, signal, and Owner authorization.
 * @returns A typed mismatch reason, or null when the authorization is admissible.
 */
export function invalidAdditionalPassReason(input: {
  target: z.infer<typeof ReviewPolicyTargetSchema>;
  lane: "standard" | "frontline";
  completedPasses: number;
  authorization?: ReviewAdditionalPassAuthorization;
  terminal?: { outcome: string; reviewOperationId?: string };
  signal?: { coverageAdequate: boolean; materialFix: boolean };
  successor?: FixCheckSuccessorRequest;
}): "target-mismatch" | "lane-mismatch" | "pass-count-mismatch" | "next-pass-mismatch"
  | "preceding-producer-mismatch" | "pass-not-converged" | null {
  const { authorization } = input;
  if (authorization === undefined) return null;
  if (!sameReviewTarget(authorization.target, input.target)) return "target-mismatch";
  if (authorization.lane !== input.lane) return "lane-mismatch";
  if (authorization.completedPasses !== input.completedPasses) return "pass-count-mismatch";
  if (authorization.nextPass !== input.completedPasses + 1) return "next-pass-mismatch";
  if ((input.terminal?.outcome !== "clean" && input.terminal?.outcome !== "findings")
    || input.terminal.reviewOperationId !== authorization.precedingProducerId) {
    return "preceding-producer-mismatch";
  }
  if (!convergedSignal(input.signal)
    && (input.successor === undefined || !isCleanFixCheckCompleteSuccessor(input.successor))) return "pass-not-converged";
  return null;
}

/** Project a full additional grant into a relay judgment without losing its recorded decision. */
export function projectReviewAdditionalPassJudgment(authorization: ReviewAdditionalPassAuthorization):
  Omit<ReviewAdditionalPassAuthorization, "target" | "lane"> & { readonly headSha: string } {
  return { headSha: authorization.target.headSha, precedingProducerId: authorization.precedingProducerId,
    completedPasses: authorization.completedPasses, nextPass: authorization.nextPass,
    ...(authorization.decisionKey === undefined ? {} : { decisionKey: authorization.decisionKey }) };
}
