/** Response bindings survive a proved Candidate record commit without spending pass authority. */

import { describe, expect, it, vi } from "vitest";
import { canonicalDigest } from "../../../../src/lib/kernel/index.js";
import { SlugSchema } from "../../../../src/lib/kernel/schema/slug.js";
import type { LaneProgressState, ReviewOperationState } from
  "../../../../src/scripts/review-gate/core/operation-state-schema.js";
import { createReviewRequirement, createReviewTarget } from
  "../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { createHostedAdmission } from "../../../../src/scripts/review-gate/hosted/request.js";
import { acknowledgeHostedRequest, bindHostedAttemptDisposition, hostedLaneAttemptId, recordHostedAwaitAttempt,
  recordHostedRequestAdmission, settleHostedAttemptFinding, captureConditionalNextPassAuthorization,
  recordLaneAttempt, recordLaneResponsePerformance } from
  "../../../../src/scripts/review-gate/lane-progress.js";

const originalHead = "a".repeat(40);
const fixHead = "b".repeat(40);
const recordHead = "c".repeat(40);
const now = "2026-10-03T12:00:00Z";
const lineage = { kind: "candidate" as const, candidateId: canonicalDigest({ candidate: "one" }) };
const dispositionSetId = canonicalDigest({ disposition: "one" });
const coordinates = { lane: "standard" as const, repositoryId: "repo", headSha: originalHead,
  lineage, attemptId: "producer", now };

function storeFixture() {
  let version = 0;
  let state: ReviewOperationState | null = null;
  return {
    readOperation: async () => ({ version, state }),
    publishOperation: async (next: ReviewOperationState, expected: number) => {
      if (expected !== version) throw new Error("version-conflict");
      state = next;
      version += 1;
      return { version };
    },
    readOperationSnapshot: async () => ({ status: "complete" as const,
      records: state === null ? [] : [{ version, state }] }),
  };
}

async function performedFixture() {
  const store = storeFixture();
  await recordLaneAttempt(store, { ...coordinates, changeRequestId: "pull/1", sourceId: "delegated-agent",
    outcome: "findings", consumedPass: true });
  const captured = await captureConditionalNextPassAuthorization(store, {
    ...coordinates, producerId: coordinates.attemptId, dispositionSetId, authorizedBy: "owner",
    exhaustedPassCount: 1, nextPass: 2,
  });
  const performance = { ...coordinates, dispositionSetId, producedHeadSha: fixHead };
  const performed = await recordLaneResponsePerformance(store, performance);
  return { store, captured, performance, performed };
}

