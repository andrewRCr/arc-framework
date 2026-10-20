/** A native reference makes ownerless policy resolution require recorded context. */
import { expect, it } from "vitest";
import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import { resolveNativeOwnerlessReviewPolicy, ReviewPolicyContextError } from "../../../../../src/scripts/review-gate/runtime/review-policy-context.js";
import { ReviewPolicyCommandRequestSchema } from "../../../../../src/scripts/review-gate/policy/review-policy-driver.js";

it.each(["ceilingOverride", "additionalPassAuthorization"] as const)("requires an established owner for a cited %s decision", field => {
  const target = { repository: "owner/repo", pullRequest: null, headSha: "a".repeat(40) };
  const grant = field === "ceilingOverride" ? { target, lane: "standard", exhaustedPassCount: 0, nextPass: 1 }
    : { target, lane: "standard", precedingProducerId: "producer-1", completedPasses: 0, nextPass: 1 };
  const input = { schemaVersion: 1, target, lane: "standard", completedPasses: 0, attempts: [],
    standardReview: { obligation: "required", reasons: ["sensitive-change-set"], rubricVersion: "standard-review/v1",
      rubricDigest: canonicalDigest({ rubric: true }), retrigger: "full-final", count: 1 } };
  const policy = { sources: [], maxPasses: 2 };
  const referenced = ReviewPolicyCommandRequestSchema.parse({ ...input, [field]: { ...grant, decisionKey: canonicalDigest({ field }) } });
  expect(() => resolveNativeOwnerlessReviewPolicy(referenced, policy)).toThrow(ReviewPolicyContextError);
  expect(() => resolveNativeOwnerlessReviewPolicy(ReviewPolicyCommandRequestSchema.parse(input), policy)).not.toThrow();
});
