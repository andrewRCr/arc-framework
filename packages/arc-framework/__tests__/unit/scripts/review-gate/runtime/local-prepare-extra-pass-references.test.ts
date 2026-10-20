/** Repository preparation refuses native decision locators before replay or admission. */
import { expect, it } from "vitest";
import { createLocalReviewPreparationFixture, createDeliveryLocalReviewAdmission } from "../../../../fixtures/local-review-preparation.js";
import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import { prepareLocalReview } from "../../../../../src/scripts/review-gate/runtime/local-prepare.js";

it.each(["policy", "delivery"] as const)("refuses an in-repository %s decision reference and prepares after repair", async form => {
  const h = createLocalReviewPreparationFixture();
  const request = { schemaVersion: 1, evaluatorIdentity: "evaluator-1", routingFacts: {
    contentKind: "code-bearing", reviewRisk: "routine", changeDeterminacy: "ordinary", ownership: "self", surfaceAuthority: "ordinary" } };
  const decisionKey = canonicalDigest({ form }), value = { exhaustedPassCount: 0, nextPass: 1, decisionKey };
  const referenced = form === "policy" ? { ...request, policyJudgment: { ceilingOverride: value } }
    : { ...request, deliveryAdmission: { ...createDeliveryLocalReviewAdmission(h.memberTarget.headSha),
      ceilingOverride: { ...value, lane: "standard", target: { repository: "owner/repository", pullRequest: 41, headSha: h.memberTarget.headSha } } } };
  await expect(prepareLocalReview(referenced, h.dependencies)).rejects.toThrow(/native review context.*retry/iu);
  expect(h.published()).toBeNull();
  expect(await prepareLocalReview(request, h.dependencies)).toMatchObject({ state: "ready", nextAction: "launch-review" });
});
