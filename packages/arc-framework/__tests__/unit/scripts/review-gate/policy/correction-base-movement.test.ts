/** Correction chains cannot inherit a delivery response's re-anchor across a moved base. */
import { describe, expect, it } from "vitest";
import { createReviewTarget } from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import type { EarlierHostedAttemptApplicabilityRead } from "../../../../../src/scripts/review-gate/policy/earlier-review-applicability.js";
import { incrementalApplicabilityFromEarlierRead } from "../../../../../src/scripts/review-gate/policy/hosted-reservation-support.js";
import { cleanHostedResult } from "../../../../fixtures/review-response-proof.js";

function fixture() {
  const { targetId: _targetId, ...coordinates } = cleanHostedResult().target; void _targetId;
  const producerTarget = createReviewTarget({ ...coordinates, kind: "delivery-member" });
  const currentTarget = createReviewTarget({ ...coordinates, kind: "delivery-member", headSha: "e".repeat(40), headTree: "f".repeat(40) });
  const earlier: EarlierHostedAttemptApplicabilityRead = { status: "complete", attempts: [{
    operationId: "lane-progress-standard", attemptId: "prior-producer", logicalPass: 1,
    updatedAt: "2026-10-18T00:00:00Z", sourceId: "delegated-agent", outcome: "settled-findings",
    requestedCoverage: "complete", effectiveCoverage: "complete", scopeMode: "whole-target", producerTarget,
    applicability: "retain-prior-attempt", retentionBasis: "verified-fix-response",
  }] };
  return { producerId: "prior-producer", producerTarget, currentTarget, earlier };
}

describe("correction-chain base movement", () => {
  it.each(["baseRef", "diffBaseSha", "diffBaseTree"] as const)("refuses a fix-response re-anchor across changed %s", field => {
    const input = fixture();
    const { targetId: _targetId, ...coordinates } = input.currentTarget; void _targetId;
    const currentTarget = createReviewTarget({ ...coordinates, [field]: field === "baseRef" ? "release" : "1".repeat(40) });
    expect(incrementalApplicabilityFromEarlierRead({ ...input, currentTarget })).toBe("review-required");
  });
  it("keeps the verified fix leg at an unchanged base", () => {
    expect(incrementalApplicabilityFromEarlierRead(fixture())).toBe("applicable");
  });
  it("keeps ordinary contribution retention across a base move", () => {
    const input = fixture();
    const { targetId: _targetId, ...coordinates } = input.currentTarget; void _targetId;
    const currentTarget = createReviewTarget({ ...coordinates, diffBaseSha: "1".repeat(40) });
    if (input.earlier.status !== "complete") throw new Error("expected complete read");
    const earlier = { ...input.earlier, attempts: input.earlier.attempts.map(({ retentionBasis: _basis, ...attempt }) => {
      void _basis; return { ...attempt, outcome: "clean" };
    }) };
    expect(incrementalApplicabilityFromEarlierRead({ ...input, currentTarget, earlier })).toBe("applicable");
  });
});
