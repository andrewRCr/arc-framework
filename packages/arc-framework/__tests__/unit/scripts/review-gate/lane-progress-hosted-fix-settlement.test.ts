import { describe, expect, it } from "vitest";

import { CanonicalDigestSchema } from "../../../../src/lib/kernel/index.js";

import { type LaneProgressState, type ReviewOperationState } from "../../../../src/scripts/review-gate/core/operation-state-schema.js";
import { createReviewRequirement, createReviewTarget } from "../../../../src/scripts/review-gate/core/gate-contract-v2.js";

import { bindHostedAttemptDisposition, captureConditionalNextPassAuthorization, hostedLaneAttemptId, invalidateConditionalNextPassAuthorization, acknowledgeHostedRequest, recordHostedAwaitAttempt, recordHostedRequestAdmission, recordLaneResponsePerformance, settleHostedAttemptFinding, supersedeHostedAttemptDisposition, withdrawConditionalNextPassAuthorization } from "../../../../src/scripts/review-gate/lane-progress.js";
import { createHostedAdmission, type HostedRequestEnvelope, type HostedRequestHandle } from "../../../../src/scripts/review-gate/hosted/request.js";


const digest = (value: string) => CanonicalDigestSchema.parse(value);
const objectId = (character: string): string => character.repeat(40);
type LaneAttempt = LaneProgressState["attempts"][number];

function currentAuthorization(attempt: LaneAttempt | undefined) {
  const lineage = attempt?.conditionalPassAuthorizations;
  return lineage?.authorizations.find(({ authorizationId }) =>
    authorizationId === lineage.currentAuthorizationId);
}

function createStore() {
  const records = new Map<string, { version: number; state: ReviewOperationState }>();
  const store = {
    records,
    drift: 0,
    get state(): ReviewOperationState | null {
      return [...records.values()][0]?.state ?? null;
    },
    readOperation: async (operationId: string) => {
      const record = records.get(operationId);
      return { version: record?.version ?? 0, state: record?.state ?? null };
    },
    publishOperation: async (next: ReviewOperationState, expectedVersion: number) => {
      const current = records.get(next.operationId)?.version ?? 0;
      if (expectedVersion !== current + store.drift) throw new Error("version-conflict");
      const version = current + 1;
      records.set(next.operationId, { version, state: next });
      return { version };
    },
    readOperationSnapshot: async () => ({
      status: "complete" as const,
      records: [...records.values()],
    }),
  };
  return store;
}


const handleBase = {
  schemaVersion: 1 as const,
  provider: "coderabbit-pr" as const,
  requestedCoverage: "complete" as const,
  effectiveCoverage: "complete" as const,
  target: { repository: "andrewRCr/arc-framework", pullRequest: 42, headSha: objectId("c") },
  artifact: {
    kind: "issue-comment" as const,
    id: "comment-1",
    url: "https://example.invalid/comment-1",
    createdAt: "2026-08-15T11:00:00Z",
  },
};
const hostedReviewTarget = createReviewTarget({
  schemaVersion: 2,
  semanticsVersion: "review-gate/v2",
  kind: "change-set",
  repositoryId: "repo-1",
  baseRef: "main",
  diffBaseSha: objectId("a"),
  diffBaseTree: objectId("b"),
  headSha: objectId("c"),
  headTree: objectId("d"),
});
const hostedRequirement = createReviewRequirement({
  target: hostedReviewTarget,
  projection: {
    obligation: "required",
    reasons: ["sensitive-change-set"],
    rubricVersion: "standard-review/v1",
    rubricDigest: digest(`sha256:${"e".repeat(64)}`),
    retrigger: "full-final",
    count: 1,
  },
  acceptableSources: [{ sourceKind: "hosted", qualifier: handleBase.provider }],
  initialAdmission: "automatic",
});
if (hostedRequirement === null) throw new Error("expected hosted review requirement");
const hostedContext = {
  reviewTarget: hostedReviewTarget,
  requirement: hostedRequirement,
  actorIdentity: "github-user-1",
  authorizeCapacity: async () => undefined,
};
const hostedAdmission = createHostedAdmission({
  schemaVersion: 1,
  repositoryId: "repo-1",
  lineage: { kind: "candidate", candidateId: digest(`sha256:${"8".repeat(64)}`) },
  logicalPass: 1,
  sourceId: handleBase.provider,
  target: handleBase.target,
  requestedCoverage: handleBase.requestedCoverage,
  reviewTarget: hostedReviewTarget,
  requirement: hostedRequirement,
  actorIdentity: hostedContext.actorIdentity,
});
const handle = { ...handleBase, admission: hostedAdmission };

