import { describe, expect, it } from "vitest";
import { checkReviewOutcome } from "../../../../../../../src/lib/store/kinds/review/outcome/check.js";
import { ReviewOutcomeSchema, type ReviewOutcome } from "../../../../../../../src/lib/store/kinds/review/outcome/schema.js";
import { reviewOutcomeKey } from "../../../../../../../src/lib/store/kinds/review/outcome/key.js";
import {
  OwnerIdentitySchema, recordReferences, StoreRecordSchema, type StoreRecord, type StoreView,
} from "../../../../../../../src/lib/store/index.js";
import { ruleView } from "../../../../../../helpers/store/rule-view.js";
import { createHostedHandleFixture } from "../../../../../../fixtures/hosted-review.js";
import { localOutcome, hostedOutcome } from "../../../../../../fixtures/review-outcome.js";

const owner = OwnerIdentitySchema.parse({ type: "work-item", name: "review-work", uid: "123e4567-e89b-12d3-a456-426614174000" });

function record(value: ReviewOutcome, key = reviewOutcomeKey(value)): StoreRecord {
  return StoreRecordSchema.parse({ reference: recordReferences["review/outcome"](owner, key),
    content: JSON.stringify(value), fields: value, version: "fixture-version", formatVersion: 1,
    conflicts: [], placement: { kind: "active" } });
}

async function check(values: readonly ReviewOutcome[], key?: string, after?: StoreView) {
  const written = values.at(-1);
  if (written === undefined) throw new Error("expected a written outcome");
  const next = record(written, key);
  const records = values.map((value) => value === written ? next : record(value));
  return checkReviewOutcome({ reference: next.reference, next: { content: next.content, fields: written },
    writer: { kind: "verb", verb: "review" }, before: ruleView(), after: after ?? ruleView(records) });
}

const local = (options: Parameters<typeof localOutcome>[0] = {}) => ReviewOutcomeSchema.parse(localOutcome(options));
const hosted = (options: Parameters<typeof hostedOutcome>[0] = {}) => ReviewOutcomeSchema.parse(hostedOutcome(options));

describe("outcome write check", () => {
  it("binds the stored key to the producer's stable identity", async () => {
    const value = local();
    expect(await check([value])).toEqual([]);
    expect(await check([value], "wrong-key")).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: "review.outcome.key" }),
    ]));
  });
});

it("refuses two finished producers of one logical pass in the whole proposed set", async () => {
  const first = local();
  const second = hosted({ lineage: first.lineage });
  expect(await check([first, second])).toEqual(expect.arrayContaining([
    expect.objectContaining({ rule: "review.outcome.finished-pass" }),
  ]));
  expect(await check([first, hosted({ lineage: first.lineage, logicalPass: 2 })])).toEqual([]);
});

it.each(["unreadable", "missed", "diagnostic", "refused"] as const)("refuses a %s listing", async (status) => {
  const after: StoreView = { ...ruleView(), list: async () => status === "refused"
    ? { status: "refused", refusal: { code: "namespace-corrupt", class: "terminal", namespace: "review", condition: "history unavailable", remedy: { text: "Retry the history read." } } }
    : { status: "ok", result: status === "unreadable"
      ? { status: "unreadable", condition: "cannot read outcome history", remedy: { text: "Retry reading outcomes." } }
      : { status: "complete", records: [], missed: status === "missed",
          diagnostics: status === "diagnostic" ? [{ kind: "malformed", key: "bad-outcome", condition: "bad outcome", remedy: { text: "Repair this outcome." } }] : [] } } };
  const rules = await check([local()], undefined, after);
  expect(rules).toEqual(expect.arrayContaining([expect.objectContaining({ rule: "review.outcome.complete-listing" })]));
  expect(rules[0]?.condition).toMatch(/unavailable|read|malformed/u);
});

it("refuses an outcome above the finished generation in the same local grouping", async () => {
  expect(await check([local(), local({ retryGeneration: 1, outcome: "terminal-failure" })])).toEqual(expect.arrayContaining([
    expect.objectContaining({ rule: "review.outcome.after-finished-generation" }),
  ]));
});

it("requires unique contiguous local generations from zero", async () => {
  expect(await check([local({ retryGeneration: 1, outcome: "terminal-failure" })])).toEqual(expect.arrayContaining([
    expect.objectContaining({ rule: "review.outcome.local-generation-gap" }),
  ]));
  const otherTarget = createHostedHandleFixture({ target: { repository: "owner/repo", pullRequest: 42, headSha: "e".repeat(40) } }).admission.reviewTarget;
  expect(await check([local({ outcome: "terminal-failure" }), local({ target: otherTarget, outcome: "terminal-failure" })])).toEqual(expect.arrayContaining([
    expect.objectContaining({ rule: "review.outcome.local-generation-duplicate" }),
  ]));
  expect(await check([0, 1, 2].map((retryGeneration) => local({ retryGeneration, outcome: "terminal-failure" })))).toEqual([]);
});

it("keeps retry generations independent across local and hosted sources", async () => {
  const first = local({ outcome: "terminal-failure" });
  const second = local({ retryGeneration: 1, outcome: "terminal-failure" });
  expect(await check([first, second, hosted({ lineage: first.lineage })])).toEqual([]);
});

