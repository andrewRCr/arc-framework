/** Provisional ceiling position follows counted coverage rather than the attempt ordinal. */
import { describe, expect, it } from "vitest";
import { provisionalPassFactsFixture } from "../../../../fixtures/provisional-pass-facts.js";
import { findingsHostedResult, approvedRecord } from "../../../../fixtures/review-response-proof.js";
import { proposeDispositionSet } from "../../../../../src/scripts/review-gate/core/dispositions.js";
import { projectProvisionalPassAssessment } from "../../../../../src/scripts/review-gate/runtime/provisional-pass-assessment.js";
import { ProvisionalPassAssessmentSchema } from "../../../../../src/scripts/review-gate/core/provisional-pass-assessment.js";

const assessment = {
  status: "provisional", lane: "standard", admittedLogicalPass: 5, ceilingPassCount: 2, configuredMaxPasses: 2,
  proposedSignal: { confirmedFindingCount: 1, maxConfirmedSeverity: "major", materialFix: false },
  capPosition: "at-ceiling", fixConsequence: { kind: "no-fix" }, potentialStopReason: null,
  nextPassAuthority: "none", summaryText: "Complete pass count remains two after three fix checks.",
};

describe("provisional ceiling facts", () => {
  it("keeps the ceiling position unchanged after fix checks", () => {
    expect(ProvisionalPassAssessmentSchema.parse(assessment)).toMatchObject({ ceilingPassCount: 2, capPosition: "at-ceiling" });
    expect(ProvisionalPassAssessmentSchema.safeParse({ ...assessment, capPosition: "above-ceiling" }).success).toBe(false);
  });

  it("keeps frontline position on its admitted ordinal", () => {
    expect(ProvisionalPassAssessmentSchema.parse({ ...assessment, lane: "frontline", admittedLogicalPass: 2 }))
      .toMatchObject({ ceilingPassCount: 2, capPosition: "at-ceiling" });
  });

  it("admits incremental follow-up at the ceiling and still refuses complete follow-up", () => {
    const followUp = { ...assessment, proposedSignal: { ...assessment.proposedSignal, materialFix: true } };
    expect(ProvisionalPassAssessmentSchema.parse({ ...followUp,
      fixConsequence: { kind: "next-pass", coverage: "incremental-when-proven" } }).fixConsequence.kind).toBe("next-pass");
    expect(ProvisionalPassAssessmentSchema.safeParse({ ...followUp,
      fixConsequence: { kind: "next-pass", coverage: "complete" } }).success).toBe(false);
    expect(ProvisionalPassAssessmentSchema.parse({ ...followUp, fixConsequence: { kind: "ceiling-decision" },
      potentialStopReason: "cap-exhausted" }).potentialStopReason).toBe("cap-exhausted");
  });
});


it.each(["complete", "incremental"] as const)("projects %s coverage from the complete count", coverage => {
  const original = findingsHostedResult(["major"]);
  const logicalPass = coverage === "complete" ? 5 : 6;
  const result = { ...original, admission: { ...original.admission, logicalPass,
    requestedCoverage: coverage, effectiveCoverage: coverage,
    ...(coverage === "incremental" ? { correctionScope: { schemaVersion: 1 as const,
      predecessorProducerId: "complete-look-five", predecessorHeadSha: "b".repeat(40),
      basisHeadSha: "b".repeat(40), headSha: original.target.headSha, requiredFindings: [] } } : {}) } };
  const approved = approvedRecord(result, [{ sourceVerification: "verified", verifiedSeverity: "major", disposition: "defer" }]);
  const proposal = proposeDispositionSet(approved.approvedDispositionLineage[0]!.approvedDisposition.dispositionSet);
  const projected = projectProvisionalPassAssessment({ proposal, result, lane: "standard", admittedLogicalPass: logicalPass,
    configuredMaxPasses: 2, configuredSources: ["delegated-agent"],
    standardFacts: provisionalPassFactsFixture({ completePasses: 2, ceiling: 2 }) });
  expect(projected).toMatchObject({ admittedLogicalPass: logicalPass, ceilingPassCount: 2, capPosition: "at-ceiling" });
});
