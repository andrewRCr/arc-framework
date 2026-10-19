/** Content-only approval and transition bindings for atomic performed responses. */
import type { z } from "zod";
import { canonicalize } from "../../../../kernel/index.js";
import type { DeliveryMemberReviewFixResponse } from "../../../../../scripts/review-gate/core/advisory-records.js";
import { createFixAuthorization } from "../../../../../scripts/review-gate/core/fix-authorization.js";
import type { ReviewEvidence } from "./schema.js";

/** Validate response identity and the complete fix transition carried inside one performance. */
export function validateEvidencePerformance(value: ReviewEvidence, context: z.RefinementCtx): void {
  const performance = value.performance;
  if (performance === undefined) return;
  const fail = (message: string) => { context.addIssue({ code: "custom", path: ["performance"], message }); };
  if (performance.producerId !== value.dispositionSet.producerId
    || performance.dispositionSetId !== value.dispositionSet.dispositionSetId) fail("performance must name its approved producer and set");
  const binding = value.binding;
  const candidate = binding?.kind === "candidate" || binding?.kind === "candidate-member";
  if (!candidate && performance.candidateResponseId !== undefined) fail("Candidate response digest requires a Candidate response binding");
  if (binding?.kind === "candidate-member" && binding.deliveryMember.head !== performance.originatingHeadSha) {
    fail("Candidate-owned private member must retain its original fix head");
  }
  validateFixOwnership(value, performance, fail);
}

function validateFixOwnership(value: ReviewEvidence, performance: NonNullable<ReviewEvidence["performance"]>,
  fail: (message: string) => void): void {
  const binding = value.binding;
  const response = performance.fixResponse;
  const needsResponse = binding?.kind === "errand" || binding?.kind === "delivery-member";
  if (needsResponse !== (response !== undefined)) fail("Errand and member performance requires exactly its complete fix response");
  if (response === undefined) return;
  if (binding?.kind !== "errand" && binding?.kind !== "delivery-member") return;
  const member = binding.kind === "delivery-member";
  if (member !== ("hostedFixTarget" in response)) fail("fix response must match its Errand or member ownership");
  validateFixAuthority(value, performance, response, fail);
  if (response.hostedTarget !== null && response.hostedTarget.headSha !== response.oldTarget.headSha) {
    fail("originating hosted target must retain the reviewed head");
  }
  if (binding.kind === "delivery-member") {
    if (response.oldTarget.kind !== "delivery-member" || response.newTarget.kind !== "delivery-member"
      || response.oldTarget.headSha !== binding.deliveryMember.head) fail("member performance must bind its exact old member target");
    if ("hostedFixTarget" in response) validateHostedTransition(response, fail);
  }
}

function validateFixAuthority(value: ReviewEvidence, performance: NonNullable<ReviewEvidence["performance"]>,
  response: NonNullable<NonNullable<ReviewEvidence["performance"]>["fixResponse"]>, fail: (message: string) => void): void {
  try {
    const authorization = createFixAuthorization({ dispositionState: { schemaVersion: 2, semanticsVersion: "review-gate/v2",
      state: "approved", dispositionSet: value.dispositionSet, approval: value.approval }, oldTarget: response.oldTarget });
    const consumed = response.fixConsumption;
    if (consumed.fixAuthorizationId !== authorization.fixAuthorizationId
      || consumed.dispositionSetId !== value.dispositionSet.dispositionSetId
      || consumed.oldTargetId !== response.oldTarget.targetId || consumed.newTargetId !== response.newTarget.targetId
      || consumed.oldHeadSha !== response.oldTarget.headSha || consumed.newHeadSha !== response.newTarget.headSha
      || performance.originatingHeadSha !== response.oldTarget.headSha || performance.producedHeadSha !== response.newTarget.headSha) {
      fail("performance must bind the exact authorization and target transition");
    }
  } catch (error) { fail(error instanceof Error ? error.message : "invalid performed authorization"); }
}

function validateHostedTransition(response: DeliveryMemberReviewFixResponse, fail: (message: string) => void): void {
  const before = response.hostedTarget;
  const after = response.hostedFixTarget;
  if ((before === null) !== (after === null)) fail("member host coordinates must be present together");
  if (before !== null && after !== null && (after.headSha !== response.newTarget.headSha
    || canonicalize({ ...after, headSha: before.headSha }) !== canonicalize(before))) {
    fail("member host coordinates must retain the originating change request across the changed head");
  }
}
