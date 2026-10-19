import { describe, expect, it } from "vitest";
import { deriveReviewOutcomePassCounts, reviewOutcomeIsOutdated } from "../../../../../../../src/lib/store/kinds/review/outcome/counts.js";
import { ReviewOutcomeSchema } from "../../../../../../../src/lib/store/kinds/review/outcome/schema.js";
import { outcomeEvidence } from "../../../../../../fixtures/review-outcome-evidence.js";
import { localOutcome, frontlineOutcome, hostedOutcome } from "../../../../../../fixtures/review-outcome.js";

function local(options: Parameters<typeof localOutcome>[0] = {}) {
  return ReviewOutcomeSchema.parse(localOutcome(options));
}

describe("stored lane pass counts", () => {
  it("counts distinct finished logical passes and selects the next ordinal", () => {
    const first = local();
    const third = local({ logicalPass: 3 });
    expect(deriveReviewOutcomePassCounts({ lane: "standard", lineage: first.lineage,
      outcomes: [first, first, third, ReviewOutcomeSchema.parse(frontlineOutcome())] })).toEqual({
      completedPasses: 2, completePasses: 2, inheritedCompletedPasses: 0, inheritedCompletePasses: 0,
      nextLogicalPass: 4,
    });
  });
  it("ignores failed and stale generations while their successful retry counts once", () => {
    const failed = local({ logicalPass: 1, outcome: "terminal-failure" });
    const retry = local({ logicalPass: 1, retryGeneration: 1 });
    const stale = ReviewOutcomeSchema.parse({ ...local({ logicalPass: 9, outcome: "terminal-failure" }), outcome: "stale-target" });
    expect(deriveReviewOutcomePassCounts({ lane: "standard", lineage: retry.lineage,
      outcomes: [failed, retry, stale] })).toMatchObject({ completedPasses: 1, completePasses: 1, nextLogicalPass: 2 });
  });
  it("advances the logical ordinal for an incremental verdict without spending a complete pass", () => {
    const first = local();
    const second = local({ logicalPass: 2, coverageAdmission: { requestedCoverage: "incremental", correctionScope: {
      schemaVersion: 1, predecessorProducerId: first.attemptId, predecessorHeadSha: first.target.headSha,
      basisHeadSha: first.target.headSha, headSha: first.target.headSha, requiredFindings: [],
    } } });
    expect(deriveReviewOutcomePassCounts({ lane: "standard", lineage: first.lineage, outcomes: [first, second] }))
      .toMatchObject({ completedPasses: 2, completePasses: 1, nextLogicalPass: 3 });
  });
  it("adds each Candidate ancestor's independent logical and complete counts", () => {
    const first = local();
    const lineage = { kind: "candidate" as const, candidateId: `sha256:${"f".repeat(64)}` as const };
    const second = local({ lineage, logicalPass: 2, coverageAdmission: { requestedCoverage: "incremental", correctionScope: {
      schemaVersion: 1, predecessorProducerId: first.attemptId, predecessorHeadSha: first.target.headSha,
      basisHeadSha: first.target.headSha, headSha: first.target.headSha, requiredFindings: [],
    } } });
    expect(deriveReviewOutcomePassCounts({ lane: "standard", lineage, outcomes: [second],
      ancestors: [{ lineage: first.lineage, outcomes: [first], evidence: [] }] })).toEqual({
      completedPasses: 2, completePasses: 1, inheritedCompletedPasses: 1, inheritedCompletePasses: 1, nextLogicalPass: 3,
    });
  });

  it("leaves an ancestor's unsettled findings outdated but carries its settled pass", () => {
    const first = local({ outcome: "findings", findings: [{ findingId: "finding-1", severity: "major",
      locus: "src/main.ts:1", evidenceUrlOrId: "finding:1", sourceOrdinal: 1 }] });
    const lineage = { kind: "candidate" as const, candidateId: `sha256:${"f".repeat(64)}` as const };
    const ancestor = { lineage: first.lineage, outcomes: [first], evidence: [] };
    const input = { lane: "standard" as const, lineage, outcomes: [], ancestors: [ancestor] };
    expect(deriveReviewOutcomePassCounts(input)).toMatchObject({ completedPasses: 0, completePasses: 0, nextLogicalPass: 1 });
    expect(deriveReviewOutcomePassCounts({ ...input,
      ancestors: [{ ...ancestor, evidence: [outcomeEvidence(first)] }] }))
      .toMatchObject({ completedPasses: 1, completePasses: 1, inheritedCompletedPasses: 1, nextLogicalPass: 2 });
  });
  it("keeps current findings counted and frontline accounting unchanged", () => {
    const outcome = ReviewOutcomeSchema.parse(frontlineOutcome({ findings: [{ findingId: "finding-1", severity: "major",
      locus: "src/main.ts:1", evidenceUrlOrId: "finding:1", sourceOrdinal: 1 }] }));
    expect(deriveReviewOutcomePassCounts({ lane: "frontline", lineage: outcome.lineage, outcomes: [outcome] }))
      .toEqual({ completedPasses: 1, completePasses: 1, inheritedCompletedPasses: 0, inheritedCompletePasses: 0,
        nextLogicalPass: 2 });
    expect(reviewOutcomeIsOutdated(outcome, [], false)).toBe(false);
    expect(reviewOutcomeIsOutdated(outcome, [], true)).toBe(true);
  });

  it.each(["partial", "ambiguous-delivery"])("marks a predecessor's %s outcome outdated without counting it", (status) => {
    const raw = hostedOutcome();
    const outcome = ReviewOutcomeSchema.parse({ ...raw, outcome: status, effectiveCoverage: null,
      hosted: { ...raw.hosted, effectiveCoverage: null, sealedResult: undefined } });
    expect(reviewOutcomeIsOutdated(outcome, [], true)).toBe(true);
    expect(reviewOutcomeIsOutdated(outcome, [], false)).toBe(false);
    expect(deriveReviewOutcomePassCounts({ lane: "standard", lineage: outcome.lineage, outcomes: [],
      ancestors: [{ lineage: outcome.lineage, outcomes: [outcome], evidence: [] }] }))
      .toMatchObject({ completedPasses: 0, completePasses: 0, nextLogicalPass: 1 });
  });

  it("keeps independently numbered ancestor owners distinct and ignores unrelated current owners", () => {
    const first = local();
    const lineage = { kind: "candidate" as const, candidateId: `sha256:${"f".repeat(64)}` as const };
    const current = local({ lineage });
    const unrelated = local({ lineage: { kind: "candidate", candidateId: `sha256:${"e".repeat(64)}` }, logicalPass: 7 });
    expect(deriveReviewOutcomePassCounts({ lane: "standard", lineage, outcomes: [current, unrelated],
      ancestors: [{ lineage: first.lineage, outcomes: [first], evidence: [] }] }))
      .toMatchObject({ completedPasses: 2, completePasses: 2, inheritedCompletedPasses: 1 });
  });
});