const authorizationId = `sha256:${"1".repeat(64)}`;
const authorized = (value: ReviewOutcome): ReviewOutcome => ({ ...value, admittedBy: authorizationId });

it("refuses duplicate hosted admission identities even under different stored keys", async () => {
  const first = hosted();
  const second = hosted({ artifact: { kind: "issue-comment", id: "comment-2", url: "https://example.invalid/comment-2", createdAt: "2026-10-19T14:00:00Z" } });
  const after = ruleView([record(first, "historical-wrong-key"), record(second)]);
  expect(await check([second], undefined, after)).toEqual(expect.arrayContaining([
    expect.objectContaining({ rule: "review.outcome.hosted-admission" }),
  ]));
});

it.each(["source", "scope", "coverage", "pass", "vehicle"] as const)("keeps authorized retry %s stable", async (changed) => {
  const first = authorized(local({ outcome: "terminal-failure" }));
  const correctionScope = { schemaVersion: 1 as const, predecessorProducerId: first.attemptId,
    predecessorHeadSha: "b".repeat(40), basisHeadSha: "b".repeat(40), headSha: first.target.headSha, requiredFindings: [] };
  const second = changed === "source" ? authorized(hosted({ lineage: first.lineage }))
    : authorized(local({ retryGeneration: 1, outcome: "terminal-failure",
      ...(changed === "scope" ? { scopeMode: "chunked" as const } : {}),
      ...(changed === "vehicle" ? { vehicle: { kind: "work-unit" as const, identity: "another-work" } } : {}),
      ...(changed === "pass" ? { logicalPass: 2 } : {}),
      ...(changed === "coverage" ? { coverageAdmission: { requestedCoverage: "incremental" as const, correctionScope } } : {}) }));
  expect(await check([first, second])).toEqual(expect.arrayContaining([
    expect.objectContaining({ rule: "review.outcome.authorized-retry-contract" }),
  ]));
});

it("requires unique contiguous generations for one extra-pass authorization", async () => {
  const first = authorized(local({ outcome: "terminal-failure" }));
  const gap = authorized(local({ outcome: "terminal-failure", retryGeneration: 2 }));
  expect(await check([first, gap])).toEqual(expect.arrayContaining([
    expect.objectContaining({ rule: "review.outcome.authorized-generation-gap" }),
  ]));
  const target = createHostedHandleFixture({ target: { repository: "owner/repo", pullRequest: 42, headSha: "e".repeat(40) } }).admission.reviewTarget;
  const duplicate = authorized(local({ target, outcome: "terminal-failure" }));
  expect(await check([first, duplicate])).toEqual(expect.arrayContaining([
    expect.objectContaining({ rule: "review.outcome.authorized-generation-duplicate" }),
  ]));
  expect(await check([first, authorized(local({ retryGeneration: 1 }))])).toEqual([]);
});

it("counts an Errand's two heads as one owner's retry history", async () => {
  const vehicle = { kind: "errand" as const, identity: "small-repair", claimId: "claim-1" };
  const first = local({ vehicle, outcome: "terminal-failure", lineage: { kind: "head-bound", vehicleKind: "errand", vehicleIdentity: vehicle.claimId, headSha: "c".repeat(40) } });
  const target = createHostedHandleFixture({ target: { repository: "owner/repo", pullRequest: 42, headSha: "e".repeat(40) } }).admission.reviewTarget;
  const second = local({ vehicle, target, retryGeneration: 1,
    lineage: { kind: "head-bound", vehicleKind: "errand", vehicleIdentity: vehicle.claimId, headSha: target.headSha } });
  expect(await check([first, second])).toEqual([]);
  expect(await check([second])).toEqual(expect.arrayContaining([
    expect.objectContaining({ rule: "review.outcome.local-generation-gap" }),
  ]));
});

it("keeps another subject owner's finished producer outside the checked lane", async () => {
  const first = local();
  const second = local({ lineage: { kind: "candidate", candidateId: `sha256:${"2".repeat(64)}` } });
  expect(await check([first, second])).toEqual([]);
});

it("admits another hosted generation zero after a request failure at an earlier head", async () => {
  const earlier = hosted();
  const failed = ReviewOutcomeSchema.parse({ ...earlier, attemptId: earlier.hosted?.admission.admissionId,
    outcome: "terminal-failure", effectiveCoverage: null,
    hosted: { ...earlier.hosted, handle: undefined, sealedResult: undefined, effectiveCoverage: null, requestFailureReason: "request failed" } });
  const next = hosted({ lineage: failed.lineage, target: { repository: "owner/repo", pullRequest: 42, headSha: "e".repeat(40) } });
  expect(await check([failed, next])).toEqual([]);
});

it("refuses malformed entries in an otherwise complete listing", async () => {
  const value = local();
  const malformed = { ...record(value, "malformed-entry"), content: "broken JSON" };
  expect(await check([value], undefined, ruleView([malformed, record(value)]))).toEqual(expect.arrayContaining([
    expect.objectContaining({ rule: "review.outcome.complete-listing", condition: expect.stringContaining("malformed-entry") }),
  ]));
});
