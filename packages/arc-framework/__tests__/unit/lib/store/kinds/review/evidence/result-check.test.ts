import { describe, expect, it } from "vitest";
import { canonicalDigest } from "../../../../../../../src/lib/kernel/index.js";
import { checkReviewEvidenceResult } from "../../../../../../../src/lib/store/kinds/review/evidence/result-check.js";
import { ReviewEvidenceSchema, type ReviewEvidence } from "../../../../../../../src/lib/store/kinds/review/evidence/schema.js";
import { ReviewOutcomeSchema, type ReviewOutcome } from "../../../../../../../src/lib/store/kinds/review/outcome/schema.js";
import { reviewOutcomeKey } from "../../../../../../../src/lib/store/kinds/review/outcome/key.js";
import { OwnerIdentitySchema, recordReferences, StoreRecordSchema, type StoreRecord, type StoreView } from
  "../../../../../../../src/lib/store/index.js";
import { ruleView } from "../../../../../../helpers/store/rule-view.js";
import { reviewEvidenceFixture, performedEvidenceFixture, privateMemberEvidenceFixture } from "../../../../../../fixtures/review-evidence.js";
import { localOutcome, hostedOutcome, frontlineOutcome } from "../../../../../../fixtures/review-outcome.js";
import { createDispositionSet, approveDispositionSet } from "../../../../../../../src/scripts/review-gate/core/dispositions.js";

const owner = OwnerIdentitySchema.parse({ type: "work-item", name: "review-work", uid: "123e4567-e89b-12d3-a456-426614174000" });
const otherOwner = OwnerIdentitySchema.parse({ type: "work-item", name: "other-work", uid: "223e4567-e89b-12d3-a456-426614174000" });
function outcomeRecord(value: ReviewOutcome, storedOwner = owner, key = reviewOutcomeKey(value)): StoreRecord {
  return StoreRecordSchema.parse({ reference: recordReferences["review/outcome"](storedOwner, key),
    content: JSON.stringify(value), fields: value, version: "fixture-version", formatVersion: 1,
    conflicts: [], placement: { kind: "active" } });
}
async function check(value: ReviewEvidence, records: readonly StoreRecord[] = [], after?: StoreView) {
  const parsed = ReviewEvidenceSchema.parse(value);
  return checkReviewEvidenceResult({ reference: recordReferences["review/evidence"](owner, parsed.dispositionSet.dispositionSetId),
    next: { content: JSON.stringify(parsed), fields: parsed }, writer: { kind: "verb", verb: "review" },
    before: ruleView(), after: after ?? ruleView(records) }, parsed);
}
const outcome = ReviewOutcomeSchema.parse(localOutcome({ outcome: "findings", findings: [{ findingId: "finding-1",
  severity: "major", locus: "src/main.ts:1", evidenceUrlOrId: "finding:1", sourceOrdinal: 1 }] }));

