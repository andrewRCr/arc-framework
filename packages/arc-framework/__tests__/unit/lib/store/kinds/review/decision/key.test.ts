import { describe, expect, it } from "vitest";
import { reviewDecisionKey } from "../../../../../../../src/lib/store/kinds/review/decision/key.js";
import { ReviewDecisionSchema } from "../../../../../../../src/lib/store/kinds/review/decision/schema.js";
import { computeConditionalPassAuthorizationId } from
  "../../../../../../../src/scripts/review-gate/core/operation-state-schema.js";
import { ReviewOutcomeSchema } from "../../../../../../../src/lib/store/kinds/review/outcome/schema.js";
import { terminusDecision, extraPassDecision, approvedFixDecision } from "../../../../../../fixtures/review-decision.js";
import { deriveReviewOutcomePassCounts } from "../../../../../../../src/lib/store/kinds/review/outcome/counts.js";
import { hostedOutcome, localOutcome, frontlineOutcome } from "../../../../../../fixtures/review-outcome.js";

const base = terminusDecision();
describe("review decision identities", () => {
  it.each([
    { ...base, decidedBy: "another-owner" }, { ...base, basis: { passCount: 3 } },
    { ...base, subject: { ...base.subject, subjectDigest: `sha256:${"a".repeat(64)}` } },
    extraPassDecision(),
  ])("distinguishes a different decider, basis, subject, or choice", (value) => {
    expect(reviewDecisionKey(ReviewDecisionSchema.parse(value))).not.toBe(reviewDecisionKey(base));
  });

  it.each([hostedOutcome({ logicalPass: 2 }), localOutcome({ logicalPass: 2 }), frontlineOutcome()])(
    "keeps the production approved-fix authorization identity for $source.kind", (raw) => {
      const outcome = ReviewOutcomeSchema.parse(raw);
      const decision = ReviewDecisionSchema.parse(approvedFixDecision(outcome));
      if (decision.choice.kind !== "extra-pass" || decision.choice.precondition.kind !== "approved-fix"
        || decision.decidedBy === null) throw new Error("expected approved-fix decision");
      const binding = decision.choice.precondition;
      const expected = computeConditionalPassAuthorizationId({ authorizedBy: decision.decidedBy,
        repositoryId: binding.repositoryId, lane: decision.lane, lineage: decision.subject.lineage,
        producerId: outcome.attemptId, dispositionSetId: binding.dispositionSetId,
        originatingHeadSha: binding.originatingHeadSha, exhaustedPassCount: outcome.logicalPass,
        nextPass: outcome.logicalPass + 1 });
      expect(reviewDecisionKey(decision)).toBe(expected);
    },
  );
  it("gives the same answer one key at two recording times and after import", () => {
    expect(reviewDecisionKey({ ...base, decidedAt: "2026-10-19T14:00:00Z" })).toBe(reviewDecisionKey(base));
    expect(reviewDecisionKey({ ...base, decidedAt: null })).toBe(reviewDecisionKey(base));
    expect(reviewDecisionKey(JSON.parse(JSON.stringify(base)))).toBe(reviewDecisionKey(base));
  });

  it("keeps completed logical counts in every extra-pass identity independently of ceiling counts", () => {
    const first = ReviewOutcomeSchema.parse(localOutcome());
    const second = ReviewOutcomeSchema.parse(localOutcome({ logicalPass: 2, coverageAdmission: {
      requestedCoverage: "incremental", correctionScope: { schemaVersion: 1, predecessorProducerId: first.attemptId,
        predecessorHeadSha: first.target.headSha, basisHeadSha: first.target.headSha, headSha: first.target.headSha,
        requiredFindings: [] } } }));
    const counts = deriveReviewOutcomePassCounts({ lane: "standard", lineage: first.lineage, outcomes: [first, second] });
    expect(counts).toMatchObject({ completedPasses: 2, completePasses: 1, nextLogicalPass: 3 });
    const fix = approvedFixDecision(second);
    for (const decision of [extraPassDecision(), extraPassDecision("additional"), fix]) {
      const parsed = ReviewDecisionSchema.parse(decision);
      if (parsed.choice.kind !== "extra-pass") throw new Error("expected extra pass");
      const choice = parsed.choice;
      const ceilingUnits = ReviewDecisionSchema.parse({ ...parsed,
        choice: { ...choice, passCount: counts.completePasses,
          precondition: choice.precondition.kind === "approved-fix"
            ? { ...choice.precondition, exhaustedPassCount: counts.completePasses } : choice.precondition } });
      expect(choice.passCount).toBe(counts.completedPasses);
      expect(reviewDecisionKey(parsed)).not.toBe(reviewDecisionKey(ceilingUnits));
    }
  });
});
