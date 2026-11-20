/** The fields an approved review response's policy request must carry to name its findings producer. */

import { z } from "zod";

import { canonicalize } from "../../../lib/kernel/index.js";
import type { ReviewPolicyCommandRequest } from "../policy/review-policy-driver.js";
import { GitObjectIdSchema, ReviewIdentifierSchema } from "./gate-contract-v2-schema.js";
import { ReviewPassSchema } from "./review-pass.js";
import { ReviewScopeModeSchema } from "./review-primitives.js";

/**
 * The producer binding a proposal returns for its approval: the lane, head, pull request (with its repository when
 * the producer is bound to one), scope mode and pass the lane's resolve request must name, and the findings attempt
 * its attempts must end in. The rest of the request is the caller's own routing input.
 */
export const ApprovalPolicyBindingSchema = z.strictObject({
  lane: z.enum(["frontline", "standard"]),
  headSha: GitObjectIdSchema,
  pullRequest: z.int().positive().nullable(),
  repository: z.string().trim().min(1).optional(),
  scopeMode: ReviewScopeModeSchema,
  completedPasses: ReviewPassSchema,
  finalAttempt: z.strictObject({
    outcome: z.literal("findings"),
    reviewOperationId: ReviewIdentifierSchema,
  }),
});
export type ApprovalPolicyBinding = z.infer<typeof ApprovalPolicyBindingSchema>;

function differs(field: string, actual: unknown, expected: unknown): string[] {
  return actual === expected ? [] : [`${field} is ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`];
}

function targetMismatches(request: ReviewPolicyCommandRequest, binding: ApprovalPolicyBinding): string[] {
  const repositoryMatches = binding.repository === undefined
    || request.target.repository.toLowerCase() === binding.repository.toLowerCase();
  const scopeTargetMatches = request.scopeSelection === undefined
    || canonicalize(request.scopeSelection.target) === canonicalize(request.target);
  return [
    ...differs("lane", request.lane, binding.lane),
    ...differs("target.headSha", request.target.headSha, binding.headSha),
    ...differs("target.pullRequest", request.target.pullRequest, binding.pullRequest),
    ...(repositoryMatches ? [] : differs("target.repository", request.target.repository, binding.repository)),
    ...differs("scopeSelection.mode", request.scopeSelection?.mode ?? "whole-target", binding.scopeMode),
    ...(scopeTargetMatches ? [] : ["scopeSelection.target differs from target, expected the same target"]),
  ];
}

function producerMismatches(request: ReviewPolicyCommandRequest, binding: ApprovalPolicyBinding): string[] {
  const expected = binding.finalAttempt.reviewOperationId;
  const last = request.attempts.at(-1);
  const lastProducer = last !== undefined && "reviewOperationId" in last ? last.reviewOperationId : undefined;
  const attempt = last === undefined ? "no attempt" : `a ${last.outcome} attempt ${lastProducer ?? "without an operation"}`;
  return [
    ...differs("completedPasses", request.completedPasses, binding.completedPasses),
    ...(last?.outcome === "findings" && lastProducer === expected
      ? []
      : [`attempts end in ${attempt}, expected the findings attempt ${expected}`]),
  ];
}

/**
 * Name every field of an approved response's policy request that does not match its producer binding.
 *
 * @returns One "field is X, expected Y" clause per mismatch; empty when the request names the producer exactly.
 */
export function approvalPolicyBindingMismatches(
  request: ReviewPolicyCommandRequest,
  binding: ApprovalPolicyBinding,
): string[] {
  return [...targetMismatches(request, binding), ...producerMismatches(request, binding)];
}
