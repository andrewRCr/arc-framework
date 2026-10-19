import { describe, expect, it } from "vitest";
import { checkReviewDecision } from "../../../../../../../src/lib/store/kinds/review/decision/check.js";
import { reviewDecisionKey } from "../../../../../../../src/lib/store/kinds/review/decision/key.js";
import { ReviewDecisionSchema, type ReviewDecision } from "../../../../../../../src/lib/store/kinds/review/decision/schema.js";
import { ReviewOutcomeSchema, type ReviewOutcome } from "../../../../../../../src/lib/store/kinds/review/outcome/schema.js";
import { reviewOutcomeKey } from "../../../../../../../src/lib/store/kinds/review/outcome/key.js";
import { OwnerIdentitySchema, recordReferences, StoreRecordSchema, type StoreRecord, type StoreView } from
  "../../../../../../../src/lib/store/index.js";
import { ruleView } from "../../../../../../helpers/store/rule-view.js";
import { terminusDecision, approvedFixDecision } from "../../../../../../fixtures/review-decision.js";
import { hostedOutcome, localOutcome, frontlineOutcome } from "../../../../../../fixtures/review-outcome.js";

const owner = OwnerIdentitySchema.parse({ type: "work-item", name: "review-work", uid: "123e4567-e89b-12d3-a456-426614174000" });
const otherOwner = OwnerIdentitySchema.parse({ type: "work-item", name: "other-work", uid: "223e4567-e89b-12d3-a456-426614174000" });
function decisionRecord(value: ReviewDecision, key = reviewDecisionKey(value), storedOwner = owner): StoreRecord {
  return StoreRecordSchema.parse({ reference: recordReferences["review/decision"](storedOwner, key), content: JSON.stringify(value),
    fields: value, version: "fixture-version", formatVersion: 1, conflicts: [], placement: { kind: "active" } });
}
function outcomeRecord(value: ReviewOutcome): StoreRecord {
  return StoreRecordSchema.parse({ reference: recordReferences["review/outcome"](owner, reviewOutcomeKey(value)),
    content: JSON.stringify(value), fields: value, version: "fixture-version", formatVersion: 1,
    conflicts: [], placement: { kind: "active" } });
}
async function check(value: ReviewDecision, records: readonly StoreRecord[] = [], key = reviewDecisionKey(value), after?: StoreView) {
  const next = decisionRecord(value, key);
  return checkReviewDecision({ reference: next.reference, next: { content: next.content, fields: value },
    writer: { kind: "verb", verb: "review" }, before: ruleView(), after: after ?? ruleView([...records, next]) });
}
function withdrawal(value: ReviewDecision, decidedBy: string | null = value.decidedBy): ReviewDecision {
  return ReviewDecisionSchema.parse({ ...terminusDecision(), decidedBy,
    choice: { kind: "withdrawal", decisionKey: reviewDecisionKey(value) }, basis: null });
}

