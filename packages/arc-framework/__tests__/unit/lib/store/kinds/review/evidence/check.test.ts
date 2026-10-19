import { describe, expect, it } from "vitest";
import { canonicalDigest } from "../../../../../../../src/lib/kernel/index.js";
import { checkReviewEvidence } from "../../../../../../../src/lib/store/kinds/review/evidence/check.js";
import { ReviewEvidenceSchema, type ReviewEvidence } from "../../../../../../../src/lib/store/kinds/review/evidence/schema.js";
import { type ReviewOutcome } from "../../../../../../../src/lib/store/kinds/review/outcome/schema.js";
import { reviewOutcomeKey } from "../../../../../../../src/lib/store/kinds/review/outcome/key.js";
import { OwnerIdentitySchema, recordReferences, StoreRecordSchema, type StoreRecord, type StoreView } from
  "../../../../../../../src/lib/store/index.js";
import { ruleView } from "../../../../../../helpers/store/rule-view.js";
import { performedEvidenceFixture, reviewEvidenceFixture, hostedSettlementFixture } from "../../../../../../fixtures/review-evidence.js";
import { createDispositionSet, approveDispositionSet } from "../../../../../../../src/scripts/review-gate/core/dispositions.js";

const owner = OwnerIdentitySchema.parse({ type: "work-item", name: "review-work", uid: "123e4567-e89b-12d3-a456-426614174000" });
function succession() {
  const { value, outcome } = performedEvidenceFixture();
  const prior = { ...reviewEvidenceFixture(outcome, "defer"), binding: value.binding };
  const successor = { ...value, performance: undefined, predecessorDispositionSetId: prior.dispositionSet.dispositionSetId };
  const parent = { ...prior, successorDispositionSetId: successor.dispositionSet.dispositionSetId };
  return { prior, parent, successor, outcome, performed: { ...value, predecessorDispositionSetId: prior.dispositionSet.dispositionSetId } };
}
function carriedSettlement() {
  const { next: prior, entry, outcome } = hostedSettlementFixture();
  const { dispositionSetId: ignored, ...original } = prior.dispositionSet;
  void ignored;
  const dispositionSet = createDispositionSet({ ...original, proposedBy: "second-proposer" });
  const approval = approveDispositionSet({ dispositionSet, approvedBy: "andrew", approvedAt: prior.approval.approvedAt });
  const parent = { ...prior, successorDispositionSetId: dispositionSet.dispositionSetId };
  const carried = { ...entry, dispositionSetId: dispositionSet.dispositionSetId,
    carriedFromDispositionSetId: prior.dispositionSet.dispositionSetId };
  const successor = ReviewEvidenceSchema.parse({ ...prior, dispositionSet, approval,
    predecessorDispositionSetId: prior.dispositionSet.dispositionSetId, settlement: { ...prior.settlement, evidence: [carried] } });
  return { prior, parent, successor, carried, outcome };
}
function evidenceRecord(value: ReviewEvidence, key = value.dispositionSet.dispositionSetId): StoreRecord {
  return StoreRecordSchema.parse({ reference: recordReferences["review/evidence"](owner, key), content: JSON.stringify(value),
    fields: value, version: "fixture-version", formatVersion: 1, conflicts: [], placement: { kind: "active" } });
}
function outcomeRecord(value: ReviewOutcome): StoreRecord {
  return StoreRecordSchema.parse({ reference: recordReferences["review/outcome"](owner, reviewOutcomeKey(value)),
    content: JSON.stringify(value), fields: value, version: "fixture-version", formatVersion: 1,
    conflicts: [], placement: { kind: "active" } });
}
async function check(value: ReviewEvidence, outcome: ReviewOutcome, options: { prior?: ReviewEvidence;
  before?: readonly StoreRecord[]; after?: readonly StoreRecord[]; view?: StoreView; key?: ReviewEvidence["dispositionSet"]["dispositionSetId"] } = {}) {
  const parsed = ReviewEvidenceSchema.parse(value);
  const next = evidenceRecord(parsed, options.key);
  const prior = options.prior === undefined ? undefined : evidenceRecord(ReviewEvidenceSchema.parse(options.prior));
  return checkReviewEvidence({ reference: next.reference, next: { content: next.content, fields: parsed },
    ...(prior === undefined ? {} : { prior: { content: prior.content, fields: prior.fields } }),
    writer: { kind: "verb", verb: "review" },
    before: ruleView([outcomeRecord(outcome), ...(prior === undefined ? [] : [prior]), ...options.before ?? []]),
    after: options.view ?? ruleView([outcomeRecord(outcome), next, ...options.after ?? []]) });
}