async function seedAcknowledgedRequest(
  store: ReturnType<typeof createStore>,
  requestHandle: HostedRequestHandle,
) {
  const admission = requestHandle.admission;
  const vehicle: HostedRequestEnvelope["vehicle"] = admission.vehicle?.kind === "errand"
    ? { kind: "errand", standardReview: admission.vehicle.standardReview }
    : admission.vehicle;
  const request: HostedRequestEnvelope = {
    schemaVersion: 1,
    target: admission.target,
    provider: admission.sourceId,
    coverage: admission.requestedCoverage,
    ...(admission.correctionScope === undefined
      ? {}
      : { correctionScope: admission.correctionScope }),
    ...(vehicle === undefined ? {} : { vehicle }),
  };
  const decision = await recordHostedRequestAdmission(store, {
    repositoryId: admission.repositoryId,
    lineage: admission.lineage,
    request,
    ...(admission.vehicle === undefined ? {} : { progressVehicle: admission.vehicle }),
    reviewTarget: admission.reviewTarget,
    requirement: admission.requirement,
    actorIdentity: admission.actorIdentity,
    authorizeCapacity: async () => undefined,
    now: "2026-08-15T11:59:00Z",
  });
  if (decision.state !== "admitted") throw new Error("expected hosted admission");
  return acknowledgeHostedRequest(store, {
    admission: decision.admission,
    handle: requestHandle,
    now: "2026-08-15T11:59:30Z",
  });
}