async function hostedFixture() {
  const store = storeFixture();
  const target = { repository: "owner/repo", pullRequest: 1, headSha: originalHead };
  const reviewTarget = createReviewTarget({ schemaVersion: 2, semanticsVersion: "review-gate/v2",
    kind: "change-set", repositoryId: "repo", baseRef: "main", diffBaseSha: "d".repeat(40),
    diffBaseTree: "e".repeat(40), headSha: originalHead, headTree: "f".repeat(40) });
  const requirement = createReviewRequirement({ target: reviewTarget, initialAdmission: "automatic",
    acceptableSources: [{ sourceKind: "hosted", qualifier: "codex-pr" }],
    projection: { obligation: "required", reasons: ["sensitive-change-set"], rubricVersion: "standard-review/v1",
      rubricDigest: canonicalDigest({ rubric: "one" }), retrigger: "full-final", count: 1 } });
  if (requirement === null) throw new Error("expected requirement");
  const admission = createHostedAdmission({ schemaVersion: 1, repositoryId: "repo", lineage, logicalPass: 1,
    sourceId: "codex-pr", target, requestedCoverage: "complete", reviewTarget, requirement, actorIdentity: "owner" });
  const handle = { schemaVersion: 1 as const, provider: "codex-pr" as const,
    requestedCoverage: "complete" as const, effectiveCoverage: "complete" as const, target, admission,
    artifact: { kind: "issue-comment" as const, id: "request", url: "https://example.test/request", createdAt: now } };
  const decision = await recordHostedRequestAdmission(store, { repositoryId: "repo", lineage,
    request: { schemaVersion: 1, provider: "codex-pr", target, coverage: "complete" },
    reviewTarget, requirement, actorIdentity: "owner", authorizeCapacity: async () => undefined, now });
  if (decision.state !== "admitted") throw new Error("expected admission");
  await acknowledgeHostedRequest(store, { admission: decision.admission, handle, now });
  const progress = await recordHostedAwaitAttempt(store, { repositoryId: "repo", now,
    result: { schemaVersion: 1, mode: "review-hosted-await", handle, state: "findings", nextAction: "triage",
      reviewUrl: "https://example.test/review", findings: [{ findingId: "finding", origin: "review-thread",
        commentId: "comment", threadId: "thread", settlement: "reply-and-resolve", severity: "major",
        locus: "source.txt:1", url: "https://example.test/thread", sourceOrdinal: 1 }] } });
  if (progress === null) throw new Error("expected progress");
  const attemptId = hostedLaneAttemptId(handle);
  await captureConditionalNextPassAuthorization(store, { ...coordinates, producerId: attemptId,
    dispositionSetId, authorizedBy: "owner", exhaustedPassCount: 1, nextPass: 2 });
  await bindHostedAttemptDisposition(store, { operationId: progress.operationId, attemptId, dispositionSetId,
    findingDispositions: [{ findingId: "finding", disposition: "fix", channelAction: "reply-and-resolve" }], now });
  const performance = { ...coordinates, attemptId, dispositionSetId, producedHeadSha: fixHead };
  await recordLaneResponsePerformance(store, performance);
  return { store, performance, operationId: progress.operationId, target };
}

function authorization(progress: LaneProgressState) {
  return progress.attempts[0]?.conditionalPassAuthorizations?.authorizations[0];
}

