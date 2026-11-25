import { describe, expect, it } from "vitest";
import { canonicalDigest } from "../../../../../../../src/lib/kernel/index.js";
import { deriveReviewReadinessBinding, type ReviewReadinessInput } from "../../../../../../../src/lib/store/kinds/review/integration-boundary/readiness.js";
import { ReviewOutcomeSchema } from "../../../../../../../src/lib/store/kinds/review/outcome/schema.js";
import { reviewOutcomeKey } from "../../../../../../../src/lib/store/kinds/review/outcome/key.js";
import { OwnerIdentitySchema, recordReferences, StoreRecordSchema, type StoreRecord } from "../../../../../../../src/lib/store/index.js";
import { localOutcome, hostedOutcome, frontlineOutcome } from "../../../../../../fixtures/review-outcome.js";
import { reviewEvidenceFixture } from "../../../../../../fixtures/review-evidence.js";
import { approvedFixDecision, extraPassDecision, terminusDecision } from "../../../../../../fixtures/review-decision.js";
import { ReviewEvidenceSchema, type ReviewEvidence } from "../../../../../../../src/lib/store/kinds/review/evidence/schema.js";
import { ReviewDecisionSchema, type ReviewDecision } from "../../../../../../../src/lib/store/kinds/review/decision/schema.js";
import { reviewDecisionKey } from "../../../../../../../src/lib/store/kinds/review/decision/key.js";
import { LaneAttemptSchema } from "../../../../../../../src/scripts/review-gate/core/operation-state-schema.js";
import { createReviewTarget } from "../../../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { laneSubjectOwner } from "../../../../../../../src/scripts/review-gate/core/lane-admission.js";

const owner = OwnerIdentitySchema.parse({ type: "work-item", name: "example" });
const outcome = (pass = 1) => ReviewOutcomeSchema.parse(localOutcome({ logicalPass: pass }));
function record(value = outcome()): StoreRecord {
  return StoreRecordSchema.parse({ reference: recordReferences["review/outcome"](owner, reviewOutcomeKey(value)),
    content: JSON.stringify(value), fields: value, version: "backend-version", formatVersion: 1,
    conflicts: [], placement: { kind: "active" } });
}
const listing = (records: StoreRecord[]): ReviewReadinessInput["outcomes"] => ({ status: "complete", records, diagnostics: [], missed: false });
function evidenceRecord(value: ReviewEvidence): StoreRecord {
  return StoreRecordSchema.parse({ ...record(), reference: recordReferences["review/evidence"](owner, value.dispositionSet.dispositionSetId),
    content: JSON.stringify(ReviewEvidenceSchema.parse(value)), fields: value });
}
function decisionRecord(value: ReviewDecision): StoreRecord {
  return StoreRecordSchema.parse({ ...record(), reference: recordReferences["review/decision"](owner, reviewDecisionKey(value)),
    content: JSON.stringify(ReviewDecisionSchema.parse(value)), fields: value });
}
function input(records: StoreRecord[] = [record()]): ReviewReadinessInput {
  return { outcomes: listing(records), evidence: { status: "absent" }, decisions: { status: "absent" },
    subjectOwner: outcome().lineage, inFlight: [] };
}
function digest(value: ReviewReadinessInput): string {
  const result = deriveReviewReadinessBinding(value);
  expect(result.status).toBe("complete");
  if (result.status !== "complete") throw new Error(result.condition);
  return result.digest;
}
function pendingLocal(pass = 2) {
  const producer = outcome(pass), local = producer.local!;
  return LaneAttemptSchema.parse({ attemptId: producer.attemptId, logicalPass: pass, retryGeneration: 0,
    changeRequestId: null, headSha: producer.target.headSha, terminalProducer: false,
    sourceId: producer.source.sourceId, outcome: "pending", local: {
      operationId: local.operationId, requestId: local.requestId, vehicle: local.vehicle, target: local.target,
      requestedCoverage: local.requestedCoverage, effectiveCoverage: null, scopeMode: local.scopeMode,
      rubricIdentity: { version: producer.requirement!.rubricVersion, digest: producer.requirement!.rubricDigest },
    } });
}
describe("standard review readiness binding", () => {
  it("binds selected outcome content, with order-independent membership", () => {
    const first = record(), second = record(outcome(2));
    expect(digest(input([first, second]))).toBe(digest(input([second, first])));
    expect(digest(input([first, second]))).not.toBe(digest(input([first])));
    expect(digest(input([first]))).not.toBe(digest(input([])));
    const changed = { ...first, content: JSON.stringify({ ...outcome(), endedAt: "2026-10-19T14:00:00Z" }) };
    expect(digest(input([changed]))).not.toBe(digest(input([first])));
  });
  it("ignores JSON formatting, property order, and opaque backend versions", () => {
    const original = record();
    const reordered = Object.fromEntries(Object.entries(JSON.parse(original.content) as object).reverse());
    const rewritten = { ...original, version: StoreRecordSchema.shape.version.parse("different-backend-version"),
      content: `\n${JSON.stringify(reordered, null, 2)}\n`, fields: undefined };
    expect(digest(input([rewritten]))).toBe(digest(input([original])));
  });
});