describe("hosted await lane recording", () => {
  it("completes an approved hosted response after its same-set pass authority is withdrawn", async () => {
    const store = createStore();
    await seedAcknowledgedRequest(store, handle);
    const progress = await recordHostedAwaitAttempt(store, {
      repositoryId: "repo-1",
      result: {
        schemaVersion: 1,
        mode: "review-hosted-await",
        handle,
        state: "findings",
        nextAction: "triage",
        reviewUrl: "https://example.invalid/review",
        findings: [{
          findingId: "body-1",
          origin: "review-body",
          reviewId: "review-1",
          fingerprint: "body-fingerprint",
          settlement: "not-applicable",
          severity: "minor",
          locus: "pull-request review body",
          url: "https://example.invalid/review",
          body: "Body finding",
          sourceOrdinal: 1,
        }, {
          findingId: "thread-1",
          origin: "review-thread",
          commentId: "comment-1",
          threadId: "thread-1",
          settlement: "reply-and-resolve",
          severity: "minor",
          locus: "src/index.ts:7",
          url: "https://example.invalid/thread-1",
          sourceOrdinal: 2,
        }],
      },
      now: "2026-08-15T12:00:00Z",
    });
    const attemptId = hostedLaneAttemptId(handle);
    const dispositionSetId = digest(`sha256:${"f".repeat(64)}`);
    const captured = await captureConditionalNextPassAuthorization(store, {
      lane: "standard",
      repositoryId: "repo-1",
      headSha: handle.target.headSha,
      lineage: hostedAdmission.lineage,
      producerId: attemptId,
      dispositionSetId,
      authorizedBy: hostedContext.actorIdentity,
      exhaustedPassCount: 1,
      nextPass: 2,
      now: "2026-08-15T12:00:15Z",
    });
    await bindHostedAttemptDisposition(store, {
      operationId: progress.operationId,
      attemptId,
      dispositionSetId,
      findingDispositions: [
        { findingId: "body-1", disposition: "fix", channelAction: "record-only" },
        { findingId: "thread-1", disposition: "defer", channelAction: "reply-and-resolve" },
      ],
      now: "2026-08-15T12:00:30Z",
    });
    await expect(withdrawConditionalNextPassAuthorization(store, {
      authorizationId: captured.authorizationId,
      lane: "standard",
      repositoryId: "repo-1",
      headSha: handle.target.headSha,
      lineage: hostedAdmission.lineage,
      producerId: attemptId,
      dispositionSetId,
      withdrawnBy: hostedContext.actorIdentity,
      now: "2026-08-15T12:00:45Z",
    }, async () => true)).resolves.toMatchObject({ state: "withdrawn" });
    const performed = await recordLaneResponsePerformance(store, {
      lane: "standard",
      repositoryId: "repo-1",
      headSha: handle.target.headSha,
      lineage: hostedAdmission.lineage,
      attemptId,
      dispositionSetId,
      producedHeadSha: objectId("d"),
      now: "2026-08-15T12:01:00Z",
    });
    expect(performed.attempts[0]?.outcome).toBe("findings");
    const settled = await settleHostedAttemptFinding(store, {
      operationId: progress.operationId,
      attemptId,
      dispositionSetId,
      findingId: "thread-1",
      disposition: "defer",
      actorIdentity: hostedContext.actorIdentity,
      target: handle.target,
      fixTarget: null,
      commentId: "comment-1",
      threadId: "thread-1",
      replyDigest: digest(`sha256:${"1".repeat(64)}`),
      replyId: "reply-1",
      now: "2026-08-15T12:02:00Z",
    });
    expect(settled.attempts[0]).toMatchObject({
      outcome: "settled-findings",
      responsePerformance: { dispositionSetId, producedHeadSha: objectId("d") },
    });
    expect(currentAuthorization(settled.attempts[0])).toMatchObject({
      status: "invalidated",
      reason: "withdrawn",
    });
  });

  it("joins record-only fix performance with hosted settlement in either order", async () => {
    for (const withAuthorization of [false, true]) {
      for (const settlementFirst of [false, true]) {
        const store = createStore();
        await seedAcknowledgedRequest(store, handle);
        const progress = await recordHostedAwaitAttempt(store, {
          repositoryId: "repo-1",
          ...hostedContext,
          result: {
            schemaVersion: 1,
            mode: "review-hosted-await",
            handle,
            state: "findings",
            nextAction: "triage",
            reviewUrl: "https://example.invalid/review",
            findings: [{
              findingId: "thread-1",
              origin: "review-thread",
              commentId: "comment-1",
              threadId: "thread-1",
              settlement: "reply-and-resolve",
              severity: "minor",
              locus: "src/index.ts:7",
              url: "https://example.invalid/thread-1",
              sourceOrdinal: 1,
              sourceLabel: "Thread native label",
            }, {
              findingId: "body-1",
              origin: "review-body",
              reviewId: "review-1",
              fingerprint: "body-fingerprint",
              settlement: "not-applicable",
              severity: "major",
              locus: "pull-request review body",
              url: "https://example.invalid/review-1",
              body: "Body finding",
              sourceOrdinal: 2,
              sourceLabel: "Body native label",
            }],
          },
          now: "2026-08-15T12:00:00Z",
        });
        if (progress === null) throw new Error("expected hosted lane progress");
        const attemptId = hostedLaneAttemptId(handle);
        const dispositionSetId = digest(`sha256:${"f".repeat(64)}`);
        if (withAuthorization) {
          await captureConditionalNextPassAuthorization(store, {
            lane: "standard",
            repositoryId: "repo-1",
            headSha: handle.target.headSha,
            lineage: hostedAdmission.lineage,
            producerId: attemptId,
            dispositionSetId,
            authorizedBy: hostedContext.actorIdentity,
            exhaustedPassCount: 1,
            nextPass: 2,
            now: "2026-08-15T12:00:15Z",
          });
        }
        await bindHostedAttemptDisposition(store, {
          operationId: progress.operationId,
          attemptId,
          dispositionSetId,
          findingDispositions: [{
            findingId: "thread-1",
            disposition: "defer",
            channelAction: "reply-and-resolve",
          }, {
            findingId: "body-1",
            disposition: "fix",
            channelAction: "record-only",
          }],
          now: "2026-08-15T12:00:30Z",
        });
        const perform = () => recordLaneResponsePerformance(store, {
          lane: "standard" as const,
          repositoryId: "repo-1",
          headSha: handle.target.headSha,
          lineage: hostedAdmission.lineage,
          attemptId,
          dispositionSetId,
          producedHeadSha: objectId("d"),
          now: "2026-08-15T12:01:00Z",
        });
        const settle = () => settleHostedAttemptFinding(store, {
          operationId: progress.operationId,
          attemptId,
          dispositionSetId,
          findingId: "thread-1",
          disposition: "defer" as const,
          actorIdentity: hostedContext.actorIdentity,
          target: handle.target,
          fixTarget: null,
          commentId: "comment-1",
          threadId: "thread-1",
          replyDigest: digest(`sha256:${"1".repeat(64)}`),
          replyId: "reply-1",
          now: "2026-08-15T12:02:00Z",
        });

        const partial = settlementFirst ? await settle() : await perform();
        expect(partial.attempts[0]).toMatchObject({ outcome: "findings" });
        const completed = settlementFirst ? await perform() : await settle();
        expect(completed.attempts[0]).toMatchObject({
          outcome: "settled-findings",
          responsePerformance: {
            dispositionSetId,
            producedHeadSha: objectId("d"),
          },
          hosted: { settledFindingIds: ["body-1", "thread-1"] },
        });
        expect(currentAuthorization(completed.attempts[0])?.status)
          .toBe(withAuthorization ? "bound" : undefined);
        const successorSetId = digest(`sha256:${"2".repeat(64)}`);
        if (withAuthorization) {
          await invalidateConditionalNextPassAuthorization(store, {
            lane: "standard",
            repositoryId: "repo-1",
            headSha: handle.target.headSha,
            lineage: hostedAdmission.lineage,
            producerId: attemptId,
            dispositionSetId,
            successorDispositionSetId: successorSetId,
            now: "2026-08-15T12:02:30Z",
          });
        }
        const successor = await supersedeHostedAttemptDisposition(store, {
          operationId: progress.operationId,
          attemptId,
          predecessorDispositionSetId: dispositionSetId,
          successorDispositionSetId: successorSetId,
          findingDispositions: [{
            findingId: "thread-1",
            disposition: "defer",
            channelAction: "reply-and-resolve",
          }, {
            findingId: "body-1",
            disposition: "fix",
            channelAction: "record-only",
          }],
          now: "2026-08-15T12:03:00Z",
        });
        expect(successor.carriedFindingIds).toEqual(["body-1", "thread-1"]);
        expect(successor.progress.attempts[0]?.outcome).toBe("findings");
        const successorPerformed = await recordLaneResponsePerformance(store, {
          lane: "standard",
          repositoryId: "repo-1",
          headSha: handle.target.headSha,
          lineage: hostedAdmission.lineage,
          attemptId,
          dispositionSetId: successorSetId,
          predecessorDispositionSetId: dispositionSetId,
          producedHeadSha: objectId("e"),
          now: "2026-08-15T12:04:00Z",
        });
        expect(successorPerformed.attempts[0]?.outcome).toBe("settled-findings");
      }
    }
  });

  it("refuses a host-addressable fix settled at a different response head", async () => {
    const store = createStore();
    await seedAcknowledgedRequest(store, handle);
    const progress = await recordHostedAwaitAttempt(store, {
      repositoryId: "repo-1",
      ...hostedContext,
      result: {
        schemaVersion: 1,
        mode: "review-hosted-await",
        handle,
        state: "findings",
        nextAction: "triage",
        reviewUrl: "https://example.invalid/review",
        findings: [{
          findingId: "thread-1",
          origin: "review-thread",
          commentId: "comment-1",
          threadId: "thread-1",
          settlement: "reply-and-resolve",
          severity: "major",
          locus: "src/index.ts:7",
          url: "https://example.invalid/thread-1",
          sourceOrdinal: 1,
          sourceLabel: "Thread native label",
        }],
      },
      now: "2026-08-15T12:00:00Z",
    });
    if (progress === null) throw new Error("expected hosted lane progress");
    const attemptId = hostedLaneAttemptId(handle);
    const dispositionSetId = digest(`sha256:${"f".repeat(64)}`);
    await bindHostedAttemptDisposition(store, {
      operationId: progress.operationId,
      attemptId,
      dispositionSetId,
      findingDispositions: [{
        findingId: "thread-1",
        disposition: "fix",
        channelAction: "reply-and-resolve",
      }],
      now: "2026-08-15T12:00:30Z",
    });
    await recordLaneResponsePerformance(store, {
      lane: "standard",
      repositoryId: "repo-1",
      headSha: handle.target.headSha,
      lineage: hostedAdmission.lineage,
      attemptId,
      dispositionSetId,
      producedHeadSha: objectId("d"),
      now: "2026-08-15T12:01:00Z",
    });

    await expect(settleHostedAttemptFinding(store, {
      operationId: progress.operationId,
      attemptId,
      dispositionSetId,
      findingId: "thread-1",
      disposition: "fix",
      actorIdentity: hostedContext.actorIdentity,
      target: handle.target,
      fixTarget: { ...handle.target, headSha: objectId("e") },
      commentId: "comment-1",
      threadId: "thread-1",
      replyDigest: digest(`sha256:${"1".repeat(64)}`),
      replyId: "reply-1",
      now: "2026-08-15T12:02:00Z",
    })).rejects.toThrow("does not match durable response-head evidence");
  });

  it("reopens a host-side fix when its successor response has no matching head evidence", async () => {
    const store = createStore();
    await seedAcknowledgedRequest(store, handle);
    const progress = await recordHostedAwaitAttempt(store, {
      repositoryId: "repo-1",
      ...hostedContext,
      result: {
        schemaVersion: 1,
        mode: "review-hosted-await",
        handle,
        state: "findings",
        nextAction: "triage",
        reviewUrl: "https://example.invalid/review",
        findings: [{
          findingId: "thread-1", origin: "review-thread", commentId: "comment-1",
          threadId: "thread-1", settlement: "reply-and-resolve", severity: "major",
          locus: "src/index.ts:7", url: "https://example.invalid/thread-1",
          sourceOrdinal: 1, sourceLabel: "Thread native label",
        }],
      },
      now: "2026-08-15T12:00:00Z",
    });
    if (progress === null) throw new Error("expected hosted lane progress");
    const attemptId = hostedLaneAttemptId(handle);
    const predecessorDispositionSetId = digest(`sha256:${"f".repeat(64)}`);
    const successorDispositionSetId = digest(`sha256:${"2".repeat(64)}`);
    const findingDispositions = [{
      findingId: "thread-1", disposition: "fix" as const,
      channelAction: "reply-and-resolve" as const,
    }];
    await bindHostedAttemptDisposition(store, {
      operationId: progress.operationId, attemptId, dispositionSetId: predecessorDispositionSetId,
      findingDispositions, now: "2026-08-15T12:00:30Z",
    });
    await recordLaneResponsePerformance(store, {
      lane: "standard", repositoryId: "repo-1", headSha: handle.target.headSha,
      lineage: hostedAdmission.lineage, attemptId, dispositionSetId: predecessorDispositionSetId,
      producedHeadSha: objectId("d"), now: "2026-08-15T12:01:00Z",
    });
    await settleHostedAttemptFinding(store, {
      operationId: progress.operationId, attemptId, dispositionSetId: predecessorDispositionSetId,
      findingId: "thread-1", disposition: "fix", actorIdentity: hostedContext.actorIdentity,
      target: handle.target, fixTarget: { ...handle.target, headSha: objectId("d") },
      commentId: "comment-1", threadId: "thread-1",
      replyDigest: digest(`sha256:${"1".repeat(64)}`), replyId: "reply-1",
      now: "2026-08-15T12:02:00Z",
    });
    const successor = await supersedeHostedAttemptDisposition(store, {
      operationId: progress.operationId, attemptId,
      predecessorDispositionSetId, successorDispositionSetId, findingDispositions,
      now: "2026-08-15T12:03:00Z",
    });
    expect(successor.carriedFindingIds).toEqual([]);
    expect(successor.reopenedFindingIds).toEqual(["thread-1"]);
    const performed = await recordLaneResponsePerformance(store, {
      lane: "standard", repositoryId: "repo-1", headSha: handle.target.headSha,
      lineage: hostedAdmission.lineage, attemptId, dispositionSetId: successorDispositionSetId,
      predecessorDispositionSetId, producedHeadSha: objectId("e"),
      now: "2026-08-15T12:04:00Z",
    });
    expect(performed.attempts[0]?.outcome).toBe("findings");
    const replay = await supersedeHostedAttemptDisposition(store, {
      operationId: progress.operationId, attemptId,
      predecessorDispositionSetId, successorDispositionSetId, findingDispositions,
      now: "2026-08-15T12:04:30Z",
    });
    expect(replay.reopenedFindingIds).toEqual(["thread-1"]);
    const settled = await settleHostedAttemptFinding(store, {
      operationId: progress.operationId, attemptId, dispositionSetId: successorDispositionSetId,
      findingId: "thread-1", disposition: "fix", actorIdentity: hostedContext.actorIdentity,
      target: handle.target, fixTarget: { ...handle.target, headSha: objectId("e") },
      commentId: "comment-1", threadId: "thread-1",
      replyDigest: digest(`sha256:${"2".repeat(64)}`), replyId: "reply-2",
      now: "2026-08-15T12:05:00Z",
    });
    expect(settled.attempts[0]?.outcome).toBe("settled-findings");
  });
});
