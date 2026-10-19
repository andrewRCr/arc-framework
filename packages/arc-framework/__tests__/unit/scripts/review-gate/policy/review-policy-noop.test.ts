/** Disabled and exempt review policies need no next-pass evidence. */
import { expect, it } from "vitest";
import { resolveReviewPolicy } from "../../../../../src/scripts/review-gate/policy/review-policy-driver.js";
import { responsePolicyRequestFixture } from "../../../../fixtures/review-response-policy.js";

it.each([
  { sources: [], obligation: "required" },
  { sources: ["codex-pr"], obligation: "exempt" },
] as const)("returns no-op without a next-pass context for $obligation with $sources", ({ sources, obligation }) => {
  const request = responsePolicyRequestFixture({ headSha: "a".repeat(40) });
  expect(resolveReviewPolicy({ ...request, attempts: [], completedPasses: 0, sources, maxPasses: 2,
    standardReview: { ...request.standardReview, obligation } })).toMatchObject({
    state: "no-op", nextAction: "none", payload: { consumedPass: false, attemptedSources: [] },
  });
});