it("binds evidence responding to selected outcomes and every content advance", () => {
  const producer = ReviewOutcomeSchema.parse(localOutcome({ outcome: "findings", findings: [{ findingId: "finding-1",
    severity: "major", locus: "src/main.ts:1", evidenceUrlOrId: "finding:1", sourceOrdinal: 1 }] }));
  const value = reviewEvidenceFixture(producer), base = input([record(producer)]);
  const bound = { ...base, evidence: listing([evidenceRecord(value)]) };
  expect(digest(bound)).not.toBe(digest(base));
  expect(digest({ ...bound, evidence: listing([evidenceRecord({ ...value,
    successorDispositionSetId: canonicalDigest({ next: 1 }) })]) })).not.toBe(digest(bound));
});

it("binds approved-fix grants and withdrawals by referenced decision key", () => {
  const value = approvedFixDecision(outcome()), grant = decisionRecord(value);
  const base = input(), granted = { ...base, decisions: listing([grant]) };
  expect(digest(granted)).not.toBe(digest(base));
  const withdrawal = decisionRecord({ ...value, choice: { kind: "withdrawal", decisionKey: reviewDecisionKey(value) } });
  const withdrawn = { ...base, decisions: listing([grant, withdrawal]) };
  expect(digest(withdrawn)).not.toBe(digest(granted));
  expect(digest({ ...base, decisions: listing([withdrawal, grant]) })).toBe(digest(withdrawn));
  const later = decisionRecord({ ...value, decidedAt: "2026-10-19T14:00:00Z" });
  expect(digest({ ...base, decisions: listing([later]) })).not.toBe(digest(granted));
});

it("binds each pending attempt's complete canonical state in any order", () => {
  const first = pendingLocal(2), second = pendingLocal(3), base = input();
  expect(digest({ ...base, inFlight: [first] })).not.toBe(digest(base));
  expect(digest({ ...base, inFlight: [first, second] })).not.toBe(digest({ ...base, inFlight: [first] }));
  expect(digest({ ...base, inFlight: [first, second] })).toBe(digest({ ...base, inFlight: [second, first] }));
  const admitted = { ...first, admittedBy: canonicalDigest({ grant: 1 }) };
  expect(digest({ ...base, inFlight: [admitted] })).not.toBe(digest({ ...base, inFlight: [first] }));
  const reordered = Object.fromEntries(Object.entries(admitted).reverse()) as typeof admitted;
  expect(digest({ ...base, inFlight: [reordered] })).toBe(digest({ ...base, inFlight: [admitted] }));
});

it.each(["local", "hosted-unacknowledged", "hosted-acknowledged"])("excludes ended %s attempts from pending state", (kind) => {
  const local = outcome(2), hosted = ReviewOutcomeSchema.parse(hostedOutcome({ logicalPass: 3, lineage: local.lineage }));
  const binding = hosted.hosted!, admission = binding.admission;
  const pending = LaneAttemptSchema.parse({ attemptId: admission.admissionId, logicalPass: admission.logicalPass,
    retryGeneration: 0, changeRequestId: `pull/${admission.target.pullRequest}`, headSha: admission.target.headSha,
    terminalProducer: false, sourceId: admission.sourceId, outcome: "pending", hosted: { admission,
      target: admission.target, requestedCoverage: admission.requestedCoverage, effectiveCoverage: null,
      reviewTarget: admission.reviewTarget, requirement: admission.requirement, actorIdentity: admission.actorIdentity,
      requestFailureReason: null, dispositionSetId: null, dispositionSetLineage: [], settledFindingIds: [], settlementEvidence: [] } });
  const base = input([record(local), record(hosted)]);
  const acknowledged = LaneAttemptSchema.parse({ ...pending, attemptId: hosted.attemptId,
    hosted: { ...pending.hosted, handle: binding.handle } });
  const attempt = kind === "local" ? pendingLocal(2) : kind === "hosted-unacknowledged" ? pending : acknowledged;
  expect(digest({ ...base, inFlight: [attempt] })).toBe(digest(base));
});

