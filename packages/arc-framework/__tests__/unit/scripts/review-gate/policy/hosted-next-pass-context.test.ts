/** Hosted context selection across the current subject and its earlier heads. */
import { describe, expect, it } from "vitest";
import { cleanHostedResult, findingsHostedResult, approvedRecord, performedFix } from "../../../../fixtures/review-response-proof.js";
import { createReviewTarget } from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { deriveHostedNextPassContext } from "../../../../../src/scripts/review-gate/policy/hosted-next-pass-context.js";

describe("hosted next-pass context", () => {
  it.each(["clean", "material-fix"] as const)("derives %s from an earlier owner attempt outside the current span", async outcome => {
    const predecessor = outcome === "clean" ? cleanHostedResult() : findingsHostedResult(["major"]);
    if (predecessor.kind !== "hosted") throw new Error("expected hosted producer");
    const { targetId: ignored, ...coordinates } = predecessor.target;
    void ignored;
    const target = createReviewTarget({ ...coordinates, headSha: "e".repeat(40) });
    const record = outcome === "clean" ? null : approvedRecord(predecessor, [{
      sourceVerification: "verified", verifiedSeverity: "major", disposition: "fix",
    }]);
    const { obligation, reasons, rubricVersion, rubricDigest, retrigger, count } = predecessor.requirement;
    const context = await deriveHostedNextPassContext({ target, readPassCounts: async () => ({ completePasses: 1, completedPasses: 1 }), lineage: predecessor.admission.lineage,
      configuredSources: ["delegated-agent"],
      standardReview: { obligation, reasons, rubricVersion, rubricDigest, retrigger, count },
      progress: [{ status: "recorded", completedPasses: 1, completePasses: 1, attempts: [],
        historicalAttempt: { attemptId: predecessor.producerId, logicalPass: 1, sourceId: predecessor.sourceIdentity,
          outcome: predecessor.originalOutcome, headSha: predecessor.target.headSha } }],
      evidence: { resultReader: { readResult: async () => predecessor },
        dispositionStore: { readDispositionRecord: async () => record,
          appendDispositionRecord: async () => { throw new Error("read-only"); } },
        readResponsePerformance: async () => record === null ? null
          : { ...performedFix(predecessor, record), producedHeadSha: target.headSha },
      }, cwd: "/repo", exec: async () => { throw new Error("unexpected Git read"); },
      observeTarget: async () => target,
    });
    expect(context).toMatchObject({ convergence: outcome === "clean" ? "converged" : "unconverged", responseDue: false });
    expect(context.incremental?.basis ?? null).toBe(outcome === "clean" ? null : "fix-check");
  });
});
