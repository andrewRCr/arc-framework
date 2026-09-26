/** Exact Owner authorization for another standard pass after convergence. */

import { z } from "zod";

import { GitObjectIdSchema, ReviewIdentifierSchema } from "../core/gate-contract-v2-schema.js";
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

function convergedSignal(signal: {
  coverageAdequate: boolean;
  maxConfirmedSeverity: "critical" | "major" | "minor" | null;
} | undefined): boolean {
  return signal !== undefined && signal.coverageAdequate
    && signal.maxConfirmedSeverity !== "major"
    && signal.maxConfirmedSeverity !== "critical";
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
  signal?: { coverageAdequate: boolean; maxConfirmedSeverity: "critical" | "major" | "minor" | null };
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
  if (!convergedSignal(input.signal)) return "pass-not-converged";
  return null;
}
