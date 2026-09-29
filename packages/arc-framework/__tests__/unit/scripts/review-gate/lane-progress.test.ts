import { describe, expect, it } from "vitest";

import { CanonicalDigestSchema } from "../../../../src/lib/kernel/index.js";


import { DeliveryReviewMemberVehicleSchema } from "../../../../src/lib/delivery/review-vehicle.js";
import { LaneProgressStateSchema, type LaneProgressState, type ReviewOperationState } from "../../../../src/scripts/review-gate/core/operation-state-schema.js";


import { captureConditionalNextPassAuthorization, hostedAwaitLaneOutcome, invalidateConditionalNextPassAuthorization, inspectConditionalNextPassInvalidation, laneContinuationOperationId, laneProgressOperationId, readCandidateInheritedLaneProgress, readLaneProgress, readLaneProgressAcrossLineage, readLaneProgressOwner, recordLaneAttempt, settleLaneAttempt, withdrawConditionalNextPassAuthorization } from "../../../../src/scripts/review-gate/lane-progress.js";



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
    candidateId: digest(`sha256:${"5".repeat(64)}`),
  };
  const dispositionSetId = digest(`sha256:${"6".repeat(64)}`);
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

async function admitConditionalPending(
  store: ReturnType<typeof createStore>,
  input: {
    authorizationId: string;
    repositoryId: string;
    lane: "standard" | "frontline";
    lineage: NonNullable<Parameters<typeof recordLaneAttempt>[1]["lineage"]>;
    producedHeadSha: string;
    nextPass: number;
    admissionId: string;
    now: string;
    sourceId?: string;
  },
  confirmDispositionSetCurrent: (producerId: string, dispositionSetId: string) => Promise<boolean>,
) {
  if (input.lineage === undefined) throw new Error("conditional admission lineage is unavailable");
  return recordLaneAttempt(store, {
    lane: input.lane,
    repositoryId: input.repositoryId,
    changeRequestId: attempt.changeRequestId,
    headSha: input.producedHeadSha,
    lineage: input.lineage,
    logicalPass: input.nextPass,
    attemptId: input.admissionId,
    sourceId: input.sourceId ?? attempt.sourceId,
    outcome: "pending",
    consumedPass: false,
    now: input.now,
    conditionalPendingAdmission: {
      ...input,
      authorizationId: digest(input.authorizationId),
      lineage: input.lineage,
      confirmDispositionSetCurrent,
    },
  });
}

