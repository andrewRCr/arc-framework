/** A delivery correction leg needs the member response that produced its exact target. */
import { SlugSchema } from "../../../../../src/lib/kernel/schema/slug.js";
import { describe, expect, it } from "vitest";
import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import { createReviewRequirement, createReviewTarget } from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { ApprovedDispositionRecordSchema } from "../../../../../src/scripts/review-gate/core/advisory-records.js";
import { createFixAuthorization, consumeFixAuthorization } from "../../../../../src/scripts/review-gate/core/fix-authorization.js";
import { confirmReviewCorrectionLeg } from "../../../../../src/scripts/review-gate/policy/review-next-pass.js";
import { approvedRecord, findingsHostedResult, performedFix } from "../../../../fixtures/review-response-proof.js";

function fixture() {
  const template = findingsHostedResult(["major"]);
  if (template.kind !== "hosted") throw new Error("expected hosted result");
  const { targetId: _targetId, ...coordinates } = template.target; void _targetId;
  const oldTarget = createReviewTarget({ ...coordinates, kind: "delivery-member" });
  const currentTarget = createReviewTarget({ ...coordinates, kind: "delivery-member", headSha: "e".repeat(40), headTree: "f".repeat(40) });
  const lineage = { kind: "delivery-member" as const, planId: "123e4567-e89b-12d3-a456-426614174000",
    deliverableId: canonicalDigest({ member: 1 }), workUnitId: SlugSchema.parse("example") };
  const requirement = createReviewRequirement({ target: oldTarget,
    projection: { obligation: template.requirement.obligation, reasons: template.requirement.reasons,
      rubricVersion: template.requirement.rubricVersion, rubricDigest: template.requirement.rubricDigest,
      retrigger: template.requirement.retrigger, count: template.requirement.count },
    acceptableSources: template.requirement.acceptableSources, initialAdmission: "automatic" });
  if (requirement === null) throw new Error("expected requirement");
  const predecessor = { ...template, target: oldTarget, requirement,
    admission: { ...template.admission, lineage, policyVersion: requirement.policyVersion } };
  const approved = approvedRecord(predecessor, [{ sourceVerification: "verified", verifiedSeverity: "major", disposition: "fix" }]);
  const node = approved.approvedDispositionLineage[0]!;
  const authorization = createFixAuthorization({ dispositionState: node.approvedDisposition, oldTarget });
  const record = ApprovedDispositionRecordSchema.parse({ ...approved,
    deliveryMember: { ...lineage, head: oldTarget.headSha },
    approvedDispositionLineage: [{ ...node, fixAuthorization: authorization, deliveryMemberFixResponse: {
      oldTarget, newTarget: currentTarget, applicability: "focused",
      fixConsumption: consumeFixAuthorization({ authorization, oldTarget, newTarget: currentTarget,
        appliedBy: "agent", consumedAt: "2026-10-18T00:01:00Z", verificationRefs: ["test://fix"], priorConsumptions: [] }),
      hostedTarget: predecessor.hostedTarget, hostedFixTarget: { ...predecessor.hostedTarget, headSha: currentTarget.headSha },
    } }] });
  const performance = { ...performedFix(predecessor, record), producedHeadSha: currentTarget.headSha };
  return { predecessor, currentTarget, currentLineage: lineage, record, performance };
}
function readers(input: ReturnType<typeof fixture>) {
  return { dispositionStore: { readDispositionRecord: async () => input.record,
    appendDispositionRecord: async () => { throw new Error("read-only proof"); } },
  readResponsePerformance: async () => input.performance };
}
describe("delivery correction response proof", () => {
  it("proves an exact performed member fix when contribution alone requires review", async () => {
    const input = fixture();
    await expect(confirmReviewCorrectionLeg({ ...input, ...readers(input), confirmGrounds: async () => "review-required" }))
      .resolves.toBe("applicable");
  });
  it.each(["base", "head", "response", "performance"])("refuses an unchecked fix with changed %s even if grounds retain it", async variation => {
    const input = fixture();
    const { targetId: _targetId, ...coordinates } = input.currentTarget; void _targetId;
    const currentTarget = createReviewTarget({ ...coordinates,
      ...(variation === "base" ? { diffBaseSha: "1".repeat(40) } : {}),
      ...(variation === "head" ? { headSha: "2".repeat(40) } : {}) });
    const record = variation === "response" ? { ...input.record, approvedDispositionLineage:
      input.record.approvedDispositionLineage.map(node => ({ ...node, deliveryMemberFixResponse: null })) } : input.record;
    await expect(confirmReviewCorrectionLeg({ ...input, currentTarget, ...readers({ ...input, record }),
      readResponsePerformance: async () => variation === "performance" ? null : input.performance,
      confirmGrounds: async () => "applicable" })).resolves.toBe("unavailable");
  });
});