it.each(["other-lane", "other-owner", "unlisted-result"])("ignores outcomes and evidence for %s", (kind) => {
  const base = input();
  const findings = [{ findingId: "finding-1", severity: "major" as const, locus: "src/main.ts:1",
    evidenceUrlOrId: "finding:1", sourceOrdinal: 1 }];
  const producer = ReviewOutcomeSchema.parse(kind === "other-lane" ? frontlineOutcome({ lineage: outcome().lineage, findings })
    : localOutcome({ lineage: { kind: "candidate", candidateId: canonicalDigest({ candidate: 99 }) }, outcome: "findings", findings }));
  const extra = kind === "unlisted-result" ? [] : [record(producer)];
  expect(digest({ ...base, outcomes: listing([record(), ...extra]),
    evidence: listing([evidenceRecord(reviewEvidenceFixture(producer))]) })).toBe(digest(base));
});

it.each(["terminus", "ceiling", "additional", "skip", "foreign-grant", "frontline-grant", "unrelated-withdrawal"])(
  "ignores %s decisions", (kind) => {
    const original = approvedFixDecision(outcome());
    const value: ReviewDecision = kind === "terminus" ? terminusDecision()
      : kind === "ceiling" || kind === "additional" ? extraPassDecision(kind)
      : kind === "skip" ? { ...terminusDecision(), lane: "frontline", basis: null, choice: { kind: "lane-skip" } }
      : kind === "foreign-grant" ? { ...original, subject: { ...original.subject,
          lineage: { kind: "candidate", candidateId: canonicalDigest({ candidate: 99 }) } } }
      : kind === "frontline-grant" ? { ...original, lane: "frontline" }
      : { ...original, choice: { kind: "withdrawal", decisionKey: canonicalDigest({ unrelated: 1 }) } };
    expect(digest({ ...input(), decisions: listing([decisionRecord(value)]) })).toBe(digest(input()));
  });

it("binds an Errand's outcomes at different heads through its stable owner", () => {
  const lineage = { kind: "head-bound" as const, vehicleKind: "errand", vehicleIdentity: "claim-1", headSha: "c".repeat(40) };
  const vehicle = { kind: "errand" as const, identity: "example", claimId: "claim-1" };
  const first = ReviewOutcomeSchema.parse(localOutcome({ lineage, vehicle }));
  const { targetId: ignored, ...coordinates } = first.target;
  void ignored;
  const second = ReviewOutcomeSchema.parse(localOutcome({ logicalPass: 2, vehicle, lineage: { ...lineage, headSha: "e".repeat(40) },
    target: createReviewTarget({ ...coordinates, headSha: "e".repeat(40), headTree: "f".repeat(40) }) }));
  const base = { ...input([record(first)]), subjectOwner: laneSubjectOwner(first.lineage) };
  expect(digest(base)).not.toBe(digest({ ...base, outcomes: listing([record(first), record(second)]) }));
});

describe.each(["outcomes", "evidence", "decisions"] as const)("%s completeness", (family) => {
  it.each(["unreadable", "missed", "diagnostic", "malformed", "duplicate", "wrong-key"])(
    "refuses %s observations without a digest", (kind) => {
      const selected = family === "outcomes" ? record() : family === "evidence"
        ? evidenceRecord(reviewEvidenceFixture()) : decisionRecord(approvedFixDecision(outcome()));
      const records = kind === "malformed" ? [{ ...selected, content: "{" }]
        : kind === "duplicate" ? [selected, selected]
        : kind === "wrong-key" ? [{ ...selected, reference: { ...selected.reference, key: "wrong-key" } }] : [selected];
      const observed: ReviewReadinessInput["outcomes"] = kind === "unreadable"
        ? { status: "unreadable", condition: "not available", remedy: { text: "Retry this listing." } }
        : { status: "complete", records, missed: kind === "missed", diagnostics: kind === "diagnostic"
          ? [{ kind: "unreadable", key: "hidden", condition: "not readable", remedy: { text: "Restore this record." } }] : [] };
      const result = deriveReviewReadinessBinding({ ...input(), [family]: observed });
      expect(result).toEqual({ status: "incomplete", condition: expect.any(String) });
      expect(result).not.toHaveProperty("digest");
    });
});
