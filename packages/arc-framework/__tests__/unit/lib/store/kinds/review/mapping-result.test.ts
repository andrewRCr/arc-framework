/** Imported evidence addresses hosted outcomes by admission while preserving approved producer IDs. */
import { expect, it } from "vitest";
import { createReviewMappingResultResolver } from "../../../../../../src/lib/store/kinds/review/mapping-result.js";
import { ReviewOutcomeSchema } from "../../../../../../src/lib/store/kinds/review/outcome/schema.js";
import { hostedOutcome } from "../../../../../fixtures/review-outcome.js";
import { reviewEvidenceFixture } from "../../../../../fixtures/review-evidence.js";

function producer(logicalPass = 1) {
  return ReviewOutcomeSchema.parse(hostedOutcome({ logicalPass, outcome: "findings", findings: [{ findingId: "finding-1",
    severity: "major", sourceOrdinal: 1, origin: "review-body", reviewId: "review-1", fingerprint: "finding-1",
    settlement: "not-applicable", locus: "src/main.ts:1", url: "https://example.invalid/review", body: "A finding." }] }));
}

it("joins an acknowledged hosted producer to its admission key without rewriting the approved set", () => {
  const outcome = producer();
  const set = reviewEvidenceFixture(outcome).dispositionSet;
  const original = JSON.stringify(set);
  const resolve = createReviewMappingResultResolver([outcome]);
  const mapped = resolve(set);
  const expectedKey = outcome.hosted?.admission.admissionId.replace(/^hosted-admission\//u, "hosted-admission-");
  expect(mapped).toEqual({ result: { outcomeKey: expectedKey, resultDigest: set.resultDigest }, dispositionSet: set });
  expect(mapped?.dispositionSet.producerId).toBe(outcome.attemptId);
  expect(mapped?.dispositionSet.producerId).not.toBe(expectedKey);
  expect(JSON.stringify(set)).toBe(original);
});

it("does not substitute another hosted producer when an approved set's result was not mapped", () => {
  const outcome = producer();
  const other = producer(2);
  const set = reviewEvidenceFixture(other).dispositionSet;
  const resolve = createReviewMappingResultResolver([outcome]);
  expect(resolve(set)).toBeNull();
});
