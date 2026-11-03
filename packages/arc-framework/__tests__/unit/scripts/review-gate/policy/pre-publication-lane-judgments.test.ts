/** Repository pre-publication relays cannot interpret native decision references. */
import { expect, it } from "vitest";
import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import { applyPrePublicationExtraPassJudgment } from "../../../../../src/scripts/review-gate/policy/pre-publication-lane-judgments.js";
import { ReviewPolicyCommandRequestSchema } from "../../../../../src/scripts/review-gate/policy/review-policy-driver.js";

it.each(["ceilingOverride", "additionalPassAuthorization"] as const)("refuses an in-repository pre-publication %s reference and binds after repair", field => {
  const target = { repository: "owner/repo", pullRequest: null, headSha: "a".repeat(40) };
  const request = ReviewPolicyCommandRequestSchema.parse({ schemaVersion: 1, target, lane: "standard", completedPasses: 2,
    attempts: [], standardReview: { obligation: "required", reasons: ["sensitive-change-set"], rubricVersion: "standard-review/v1",
      rubricDigest: canonicalDigest({ rubric: true }), retrigger: "full-final", count: 1 } });
  const value = field === "ceilingOverride" ? { exhaustedPassCount: 2, nextPass: 3 }
    : { headSha: target.headSha, precedingProducerId: "producer-1", completedPasses: 2, nextPass: 3 };
  const input = { native: false, lane: "standard" as const, policyTarget: target };
  expect(() => applyPrePublicationExtraPassJudgment(request, { ...input,
    judgment: { [field]: { ...value, decisionKey: canonicalDigest({ field }) } } })).toThrow(/native review context.*retry/iu);
  expect(applyPrePublicationExtraPassJudgment(request, { ...input, judgment: { [field]: value } }))
    .toHaveProperty(`${field}.target`, target);
});

it("does not restore a spent override after composing the fresh successor", () => {
  const target = { repository: "owner/repo", pullRequest: null, headSha: "a".repeat(40) };
  const request = ReviewPolicyCommandRequestSchema.parse({ schemaVersion: 1, target, lane: "standard", completedPasses: 3,
    attempts: [], standardReview: { obligation: "required", reasons: ["sensitive-change-set"], rubricVersion: "standard-review/v1",
      rubricDigest: canonicalDigest({ rubric: true }), retrigger: "full-final", count: 1 } });
  expect(applyPrePublicationExtraPassJudgment(request, { native: false, lane: "standard", policyTarget: target,
    judgment: { ceilingOverride: { exhaustedPassCount: 2, nextPass: 3 } } }).ceilingOverride).toBeUndefined();
});
