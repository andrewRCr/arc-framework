import { describe, expect, it } from "vitest";


import { DeliveryReviewMemberVehicleSchema } from "../../../../src/lib/delivery/review-vehicle.js";
import { LaneProgressStateSchema, type LaneProgressState, type ReviewOperationState } from "../../../../src/scripts/review-gate/core/operation-state-schema.js";


import { captureConditionalNextPassAuthorization, consumeConditionalNextPassAuthorization, hostedAwaitLaneOutcome, invalidateConditionalNextPassAuthorization, inspectConditionalNextPassInvalidation, laneContinuationOperationId, laneProgressOperationId, readLaneProgressOwner, recordLaneAttempt, settleLaneAttempt, withdrawConditionalNextPassAuthorization } from "../../../../src/scripts/review-gate/lane-progress.js";



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

const attempt = {
  lane: "standard" as const,
  repositoryId: "repo-1",
  changeRequestId: "pull/42",
  headSha: objectId("c"),
  attemptId: "attempt-1",
  sourceId: "coderabbit-pr",
  now: "2026-08-15T12:00:00Z",
};

async function seedConditionalAuthorization(
  store: ReturnType<typeof createStore>,
  options: { bind?: boolean } = {},
) {
  const lineage = {
    kind: "candidate" as const,
    candidateId: `sha256:${"5".repeat(64)}`,
  };
  const dispositionSetId = `sha256:${"6".repeat(64)}`;
  await recordLaneAttempt(store, {
    ...attempt,
    lineage,
    outcome: "findings",
    consumedPass: true,
  });
  const captured = await captureConditionalNextPassAuthorization(store, {
    lane: attempt.lane,
    repositoryId: attempt.repositoryId,
    headSha: attempt.headSha,
    lineage,
    producerId: attempt.attemptId,
    dispositionSetId,
    authorizedBy: "author-1",
    exhaustedPassCount: 1,
    nextPass: 2,
    now: "2026-08-15T12:01:00Z",
  });
  if (options.bind === true) {
    await settleLaneAttempt(store, {
      ...attempt,
      lineage,
      dispositionSetId,
      producedHeadSha: attempt.headSha,
      now: "2026-08-15T12:02:00Z",
    });
  }
  return { captured, lineage, dispositionSetId };
}

