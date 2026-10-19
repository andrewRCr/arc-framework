/** Response performance and immutable-base coverage for correction legs. */
import { describe, expect, it } from "vitest";
import { findingsHostedResult, approvedRecord, performedFix } from "../../../../fixtures/review-response-proof.js";
import { createReviewTarget } from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { confirmPerformedResponse } from "../../../../../src/scripts/review-gate/policy/performed-response-proof.js";
const objectId = (character: string): string => character.repeat(40);
function store(record: ReturnType<typeof approvedRecord> | null) {
  return { readDispositionRecord: async () => record,
    appendDispositionRecord: async () => { throw new Error("read-only proof"); } };
}

describe("performed change-set response proof", () => {
  it("proves the approved response's exact produced head at the same base", async () => {
    const predecessor = findingsHostedResult(["major"]);
    const record = approvedRecord(predecessor, [{
      sourceVerification: "verified", verifiedSeverity: "major", disposition: "fix",
    }]);
    const { targetId: _targetId, ...coordinates } = predecessor.target;
    void _targetId;
    const currentTarget = createReviewTarget({ ...coordinates, headSha: objectId("e") });
    const performance = { ...performedFix(predecessor, record), producedHeadSha: currentTarget.headSha };
    await expect(confirmPerformedResponse({
      predecessor, currentTarget, currentLineage: predecessor.admission.lineage,
      dispositionStore: store(record),
      readResponsePerformance: async () => performance,
    })).resolves.toBe("applicable");
  });

  it.each(["base ref", "base commit", "base tree", "unapproved", "unperformed", "other head",
    "other producer", "other origin", "other approval", "unsettled host", "delivery target"])(
    "refuses a leg with %s", async (variation) => {
      const initial = findingsHostedResult(["major"]);
      const predecessor = variation === "unsettled host" && initial.kind === "hosted"
        ? { ...initial, hostSettlementFindingIds: ["finding-1"], settled: false } : initial;
      const record = approvedRecord(predecessor, [{
        sourceVerification: "verified", verifiedSeverity: "major", disposition: "fix",
      }]);
      const { targetId: _targetId, ...coordinates } = predecessor.target;
    void _targetId;
      const currentTarget = createReviewTarget({ ...coordinates, headSha: objectId("e"),
        ...(variation === "base ref" ? { baseRef: "release" } : {}),
        ...(variation === "base commit" ? { diffBaseSha: objectId("f") } : {}),
        ...(variation === "base tree" ? { diffBaseTree: objectId("f") } : {}),
        ...(variation === "delivery target" ? { kind: "delivery-member" } : {}),
      });
      const performance = { ...performedFix(predecessor, record), producedHeadSha: currentTarget.headSha,
        ...(variation === "other head" ? { producedHeadSha: objectId("f") } : {}),
        ...(variation === "other producer" ? { producerId: "another" } : {}),
        ...(variation === "other origin" ? { originatingHeadSha: objectId("f") } : {}),
        ...(variation === "other approval" ? { dispositionSetId: `sha256:${"f".repeat(64)}` as const } : {}),
      };
      await expect(confirmPerformedResponse({
        predecessor, currentTarget, currentLineage: predecessor.admission.lineage,
        dispositionStore: store(variation === "unapproved" ? null : record),
        readResponsePerformance: async () => variation === "unperformed" ? null : performance,
      })).resolves.toBe("unavailable");
    },
  );
});
