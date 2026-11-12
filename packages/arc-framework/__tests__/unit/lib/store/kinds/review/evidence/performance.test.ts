import { describe, expect, it } from "vitest";
import { parseReviewEvidence } from "../../../../../../../src/lib/store/kinds/review/evidence/parser.js";
import { performedEvidenceFixture, reviewEvidenceFixture } from "../../../../../../fixtures/review-evidence.js";
import { LaneResponsePerformanceSchema } from "../../../../../../../src/scripts/review-gate/core/operation-state-schema.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../../../../src/lib/store/identity.js";
import { reviewOutcomeKey } from "../../../../../../../src/lib/store/kinds/review/outcome/key.js";
import { assertReviewMapping } from "../../../../../../helpers/store/assert-review-mapping.js";

function noFixEvidence(kind: "errand" | "delivery-member") {
  const { outcome, value: fixed } = performedEvidenceFixture(kind);
  const approved = reviewEvidenceFixture(outcome, "reject");
  const { fixResponse: ignored, ...header } = fixed.performance;
  void ignored;
  const performance = LaneResponsePerformanceSchema.parse({ ...header,
    dispositionSetId: approved.dispositionSet.dispositionSetId, producedHeadSha: outcome.target.headSha });
  return { outcome, value: { ...approved, binding: fixed.binding, performance } };
}

describe("atomic performed responses", () => {
  it.each(["errand", "delivery-member"] as const)("retains a native no-fix %s settlement header", async (kind) => {
    const { outcome, value } = noFixEvidence(kind);
    expect(parseReviewEvidence(JSON.stringify(value))).toEqual(JSON.parse(JSON.stringify(value)));
    const owner = OwnerIdentitySchema.parse({ type: "work-item", name: "example",
      uid: "123e4567-e89b-42d3-a456-426614174000" });
    await assertReviewMapping({ records: [
      { reference: recordReferences["review/outcome"](owner, reviewOutcomeKey(outcome)), contents: [JSON.stringify(outcome)] },
      { reference: recordReferences["review/evidence"](owner, value.dispositionSet.dispositionSetId), contents: [JSON.stringify(value)] },
    ], listing: [] });
  });

  it.each(["candidate", "errand", "delivery-member"] as const)("parses the complete %s response", (kind) => {
    const { value } = performedEvidenceFixture(kind);
    expect(parseReviewEvidence(JSON.stringify(value))).toEqual(JSON.parse(JSON.stringify(value)));
  });

  it.each(["errand", "delivery-member"] as const)("requires the complete transition for a performed %s fix", (kind) => {
    const { value } = performedEvidenceFixture(kind);
    const { fixResponse: ignored, ...header } = value.performance;
    void ignored;
    expect(parseReviewEvidence(JSON.stringify({ ...value, performance: header }))).toBeNull();
  });

  it.each(["errand", "delivery-member"] as const)("refuses a %s fix-response object on a no-fix set", (kind) => {
    const { value } = noFixEvidence(kind);
    const { value: fixed } = performedEvidenceFixture(kind);
    expect(parseReviewEvidence(JSON.stringify({ ...value, performance: {
      ...value.performance, fixResponse: fixed.performance.fixResponse,
    } }))).toBeNull();
  });

  it.each(["producer", "set", "origin", "produced", "authorization", "transition"] as const)(
    "refuses performed Errand evidence with a mismatched %s", (field) => {
      const { value } = performedEvidenceFixture("errand");
      const performance = value.performance;
      const response = performance.fixResponse;
      if (response === undefined) throw new Error("expected fix response");
      const digest = `sha256:${"d".repeat(64)}`;
      const changed = field === "producer" ? { ...performance, producerId: "another-producer" }
        : field === "set" ? { ...performance, dispositionSetId: digest }
        : field === "origin" ? { ...performance, originatingHeadSha: "d".repeat(40) }
        : field === "produced" ? { ...performance, producedHeadSha: "d".repeat(40) }
        : { ...performance, fixResponse: { ...response, fixConsumption: { ...response.fixConsumption,
            ...(field === "authorization" ? { fixAuthorizationId: digest } : { newTargetId: digest }) } } };
      expect(parseReviewEvidence(JSON.stringify({ ...value, performance: changed }))).toBeNull();
    },
  );
  it("refuses a performed response while its policy projection is pending", () => {
    const { value } = performedEvidenceFixture();
    expect(parseReviewEvidence(JSON.stringify({ ...value, policyProjectionPending: true }))).toBeNull();
  });

  it.each(["errand", "delivery-member"] as const)("refuses a Candidate response digest on a %s binding", (kind) => {
    const { value } = performedEvidenceFixture(kind);
    expect(parseReviewEvidence(JSON.stringify({ ...value, performance: { ...value.performance,
      candidateResponseId: `sha256:${"a".repeat(64)}` } }))).toBeNull();
  });

  it.each(["binding", "host-head", "host-request", "missing-fix"] as const)("refuses an inconsistent member %s", (field) => {
    const { value } = performedEvidenceFixture("delivery-member");
    const response = value.performance.fixResponse;
    if (value.binding?.kind !== "delivery-member" || response === undefined || !("hostedFixTarget" in response)
      || response.hostedFixTarget === null) throw new Error("expected performed hosted member");
    const changed = field === "binding" ? { ...value, binding: { ...value.binding,
        deliveryMember: { ...value.binding.deliveryMember, head: "d".repeat(40) } } }
      : { ...value, performance: { ...value.performance, fixResponse: field === "missing-fix" ? undefined
          : { ...response, hostedFixTarget: { ...response.hostedFixTarget,
              ...(field === "host-head" ? { headSha: "d".repeat(40) } : { repository: "another/repository" }) } } } };
    expect(parseReviewEvidence(JSON.stringify(changed))).toBeNull();
  });
});