describe("evidence write admission", () => {
  it("requires the canonical disposition-set key and admits a complete performed record", async () => {
    const { value, outcome } = performedEvidenceFixture();
    expect(await check(value, outcome, { key: canonicalDigest({ wrong: "key" }) })).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: "review.evidence.key" }),
    ]));
    expect(await check(value, outcome)).toEqual([]);
  });
  it.each(["performance", "binding", "policy"] as const)("refuses an unrelated %s rewrite during performance", async (field) => {
    const { value, outcome } = performedEvidenceFixture();
    const prior = field === "performance" ? value : { ...value, performance: undefined };
    const next = field === "performance" ? { ...value, performance: { ...value.performance, producedHeadSha: "d".repeat(40) } }
      : field === "binding" ? { ...value, binding: null }
      : { ...value, responsePolicyRequest: { ...value.responsePolicyRequest,
          target: { ...value.responsePolicyRequest.target, repository: "another/repo" } } };
    expect(await check(next, outcome, { prior })).toEqual(expect.arrayContaining([expect.objectContaining({ rule: "review.evidence.advance" })]));
    expect(await check(value, outcome, { prior: { ...value, performance: undefined } })).toEqual([]);
  });
  it("clears the pending policy projection with its one request correction", async () => {
    const { value, outcome } = performedEvidenceFixture();
    const prior = { ...value, performance: undefined, policyProjectionPending: true as const };
    const next = { ...value, performance: undefined, responsePolicyRequest: { ...value.responsePolicyRequest,
      target: { ...value.responsePolicyRequest.target, repository: "corrected/repo" } } };
    expect(await check(next, outcome, { prior })).toEqual([]);
  });
  it("binds a Candidate response digest exactly once without changing the performance", async () => {
    const { value, outcome } = performedEvidenceFixture();
    const next = { ...value, performance: { ...value.performance, candidateResponseId: canonicalDigest({ response: 1 }) } };
    expect(await check(next, outcome, { prior: value })).toEqual([]);
  });
  it.each(["refused", "unreadable", "missed", "malformed"] as const)("refuses a %s evidence listing", async (kind) => {
    const { value, outcome } = performedEvidenceFixture();
    const base = ruleView([outcomeRecord(outcome), evidenceRecord(value)]);
    const view: StoreView = { ...base, list: async (query) => query.kind !== "review/evidence" ? base.list(query)
      : kind === "refused" ? { status: "refused", refusal: { code: "namespace-corrupt", class: "terminal", namespace: "review",
          condition: "Evidence cannot be read.", remedy: { text: "Repair the evidence." } } }
      : { status: "ok", result: kind === "unreadable" ? { status: "unreadable", condition: "Unreadable evidence.", remedy: { text: "Restore it." } }
          : { status: "complete", records: kind === "malformed" ? [{ ...evidenceRecord(value), content: "{" }] : [],
              missed: kind === "missed", diagnostics: [] } } };
    expect(await check(value, outcome, { view })).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: "review.evidence.complete-listing" }),
    ]));
  });
  it.each(["missing", "unlinked", "existing"] as const)("requires its %s successor to be created and linked in the batch", async (kind) => {
    const { parent, prior, successor, outcome } = succession();
    const next = kind === "unlinked" ? { ...successor, predecessorDispositionSetId: null } : successor;
    expect(await check(parent, outcome, { after: kind === "missing" ? [] : [evidenceRecord(next)],
      before: kind === "existing" ? [evidenceRecord(successor)] : [] })).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: "review.evidence.succession" }),
    ]));
    expect(await check(parent, outcome, { after: [evidenceRecord(successor)] })).toEqual([]);
    expect(await check(successor, outcome, { after: [evidenceRecord(parent)] })).toEqual([]);
    expect(prior.successorDispositionSetId).toBeNull();
  });
  it("marks a first successor only while both responses are unperformed", async () => {
    const { prior, parent, successor, performed, outcome } = succession();
    expect(await check(parent, outcome, { prior, after: [evidenceRecord(successor)] })).toEqual([]);
    expect(await check(parent, outcome, { prior, after: [evidenceRecord(performed)] })).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: "review.evidence.succession" }),
    ]));
  });
  it("imports a complete history whose tail was subsequently performed", async () => {
    const { parent, performed, outcome } = succession();
    expect(await check(parent, outcome, { after: [evidenceRecord(performed)] })).toEqual([]);
    expect(await check(performed, outcome, { after: [evidenceRecord(parent)] })).toEqual([]);
  });
  it("imports a complete hosted response already performed and settled", async () => {
    const { value, outcome } = performedEvidenceFixture("delivery-member");
    expect(await check(value, outcome)).toEqual([]);
  });
  it("requires a hosted response to retain actions covering the sealed findings", async () => {
    const { value, outcome } = performedEvidenceFixture("delivery-member");
    expect(await check({ ...value, settlement: undefined }, outcome)).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: "review.evidence.hosted-findings" }),
    ]));
    expect(await check(value, outcome)).toEqual([]);
  });
  it("appends an uncarried replied-and-resolved settlement entry", async () => {
    const { prior, next, outcome } = hostedSettlementFixture();
    expect(await check(next, outcome, { prior })).toEqual([]);
  });
  it("carries a predecessor's exact settlement receipt with only the set coordinates changed", async () => {
    const { prior, parent, successor, carried, outcome } = carriedSettlement();
    expect(await check({ ...successor, settlement: { ...successor.settlement!, evidence: [{ ...carried, replyId: "another-reply" }] } },
      outcome, { before: [evidenceRecord(prior)], after: [evidenceRecord(parent)] })).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: "review.evidence.settlement-carry" }),
    ]));
    expect(await check(successor, outcome, { before: [evidenceRecord(prior)], after: [evidenceRecord(parent)] })).toEqual([]);
  });
  it.each(["remove-performance", "replace-response", "remove-response", "change-with-response", "repeat-policy", "reopen-policy"] as const)(
    "refuses the non-monotonic %s advance", async (kind) => {
      const { value, outcome } = performedEvidenceFixture();
      const bound = { ...value, performance: { ...value.performance, candidateResponseId: canonicalDigest({ response: 1 }) } };
      const prior = kind === "remove-performance" ? value : kind === "repeat-policy" || kind === "reopen-policy"
        ? { ...value, performance: undefined } : kind === "change-with-response" ? value : bound;
      const next = kind === "remove-performance" ? { ...value, performance: undefined }
        : kind === "remove-response" ? value : kind === "repeat-policy" ? { ...value, performance: undefined,
            responsePolicyRequest: { ...value.responsePolicyRequest, completedPasses: 2 } }
        : kind === "reopen-policy" ? { ...value, performance: undefined, policyProjectionPending: true as const }
        : { ...bound, performance: { ...bound.performance, ...(kind === "replace-response"
            ? { candidateResponseId: canonicalDigest({ response: 2 }) } : { performedAt: "2026-10-19T14:00:00Z" }) } };
      expect(await check(next, outcome, { prior })).toEqual(expect.arrayContaining([expect.objectContaining({ rule: "review.evidence.advance" })]));
    },
  );
  it.each(["add", "remove", "change"] as const)("refuses a tag %s during a performance advance", async (kind) => {
    const { value, outcome } = performedEvidenceFixture();
    const tags = [{ findingId: "finding-1", tag: "local-correction" as const }];
    const prior = { ...value, performance: undefined, ...(kind === "add" ? {} : { advisoryFixTags: tags }) };
    const next = { ...value, ...(kind === "remove" ? {} : { advisoryFixTags: kind === "add" ? tags
      : [{ findingId: "finding-1", tag: "new-design" as const }] }) };
    expect(await check(next, outcome, { prior })).toEqual(expect.arrayContaining([expect.objectContaining({ rule: "review.evidence.advance" })]));
    expect(await check({ ...value, advisoryFixTags: tags }, outcome, { prior: { ...prior, advisoryFixTags: tags } })).toEqual([]);
  });
  it("does not bind a previously unbound response", async () => {
    const { value, outcome } = performedEvidenceFixture();
    const unperformed = { ...value, performance: undefined };
    expect(await check(unperformed, outcome, { prior: { ...unperformed, binding: null } }))
      .toEqual(expect.arrayContaining([expect.objectContaining({ rule: "review.evidence.advance" })]));
  });
  it.each(["remove", "change", "reorder", "record-only"] as const)("refuses a settlement %s update", async (kind) => {
    const { prior, next, entry, outcome } = hostedSettlementFixture();
    const second = { ...entry, findingId: "thread-2", commentId: "comment-2", threadId: "thread-2", replyId: "reply-2" };
    const complete = { ...next, settlement: { ...next.settlement!, evidence: [entry, second] } };
    const member = performedEvidenceFixture("delivery-member");
    const before = kind === "record-only" ? { ...member.value, settlement: { ...member.value.settlement!, evidence: [] } }
      : kind === "reorder" ? complete : next;
    const after = kind === "record-only" ? member.value : kind === "remove" ? prior : { ...next, settlement: {
      ...next.settlement!, evidence: kind === "reorder" ? [second, entry] : [{ ...entry, replyId: "changed-reply" }] } };
    expect(await check(after, kind === "record-only" ? member.outcome : outcome, { prior: before })).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: "review.evidence.advance" }),
    ]));
  });
  it("preserves approved evidence instead of removing its record", async () => {
    const { value, outcome } = performedEvidenceFixture();
    const record = evidenceRecord(value);
    expect(await checkReviewEvidence({ reference: record.reference, prior: { content: record.content, fields: value },
      writer: { kind: "verb", verb: "review" }, before: ruleView([record, outcomeRecord(outcome)]), after: ruleView([outcomeRecord(outcome)]) }))
      .toEqual(expect.arrayContaining([expect.objectContaining({ rule: "review.evidence.advance" })]));
  });
  it("does not append settlement to a superseded response", async () => {
    const { parent, successor, outcome } = carriedSettlement();
    const entry = parent.settlement?.evidence[0];
    if (entry === undefined) throw new Error("expected settlement");
    const changed = { ...parent, settlement: { ...parent.settlement!, evidence: [entry, { ...entry, findingId: "thread-2",
      commentId: "comment-2", threadId: "thread-2", replyId: "reply-2" }] } };
    expect(await check(changed, outcome, { prior: parent, before: [evidenceRecord(successor)], after: [evidenceRecord(successor)] }))
      .toEqual(expect.arrayContaining([expect.objectContaining({ rule: "review.evidence.advance" })]));
  });
  it.each(["policy", "candidate", "successor", "settlement"] as const)("preserves tag absence during a %s advance", async (kind) => {
    const performance = performedEvidenceFixture();
    const chain = succession();
    const settlement = hostedSettlementFixture();
    const { value } = performance;
    const scene = kind === "policy" ? { prior: { ...value, performance: undefined, policyProjectionPending: true as const },
      next: { ...value, performance: undefined }, outcome: performance.outcome, after: [] }
      : kind === "candidate" ? { prior: value, next: { ...value, performance: { ...value.performance,
          candidateResponseId: canonicalDigest({ response: 1 }) } }, outcome: performance.outcome, after: [] }
      : kind === "successor" ? { prior: chain.prior, next: chain.parent, outcome: chain.outcome, after: [evidenceRecord(chain.successor)] }
      : { prior: settlement.prior, next: settlement.next, outcome: settlement.outcome, after: [] };
    const advisoryFixTags = scene.next.dispositionSet.findings.filter(({ disposition }) => disposition === "fix")
      .map(({ findingId }) => ({ findingId, tag: "local-correction" as const }));
    const next = { ...scene.next, advisoryFixTags };
    expect(await check(next, scene.outcome, { prior: scene.prior, after: scene.after })).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: "review.evidence.advance" }),
    ]));
    expect(await check(next, scene.outcome, { prior: { ...scene.prior, advisoryFixTags }, after: scene.after })).toEqual([]);
  });
  it("refuses a second successor even when the proposed new edge is reciprocal", async () => {
    const { parent, successor, outcome } = succession();
    const { dispositionSetId: ignored, ...original } = successor.dispositionSet;
    void ignored;
    const dispositionSet = createDispositionSet({ ...original, proposedBy: "another-proposer" });
    const approval = approveDispositionSet({ dispositionSet, approvedBy: "andrew", approvedAt: successor.approval.approvedAt });
    const second = { ...successor, dispositionSet, approval };
    expect(await check({ ...parent, successorDispositionSetId: dispositionSet.dispositionSetId }, outcome, {
      prior: parent, before: [evidenceRecord(successor)], after: [evidenceRecord(successor), evidenceRecord(second)] }))
      .toEqual(expect.arrayContaining([expect.objectContaining({ rule: "review.evidence.advance" })]));
  });
  it("refuses a cycle of otherwise reciprocal succession edges", async () => {
    const { parent, successor, outcome } = succession();
    expect(await check({ ...parent, predecessorDispositionSetId: successor.dispositionSet.dispositionSetId }, outcome,
      { after: [evidenceRecord({ ...successor, successorDispositionSetId: parent.dispositionSet.dispositionSetId })] }))
      .toEqual(expect.arrayContaining([expect.objectContaining({ rule: "review.evidence.succession" })]));
  });
  it("allows a successor's own tags while retaining the predecessor's tag absence", async () => {
    const { prior, parent, successor, outcome } = succession();
    const tagged = { ...successor, advisoryFixTags: [{ findingId: "finding-1", tag: "new-design" as const }] };
    expect(await check(parent, outcome, { prior, after: [evidenceRecord(tagged)] })).toEqual([]);
    expect(await check(tagged, outcome, { before: [evidenceRecord(prior)], after: [evidenceRecord(parent)] })).toEqual([]);
  });
  it("does not append a carried settlement receipt after the successor is created", async () => {
    const { parent, successor, outcome } = carriedSettlement();
    const prior = { ...successor, settlement: { ...successor.settlement!, evidence: [] } };
    expect(await check(successor, outcome, { prior, before: [evidenceRecord(parent)], after: [evidenceRecord(parent)] }))
      .toEqual(expect.arrayContaining([expect.objectContaining({ rule: "review.evidence.advance" })]));
  });
});
