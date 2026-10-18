/** Incremental admissions recover by dropping complete-pass ceiling authority. */
import { describe, expect, it } from "vitest";
import { findingsHostedResult, approvedRecord, performedFix } from "../../../../fixtures/review-response-proof.js";
import { createReviewTarget } from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { deriveReviewNextPassContext } from "../../../../../src/scripts/review-gate/policy/review-next-pass.js";
import { ReviewPolicyCommandRequestSchema, resolveReviewPolicy } from "../../../../../src/scripts/review-gate/policy/review-policy-driver.js";
import { ReviewDriverAdmissionError } from "../../../../../src/scripts/review-gate/policy/review-execution-admission.js";
import { localPrepareAdmissionRemedy, requireReviewSourceSelection, reviewResolveRemedy } from "../../../../../src/scripts/review-gate/runtime/review-policy-remedy.js";
import { LocalPrepareRequestSchema } from "../../../../../src/scripts/review-gate/runtime/local-prepare.js";

async function fixture() {
  const result = findingsHostedResult(["major"]);
  if (result.kind !== "hosted") throw new Error("expected hosted producer");
  const record = approvedRecord(result, [{ sourceVerification: "verified", verifiedSeverity: "major", disposition: "fix" }]);
  const { targetId: _id, ...coordinates } = result.target; void _id;
  const currentTarget = createReviewTarget({ ...coordinates, headSha: "e".repeat(40) });
  const { obligation, reasons, rubricVersion, rubricDigest, retrigger, count } = result.requirement;
  const standardReview = { obligation, reasons, rubricVersion, rubricDigest, retrigger, count };
  const nextPassContext = await deriveReviewNextPassContext({ completedPasses: 1, completePasses: 1,
    predecessor: result, currentTarget, currentLineage: result.admission.lineage, standardReview,
    resultReader: { readResult: async () => result },
    dispositionStore: { readDispositionRecord: async () => record, appendDispositionRecord: async () => { throw new Error("read-only"); } },
    readResponsePerformance: async () => ({ ...performedFix(result, record), producedHeadSha: currentTarget.headSha }),
  });
  if (nextPassContext.incremental === null) throw new Error("expected proven fix check");
  const target = { ...result.hostedTarget, headSha: currentTarget.headSha };
  const request = ReviewPolicyCommandRequestSchema.parse({ schemaVersion: 1, target, lane: "standard", standardReview,
    completedPasses: 1, attempts: [], ceilingOverride: { target, lane: "standard", exhaustedPassCount: 1, nextPass: 2 } });
  const facts = { sources: ["delegated-agent"], maxPasses: 1, nextPassContext, chosenCoverage: "incremental" };
  const internal = { ...request, ...facts };
  const resolution = resolveReviewPolicy(internal);
  const local = LocalPrepareRequestSchema.parse({ schemaVersion: 1, evaluatorIdentity: "delegated-agent",
    routingFacts: { contentKind: "code-bearing", reviewRisk: "routine", changeDeterminacy: "ordinary", ownership: "self", surfaceAuthority: "ordinary" },
    policyJudgment: { scopeMode: "whole-target", ceilingOverride: { exhaustedPassCount: 1, nextPass: 2 } },
    coverageAdmission: { requestedCoverage: "incremental", correctionScope: nextPassContext.incremental.scope } });
  return { request, internal, facts, resolution, local };
}

describe("incremental override recovery", () => {
  it("replays resolve without its override and admits the incremental look", async () => {
    const { request, facts, resolution } = await fixture();
    expect(() => requireReviewSourceSelection(resolution, request)).toThrow(ReviewDriverAdmissionError);
    const error = new ReviewDriverAdmissionError("refused", resolution, request);
    const remedy = reviewResolveRemedy(error, request);
    expect(remedy).toMatchObject({ argv: ["arc", "review", "resolve", "-"], stdin: expect.not.objectContaining({ ceilingOverride: expect.anything() }) });
    expect(remedy?.text).toMatch(/complete.*coverage/iu);
    const corrected = ReviewPolicyCommandRequestSchema.parse(remedy?.stdin);
    expect(resolveReviewPolicy({ ...corrected, ...facts })).toMatchObject({
      state: "ready", payload: { ceilingOverrideApplied: false } });
  });

  it("replays local prepare with its incremental scope and without the override", async () => {
    const { internal, resolution, local } = await fixture();
    const remedy = localPrepareAdmissionRemedy(new ReviewDriverAdmissionError("refused", resolution), local);
    expect(remedy).toMatchObject({ argv: ["arc", "review", "local", "prepare", "-"] });
    const corrected = LocalPrepareRequestSchema.parse(remedy?.stdin);
    expect(corrected.coverageAdmission).toEqual(local.coverageAdmission);
    expect(corrected.policyJudgment).toEqual({ scopeMode: "whole-target" });
    expect(resolveReviewPolicy({ ...internal, ceilingOverride: corrected.policyJudgment?.ceilingOverride })).toMatchObject({ state: "ready" });
  });
});