describe("decision write check", () => {
  it("binds the stored key to the decision's content", async () => {
    const value = terminusDecision();
    expect(await check(value)).toEqual([]);
    expect(await check(value, [], `sha256:${"f".repeat(64)}`)).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: "review.decision.key" }),
    ]));
  });
  it("requires a withdrawal to name a non-withdrawal decision on the same work item", async () => {
    const target = terminusDecision();
    const value = withdrawal(target);
    expect(await check(value)).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: "review.decision.withdrawal-target" }),
    ]));
    expect(await check(value, [decisionRecord(target, reviewDecisionKey(target), otherOwner)]))
      .toEqual(expect.arrayContaining([expect.objectContaining({ rule: "review.decision.withdrawal-target" })]));
    expect(await check(withdrawal(value), [decisionRecord(value)]))
      .toEqual(expect.arrayContaining([expect.objectContaining({ rule: "review.decision.withdrawal-target" })]));
    expect(await check(value, [decisionRecord(target)])).toEqual([]);
  });
  it("refuses an approved-fix withdrawal by a different decider or after outcome admission", async () => {
    const producer = ReviewOutcomeSchema.parse(hostedOutcome());
    const target = ReviewDecisionSchema.parse(approvedFixDecision(producer));
    expect(await check(withdrawal(target, "another-owner"), [decisionRecord(target), outcomeRecord(producer)]))
      .toEqual(expect.arrayContaining([expect.objectContaining({ rule: "review.decision.withdrawal-decider" })]));
    const consumed = ReviewOutcomeSchema.parse({ ...localOutcome({ lineage: producer.lineage, logicalPass: 2 }),
      admittedBy: reviewDecisionKey(target) });
    expect(await check(withdrawal(target), [decisionRecord(target), outcomeRecord(producer), outcomeRecord(consumed)]))
      .toEqual(expect.arrayContaining([expect.objectContaining({ rule: "review.decision.withdrawal-consumed" })]));
    expect(await check(withdrawal(target), [decisionRecord(target), outcomeRecord(producer)])).toEqual([]);
  });
  it("binds an approved-fix grant to its stored finished producer instead of the hosted storage key", async () => {
    const producer = ReviewOutcomeSchema.parse(hostedOutcome());
    const value = ReviewDecisionSchema.parse(approvedFixDecision(producer));
    expect(await check(value)).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: "review.decision.approved-fix-producer" }),
    ]));
    expect(await check(value, [outcomeRecord(producer)])).toEqual([]);
  });
  it.each(["repository", "lane", "lineage", "pass", "head", "producer-key"] as const)(
    "refuses an approved-fix grant with a mismatched %s", async (changed) => {
      const producer = ReviewOutcomeSchema.parse(hostedOutcome());
      const base = approvedFixDecision(producer);
      if (base.choice.kind !== "extra-pass" || base.choice.precondition.kind !== "approved-fix") throw new Error("expected approved fix");
      const origin = changed === "head" ? "e".repeat(40) : producer.target.headSha;
      const count = changed === "pass" ? 2 : 1;
      const value = ReviewDecisionSchema.parse({ ...base, lane: changed === "lane" ? "frontline" : base.lane,
        subject: { ...base.subject, headSha: origin, lineage: changed === "lineage"
          ? { kind: "candidate", candidateId: `sha256:${"e".repeat(64)}` } : base.subject.lineage },
        choice: { ...base.choice, passCount: count, precondition: { ...base.choice.precondition,
          exhaustedPassCount: count, originatingHeadSha: origin,
          repositoryId: changed === "repository" ? "another-project" : producer.target.repositoryId,
          producerId: changed === "producer-key" ? reviewOutcomeKey(producer) : producer.attemptId } } });
      expect(await check(value, [outcomeRecord(producer)])).toEqual(expect.arrayContaining([
        expect.objectContaining({ rule: "review.decision.approved-fix-producer" }),
      ]));
    },
  );

  it("requires a finished producer and admits every source's finished counterpart", async () => {
    const failed = ReviewOutcomeSchema.parse(localOutcome({ outcome: "terminal-failure" }));
    expect(await check(approvedFixDecision(failed), [outcomeRecord(failed)])).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: "review.decision.approved-fix-producer" }),
    ]));
    for (const raw of [localOutcome(), hostedOutcome(), frontlineOutcome()]) {
      const producer = ReviewOutcomeSchema.parse(raw);
      expect(await check(approvedFixDecision(producer), [outcomeRecord(producer)])).toEqual([]);
    }
  });
  it.each(["review/decision", "review/outcome"] as const)("requires complete %s observations", async (kind) => {
    const producer = ReviewOutcomeSchema.parse(hostedOutcome());
    const target = approvedFixDecision(producer);
    const records = [decisionRecord(target), outcomeRecord(producer)];
    for (const status of ["refused", "unreadable", "missed", "diagnostic"] as const) {
      const base = ruleView(records);
      const after: StoreView = { ...base, list: async (query) => query.kind !== kind ? base.list(query)
        : status === "refused" ? { status: "refused", refusal: { code: "namespace-corrupt", class: "terminal",
            namespace: "review", condition: "review history unavailable", remedy: { text: "Repair the history." } } }
        : { status: "ok", result: status === "unreadable"
          ? { status: "unreadable", condition: "review history cannot be read", remedy: { text: "Restore the listing." } }
          : { status: "complete", records: [], missed: status === "missed", diagnostics: status === "diagnostic"
            ? [{ kind: "malformed", key: "bad-record", condition: "malformed history", remedy: { text: "Repair the record." } }] : [] } } };
      expect(await check(withdrawal(target), records, undefined, after)).toEqual(expect.arrayContaining([
        expect.objectContaining({ rule: "review.decision.complete-listing" }),
      ]));
    }
  });

  it("refuses malformed decision or outcome records instead of treating them as absent", async () => {
    const producer = ReviewOutcomeSchema.parse(hostedOutcome());
    const target = approvedFixDecision(producer);
    for (const record of [decisionRecord(target), outcomeRecord(producer)]) {
      const records = record.reference.kind === "review/decision" ? [{ ...record, content: "{" }, outcomeRecord(producer)]
        : [decisionRecord(target), { ...record, content: "{" }];
      expect(await check(withdrawal(target), records)).toEqual(expect.arrayContaining([
        expect.objectContaining({ rule: "review.decision.complete-listing" }),
      ]));
    }
  });

  it("does not require successor-evidence observations to admit a withdrawal", async () => {
    const producer = ReviewOutcomeSchema.parse(hostedOutcome());
    const target = approvedFixDecision(producer);
    const records = [decisionRecord(target), outcomeRecord(producer)];
    const base = ruleView(records);
    const after: StoreView = { ...base, list: async (query) => query.kind === "review/evidence"
      ? { status: "refused", refusal: { code: "namespace-corrupt", class: "terminal", namespace: "review",
          condition: "Successor approval ordering is unavailable.", remedy: { text: "Use the live withdrawing verb." } } }
      : base.list(query) };
    expect(await check(withdrawal(target), records, undefined, after)).toEqual([]);
  });
});