describe("Candidate response head continuation", () => {
  it.each([
    { kind: "delivery-member" as const, planId: canonicalDigest("plan"), deliverableId: canonicalDigest("member"), workUnitId: SlugSchema.parse("example") },
    { kind: "head-bound" as const, vehicleKind: "review-target" as const, vehicleIdentity: "repo/head", headSha: originalHead },
  ])("rejects a Candidate response digest on $kind lineage before reading state", async (otherLineage) => {
    const readOperation = vi.fn(async () => { throw new Error("unexpected state read"); });
    const store = { ...storeFixture(), readOperation };
    await expect(recordLaneResponsePerformance(store, { ...coordinates, lineage: otherLineage,
      dispositionSetId, producedHeadSha: fixHead, candidateResponseId: canonicalDigest("response") }))
      .rejects.toThrow("Candidate response digest requires its Candidate lineage");
    expect(readOperation).not.toHaveBeenCalled();
  });

  it("admits the record head while retaining the verified response and approval bindings", async () => {
    const { store, captured, performance, performed } = await performedFixture();
    let proofs = 0;
    const confirmResponseHeadContinuation = async (input: {
      fromHeadSha: string; toHeadSha: string; producerId: string;
    }) => {
      proofs += 1;
      return input.fromHeadSha === fixHead && input.toHeadSha === recordHead && input.producerId === "producer";
    };
    const pending = { ...coordinates, headSha: recordHead, attemptId: "next", logicalPass: 2,
      changeRequestId: "pull/1", sourceId: "delegated-agent", outcome: "pending" as const, consumedPass: false,
      conditionalPendingAdmission: { authorizationId: captured.authorizationId, repositoryId: "repo",
        lane: "standard" as const, lineage, producedHeadSha: recordHead, nextPass: 2, admissionId: "next", now,
        confirmDispositionSetCurrent: async () => true, confirmResponseHeadContinuation } };
    const admitted = await recordLaneAttempt(store, pending);
    expect(proofs).toBe(1);
    expect(admitted.attempts[0]?.responsePerformance).toEqual(performed.attempts[0]?.responsePerformance);
    expect(authorization(admitted)).toEqual({ ...authorization(performed), status: "consumed",
      admissionId: "next", consumedAt: now });
    expect(admitted.attempts[1]?.headSha).toBe(recordHead);
    await expect(recordLaneResponsePerformance(store, performance)).resolves.toEqual(admitted);
    await expect(recordLaneAttempt(store, { ...pending, attemptId: "another",
      conditionalPendingAdmission: { ...pending.conditionalPendingAdmission, admissionId: "another" } }))
      .rejects.toThrow(/consumed|only one pending/u);
  });

  it("settles the hosted fix at the record head and keeps immutable source-head provenance", async () => {
    const { store, performance, operationId, target } = await hostedFixture();
    const before = (await store.readOperation()).state;
    const settlement = { operationId, attemptId: performance.attemptId, dispositionSetId,
      findingId: "finding", disposition: "fix" as const, actorIdentity: "owner", target,
      fixTarget: { ...target, headSha: recordHead }, commentId: "comment", threadId: "thread",
      replyDigest: canonicalDigest({ reply: "fixed" }), replyId: "reply", now };
    await expect(settleHostedAttemptFinding(store, settlement)).rejects.toThrow("response-head evidence");
    expect((await store.readOperation()).state).toEqual(before);
    const confirmResponseHeadContinuation = async (input: { fromHeadSha: string; toHeadSha: string }) =>
      input.fromHeadSha === fixHead && input.toHeadSha === recordHead;
    const settled = await settleHostedAttemptFinding(store, { ...settlement, confirmResponseHeadContinuation });
    expect(settled.attempts[0]?.outcome).toBe("settled-findings");
    expect(settled.attempts[0]?.responsePerformance?.producedHeadSha).toBe(fixHead);
    expect(authorization(settled)).toMatchObject({ status: "bound", producedHeadSha: fixHead });
    await expect(recordLaneResponsePerformance(store, { ...performance, confirmResponseHeadContinuation }))
      .resolves.toEqual(settled);
    await expect(settleHostedAttemptFinding(store, { ...settlement, confirmResponseHeadContinuation }))
      .resolves.toEqual(settled);
  });

  it("rechecks proof after failed admission publication without spending approval", async () => {
    const { store, captured, performed } = await performedFixture();
    const publish = store.publishOperation;
    let fail = true;
    let proofs = 0;
    store.publishOperation = async (...args) => {
      if (fail) throw new Error("disk unavailable");
      return publish(...args);
    };
    const pending = { ...coordinates, headSha: recordHead, attemptId: "next", logicalPass: 2,
      changeRequestId: "pull/1", sourceId: "delegated-agent", outcome: "pending" as const, consumedPass: false,
      conditionalPendingAdmission: { authorizationId: captured.authorizationId, repositoryId: "repo",
        lane: "standard" as const, lineage, producedHeadSha: recordHead, nextPass: 2, admissionId: "next", now,
        confirmDispositionSetCurrent: async () => true,
        confirmResponseHeadContinuation: async () => { proofs += 1; return true; } } };
    await expect(recordLaneAttempt(store, pending)).rejects.toThrow("disk unavailable");
    expect((await store.readOperation()).state).toEqual(performed);
    fail = false;
    const admitted = await recordLaneAttempt(store, pending);
    expect(proofs).toBe(2);
    expect(authorization(admitted)?.status).toBe("consumed");
  });

  it("refuses absent or failed continuation proof without changing approval", async () => {
    const { store, captured, performed } = await performedFixture();
    const pending = { ...coordinates, headSha: recordHead, attemptId: "next", logicalPass: 2,
      changeRequestId: "pull/1", sourceId: "delegated-agent", outcome: "pending" as const, consumedPass: false,
      conditionalPendingAdmission: { authorizationId: captured.authorizationId, repositoryId: "repo",
        lane: "standard" as const, lineage, producedHeadSha: recordHead, nextPass: 2, admissionId: "next", now,
        confirmDispositionSetCurrent: async () => true } };
    await expect(recordLaneAttempt(store, pending)).rejects.toThrow("produced head");
    await expect(recordLaneAttempt(store, { ...pending,
      conditionalPendingAdmission: { ...pending.conditionalPendingAdmission,
        confirmResponseHeadContinuation: async () => false } })).rejects.toThrow("produced head");
    expect((await store.readOperation()).state).toEqual(performed);
  });
});