describe("evidence producer admission", () => {
  it("requires the exact outcome on the response's own work item", async () => {
    const value = reviewEvidenceFixture(outcome);
    expect(await check(value)).toEqual(expect.arrayContaining([expect.objectContaining({ rule: "review.evidence.outcome-unavailable" })]));
    expect(await check(value, [outcomeRecord(outcome, otherOwner)]))
      .toEqual(expect.arrayContaining([expect.objectContaining({ rule: "review.evidence.outcome-unavailable" })]));
    expect(await check(value, [outcomeRecord(outcome)])).toEqual([]);
  });
  it.each(["malformed", "wrong-key", "different-producer"] as const)("refuses a %s outcome", async (kind) => {
    const value = reviewEvidenceFixture(outcome);
    const record = kind === "different-producer" ? outcomeRecord(ReviewOutcomeSchema.parse(localOutcome({ logicalPass: 2,
      outcome: "findings", findings: outcome.findings })), owner, value.result.outcomeKey) : outcomeRecord(outcome);
    const changed = kind === "malformed" ? { ...record, content: "{" }
      : kind === "wrong-key" ? { ...record, content: JSON.stringify({ ...outcome, attemptId: "another-attempt" }) } : record;
    expect(await check(value, [changed])).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: "review.evidence.outcome-binding" }),
    ]));
    expect(await check(value, [outcomeRecord(outcome)])).toEqual([]);
  });
  it("binds the approved context and finding identities to the exact result", async () => {
    const value = reviewEvidenceFixture(outcome);
    const changed = ReviewOutcomeSchema.parse(localOutcome({ outcome: "findings", findings: [{ ...outcome.findings[0]!, severity: "minor" }] }));
    expect(reviewOutcomeKey(changed)).toBe(value.result.outcomeKey);
    expect(await check(value, [outcomeRecord(changed)])).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: "review.evidence.outcome-binding" }),
    ]));
    expect(await check(reviewEvidenceFixture(changed), [outcomeRecord(changed)])).toEqual([]);
  });
  it("keeps Candidate response ownership distinct from the producer's original lineage", async () => {
    const headBound = ReviewOutcomeSchema.parse(localOutcome({ outcome: "findings", findings: outcome.findings,
      lineage: { kind: "head-bound", vehicleKind: "review-target", vehicleIdentity: outcome.target.targetId,
        headSha: outcome.target.headSha } }));
    const digest = canonicalDigest({ response: 1 });
    const refused = performedEvidenceFixture("candidate", headBound);
    const value = { ...refused.value, performance: { ...refused.value.performance, candidateResponseId: digest } };
    expect(await check(value, [outcomeRecord(headBound)])).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: "review.evidence.response-lineage" }),
    ]));
    const valid = performedEvidenceFixture("candidate", outcome);
    expect(await check({ ...valid.value, performance: { ...valid.value.performance, candidateResponseId: digest } },
      [outcomeRecord(outcome)])).toEqual([]);
  });
  it("requires a hosted Errand's original change request at performance", async () => {
    const producer = ReviewOutcomeSchema.parse(hostedOutcome({ vehicle: { kind: "errand", key: "example", claimId: "claim-1",
      branch: "fix/example", sources: ["codex-pr"], standardReview: { obligation: "required", reasons: ["sensitive-change-set"],
        rubricVersion: "standard-review/v1", rubricDigest: `sha256:${"e".repeat(64)}`, retrigger: "full-final", count: 1 } },
      outcome: "findings", findings: [{ findingId: "finding-1", sourceOrdinal: 1, severity: "major", origin: "review-body",
        reviewId: "review-1", fingerprint: "finding-1", settlement: "not-applicable", locus: "src/main.ts:1",
        url: "https://example.invalid/review", body: "A retained finding." }] }));
    const { value } = performedEvidenceFixture("errand", producer);
    const response = value.performance.fixResponse;
    if (response === undefined) throw new Error("expected Errand fix");
    expect(await check({ ...value, performance: { ...value.performance, fixResponse: { ...response, hostedTarget: null } } },
      [outcomeRecord(producer)])).toEqual(expect.arrayContaining([expect.objectContaining({ rule: "review.evidence.performance-source" })]));
    expect(await check(value, [outcomeRecord(producer)])).toEqual([]);
  });
  it.each(["local", "hosted", "frontline"] as const)("checks a member's performance against its %s producer", async (kind) => {
    const hosted = performedEvidenceFixture("delivery-member");
    const producer = kind === "hosted" ? hosted.outcome : ReviewOutcomeSchema.parse(kind === "frontline"
      ? frontlineOutcome({ target: hosted.outcome.target, lineage: hosted.outcome.lineage, findings: outcome.findings })
      : localOutcome({ target: hosted.outcome.target, lineage: hosted.outcome.lineage,
          vehicle: { kind: "delivery-member", identity: hosted.outcome.lineage.kind === "delivery-member"
            ? hosted.outcome.lineage.deliverableId : "missing-member" }, outcome: "findings", findings: outcome.findings }));
    const { value } = performedEvidenceFixture("delivery-member", producer);
    const response = value.performance.fixResponse;
    if (response === undefined || !("hostedFixTarget" in response) || hosted.outcome.hosted === undefined) throw new Error("expected member fix");
    const coordinates = kind === "local" ? { hostedTarget: hosted.outcome.hosted.target,
      hostedFixTarget: { ...hosted.outcome.hosted.target, headSha: value.performance.producedHeadSha } }
      : { hostedTarget: null, hostedFixTarget: null };
    expect(await check({ ...value, performance: { ...value.performance, fixResponse: { ...response, ...coordinates } } },
      [outcomeRecord(producer)])).toEqual(expect.arrayContaining([expect.objectContaining({ rule: "review.evidence.performance-source" })]));
    expect(await check(kind === "frontline" ? { ...value, performance: undefined } : value, [outcomeRecord(producer)])).toEqual([]);
  });
  it("checks a private member's original fix head before performance exists", async () => {
    const { value, outcome: producer } = privateMemberEvidenceFixture("fix");
    if (value.binding?.kind !== "candidate-member") throw new Error("expected private member");
    expect(await check({ ...value, binding: { ...value.binding, deliveryMember: { ...value.binding.deliveryMember,
      head: "d".repeat(40) } } }, [outcomeRecord(producer)])).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: "review.evidence.private-member-head" }),
    ]));
    expect(await check(value, [outcomeRecord(producer)])).toEqual([]);
  });
  it("binds a performed Candidate response to the producer's original head", async () => {
    const { value, outcome: producer } = performedEvidenceFixture();
    expect(await check({ ...value, performance: { ...value.performance, originatingHeadSha: "d".repeat(40) } },
      [outcomeRecord(producer)])).toEqual(expect.arrayContaining([expect.objectContaining({ rule: "review.evidence.performance-target" })]));
    expect(await check(value, [outcomeRecord(producer)])).toEqual([]);
  });
  it("preserves unreadable-outcome diagnostics and resumes after restoration", async () => {
    const after: StoreView = { ...ruleView(), read: async () => ({ status: "refused", refusal: { code: "namespace-corrupt",
      class: "terminal", namespace: "review", condition: "The outcome namespace is unreadable.", remedy: { text: "Repair its records." } } }) };
    expect(await check(reviewEvidenceFixture(outcome), [], after)).toEqual([
      expect.objectContaining({ rule: "review.evidence.outcome-unavailable", condition: "The outcome namespace is unreadable.",
        remedy: { text: expect.any(String) } }),
    ]);
    expect(await check(reviewEvidenceFixture(outcome), [outcomeRecord(outcome)])).toEqual([]);
  });
  it.each(["producer", "target", "policy", "rubric", "source", "severity", "locus", "nit", "finding"] as const)(
    "refuses an independently approved set with a different %s", async (field) => {
      const producer = field === "nit" ? ReviewOutcomeSchema.parse(localOutcome({ outcome: "findings",
        findings: outcome.findings.map((finding) => ({ ...finding, severity: "minor" })) })) : outcome;
      const value = reviewEvidenceFixture(producer);
      const { dispositionSetId: ignored, ...original } = value.dispositionSet;
      void ignored;
      const digest = canonicalDigest({ other: 1 });
      const dispositionSet = createDispositionSet({ ...original,
        ...(field === "producer" ? { producerId: "another-producer" } : field === "target" ? { targetId: digest }
          : field === "policy" ? { policyVersion: digest } : field === "rubric" ? { rubricDigest: digest } : {}),
        findings: original.findings.map((finding) => ({ ...finding,
          ...(field === "finding" ? { findingId: "another-finding" } : field === "source" ? { sourceIdentity: "another-source" } : field === "severity" ? { reportedSeverity: "minor" as const }
            : field === "locus" ? { locus: "src/other.ts:1" } : field === "nit" ? { reportedNit: true } : {}) })),
      });
      const approval = approveDispositionSet({ dispositionSet, approvedBy: "andrew", approvedAt: value.approval.approvedAt });
      expect(await check({ ...value, dispositionSet, approval }, [outcomeRecord(producer)])).toEqual(expect.arrayContaining([
        expect.objectContaining({ rule: "review.evidence.outcome-binding" }),
      ]));
    },
  );
});
