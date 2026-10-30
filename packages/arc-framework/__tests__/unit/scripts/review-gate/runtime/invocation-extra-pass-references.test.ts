/** Native decision references require the backend that can resolve their stored authority. */
import { expect, it } from "vitest";
import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import { resolveReviewInvocation } from "../../../../../src/scripts/review-gate/runtime/invocation.js";
import { ReviewLaneJudgmentSchema } from "../../../../../src/scripts/review-gate/policy/review-policy-driver.js";
import { scriptGitExec } from "../../../../helpers/git-exec-fake.js";
import { createReviewHarness } from "../../../../helpers/store/review-harness.js";

it.each(["ceilingOverride", "additionalPassAuthorization"] as const)("refuses a %s decision reference in the repository arm and accepts a repaired judgment", field => {
  const input = { cwd: "/unavailable", exec: scriptGitExec([]).exec };
  const value = field === "ceilingOverride" ? { exhaustedPassCount: 2, nextPass: 3 }
    : { headSha: "a".repeat(40), precedingProducerId: "producer-1", completedPasses: 2, nextPass: 3 };
  const reference = ReviewLaneJudgmentSchema.parse({ [field]: { ...value, decisionKey: canonicalDigest({ field }) } });
  expect(() => resolveReviewInvocation(input, reference)).toThrow(/native review context.*retry/iu);
  const repaired = resolveReviewInvocation(input, ReviewLaneJudgmentSchema.parse({ [field]: value }));
  expect(repaired.store.capabilities.stateOffBranch).toBe(false);
  const native = createReviewHarness();
  expect(resolveReviewInvocation({ ...input, store: native.store }, reference).store.capabilities.stateOffBranch).toBe(true);
});
