import { describe, expect, it } from "vitest";
import { parseReviewEvidence } from "../../../../../../../src/lib/store/kinds/review/evidence/parser.js";
import { performedEvidenceFixture } from "../../../../../../fixtures/review-evidence.js";

describe("atomic performed responses", () => {
  it.each(["candidate", "errand", "delivery-member"] as const)("parses the complete %s response", (kind) => {
    const { value } = performedEvidenceFixture(kind);
    expect(parseReviewEvidence(JSON.stringify(value))).toEqual(JSON.parse(JSON.stringify(value)));
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