describe("lane progress", () => {
  it("publishes conditional consumption and its pending attempt in one owner write", async () => {
    const store = createStore();
    const { captured, lineage } = await seedConditionalAuthorization(store, { bind: true });
    const originalPublish = store.publishOperation;
    const pending = (attemptId: string, sourceId: string) => recordLaneAttempt(store, {
      ...attempt,
      lineage,
      attemptId,
      sourceId,
      logicalPass: 2,
      headSha: attempt.headSha,
      outcome: "pending",
      consumedPass: false,
      conditionalPendingAdmission: {
        authorizationId: captured.authorizationId,
        repositoryId: attempt.repositoryId,
        lane: "standard" as const,
        lineage,
        producedHeadSha: attempt.headSha,
        nextPass: 2,
        admissionId: attemptId,
        now: "2026-08-15T12:03:00Z",
        confirmDispositionSetCurrent: async () => true,
      },
    });
    store.publishOperation = async () => { throw new Error("interrupted before owner publication"); };
    await expect(pending("interrupted", "old-source")).rejects.toThrow("interrupted");
    const before = await readLaneProgressOwner(store, {
      lane: "standard", repositoryId: attempt.repositoryId, headSha: attempt.headSha, lineage,
    });
    expect(currentAuthorization(before?.attempts[0])).toMatchObject({ status: "bound" });
    expect(before?.attempts).toHaveLength(1);

    store.publishOperation = originalPublish;
    const admitted = await pending("resumed", "new-source");
    expect(currentAuthorization(admitted.attempts[0])).toMatchObject({
      status: "consumed", admissionId: "resumed",
    });
    expect(admitted.attempts[1]).toMatchObject({
      attemptId: "resumed", sourceId: "new-source", outcome: "pending",
    });
    await expect(pending("competing", "other-source")).rejects.toThrow("one pending source attempt");
  });

  it("rechecks conditional authority after a concurrent owner update", async () => {
    const store = createStore();
    const { captured, lineage } = await seedConditionalAuthorization(store, { bind: true });
    const originalPublish = store.publishOperation;
    let raced = false;
    let dispositionChecks = 0;
    store.publishOperation = async (next, expectedVersion) => {
      if (!raced && next.kind === "lane-progress"
        && next.attempts.some(({ attemptId }) => attemptId === "raced-admission")) {
        raced = true;
        const current = await store.readOperation(next.operationId);
        if (current.state === null) throw new Error("missing lane owner");
        await originalPublish({ ...current.state, updatedAt: "2026-08-15T12:03:01Z" }, current.version);
        throw new Error("version-conflict");
      }
      return originalPublish(next, expectedVersion);
    };
    const result = await recordLaneAttempt(store, {
      ...attempt,
      lineage,
      attemptId: "raced-admission",
      logicalPass: 2,
      outcome: "pending",
      consumedPass: false,
      conditionalPendingAdmission: {
        authorizationId: captured.authorizationId,
        repositoryId: attempt.repositoryId,
        lane: "standard",
        lineage,
        producedHeadSha: attempt.headSha,
        nextPass: 2,
        admissionId: "raced-admission",
        now: "2026-08-15T12:03:00Z",
        confirmDispositionSetCurrent: async () => { dispositionChecks += 1; return true; },
      },
    });
    expect(dispositionChecks).toBe(2);
    expect(result.attempts).toHaveLength(2);
    expect(currentAuthorization(result.attempts[0])).toMatchObject({
      status: "consumed", admissionId: "raced-admission",
    });
  });

  it("sums nested Candidate ancestor pass budgets without importing old attempts", async () => {
    const store = createStore();
    const oldest = digest(`sha256:${"1".repeat(64)}`);
    const middle = digest(`sha256:${"2".repeat(64)}`);
    for (const [index, candidateId] of [oldest, middle].entries()) {
      const lineage = { kind: "candidate" as const, candidateId };
      await recordLaneAttempt(store, {
        ...attempt,
        attemptId: `ancestor-${index}`,
        lineage,
        outcome: "findings",
        consumedPass: true,
      });
      await settleLaneAttempt(store, {
        lane: "standard", repositoryId: attempt.repositoryId,
        headSha: attempt.headSha, lineage,
        attemptId: `ancestor-${index}`, now: attempt.now,
      });
    }
    const result = await readCandidateInheritedLaneProgress(store, {
      lane: "standard", repositoryId: attempt.repositoryId, headSha: objectId("d"),
      ancestors: [middle, oldest].map((candidateId) => ({
        candidateId, baseRevision: objectId("a"), reviewResponseCount: 1,
      })),
    });
    expect(result.inheritedCompletedPasses).toBe(2);
    expect(result.inheritedCompletePasses).toBe(0);
    expect(result.ancestorOwners.map(({ owner }) => owner?.attempts[0]?.attemptId))
      .toEqual(["ancestor-1", "ancestor-0"]);
  });

  it("distinguishes a zero-attempt ancestor from a missing owner with a recorded response", async () => {
    const store = createStore();
    const ancestor = {
      candidateId: digest(`sha256:${"3".repeat(64)}`), baseRevision: objectId("a"), reviewResponseCount: 0,
    };
    expect((await readCandidateInheritedLaneProgress(store, {
      lane: "standard", repositoryId: attempt.repositoryId,
      headSha: objectId("d"), ancestors: [ancestor],
    })).inheritedCompletedPasses).toBe(0);
    await expect(readCandidateInheritedLaneProgress(store, {
      lane: "standard", repositoryId: attempt.repositoryId,
      headSha: objectId("d"), ancestors: [{ ...ancestor, reviewResponseCount: 1 }],
    })).rejects.toThrow(/Restore the shared review operation/u);
  });
  it("refuses a predecessor pending pass or unsettled findings until they are resolved", async () => {
    const pendingStore = createStore();
    const candidateId = digest(`sha256:${"4".repeat(64)}`);
    const lineage = { kind: "candidate" as const, candidateId };
    const input = {
      lane: "standard" as const, repositoryId: attempt.repositoryId,
      headSha: objectId("d"),
      ancestors: [{ candidateId, baseRevision: objectId("a"), reviewResponseCount: 0 }],
    };
    await recordLaneAttempt(pendingStore, {
      ...attempt, lineage, outcome: "pending", consumedPass: false,
    });
    await expect(readCandidateInheritedLaneProgress(pendingStore, input)).rejects
      .toThrow(/restore a branch worktree at the predecessor Candidate record/u);
    const store = createStore();
    await recordLaneAttempt(store, {
      ...attempt, lineage, outcome: "findings", consumedPass: true,
    });
    await expect(readCandidateInheritedLaneProgress(store, input)).rejects
      .toThrow(/restore a branch worktree at the predecessor Candidate record/u);
    await settleLaneAttempt(store, {
      lane: "standard", repositoryId: attempt.repositoryId,
      headSha: attempt.headSha, lineage, attemptId: attempt.attemptId,
      now: attempt.now,
    });
    expect((await readCandidateInheritedLaneProgress(store, input)).inheritedCompletedPasses).toBe(1);
  });
  it("lets a superseding root continue after old failed or unavailable zero-pass outcomes", async () => {
    const outcomes = ["rate-limited", "transient-unavailable", "timed-out", "terminal-failure"] as const;
    for (const [index, outcome] of outcomes.entries()) {
      const store = createStore();
      const candidateId = digest(`sha256:${String(index + 5).repeat(64)}`);
      await recordLaneAttempt(store, {
        ...attempt, lineage: { kind: "candidate", candidateId },
        outcome, consumedPass: false,
      });
      const inherited = await readCandidateInheritedLaneProgress(store, {
        lane: "standard", repositoryId: attempt.repositoryId, headSha: objectId("d"),
        ancestors: [{ candidateId, baseRevision: objectId("a"), reviewResponseCount: 0 }],
      });
      expect(inherited.inheritedCompletedPasses).toBe(0);
    }
  });
  it("retains the latest original-head producer for Candidate applicability", async () => {
    const store = createStore();
    const lineage = { kind: "candidate" as const, candidateId: digest(`sha256:${"5".repeat(64)}`) };
    await recordLaneAttempt(store, {
      ...attempt,
      lineage,
      outcome: "clean",
      consumedPass: true,
    });
    const currentHead = objectId("d");
    const progress = await readLaneProgressAcrossLineage(store, {
      lane: "standard",
      repositoryId: attempt.repositoryId,
      headSha: currentHead,
      lineageHeadShas: [attempt.headSha, currentHead],
      lineage,
    });
    expect(progress).toMatchObject({
      status: "recorded",
      completedPasses: 1,
      attempts: [],
      historicalAttempt: {
        attemptId: attempt.attemptId,
        logicalPass: 1,
        headSha: attempt.headSha,
        outcome: "clean",
      },
    });
  });

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
      deliverableId: digest("sha256:" + "2".repeat(64)),
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
      lineage: { ...member, deliverableId: digest("sha256:" + "3".repeat(64)) },
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

  it("counts completed passes across Errand heads once and isolates a replacement claim", async () => {
    const store = createStore();
    const lineage = (claimId: string, headSha: string) => ({
      kind: "head-bound" as const, vehicleKind: "errand" as const,
      vehicleIdentity: claimId, headSha,
    });
    const first = {
      ...attempt, lineage: lineage("claim-one", attempt.headSha),
      outcome: "findings" as const, consumedPass: true,
    };
    await recordLaneAttempt(store, first);
    await recordLaneAttempt(store, first);
    const secondHead = objectId("d");
    await recordLaneAttempt(store, {
      ...first, headSha: secondHead, lineage: lineage("claim-one", secondHead),
      attemptId: "attempt-2", outcome: "clean", logicalPass: 2,
    });

    const nextHead = objectId("e");
    await expect(readLaneProgress(store, {
      lane: "standard", repositoryId: attempt.repositoryId, headSha: nextHead,
      lineage: lineage("claim-one", nextHead),
    })).resolves.toMatchObject({ status: "recorded", completedPasses: 2, attempts: [] });
    await expect(readLaneProgress(store, {
      lane: "standard", repositoryId: attempt.repositoryId, headSha: nextHead,
      lineage: lineage("claim-two", nextHead),
    })).resolves.toEqual({ status: "unrecorded" });
  });

  it("records a conditionally admitted corrected-head attempt under one Errand owner", async () => {
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
    const dispositionSetId = digest(`sha256:${"6".repeat(64)}`);
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
    await admitConditionalPending(store, {
      authorizationId: captured.authorizationId,
      repositoryId: attempt.repositoryId,
      lane: attempt.lane,
      lineage: priorLineage,
      producedHeadSha: objectId("d"),
      nextPass: 2,
      admissionId: "attempt-2",
      now: "2026-08-15T12:03:00Z",
      sourceId: "delegated-agent",
    }, async () => true);

    const corrected = await readLaneProgressOwner(store, {
      lane: "standard", repositoryId: attempt.repositoryId,
      headSha: objectId("d"), lineage: { ...priorLineage, headSha: objectId("d") },
    });

    expect(corrected).toMatchObject({
      lineage: priorLineage,
      completedPasses: 1,
      attempts: [
        {
          attemptId: "attempt-1",
          headSha: objectId("c"),
          conditionalPassAuthorizations: {
            currentAuthorizationId: captured.authorizationId,
            authorizations: [{ authorizationId: captured.authorizationId, status: "consumed" }],
          },
        },
        { attemptId: "attempt-2", headSha: objectId("d"), outcome: "pending" },
      ],
    });
  });

  it("retains exact target facts on attempts owned by one moving lineage", async () => {
    const store = createStore();
    const lineage = {
      kind: "candidate" as const,
      candidateId: digest("sha256:" + "4".repeat(64)),
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
      candidateId: digest("sha256:" + "5".repeat(64)),
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
      candidateId: digest(`sha256:${"5".repeat(64)}`),
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
      dispositionSetId: digest(`sha256:${"6".repeat(64)}`),
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
      dispositionSetId: digest(`sha256:${"7".repeat(64)}`),
    })).rejects.toThrow("replay conflicts");
  });

  it("appends successor authority after retaining predecessor invalidation", async () => {
    const store = createStore();
    const lineage = {
      kind: "candidate" as const,
      candidateId: digest(`sha256:${"5".repeat(64)}`),
    };
    const predecessorDispositionSetId = digest(`sha256:${"6".repeat(64)}`);
    const successorDispositionSetId = digest(`sha256:${"7".repeat(64)}`);
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
      dispositionSetId: digest(`sha256:${"8".repeat(64)}`),
    })).rejects.toThrow("replay conflicts");
    await expect(admitConditionalPending(store, {
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
      candidateId: digest(`sha256:${"5".repeat(64)}`),
    };
    const dispositionSetId = digest(`sha256:${"6".repeat(64)}`);
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
    expect(settled.attempts[0]?.responsePerformance).toMatchObject({
      producerId: attempt.attemptId,
      dispositionSetId,
      originatingHeadSha: attempt.headSha,
      producedHeadSha: objectId("d"),
    });
    await expect(settleLaneAttempt(store, {
      ...attempt, lineage, dispositionSetId,
      producedHeadSha: objectId("d"), now: "2026-08-15T12:04:00Z",
    })).resolves.toEqual(settled);
    await expect(settleLaneAttempt(store, {
      ...attempt, lineage, dispositionSetId,
      producedHeadSha: objectId("e"), now: "2026-08-15T12:04:00Z",
    })).rejects.toThrow(/replay conflicts/u);

    const consumed = await admitConditionalPending(store, {
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
    await expect(admitConditionalPending(store, {
      authorizationId: currentAuthorization(settled.attempts[0])?.authorizationId ?? "missing",
      repositoryId: attempt.repositoryId,
      lane: attempt.lane,
      lineage,
      producedHeadSha: objectId("d"),
      nextPass: 2,
      admissionId: "attempt-2",
      now: "2026-08-15T12:04:00Z",
    }, async () => true)).resolves.toEqual(consumed);
    await expect(admitConditionalPending(store, {
      authorizationId: currentAuthorization(settled.attempts[0])?.authorizationId ?? "missing",
      repositoryId: attempt.repositoryId,
      lane: attempt.lane,
      lineage,
      producedHeadSha: objectId("d"),
      nextPass: 2,
      admissionId: "competing-attempt-2",
      now: "2026-08-15T12:04:00Z",
    }, async () => true)).rejects.toThrow("one pending source attempt");
    await expect(inspectConditionalNextPassInvalidation(store, {
      lane: attempt.lane,
      repositoryId: attempt.repositoryId,
      headSha: attempt.headSha,
      lineage,
      producerId: attempt.attemptId,
      dispositionSetId,
      successorDispositionSetId: digest(`sha256:${"7".repeat(64)}`),
    })).resolves.toMatchObject({
      state: "refused",
      reason: "fix-consumed",
    });
    expect(consumed.attempts[1]).toMatchObject({
      attemptId: "attempt-2", logicalPass: 2, outcome: "pending",
    });
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
        successorDispositionSetId: digest(`sha256:${"7".repeat(64)}`),
      };
      await expect(inspectConditionalNextPassInvalidation(store, supersession))
        .resolves.toEqual({ state: "ready" });
      await expect(invalidateConditionalNextPassAuthorization(store, {
        ...supersession,
        now: "2026-08-15T12:05:00Z",
      })).resolves.toEqual(withdrawn.progress);
    }
  });

  it("settles the approved response after its same-set pass authority is withdrawn", async () => {
    const store = createStore();
    const seeded = await seedConditionalAuthorization(store);
    const withdrawal = {
      authorizationId: seeded.captured.authorizationId,
      lane: attempt.lane,
      repositoryId: attempt.repositoryId,
      headSha: attempt.headSha,
      lineage: seeded.lineage,
      producerId: attempt.attemptId,
      dispositionSetId: seeded.dispositionSetId,
      withdrawnBy: "author-1",
      now: "2026-08-15T12:02:00Z",
    };
    await expect(withdrawConditionalNextPassAuthorization(store, withdrawal, async () => true))
      .resolves.toMatchObject({ state: "withdrawn" });

    const settled = await settleLaneAttempt(store, {
      ...attempt,
      lineage: seeded.lineage,
      dispositionSetId: seeded.dispositionSetId,
      producedHeadSha: objectId("d"),
      now: "2026-08-15T12:03:00Z",
    });
    expect(settled.attempts[0]).toMatchObject({
      outcome: "settled-findings",
      responsePerformance: {
        dispositionSetId: seeded.dispositionSetId,
        producedHeadSha: objectId("d"),
      },
      conditionalPassAuthorizations: {
        authorizations: [expect.objectContaining({ status: "invalidated", reason: "withdrawn" })],
      },
    });
    await expect(settleLaneAttempt(store, {
      ...attempt,
      lineage: seeded.lineage,
      dispositionSetId: digest(`sha256:${"7".repeat(64)}`),
      producedHeadSha: objectId("d"),
      now: "2026-08-15T12:04:00Z",
    })).rejects.toThrow(/response performance replay conflicts/u);
    await expect(admitConditionalPending(store, {
      authorizationId: seeded.captured.authorizationId,
      repositoryId: attempt.repositoryId,
      lane: attempt.lane,
      lineage: seeded.lineage,
      producedHeadSha: objectId("d"),
      nextPass: 2,
      admissionId: "attempt-2",
      now: "2026-08-15T12:05:00Z",
    }, async () => true)).rejects.toThrow(/invalidated/u);
    await expect(withdrawConditionalNextPassAuthorization(store, {
      ...withdrawal,
      now: "2026-08-15T12:06:00Z",
    }, async () => true)).resolves.toMatchObject({ state: "already-withdrawn", progress: settled });
  });

  it("refuses consumed, superseded, stale, and foreign withdrawal without rewriting authority", async () => {
    const consumedStore = createStore();
    const consumed = await seedConditionalAuthorization(consumedStore, { bind: true });
    await admitConditionalPending(consumedStore, {
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
      successorDispositionSetId: digest(`sha256:${"7".repeat(64)}`),
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
      authorizationId: digest(`sha256:${"9".repeat(64)}`),
    }, async () => true)).resolves.toMatchObject({ state: "refused", reason: "foreign-authority" });
    expect((pendingStore.state?.kind === "lane-progress"
      ? currentAuthorization(pendingStore.state.attempts[0])
      : null)).toMatchObject({ status: "pending" });
  });

  it("does not confuse another lineage's terminal pass with the authorized admission", async () => {
    const store = createStore();
    const lineage = {
      kind: "candidate" as const,
      candidateId: digest(`sha256:${"5".repeat(64)}`),
    };
    const dispositionSetId = digest(`sha256:${"6".repeat(64)}`);
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
        candidateId: digest(`sha256:${"8".repeat(64)}`),
      },
      attemptId: "other-lineage-pass-2",
      outcome: "clean",
      consumedPass: true,
      logicalPass: 2,
    });

    await expect(admitConditionalPending(store, {
      authorizationId: captured.authorizationId,
      repositoryId: attempt.repositoryId,
      lane: attempt.lane,
      lineage,
      producedHeadSha: attempt.headSha,
      nextPass: 2,
      admissionId: "authorized-pass-2",
      now: "2026-08-15T12:03:00Z",
    }, async () => true)).resolves.toMatchObject({
      attempts: expect.arrayContaining([expect.objectContaining({
        conditionalPassAuthorizations: expect.objectContaining({
          authorizations: [expect.objectContaining({ status: "consumed" })],
        }),
      })]),
    });
  });

  it("replays the exact pending admission without another authorization write", async () => {
    const store = createStore();
    const { captured, lineage } = await seedConditionalAuthorization(store, { bind: true });
    const input = {
      authorizationId: captured.authorizationId,
      repositoryId: attempt.repositoryId,
      lane: attempt.lane,
      lineage,
      producedHeadSha: attempt.headSha,
      nextPass: 2,
      admissionId: "authorized-pass-2",
      now: "2026-08-15T12:03:00Z",
    };
    const admitted = await admitConditionalPending(store, input, async () => true);
    await expect(admitConditionalPending(store, input, async () => true))
      .resolves.toEqual(admitted);
    await expect(admitConditionalPending(store, {
      ...input,
      admissionId: "another-admission",
    }, async () => true)).rejects.toThrow("one pending source attempt");
  });

  it("refuses a bound pass authorization after its disposition set stops being current", async () => {
    const store = createStore();
    const lineage = {
      kind: "candidate" as const,
      candidateId: digest(`sha256:${"5".repeat(64)}`),
    };
    const dispositionSetId = digest(`sha256:${"6".repeat(64)}`);
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

    await expect(admitConditionalPending(store, {
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
      candidateId: digest(`sha256:${"5".repeat(64)}`),
    };
    await recordLaneAttempt(store, {
      ...attempt,
      lineage,
      outcome: "findings",
      consumedPass: true,
    });
    const dispositionSetId = digest(`sha256:${"6".repeat(64)}`);
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
    const successorDispositionSetId = digest(`sha256:${"7".repeat(64)}`);

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