describe("lane progress", () => {
  it("creates the record on a lane's first recorded attempt", async () => {
    const store = createStore();
    const state = await recordLaneAttempt(store, {
      ...attempt,
      outcome: "rate-limited",
      consumedPass: false,
    });
    expect(LaneProgressStateSchema.parse(state)).toEqual(state);
    expect(state.lane).toBe("standard");
    expect(state.repositoryId).toBe("repo-1");
    expect(state.attempts).toEqual([{
      attemptId: "attempt-1",
      logicalPass: 1,
      retryGeneration: 0,
      changeRequestId: "pull/42",
      headSha: objectId("c"),
      terminalProducer: false,
      sourceId: "coderabbit-pr",
      outcome: "rate-limited",
    }]);
  });

  it("appends later attempts in the order they were recorded", async () => {
    const store = createStore();
    await recordLaneAttempt(store, { ...attempt, outcome: "rate-limited", consumedPass: false });
    await recordLaneAttempt(store, {
      ...attempt,
      attemptId: "attempt-2",
      sourceId: "codex-pr",
      outcome: "transient-unavailable",
      consumedPass: false,
    });
    const state = await recordLaneAttempt(store, {
      ...attempt,
      attemptId: "attempt-3",
      sourceId: "delegated-agent",
      outcome: "findings",
      consumedPass: true,
    });
    expect(state.attempts.map(({ sourceId }) => sourceId))
      .toEqual(["coderabbit-pr", "codex-pr", "delegated-agent"]);
  });

  it("advances the pass count only for an attempt that consumed a pass", async () => {
    const store = createStore();
    const unavailable = await recordLaneAttempt(store, {
      ...attempt,
      outcome: "rate-limited",
      consumedPass: false,
    });
    expect(unavailable.completedPasses).toBe(0);
    const verdict = await recordLaneAttempt(store, {
      ...attempt,
      attemptId: "attempt-2",
      sourceId: "codex-pr",
      outcome: "clean",
      consumedPass: true,
    });
    expect(verdict.completedPasses).toBe(1);
  });

  it("keeps one record per lane and target", () => {
    const standard = laneProgressOperationId({ lane: "standard", repositoryId: "repo-1", headSha: objectId("c") });
    const frontline = laneProgressOperationId({ lane: "frontline", repositoryId: "repo-1", headSha: objectId("c") });
    const otherHead = laneProgressOperationId({ lane: "standard", repositoryId: "repo-1", headSha: objectId("d") });
    expect(standard).not.toBe(frontline);
    expect(standard).not.toBe(otherHead);
    expect(laneProgressOperationId({ lane: "standard", repositoryId: "repo-1", headSha: objectId("c") }))
      .toBe(standard);
  });

  it("owns progress by stable delivery-member lineage instead of exact head", () => {
    const member = DeliveryReviewMemberVehicleSchema.omit({ head: true }).parse({
      kind: "delivery-member" as const,
      planId: "123e4567-e89b-12d3-a456-426614174000",
      workUnitId: "review-signal-convergence",
      deliverableId: "sha256:" + "2".repeat(64),
    });
    const firstHead = laneProgressOperationId({
      lane: "standard",
      repositoryId: "repo-1",
      lineage: member,
      headSha: objectId("c"),
    });
    const movedHead = laneProgressOperationId({
      lane: "standard",
      repositoryId: "repo-1",
      lineage: member,
      headSha: objectId("d"),
    });
    const siblingAtSameHead = laneProgressOperationId({
      lane: "standard",
      repositoryId: "repo-1",
      lineage: { ...member, deliverableId: "sha256:" + "3".repeat(64) },
      headSha: objectId("c"),
    });

    expect(movedHead).toBe(firstHead);
    expect(siblingAtSameHead).not.toBe(firstHead);
  });

  it("serializes a head-bound continuation on one identity across head movement", () => {
    const first = laneContinuationOperationId({
      lane: "standard",
      repositoryId: "repo-1",
      headSha: objectId("c"),
      lineage: {
        kind: "head-bound",
        vehicleKind: "errand",
        vehicleIdentity: "repair-review-state",
        headSha: objectId("c"),
      },
    });
    const moved = laneContinuationOperationId({
      lane: "standard",
      repositoryId: "repo-1",
      headSha: objectId("d"),
      lineage: {
        kind: "head-bound",
        vehicleKind: "errand",
        vehicleIdentity: "repair-review-state",
        headSha: objectId("d"),
      },
    });
    const sibling = laneContinuationOperationId({
      lane: "standard",
      repositoryId: "repo-1",
      headSha: objectId("d"),
      lineage: {
        kind: "head-bound",
        vehicleKind: "errand",
        vehicleIdentity: "other-errand",
        headSha: objectId("d"),
      },
    });

    expect(moved).toBe(first);
    expect(sibling).not.toBe(first);
  });

  it("retains one head-bound Errand owner across correction head movement", () => {
    const owner = (identity: string, headSha: string) => laneProgressOperationId({
      lane: "standard",
      repositoryId: "repo-1",
      headSha,
      lineage: {
        kind: "head-bound",
        vehicleKind: "errand",
        vehicleIdentity: identity,
        headSha,
      },
    });

    expect(owner("repair-review-state", objectId("d")))
      .toBe(owner("repair-review-state", objectId("c")));
    expect(owner("other-errand", objectId("d")))
      .not.toBe(owner("repair-review-state", objectId("c")));
  });

  it("reads an Errand predecessor owner from its corrected head", async () => {
    const store = createStore();
    const priorLineage = {
      kind: "head-bound" as const,
      vehicleKind: "errand" as const,
      vehicleIdentity: "repair-review-state",
      headSha: objectId("c"),
    };
    await recordLaneAttempt(store, {
      ...attempt,
      lineage: priorLineage,
      outcome: "clean",
      consumedPass: true,
    });

    const owner = await readLaneProgressOwner(store, {
      lane: "standard",
      repositoryId: "repo-1",
      headSha: objectId("d"),
      lineage: { ...priorLineage, headSha: objectId("d") },
    });

    expect(owner).toMatchObject({
      completedPasses: 1,
      attempts: [{ attemptId: attempt.attemptId, outcome: "clean" }],
    });
  });

  it("records corrected-head attempts under one Errand owner", async () => {
    const store = createStore();
    const priorLineage = {
      kind: "head-bound" as const,
      vehicleKind: "errand" as const,
      vehicleIdentity: "repair-review-state",
      headSha: objectId("c"),
    };
    await recordLaneAttempt(store, {
      ...attempt,
      lineage: priorLineage,
      outcome: "findings",
      consumedPass: true,
    });
    const dispositionSetId = `sha256:${"6".repeat(64)}`;
    const captured = await captureConditionalNextPassAuthorization(store, {
      lane: attempt.lane,
      repositoryId: attempt.repositoryId,
      headSha: attempt.headSha,
      lineage: priorLineage,
      producerId: attempt.attemptId,
      dispositionSetId,
      authorizedBy: "author-1",
      exhaustedPassCount: 1,
      nextPass: 2,
      now: "2026-08-15T12:01:00Z",
    });
    await settleLaneAttempt(store, {
      ...attempt,
      lineage: priorLineage,
      dispositionSetId,
      producedHeadSha: objectId("d"),
      now: "2026-08-15T12:02:00Z",
    } as Parameters<typeof settleLaneAttempt>[1] & {
      dispositionSetId: string;
      producedHeadSha: string;
    });
    await consumeConditionalNextPassAuthorization(store, {
      authorizationId: captured.authorizationId,
      repositoryId: attempt.repositoryId,
      lane: attempt.lane,
      lineage: priorLineage,
      producedHeadSha: objectId("d"),
      nextPass: 2,
      admissionId: "attempt-2",
      now: "2026-08-15T12:03:00Z",
    }, async () => true);

    const corrected = await recordLaneAttempt(store, {
      ...attempt,
      attemptId: "attempt-2",
      headSha: objectId("d"),
      lineage: { ...priorLineage, headSha: objectId("d") },
      sourceId: "delegated-agent",
      outcome: "clean",
      consumedPass: true,
      logicalPass: 2,
    });

    expect(corrected).toMatchObject({
      lineage: { ...priorLineage, headSha: objectId("d") },
      completedPasses: 2,
      attempts: [
        {
          attemptId: "attempt-1",
          headSha: objectId("c"),
          conditionalPassAuthorizations: {
            currentAuthorizationId: captured.authorizationId,
            authorizations: [{ authorizationId: captured.authorizationId, status: "consumed" }],
          },
        },
        { attemptId: "attempt-2", headSha: objectId("d") },
      ],
    });
  });

  it("retains exact target facts on attempts owned by one moving lineage", async () => {
    const store = createStore();
    const lineage = {
      kind: "candidate" as const,
      candidateId: "sha256:" + "4".repeat(64),
    };
    await recordLaneAttempt(store, {
      ...attempt,
      lineage,
      logicalPass: 1,
      retryGeneration: 0,
      outcome: "rate-limited",
      consumedPass: false,
    });
    const state = await recordLaneAttempt(store, {
      ...attempt,
      lineage,
      logicalPass: 1,
      retryGeneration: 1,
      headSha: objectId("d"),
      changeRequestId: "pull/43",
      attemptId: "attempt-2",
      sourceId: "codex-pr",
      outcome: "clean",
      consumedPass: true,
    });

    expect(state.lineage).toEqual(lineage);
    expect(state).not.toHaveProperty("headSha");
    expect(state).not.toHaveProperty("changeRequestId");
    expect(state.attempts.map(({ headSha, changeRequestId, logicalPass, retryGeneration }) => ({
      headSha,
      changeRequestId,
      logicalPass,
      retryGeneration,
    }))).toEqual([
      {
        headSha: objectId("c"),
        changeRequestId: "pull/42",
        logicalPass: 1,
        retryGeneration: 0,
      },
      {
        headSha: objectId("d"),
        changeRequestId: "pull/43",
        logicalPass: 1,
        retryGeneration: 1,
      },
    ]);
  });

  it("carries the chunk-series flag through to the record", async () => {
    const store = createStore();
    const state = await recordLaneAttempt(store, {
      ...attempt,
      outcome: "clean",
      consumedPass: true,
      chunkSeriesComplete: true,
    });
    expect(state.attempts[0]).toEqual({
      attemptId: "attempt-1",
      logicalPass: 1,
      retryGeneration: 0,
      changeRequestId: "pull/42",
      headSha: objectId("c"),
      terminalProducer: true,
      sourceId: "coderabbit-pr",
      outcome: "clean",
      chunkSeriesComplete: true,
    });
  });

  it("surfaces a concurrent write rather than silently overwriting it", async () => {
    const store = createStore();
    await recordLaneAttempt(store, { ...attempt, outcome: "clean", consumedPass: true });
    store.drift = 1;
    await expect(recordLaneAttempt(store, {
      ...attempt,
      attemptId: "attempt-2",
      outcome: "findings",
      consumedPass: true,
    }))
      .rejects.toThrow(/version-conflict/u);
  });

  it("repairs an interrupted identical owner write after a version conflict", async () => {
    const store = createStore();
    const publish = store.publishOperation;
    let interrupted = false;
    store.publishOperation = async (next, expectedVersion) => {
      if (!interrupted) {
        interrupted = true;
        store.records.set(next.operationId, { version: 1, state: next });
        throw Object.assign(new Error("version-conflict"), { code: "version-conflict" });
      }
      return publish(next, expectedVersion);
    };

    const state = await recordLaneAttempt(store, {
      ...attempt,
      logicalPass: 1,
      outcome: "clean",
      consumedPass: true,
    });

    expect(state.completedPasses).toBe(1);
    expect(state.attempts).toHaveLength(1);
    expect(state.attempts[0]?.attemptId).toBe(attempt.attemptId);
  });

  it("makes an exact terminal-attempt replay idempotent and rejects a conflicting replay", async () => {
    const store = createStore();
    const first = await recordLaneAttempt(store, { ...attempt, outcome: "findings", consumedPass: true });
    const replay = await recordLaneAttempt(store, { ...attempt, outcome: "findings", consumedPass: true });

    expect(replay).toEqual(first);
    expect(replay.completedPasses).toBe(1);
    expect(replay.attempts).toHaveLength(1);
    await expect(recordLaneAttempt(store, { ...attempt, outcome: "clean", consumedPass: true }))
      .rejects.toThrow(/conflicting lane-attempt replay/u);
  });

  it("allows only one authoritative terminal producer for a logical pass", async () => {
    const store = createStore();
    const lineage = {
      kind: "candidate" as const,
      candidateId: "sha256:" + "5".repeat(64),
    };
    await recordLaneAttempt(store, {
      ...attempt,
      lineage,
      logicalPass: 1,
      retryGeneration: 0,
      outcome: "rate-limited",
      consumedPass: false,
    });
    await recordLaneAttempt(store, {
      ...attempt,
      lineage,
      logicalPass: 1,
      retryGeneration: 0,
      attemptId: "attempt-2",
      sourceId: "codex-pr",
      outcome: "clean",
      consumedPass: true,
    });

    await expect(recordLaneAttempt(store, {
      ...attempt,
      lineage,
      logicalPass: 1,
      retryGeneration: 0,
      attemptId: "attempt-3",
      sourceId: "delegated-agent",
      outcome: "findings",
      consumedPass: true,
    })).rejects.toThrow(/terminal producer/u);
  });

  it("settles one findings attempt once and preserves its pass count on replay", async () => {
    const store = createStore();
    await recordLaneAttempt(store, { ...attempt, outcome: "findings", consumedPass: true });
    const settled = await settleLaneAttempt(store, {
      ...attempt,
      now: "2026-08-15T12:01:00Z",
    });
    const replay = await settleLaneAttempt(store, {
      ...attempt,
      now: "2026-08-15T12:02:00Z",
    });

    expect(settled.attempts[0]?.outcome).toBe("settled-findings");
    expect(settled.completedPasses).toBe(1);
    expect(replay).toEqual(settled);
  });

  it("captures one response-gated next pass beside its exact terminal producer", async () => {
    const store = createStore();
    const lineage = {
      kind: "candidate" as const,
      candidateId: `sha256:${"5".repeat(64)}`,
    };
    await recordLaneAttempt(store, {
      ...attempt,
      lineage,
      outcome: "findings",
      consumedPass: true,
    });
    const input = {
      lane: attempt.lane,
      repositoryId: attempt.repositoryId,
      headSha: attempt.headSha,
      lineage,
      producerId: attempt.attemptId,
      dispositionSetId: `sha256:${"6".repeat(64)}`,
      authorizedBy: "author-1",
      exhaustedPassCount: 1,
      nextPass: 2,
      now: "2026-08-15T12:01:00Z",
    };

    const captured = await captureConditionalNextPassAuthorization(store, input);
    expect(currentAuthorization(captured.progress.attempts[0])).toMatchObject({
      authorizationId: captured.authorizationId,
      status: "pending",
      authorizedBy: "author-1",
      producerId: attempt.attemptId,
      dispositionSetId: input.dispositionSetId,
      exhaustedPassCount: 1,
      nextPass: 2,
    });
    await expect(captureConditionalNextPassAuthorization(store, {
      ...input,
      now: "2026-08-15T12:02:00Z",
    })).resolves.toEqual(captured);
    await expect(captureConditionalNextPassAuthorization(store, {
      ...input,
      dispositionSetId: `sha256:${"7".repeat(64)}`,
    })).rejects.toThrow("replay conflicts");
  });

  it("appends successor authority after retaining predecessor invalidation", async () => {
    const store = createStore();
    const lineage = {
      kind: "candidate" as const,
      candidateId: `sha256:${"5".repeat(64)}`,
    };
    const predecessorDispositionSetId = `sha256:${"6".repeat(64)}`;
    const successorDispositionSetId = `sha256:${"7".repeat(64)}`;
    await recordLaneAttempt(store, {
      ...attempt,
      lineage,
      outcome: "findings",
      consumedPass: true,
    });
    const predecessor = await captureConditionalNextPassAuthorization(store, {
      lane: attempt.lane,
      repositoryId: attempt.repositoryId,
      headSha: attempt.headSha,
      lineage,
      producerId: attempt.attemptId,
      dispositionSetId: predecessorDispositionSetId,
      authorizedBy: "author-1",
      exhaustedPassCount: 1,
      nextPass: 2,
      now: "2026-08-15T12:01:00Z",
    });
    await invalidateConditionalNextPassAuthorization(store, {
      lane: attempt.lane,
      repositoryId: attempt.repositoryId,
      headSha: attempt.headSha,
      lineage,
      producerId: attempt.attemptId,
      dispositionSetId: predecessorDispositionSetId,
      successorDispositionSetId,
      now: "2026-08-15T12:02:00Z",
    });

    const successorInput = {
      lane: attempt.lane,
      repositoryId: attempt.repositoryId,
      headSha: attempt.headSha,
      lineage,
      producerId: attempt.attemptId,
      dispositionSetId: successorDispositionSetId,
      authorizedBy: "author-1",
      exhaustedPassCount: 1,
      nextPass: 2,
      now: "2026-08-15T12:03:00Z",
    };
    const successor = await captureConditionalNextPassAuthorization(store, successorInput);
    const replay = await captureConditionalNextPassAuthorization(store, {
      ...successorInput,
      now: "2026-08-15T12:04:00Z",
    });

    expect(replay).toEqual(successor);
    expect(successor.authorizationId).not.toBe(predecessor.authorizationId);
    expect(successor.progress.attempts[0]).toMatchObject({
      conditionalPassAuthorizations: {
        currentAuthorizationId: successor.authorizationId,
        authorizations: [
          {
            authorizationId: predecessor.authorizationId,
            status: "invalidated",
            reason: "superseded",
            successorDispositionSetId,
          },
          {
            authorizationId: successor.authorizationId,
            status: "pending",
            dispositionSetId: successorDispositionSetId,
          },
        ],
      },
    });
    await expect(captureConditionalNextPassAuthorization(store, {
      ...successorInput,
      dispositionSetId: `sha256:${"8".repeat(64)}`,
    })).rejects.toThrow("replay conflicts");
    await expect(consumeConditionalNextPassAuthorization(store, {
      authorizationId: predecessor.authorizationId,
      repositoryId: attempt.repositoryId,
      lane: attempt.lane,
      lineage,
      producedHeadSha: objectId("d"),
      nextPass: 2,
      admissionId: "attempt-2",
      now: "2026-08-15T12:05:00Z",
    }, async () => false)).rejects.toThrow("invalidated");
  });

  it("binds a pending next-pass authorization only when its approved response is settled", async () => {
    const store = createStore();
    const lineage = {
      kind: "candidate" as const,
      candidateId: `sha256:${"5".repeat(64)}`,
    };
    const dispositionSetId = `sha256:${"6".repeat(64)}`;
    await recordLaneAttempt(store, {
      ...attempt,
      lineage,
      outcome: "findings",
      consumedPass: true,
    });
    await captureConditionalNextPassAuthorization(store, {
      lane: attempt.lane,
      repositoryId: attempt.repositoryId,
      headSha: attempt.headSha,
      lineage,
      producerId: attempt.attemptId,
      dispositionSetId,
      authorizedBy: "author-1",
      exhaustedPassCount: 1,
      nextPass: 2,
      now: "2026-08-15T12:01:00Z",
    });

    const settled = await settleLaneAttempt(store, {
      ...attempt,
      lineage,
      dispositionSetId,
      producedHeadSha: objectId("d"),
      now: "2026-08-15T12:02:00Z",
    } as Parameters<typeof settleLaneAttempt>[1] & {
      dispositionSetId: string;
      producedHeadSha: string;
    });

    expect(currentAuthorization(settled.attempts[0])).toMatchObject({
      status: "bound",
      producedHeadSha: objectId("d"),
      boundAt: "2026-08-15T12:02:00Z",
    });

    const consumed = await consumeConditionalNextPassAuthorization(store, {
      authorizationId: currentAuthorization(settled.attempts[0])?.authorizationId ?? "missing",
      repositoryId: attempt.repositoryId,
      lane: attempt.lane,
      lineage,
      producedHeadSha: objectId("d"),
      nextPass: 2,
      admissionId: "attempt-2",
      now: "2026-08-15T12:03:00Z",
    }, async () => true);
    expect(currentAuthorization(consumed.attempts[0])).toMatchObject({
      status: "consumed",
      producedHeadSha: objectId("d"),
      admissionId: "attempt-2",
      consumedAt: "2026-08-15T12:03:00Z",
    });
    await expect(consumeConditionalNextPassAuthorization(store, {
      authorizationId: currentAuthorization(settled.attempts[0])?.authorizationId ?? "missing",
      repositoryId: attempt.repositoryId,
      lane: attempt.lane,
      lineage,
      producedHeadSha: objectId("d"),
      nextPass: 2,
      admissionId: "attempt-2",
      now: "2026-08-15T12:04:00Z",
    }, async () => true)).resolves.toEqual(consumed);
    await expect(consumeConditionalNextPassAuthorization(store, {
      authorizationId: currentAuthorization(settled.attempts[0])?.authorizationId ?? "missing",
      repositoryId: attempt.repositoryId,
      lane: attempt.lane,
      lineage,
      producedHeadSha: objectId("d"),
      nextPass: 2,
      admissionId: "competing-attempt-2",
      now: "2026-08-15T12:04:00Z",
    }, async () => true)).rejects.toThrow("already consumed by another admission");
    await expect(inspectConditionalNextPassInvalidation(store, {
      lane: attempt.lane,
      repositoryId: attempt.repositoryId,
      headSha: attempt.headSha,
      lineage,
      producerId: attempt.attemptId,
      dispositionSetId,
      successorDispositionSetId: `sha256:${"7".repeat(64)}`,
    })).resolves.toMatchObject({
      state: "refused",
      reason: "fix-consumed",
    });
    await recordLaneAttempt(store, {
      ...attempt,
      lineage,
      headSha: objectId("d"),
      attemptId: "attempt-2",
      logicalPass: 2,
      outcome: "clean",
      consumedPass: true,
    });
    await expect(consumeConditionalNextPassAuthorization(store, {
      authorizationId: currentAuthorization(settled.attempts[0])?.authorizationId ?? "missing",
      repositoryId: attempt.repositoryId,
      lane: attempt.lane,
      lineage,
      producedHeadSha: objectId("d"),
      nextPass: 2,
      admissionId: "attempt-2",
      now: "2026-08-15T12:05:00Z",
    }, async () => true)).rejects.toThrow("named pass is already complete");
  });

  it("withdraws exact pending or bound next-pass authority and replays without mutation", async () => {
    for (const bind of [false, true]) {
      const store = createStore();
      const seeded = await seedConditionalAuthorization(store, { bind });
      const input = {
        authorizationId: seeded.captured.authorizationId,
        lane: attempt.lane,
        repositoryId: attempt.repositoryId,
        headSha: attempt.headSha,
        lineage: seeded.lineage,
        producerId: attempt.attemptId,
        dispositionSetId: seeded.dispositionSetId,
        withdrawnBy: "author-1",
        now: "2026-08-15T12:03:00Z",
      };

      const withdrawn = await withdrawConditionalNextPassAuthorization(
        store,
        input,
        async () => true,
      );
      expect(withdrawn).toMatchObject({
        state: "withdrawn",
        authorizationId: seeded.captured.authorizationId,
        dispositionSetId: seeded.dispositionSetId,
        progress: {
          attempts: [expect.objectContaining({
            conditionalPassAuthorizations: expect.objectContaining({
              authorizations: [expect.objectContaining({
                status: "invalidated",
                reason: "withdrawn",
                withdrawnBy: "author-1",
              })],
            }),
          })],
        },
      });
      if (withdrawn.state === "refused") throw new Error("expected conditional authority withdrawal");
      await expect(withdrawConditionalNextPassAuthorization(
        store,
        { ...input, now: "2026-08-15T12:04:00Z" },
        async () => true,
      )).resolves.toMatchObject({ state: "already-withdrawn", progress: withdrawn.progress });
      const supersession = {
        lane: attempt.lane,
        repositoryId: attempt.repositoryId,
        headSha: attempt.headSha,
        lineage: seeded.lineage,
        producerId: attempt.attemptId,
        dispositionSetId: seeded.dispositionSetId,
        successorDispositionSetId: `sha256:${"7".repeat(64)}`,
      };
      await expect(inspectConditionalNextPassInvalidation(store, supersession))
        .resolves.toEqual({ state: "ready" });
      await expect(invalidateConditionalNextPassAuthorization(store, {
        ...supersession,
        now: "2026-08-15T12:05:00Z",
      })).resolves.toEqual(withdrawn.progress);
    }
  });

  it("refuses consumed, superseded, stale, and foreign withdrawal without rewriting authority", async () => {
    const consumedStore = createStore();
    const consumed = await seedConditionalAuthorization(consumedStore, { bind: true });
    await consumeConditionalNextPassAuthorization(consumedStore, {
      authorizationId: consumed.captured.authorizationId,
      repositoryId: attempt.repositoryId,
      lane: attempt.lane,
      lineage: consumed.lineage,
      producedHeadSha: attempt.headSha,
      nextPass: 2,
      admissionId: "attempt-2",
      now: "2026-08-15T12:03:00Z",
    }, async () => true);
    const withdrawal = {
      authorizationId: consumed.captured.authorizationId,
      lane: attempt.lane,
      repositoryId: attempt.repositoryId,
      headSha: attempt.headSha,
      lineage: consumed.lineage,
      producerId: attempt.attemptId,
      dispositionSetId: consumed.dispositionSetId,
      withdrawnBy: "author-1",
      now: "2026-08-15T12:04:00Z",
    };
    await expect(withdrawConditionalNextPassAuthorization(
      consumedStore,
      withdrawal,
      async () => true,
    )).resolves.toMatchObject({ state: "refused", reason: "consumed" });

    const supersededStore = createStore();
    const superseded = await seedConditionalAuthorization(supersededStore);
    await invalidateConditionalNextPassAuthorization(supersededStore, {
      lane: attempt.lane,
      repositoryId: attempt.repositoryId,
      headSha: attempt.headSha,
      lineage: superseded.lineage,
      producerId: attempt.attemptId,
      dispositionSetId: superseded.dispositionSetId,
      successorDispositionSetId: `sha256:${"7".repeat(64)}`,
      now: "2026-08-15T12:03:00Z",
    });
    await expect(withdrawConditionalNextPassAuthorization(supersededStore, {
      ...withdrawal,
      authorizationId: superseded.captured.authorizationId,
      lineage: superseded.lineage,
      dispositionSetId: superseded.dispositionSetId,
    }, async () => true)).resolves.toMatchObject({ state: "refused", reason: "superseded" });

    const pendingStore = createStore();
    const pending = await seedConditionalAuthorization(pendingStore);
    const pendingInput = {
      ...withdrawal,
      authorizationId: pending.captured.authorizationId,
      lineage: pending.lineage,
      dispositionSetId: pending.dispositionSetId,
    };
    await expect(withdrawConditionalNextPassAuthorization(
      pendingStore,
      pendingInput,
      async () => false,
    )).resolves.toMatchObject({ state: "refused", reason: "stale-current-set" });
    await expect(withdrawConditionalNextPassAuthorization(pendingStore, {
      ...pendingInput,
      authorizationId: `sha256:${"9".repeat(64)}`,
    }, async () => true)).resolves.toMatchObject({ state: "refused", reason: "foreign-authority" });
    expect((pendingStore.state?.kind === "lane-progress"
      ? currentAuthorization(pendingStore.state.attempts[0])
      : null)).toMatchObject({ status: "pending" });
  });

  it("does not confuse another lineage's terminal pass with the authorized admission", async () => {
    const store = createStore();
    const lineage = {
      kind: "candidate" as const,
      candidateId: `sha256:${"5".repeat(64)}`,
    };
    const dispositionSetId = `sha256:${"6".repeat(64)}`;
    await recordLaneAttempt(store, {
      ...attempt,
      lineage,
      outcome: "findings",
      consumedPass: true,
    });
    const captured = await captureConditionalNextPassAuthorization(store, {
      lane: attempt.lane,
      repositoryId: attempt.repositoryId,
      headSha: attempt.headSha,
      lineage,
      producerId: attempt.attemptId,
      dispositionSetId,
      authorizedBy: "author-1",
      exhaustedPassCount: 1,
      nextPass: 2,
      now: "2026-08-15T12:01:00Z",
    });
    await settleLaneAttempt(store, {
      ...attempt,
      lineage,
      dispositionSetId,
      producedHeadSha: attempt.headSha,
      now: "2026-08-15T12:02:00Z",
    });
    await recordLaneAttempt(store, {
      ...attempt,
      lineage: {
        kind: "candidate" as const,
        candidateId: `sha256:${"8".repeat(64)}`,
      },
      attemptId: "other-lineage-pass-2",
      outcome: "clean",
      consumedPass: true,
      logicalPass: 2,
    });

    await expect(consumeConditionalNextPassAuthorization(store, {
      authorizationId: captured.authorizationId,
      repositoryId: attempt.repositoryId,
      lane: attempt.lane,
      lineage,
      producedHeadSha: attempt.headSha,
      nextPass: 2,
      admissionId: "authorized-pass-2",
      now: "2026-08-15T12:03:00Z",
    }, async () => true)).resolves.toMatchObject({
      attempts: [expect.objectContaining({
        conditionalPassAuthorizations: expect.objectContaining({
          authorizations: [expect.objectContaining({ status: "consumed" })],
        }),
      })],
    });
  });

  it("refuses a bound pass authorization after its disposition set stops being current", async () => {
    const store = createStore();
    const lineage = {
      kind: "candidate" as const,
      candidateId: `sha256:${"5".repeat(64)}`,
    };
    const dispositionSetId = `sha256:${"6".repeat(64)}`;
    await recordLaneAttempt(store, {
      ...attempt,
      lineage,
      outcome: "findings",
      consumedPass: true,
    });
    const captured = await captureConditionalNextPassAuthorization(store, {
      lane: attempt.lane,
      repositoryId: attempt.repositoryId,
      headSha: attempt.headSha,
      lineage,
      producerId: attempt.attemptId,
      dispositionSetId,
      authorizedBy: "author-1",
      exhaustedPassCount: 1,
      nextPass: 2,
      now: "2026-08-15T12:01:00Z",
    });
    await settleLaneAttempt(store, {
      ...attempt,
      lineage,
      dispositionSetId,
      producedHeadSha: attempt.headSha,
      now: "2026-08-15T12:02:00Z",
    });

    await expect(consumeConditionalNextPassAuthorization(store, {
      authorizationId: captured.authorizationId,
      repositoryId: attempt.repositoryId,
      lane: attempt.lane,
      lineage,
      producedHeadSha: attempt.headSha,
      nextPass: 2,
      admissionId: "attempt-2",
      now: "2026-08-15T12:03:00Z",
    }, async () => false)).rejects.toThrow("disposition set is not current");
  });

  it("invalidates a predecessor's pending pass authorization on disposition supersession", async () => {
    const store = createStore();
    const lineage = {
      kind: "candidate" as const,
      candidateId: `sha256:${"5".repeat(64)}`,
    };
    await recordLaneAttempt(store, {
      ...attempt,
      lineage,
      outcome: "findings",
      consumedPass: true,
    });
    const dispositionSetId = `sha256:${"6".repeat(64)}`;
    await captureConditionalNextPassAuthorization(store, {
      lane: attempt.lane,
      repositoryId: attempt.repositoryId,
      headSha: attempt.headSha,
      lineage,
      producerId: attempt.attemptId,
      dispositionSetId,
      authorizedBy: "author-1",
      exhaustedPassCount: 1,
      nextPass: 2,
      now: "2026-08-15T12:01:00Z",
    });
    const successorDispositionSetId = `sha256:${"7".repeat(64)}`;

    const invalidated = await invalidateConditionalNextPassAuthorization(store, {
      lane: attempt.lane,
      repositoryId: attempt.repositoryId,
      headSha: attempt.headSha,
      lineage,
      producerId: attempt.attemptId,
      dispositionSetId,
      successorDispositionSetId,
      now: "2026-08-15T12:02:00Z",
    });
    expect(currentAuthorization(invalidated?.attempts[0])).toMatchObject({
      status: "invalidated",
      reason: "superseded",
      successorDispositionSetId,
    });
  });

  it("maps every concluded hosted await state onto the driver's vocabulary", () => {
    expect(hostedAwaitLaneOutcome("clean")).toBe("clean");
    expect(hostedAwaitLaneOutcome("findings")).toBe("findings");
    expect(hostedAwaitLaneOutcome("rate-limited")).toBe("rate-limited");
    expect(hostedAwaitLaneOutcome("transient-unavailable")).toBe("transient-unavailable");
    expect(hostedAwaitLaneOutcome("stale-target")).toBe("stale-target");
    expect(hostedAwaitLaneOutcome("source-unavailable")).toBe("source-unbound");
    expect(hostedAwaitLaneOutcome("malformed-output")).toBe("malformed");
    expect(hostedAwaitLaneOutcome("terminal-failure")).toBe("terminal-failure");
  });

  it("treats ordinary and attention-bound pending results as no concluded attempt", () => {
    expect(hostedAwaitLaneOutcome("pending")).toBeNull();
  });
});
