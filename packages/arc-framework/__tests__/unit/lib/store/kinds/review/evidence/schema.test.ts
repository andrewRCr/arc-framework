import { describe, expect, it } from "vitest";
import { parseReviewEvidence, decodeReviewEvidence } from "../../../../../../../src/lib/store/kinds/review/evidence/parser.js";
import { reviewEvidenceFixture, privateMemberEvidenceFixture } from "../../../../../../fixtures/review-evidence.js";

import { frontlineOutcome, localOutcome } from "../../../../../../fixtures/review-outcome.js";
import { ApprovedDispositionRecordSchema } from "../../../../../../../src/scripts/review-gate/core/advisory-records.js";
import { bindReviewSourceReference } from "../../../../../../../src/scripts/review-gate/core/review-source-reference.js";
import { ReviewOutcomeSchema } from "../../../../../../../src/lib/store/kinds/review/outcome/schema.js";

const candidate = { workUnit: "example", candidateId: `sha256:${"c".repeat(64)}` };
const member = { kind: "delivery-member", planId: "123e4567-e89b-42d3-a456-426614174000",
  deliverableId: `sha256:${"d".repeat(64)}`, workUnitId: "example", head: "c".repeat(40) };


describe("review evidence envelopes", () => {
  it.each([null, { kind: "candidate", candidate },
    { kind: "errand", errand: { key: "example", claimId: "claim-1", branch: "fix/example" } },
    { kind: "delivery-member", deliveryMember: member },
  ])("parses an approved response with binding %j", (binding) => {
    const value = { ...reviewEvidenceFixture(), binding };
    expect(parseReviewEvidence(JSON.stringify(value))).toEqual(JSON.parse(JSON.stringify(value)));
  });
  it("parses the Candidate-owned private-member binding with a production frontline context", () => {
    const { value } = privateMemberEvidenceFixture();
    expect(parseReviewEvidence(JSON.stringify(value))).toEqual(JSON.parse(JSON.stringify(value)));
  });
  it.each(["approver", "approval-set", "set-id", "result-digest", "pending-successor"] as const)(
    "refuses an inconsistent %s", (field) => {
      const value = reviewEvidenceFixture();
      const digest = `sha256:${"f".repeat(64)}`;
      const changed = field === "approver" ? { ...value, approval: { ...value.approval, approvedBy: value.dispositionSet.proposedBy } }
        : field === "approval-set" ? { ...value, approval: { ...value.approval, dispositionSetId: digest } }
        : field === "set-id" ? { ...value, dispositionSet: { ...value.dispositionSet, dispositionSetId: digest } }
        : field === "result-digest" ? { ...value, result: { ...value.result, resultDigest: digest } }
        : { ...value, policyProjectionPending: true, successorDispositionSetId: digest };
      expect(parseReviewEvidence(JSON.stringify(changed))).toBeNull();
    },
  );
  it("keeps absent and valid fix tags outside canonical approval identity", () => {
    const outcome = ReviewOutcomeSchema.parse(frontlineOutcome({ findings: [{ findingId: "finding-1", severity: "major",
      locus: "src/main.ts:1", evidenceUrlOrId: "finding:1", sourceOrdinal: 1 }] }));
    const value = reviewEvidenceFixture(outcome, "fix");
    const parsed = parseReviewEvidence(JSON.stringify(value));
    const tagged = parseReviewEvidence(JSON.stringify({ ...value,
      advisoryFixTags: [{ findingId: "finding-1", tag: "local-correction" }] }));
    expect(parsed).not.toHaveProperty("advisoryFixTags");
    expect(tagged?.advisoryFixTags).toEqual([{ findingId: "finding-1", tag: "local-correction" }]);
    expect(tagged?.dispositionSet).toEqual(parsed?.dispositionSet);
    expect(tagged?.approval).toEqual(parsed?.approval);
  });

  it.each([[], [{ findingId: "another-finding", tag: "new-design" }],
    [{ findingId: "finding-1", tag: "new-design" }, { findingId: "finding-1", tag: "local-correction" }],
  ].map((tags) => ({ tags })))("refuses tags that do not cover exactly the fix findings", ({ tags: advisoryFixTags }) => {
    const outcome = ReviewOutcomeSchema.parse(frontlineOutcome({ findings: [{ findingId: "finding-1", severity: "major",
      locus: "src/main.ts:1", evidenceUrlOrId: "finding:1", sourceOrdinal: 1 }] }));
    expect(parseReviewEvidence(JSON.stringify({ ...reviewEvidenceFixture(outcome, "fix"), advisoryFixTags }))).toBeNull();
  });
  it.each(["work-unit", "non-frontline"] as const)("refuses an inconsistent private-member %s", (field) => {
    const { value } = privateMemberEvidenceFixture();
    const changed = field === "work-unit" ? { ...value, binding: { ...value.binding,
      candidate: { ...candidate, workUnit: "another-work-unit" } } }
      : { ...reviewEvidenceFixture(), binding: value.binding };
    expect(parseReviewEvidence(JSON.stringify(changed))).toBeNull();
  });
  it.each(["predecessorDispositionSetId", "successorDispositionSetId"] as const)("refuses a self %s", (field) => {
    const value = reviewEvidenceFixture();
    expect(parseReviewEvidence(JSON.stringify({ ...value, [field]: value.dispositionSet.dispositionSetId }))).toBeNull();
  });

  it.each(["receiptRef", "localSourceRef", "outcomeRef", "attemptRef"])("refuses the legacy %s source field", (field) => {
    expect(parseReviewEvidence(JSON.stringify({ ...reviewEvidenceFixture(), [field]: "legacy:source" }))).toBeNull();
  });

  it("refuses a disposition set whose finding order is not canonical", () => {
    const outcome = ReviewOutcomeSchema.parse(localOutcome({ outcome: "findings", findings: [1, 2].map((sourceOrdinal) => ({
      findingId: `finding-${sourceOrdinal}`, severity: "major", locus: `src/main.ts:${sourceOrdinal}`,
      evidenceUrlOrId: `finding:${sourceOrdinal}`, sourceOrdinal,
    })) }));
    const value = reviewEvidenceFixture(outcome);
    expect(parseReviewEvidence(JSON.stringify({ ...value, dispositionSet: { ...value.dispositionSet,
      findings: [...value.dispositionSet.findings].reverse() } }))).toBeNull();
  });
  it("checks a performed private member's head against its recorded performance", () => {
    const { value } = privateMemberEvidenceFixture("fix");
    const performance = { schemaVersion: 1, producerId: value.dispositionSet.producerId,
      dispositionSetId: value.dispositionSet.dispositionSetId, originatingHeadSha: member.head,
      producedHeadSha: "e".repeat(40), performedAt: "2026-10-19T13:00:00Z" };
    expect(parseReviewEvidence(JSON.stringify({ ...value, performance }))).not.toBeNull();
    expect(parseReviewEvidence(JSON.stringify({ ...value, performance, binding: { ...value.binding,
      deliveryMember: { ...member, head: "d".repeat(40) } } }))).toBeNull();
  });

  it("refuses malformed JSON with a precise decoding diagnostic", () => {
    expect(parseReviewEvidence("{")).toBeNull();
    expect(decodeReviewEvidence("{")).toEqual({ success: false, error: expect.stringMatching(/^JSON:/u) });
  });
  it("keeps an unperformed frontline member binding readable as the legacy record does", () => {
    const { value: original } = privateMemberEvidenceFixture();
    const value = { ...original, binding: { kind: "delivery-member", deliveryMember: member } };
    const legacy = { schemaVersion: 1, semanticsVersion: "review-advisory/v1", repositoryId: "repo-1",
      operationId: value.dispositionSet.producerId, candidate: null, errand: null, deliveryMember: member,
      source: { kind: "frontline", outcomeRef: bindReviewSourceReference({ kind: "frontline",
        operationId: value.dispositionSet.producerId, durableRef: "git-common:review-gate/outcomes/frontline.json#1" }) },
      currentDispositionSetId: value.dispositionSet.dispositionSetId, approvedDispositionLineage: [{
        approvedDisposition: { schemaVersion: 2, semanticsVersion: "review-gate/v2", state: "approved",
          dispositionSet: value.dispositionSet, approval: value.approval }, responsePolicyRequest: value.responsePolicyRequest,
        fixAuthorization: null, errandFixResponse: null, deliveryMemberFixResponse: null,
        predecessorDispositionSetId: null, successorDispositionSetId: null,
      }] };
    expect(ApprovedDispositionRecordSchema.safeParse(legacy).success).toBe(true);
    expect(parseReviewEvidence(JSON.stringify(value))).not.toBeNull();
  });
});
