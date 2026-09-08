import { describe, expect, it } from "vitest";

import { DeliveryReviewMemberVehicleSchema } from
  "../../../../src/lib/delivery/review-vehicle.js";
import {
  LaneProgressStateSchema,
  type ReviewOperationState,
} from "../../../../src/scripts/review-gate/core/operation-state-schema.js";
import {
  createReviewRequirement,
  createReviewTarget,
} from "../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { createFrontlineAdmission } from
  "../../../../src/scripts/review-gate/core/frontline-admission.js";
import {
  frontlineLaneOutcome,
  bindHostedAttemptDisposition,
  hostedAwaitLaneOutcome,
  hostedLaneAttemptId,
  laneProgressOperationId,
  acknowledgeHostedRequest,
  recordFrontlineAttempt,
  recordHostedAwaitAttempt,
  recordHostedRequestAdmission,
  recordHostedRequestConclusion,
  readLaneProgress,
  readLaneProgressAcrossLineage,
  recordLaneAttempt,
  settleLaneAttempt,
  settleHostedAttemptFinding,
} from "../../../../src/scripts/review-gate/lane-progress.js";
import {
  createHostedAdmission,
  type HostedRequestEnvelope,
  type HostedRequestHandle,
} from
  "../../../../src/scripts/review-gate/hosted/request.js";
import { reduceReviewRouting } from
  "../../../../src/scripts/review-gate/policy/routing.js";

const objectId = (character: string): string => character.repeat(40);

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
      if (expectedVersion !== current + store.drift) throw new Error("operation-state-version-conflict");
      const version = current + 1;
      records.set(next.operationId, { version, state: next });
      return { version };
    },
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
const deliveryVehicle = DeliveryReviewMemberVehicleSchema.parse({
  kind: "delivery-member",
  planId: "123e4567-e89b-12d3-a456-426614174000",
  deliverableId: `sha256:${"9".repeat(64)}`,
  workUnitId: "example",
  head: objectId("c"),
});
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
    rubricDigest: `sha256:${"e".repeat(64)}`,
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
};
const hostedAdmission = createHostedAdmission({
  schemaVersion: 1,
  repositoryId: "repo-1",
  lineage: { kind: "candidate", candidateId: `sha256:${"8".repeat(64)}` },
  logicalPass: 1,
  sourceId: handleBase.provider,
  target: handleBase.target,
  requestedCoverage: handleBase.requestedCoverage,
  reviewTarget: hostedReviewTarget,
  requirement: hostedRequirement,
  actorIdentity: hostedContext.actorIdentity,
});
const handle = { ...handleBase, admission: hostedAdmission };
const deliveryHostedReviewTarget = createReviewTarget({
  schemaVersion: 2,
  semanticsVersion: "review-gate/v2",
  kind: "delivery-member",
  repositoryId: "repo-1",
  baseRef: "main",
  diffBaseSha: objectId("a"),
  diffBaseTree: objectId("b"),
  headSha: objectId("c"),
  headTree: objectId("d"),
});
const deliveryHostedRequirement = createReviewRequirement({
  target: deliveryHostedReviewTarget,
  projection: {
    obligation: "required",
    reasons: ["sensitive-change-set"],
    rubricVersion: "standard-review/v1",
    rubricDigest: `sha256:${"e".repeat(64)}`,
    retrigger: "full-final",
    count: 1,
  },
  acceptableSources: [{ sourceKind: "hosted", qualifier: handleBase.provider }],
  initialAdmission: "automatic",
});
if (deliveryHostedRequirement === null) throw new Error("expected delivery hosted review requirement");
const deliveryHostedContext = {
  reviewTarget: deliveryHostedReviewTarget,
  requirement: deliveryHostedRequirement,
  actorIdentity: "github-user-1",
};
const deliveryAdmission = createHostedAdmission({
  schemaVersion: 1,
  repositoryId: "repo-1",
  lineage: {
    kind: "delivery-member",
    planId: deliveryVehicle.planId,
    workUnitId: deliveryVehicle.workUnitId,
    deliverableId: deliveryVehicle.deliverableId,
  },
  logicalPass: 1,
  sourceId: handleBase.provider,
  target: handleBase.target,
  requestedCoverage: handleBase.requestedCoverage,
  vehicle: deliveryVehicle,
  reviewTarget: deliveryHostedReviewTarget,
  requirement: deliveryHostedRequirement,
  actorIdentity: deliveryHostedContext.actorIdentity,
});
const deliveryHandle = { ...handleBase, vehicle: deliveryVehicle, admission: deliveryAdmission };

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
  it("persists an unacknowledged hosted admission in the lineage owner", async () => {
    const store = createStore();
    const decision = await recordHostedRequestAdmission(store, {
      repositoryId: "repo-1",
      lineage: hostedAdmission.lineage,
      request: {
        schemaVersion: 1,
        target: handle.target,
        provider: handle.provider,
        coverage: handle.requestedCoverage,
      },
      ...hostedContext,
      now: "2026-08-15T12:00:00Z",
    });

    expect(decision).toEqual({ state: "admitted", admission: hostedAdmission });
    expect(store.state).toMatchObject({
      kind: "lane-progress",
      lineage: hostedAdmission.lineage,
      attempts: [{
        attemptId: hostedAdmission.admissionId,
        logicalPass: 1,
        outcome: "pending",
        hosted: { admission: hostedAdmission },
      }],
    });
  });

  it("stops an unacknowledged admission replay as ambiguous delivery", async () => {
    const store = createStore();
    const input = {
      repositoryId: "repo-1",
      lineage: hostedAdmission.lineage,
      request: {
        schemaVersion: 1 as const,
        target: handle.target,
        provider: handle.provider,
        coverage: handle.requestedCoverage,
      },
      ...hostedContext,
      now: "2026-08-15T12:00:00Z",
    };
    await recordHostedRequestAdmission(store, input);

    expect(await recordHostedRequestAdmission(store, {
      ...input,
      now: "2026-08-15T12:01:00Z",
    })).toEqual({ state: "ambiguous-delivery" });
  });

  it("replays the stored await action after acknowledgment without a new admission", async () => {
    const store = createStore();
    const input = {
      repositoryId: "repo-1",
      lineage: hostedAdmission.lineage,
      request: {
        schemaVersion: 1 as const,
        target: handle.target,
        provider: handle.provider,
        coverage: handle.requestedCoverage,
      },
      ...hostedContext,
      now: "2026-08-15T12:00:00Z",
    };
    const decision = await recordHostedRequestAdmission(store, input);
    if (decision.state !== "admitted") throw new Error("expected fresh hosted admission");
    await acknowledgeHostedRequest(store, {
      admission: decision.admission,
      handle,
      now: "2026-08-15T12:01:00Z",
    });

    expect(await recordHostedRequestAdmission(store, {
      ...input,
      now: "2026-08-15T12:02:00Z",
    })).toEqual({
      state: "acknowledged",
      handle,
      action: { schemaVersion: 1, handle },
    });
  });

  it("keeps the acknowledged admission when current policy and actor context change", async () => {
    const store = createStore();
    const input = {
      repositoryId: "repo-1",
      lineage: hostedAdmission.lineage,
      request: {
        schemaVersion: 1 as const,
        target: handle.target,
        provider: handle.provider,
        coverage: handle.requestedCoverage,
      },
      ...hostedContext,
      now: "2026-08-15T12:00:00Z",
    };
    const decision = await recordHostedRequestAdmission(store, input);
    if (decision.state !== "admitted") throw new Error("expected fresh hosted admission");
    await acknowledgeHostedRequest(store, {
      admission: decision.admission,
      handle,
      now: "2026-08-15T12:01:00Z",
    });
    const changedRequirement = createReviewRequirement({
      target: hostedReviewTarget,
      projection: {
        obligation: "required",
        reasons: ["sensitive-change-set"],
        rubricVersion: "standard-review/v2",
        rubricDigest: `sha256:${"7".repeat(64)}`,
        retrigger: "full-final",
        count: 1,
      },
      acceptableSources: [{ sourceKind: "hosted", qualifier: handle.provider }],
      initialAdmission: "automatic",
    });
    if (changedRequirement === null) throw new Error("expected changed hosted requirement");

    expect(await recordHostedRequestAdmission(store, {
      ...input,
      requirement: changedRequirement,
      actorIdentity: "github-user-2",
      now: "2026-08-15T12:02:00Z",
    })).toEqual({
      state: "acknowledged",
      handle,
      action: { schemaVersion: 1, handle },
    });
  });

  it("durably records safe request-time unavailability for fallback after restart", async () => {
    const store = createStore();
    const request = {
      schemaVersion: 1 as const,
      target: handle.target,
      provider: "coderabbit-pr" as const,
      coverage: "complete" as const,
      vehicle: deliveryVehicle,
    };
    const decision = await recordHostedRequestAdmission(store, {
      repositoryId: "repo-1",
      lineage: deliveryAdmission.lineage,
      request,
      progressVehicle: deliveryVehicle,
      ...deliveryHostedContext,
      now: "2026-08-15T11:59:00Z",
    });
    if (decision.state !== "admitted") throw new Error("expected hosted admission");
    const state = await recordHostedRequestConclusion(store, {
      admission: decision.admission,
      result: {
        schemaVersion: 1,
        mode: "review-hosted-request",
        state: "rate-limited",
        nextAction: "try-next-source",
        provider: "coderabbit-pr",
        requestedCoverage: "complete",
        attemptedProviders: ["coderabbit-pr"],
      },
      now: "2026-08-15T12:00:00Z",
    });

    expect(state.attempts).toEqual([expect.objectContaining({
      sourceId: "coderabbit-pr",
      outcome: "rate-limited",
      hosted: expect.objectContaining({ target: handle.target, vehicle: deliveryVehicle }),
    })]);
    expect(state.completedPasses).toBe(0);
  });

  it("refuses a request conclusion that has no durable pending admission", async () => {
    const store = createStore();

    await expect(recordHostedRequestConclusion(store, {
      admission: deliveryAdmission,
      result: {
        schemaVersion: 1,
        mode: "review-hosted-request",
        state: "rate-limited",
        nextAction: "try-next-source",
        provider: "coderabbit-pr",
        requestedCoverage: "complete",
        attemptedProviders: ["coderabbit-pr"],
      },
      now: "2026-08-15T12:00:00Z",
    })).rejects.toThrow(/unacknowledged pending admission/u);
  });

  it("refuses an await result that has no durable acknowledged request", async () => {
    const store = createStore();

    await expect(recordHostedAwaitAttempt(store, {
      repositoryId: "repo-1",
      result: {
        schemaVersion: 1,
        mode: "review-hosted-await",
        handle,
        state: "clean",
        nextAction: "complete",
        reviewUrl: "https://example.invalid/review",
      },
      now: "2026-08-15T12:00:00Z",
    })).rejects.toThrow(/acknowledged request/u);
  });

  it("records a concluded hosted attempt against the standard lane", async () => {
    const store = createStore();
    await seedAcknowledgedRequest(store, handle);
    const state = await recordHostedAwaitAttempt(store, {
      repositoryId: "repo-1",
      ...hostedContext,
      result: { schemaVersion: 1, mode: "review-hosted-await", handle, state: "rate-limited", nextAction: "try-next-source" },
      now: "2026-08-15T12:00:00Z",
    });
    expect(state?.lane).toBe("standard");
    expect(state?.repositoryId).toBe("repo-1");
    expect(state?.attempts).toEqual([expect.objectContaining({
      attemptId: expect.any(String),
      sourceId: "coderabbit-pr",
      outcome: "rate-limited",
    })]);
    expect(state?.completedPasses).toBe(0);
  });

  it("counts an incremental verdict once while retaining its coverage", async () => {
    const store = createStore();
    const incrementalAdmission = createHostedAdmission({
      schemaVersion: 1,
      repositoryId: deliveryAdmission.repositoryId,
      lineage: deliveryAdmission.lineage,
      logicalPass: deliveryAdmission.logicalPass,
      sourceId: deliveryAdmission.sourceId,
      target: deliveryAdmission.target,
      requestedCoverage: "incremental",
      vehicle: deliveryVehicle,
      reviewTarget: deliveryAdmission.reviewTarget,
      requirement: deliveryAdmission.requirement,
      actorIdentity: deliveryAdmission.actorIdentity,
    });
    const incrementalHandle = {
      ...deliveryHandle,
      requestedCoverage: "incremental" as const,
      effectiveCoverage: "incremental" as const,
      admission: incrementalAdmission,
    };
    await seedAcknowledgedRequest(store, incrementalHandle);
    const state = await recordHostedAwaitAttempt(store, {
      repositoryId: "repo-1",
      ...deliveryHostedContext,
      result: {
        schemaVersion: 1,
        mode: "review-hosted-await",
        handle: incrementalHandle,
        state: "clean",
        nextAction: "complete",
        reviewUrl: "https://example.test/review-incremental",
      },
      now: "2026-08-15T12:00:00Z",
    });

    expect(state?.completedPasses).toBe(1);
    expect(state?.attempts[0]?.hosted).toMatchObject({
      requestedCoverage: "incremental",
      effectiveCoverage: "incremental",
    });
  });

  it("retains a delivery selector on the concluded hosted attempt", async () => {
    const store = createStore();
    await seedAcknowledgedRequest(store, deliveryHandle);
    const state = await recordHostedAwaitAttempt(store, {
      repositoryId: "repo-1",
      ...deliveryHostedContext,
      result: {
        schemaVersion: 1,
        mode: "review-hosted-await",
        handle: deliveryHandle,
        state: "clean",
        nextAction: "complete",
        reviewUrl: "https://example.invalid/review",
      },
      now: "2026-08-15T12:00:00Z",
    });

    expect(state?.attempts[0]?.hosted).toMatchObject({ vehicle: deliveryVehicle });
  });

  it("consumes a pass only for a verdict-bearing outcome", async () => {
    const store = createStore();
    await seedAcknowledgedRequest(store, handle);
    const state = await recordHostedAwaitAttempt(store, {
      repositoryId: "repo-1",
      ...hostedContext,
      result: {
        schemaVersion: 1,
        mode: "review-hosted-await",
        handle,
        state: "clean",
        nextAction: "complete",
        reviewUrl: "https://example.invalid/review",
      },
      now: "2026-08-15T12:00:00Z",
    });
    expect(state?.completedPasses).toBe(1);
  });

  it("retains the acknowledged request handle and advances that same attempt monotonically through await", async () => {
    const store = createStore();
    const requested = await seedAcknowledgedRequest(store, handle);
    const pending = await recordHostedAwaitAttempt(store, {
      repositoryId: "repo-1",
      ...hostedContext,
      result: {
        schemaVersion: 1,
        mode: "review-hosted-await",
        handle,
        action: { schemaVersion: 1, handle },
        state: "pending",
        nextAction: "await",
        elapsedMs: 10,
      },
      now: "2026-08-15T12:01:00Z",
    });
    expect(requested.completedPasses).toBe(0);
    expect(pending).toEqual(requested);
    expect(pending?.attempts).toEqual([expect.objectContaining({
      attemptId: hostedLaneAttemptId(handle),
      outcome: "pending",
      hosted: expect.objectContaining({ handle }),
    })]);

    const concluded = await recordHostedAwaitAttempt(store, {
      repositoryId: "repo-1",
      ...hostedContext,
      result: {
        schemaVersion: 1,
        mode: "review-hosted-await",
        handle,
        state: "clean",
        nextAction: "complete",
        reviewUrl: "https://example.invalid/review",
      },
      now: "2026-08-15T12:02:00Z",
    });
    expect(concluded?.completedPasses).toBe(1);
    expect(concluded?.attempts).toEqual([expect.objectContaining({
      attemptId: hostedLaneAttemptId(handle),
      outcome: "clean",
      hosted: expect.objectContaining({ handle }),
    })]);

    const replay = await recordHostedAwaitAttempt(store, {
      repositoryId: "repo-1",
      ...hostedContext,
      result: {
        schemaVersion: 1,
        mode: "review-hosted-await",
        handle,
        state: "clean",
        nextAction: "complete",
        reviewUrl: "https://example.invalid/review",
      },
      now: "2026-08-15T12:03:00Z",
    });
    expect(replay).toEqual(concluded);
  });

  it("retains the exact pending handle when unattended waiting requests inspection or extension", async () => {
    const store = createStore();
    await seedAcknowledgedRequest(store, handle);
    const state = await recordHostedAwaitAttempt(store, {
      repositoryId: "repo-1",
      ...hostedContext,
      result: {
        schemaVersion: 1,
        mode: "review-hosted-await",
        handle,
        action: { schemaVersion: 1, handle },
        state: "pending",
        nextAction: "inspect-or-extend",
        ageMs: 900_000,
        attentionAfterMs: 900_000,
      },
      now: "2026-08-15T12:00:00Z",
    });

    expect(state?.completedPasses).toBe(0);
    expect(state?.attempts).toEqual([expect.objectContaining({
      attemptId: hostedLaneAttemptId(handle),
      outcome: "pending",
      hosted: expect.objectContaining({ handle }),
    })]);
  });

  it("settles only the approved hosted finding set and is idempotent per finding", async () => {
    const store = createStore();
    await seedAcknowledgedRequest(store, handle);
    const findings = [{
      findingId: "thread-1",
      origin: "review-thread" as const,
      commentId: "comment-1",
      threadId: "thread-1",
      settlement: "reply-and-resolve" as const,
      severity: "major" as const,
      locus: "src/index.ts:7",
      url: "https://example.invalid/thread-1",
    }, {
      findingId: "body-1",
      origin: "review-body" as const,
      reviewId: "review-1",
      fingerprint: "body-fingerprint",
      settlement: "not-applicable" as const,
      severity: "minor" as const,
      locus: "pull-request review body",
      url: "https://example.invalid/review-1",
      body: "Body finding",
    }];
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
        findings,
      },
      now: "2026-08-15T12:00:00Z",
    });
    if (progress === null) throw new Error("expected hosted lane progress");
    const attemptId = hostedLaneAttemptId(handle);
    const bound = await bindHostedAttemptDisposition(store, {
      operationId: progress.operationId,
      attemptId,
      dispositionSetId: `sha256:${"f".repeat(64)}`,
      findingIds: findings.map(({ findingId }) => findingId),
      noHostSettlementFindingIds: ["body-1"],
      now: "2026-08-15T12:01:00Z",
    });
    expect(bound.attempts[0]).toMatchObject({
      outcome: "findings",
      hosted: { settledFindingIds: ["body-1"] },
    });
    const settled = await settleHostedAttemptFinding(store, {
      operationId: progress.operationId,
      attemptId,
      dispositionSetId: `sha256:${"f".repeat(64)}`,
      findingId: "thread-1",
      now: "2026-08-15T12:02:00Z",
    });
    expect(settled.attempts[0]).toMatchObject({
      outcome: "settled-findings",
      hosted: { settledFindingIds: ["body-1", "thread-1"] },
    });
    await expect(settleHostedAttemptFinding(store, {
      operationId: progress.operationId,
      attemptId,
      dispositionSetId: `sha256:${"f".repeat(64)}`,
      findingId: "thread-1",
      now: "2026-08-15T12:03:00Z",
    })).resolves.toEqual(settled);
  });
});

const frontlineTarget = createReviewTarget({
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
const frontlineLineage = {
  kind: "candidate" as const,
  candidateId: `sha256:${"1".repeat(64)}`,
};
const frontlineSource = {
  sourceId: "coderabbit",
  kind: "agent" as const,
  handle: { capabilityId: "coderabbit" },
};
const frontlineFacts = {
  schemaVersion: 1 as const,
  changeSetState: "known" as const,
  contentKind: "code-bearing" as const,
  reviewRisk: "routine" as const,
  changeDeterminacy: "ordinary" as const,
  ownership: "self" as const,
  surfaceAuthority: "ordinary" as const,
  assurance: { workContext: "work-unit", workClass: "Light" },
  activity: { selfReview: true, frontlineReview: true },
} as const;

function frontlineAdmission() {
  return createFrontlineAdmission({
    lineage: frontlineLineage,
    target: frontlineTarget,
    routing: {
      facts: frontlineFacts,
      decision: reduceReviewRouting(frontlineFacts),
    },
    frontlineReview: {
      schemaVersion: 1,
      semanticsVersion: "frontline-review/v1",
      action: "attempt",
      reasons: ["routine-code"],
      source: frontlineSource,
      maxPasses: 2,
      promptText: "Review the aggregate candidate.",
    },
    logicalPass: 1,
    retryGeneration: 0,
    maxPasses: 2,
  });
}

async function recordPendingFrontline(store: ReturnType<typeof createStore>) {
  const admission = frontlineAdmission();
  await recordLaneAttempt(store, {
    lane: "frontline",
    repositoryId: frontlineTarget.repositoryId,
    changeRequestId: null,
    headSha: frontlineTarget.headSha,
    lineage: admission.lineage,
    logicalPass: admission.logicalPass,
    retryGeneration: admission.retryGeneration,
    attemptId: admission.operationId,
    sourceId: frontlineSource.sourceId,
    outcome: "pending",
    consumedPass: false,
    chunkSeriesComplete: false,
    frontline: { admission, effectiveCoverage: null },
    now: "2026-08-15T11:59:00Z",
  });
  return admission;
}

function frontlineOutcome(
  outcome: string,
  reason: { class: string } | null,
): Parameters<typeof recordFrontlineAttempt>[1]["outcome"] {
  return {
    schemaVersion: 1,
    semanticsVersion: "frontline-review/v1",
    source: frontlineSource,
    target: frontlineTarget,
    pass: 1,
    maxPasses: 2,
    outcome,
    findings: [],
    reason,
  } as unknown as Parameters<typeof recordFrontlineAttempt>[1]["outcome"];
}

describe("frontline lane recording", () => {
  it("preserves the unavailable-class distinction the fall-through decision reads", () => {
    expect(frontlineLaneOutcome("unavailable", "rate-limited")).toBe("rate-limited");
    expect(frontlineLaneOutcome("unavailable", "transient-unavailable")).toBe("transient-unavailable");
    expect(frontlineLaneOutcome("unavailable", "source-unbound")).toBe("source-unbound");
    expect(frontlineLaneOutcome("unavailable", "capability-unsupported")).toBe("capability-unsupported");
  });

  it("maps the verdict, timeout, and stale-target outcomes", () => {
    expect(frontlineLaneOutcome("clean", null)).toBe("clean");
    expect(frontlineLaneOutcome("findings", null)).toBe("findings");
    expect(frontlineLaneOutcome("timed-out", "execution-timeout")).toBe("timed-out");
    expect(frontlineLaneOutcome("stale-target", "head-mismatch")).toBe("stale-target");
    expect(frontlineLaneOutcome("stale-target", "target-mismatch")).toBe("stale-target");
  });

  it("separates a malformed carrier result from a terminal refusal", () => {
    expect(frontlineLaneOutcome("failed", "invalid-output")).toBe("malformed");
    expect(frontlineLaneOutcome("failed", "authorization-rejected")).toBe("terminal-failure");
  });

  it("keeps the lane's own retry classification for transient carrier failures", () => {
    for (const reasonClass of [
      "transient-transport",
      "process-failure",
      "signal-termination",
      "unexpected-adapter-failure",
    ]) {
      expect(frontlineLaneOutcome("failed", reasonClass)).toBe("transient-unavailable");
    }
  });

  it("concludes no attempt for an exhausted pass cap", () => {
    expect(frontlineLaneOutcome("pass-cap-exhausted", "pass-cap")).toBeNull();
  });

  it("records a concluded frontline attempt against the frontline lane", async () => {
    const store = createStore();
    const admission = await recordPendingFrontline(store);
    const state = await recordFrontlineAttempt(store, {
      admission,
      outcome: frontlineOutcome("unavailable", { class: "rate-limited" }),
      now: "2026-08-15T12:00:00Z",
    });
    expect(state?.lane).toBe("frontline");
    expect(state?.repositoryId).toBe("repo-1");
    expect(state?.attempts).toEqual([{
      attemptId: admission.operationId,
      logicalPass: 1,
      retryGeneration: 0,
      changeRequestId: null,
      headSha: objectId("c"),
      terminalProducer: false,
      sourceId: "coderabbit",
      outcome: "rate-limited",
      chunkSeriesComplete: false,
      frontline: { admission, effectiveCoverage: null },
    }]);
    expect(state?.completedPasses).toBe(0);
  });

  it("consumes a pass for a verdict-bearing frontline outcome", async () => {
    const store = createStore();
    const admission = await recordPendingFrontline(store);
    const state = await recordFrontlineAttempt(store, {
      admission,
      outcome: frontlineOutcome("findings", null),
      now: "2026-08-15T12:00:00Z",
    });
    expect(state?.completedPasses).toBe(1);
    expect(state?.attempts[0]).toMatchObject({ chunkSeriesComplete: true });
  });
});

describe("lane progress reader", () => {
  it("reports an unrecorded lane distinctly from one that recorded attempts", async () => {
    const store = createStore();
    await expect(readLaneProgress(store, {
      lane: "standard",
      repositoryId: "repo-1",
      headSha: objectId("c"),
    })).resolves.toEqual({ status: "unrecorded" });
  });

  it("projects recorded progress into the driver's pass count and ordered attempts", async () => {
    const store = createStore();
    await recordLaneAttempt(store, { ...attempt, outcome: "rate-limited", consumedPass: false });
    await recordLaneAttempt(store, {
      ...attempt,
      attemptId: "attempt-2",
      sourceId: "codex-pr",
      outcome: "findings",
      consumedPass: true,
    });
    await expect(readLaneProgress(store, {
      lane: "standard",
      repositoryId: "repo-1",
      headSha: objectId("c"),
    })).resolves.toEqual({
      status: "recorded",
      completedPasses: 1,
      completePasses: 0,
      attempts: [
        {
          attemptId: "attempt-1",
          logicalPass: 1,
          retryGeneration: 0,
          changeRequestId: "pull/42",
          headSha: objectId("c"),
          terminalProducer: false,
          sourceId: "coderabbit-pr",
          outcome: "rate-limited",
        },
        {
          attemptId: "attempt-2",
          logicalPass: 1,
          retryGeneration: 0,
          changeRequestId: "pull/42",
          headSha: objectId("c"),
          terminalProducer: true,
          sourceId: "codex-pr",
          outcome: "findings",
        },
      ],
    });
  });

  it("does not read another lane's progress against the same head", async () => {
    const store = createStore();
    await recordLaneAttempt(store, { ...attempt, outcome: "clean", consumedPass: true });
    await expect(readLaneProgress(store, {
      lane: "frontline",
      repositoryId: "repo-1",
      headSha: objectId("c"),
    })).resolves.toEqual({ status: "unrecorded" });
  });

  it("does not read progress recorded against a different head", async () => {
    const store = createStore();
    await recordLaneAttempt(store, { ...attempt, outcome: "clean", consumedPass: true });
    await expect(readLaneProgress(store, {
      lane: "standard",
      repositoryId: "repo-1",
      headSha: objectId("d"),
    })).resolves.toEqual({ status: "unrecorded" });
  });

  it("carries consumed passes across Candidate heads while exposing only current-head attempts", async () => {
    const store = createStore();
    await recordLaneAttempt(store, { ...attempt, outcome: "findings", consumedPass: true });
    await recordLaneAttempt(store, {
      ...attempt,
      headSha: objectId("d"),
      attemptId: "attempt-2",
      sourceId: "codex-pr",
      outcome: "clean",
      consumedPass: true,
    });

    await expect(readLaneProgressAcrossLineage(store, {
      lane: "standard",
      repositoryId: "repo-1",
      headSha: objectId("d"),
      lineageHeadShas: [objectId("c"), objectId("d"), objectId("c")],
    })).resolves.toEqual({
      status: "recorded",
      completedPasses: 2,
      completePasses: 0,
      attempts: [{
        attemptId: "attempt-2",
        logicalPass: 1,
        retryGeneration: 0,
        changeRequestId: "pull/42",
        headSha: objectId("d"),
        terminalProducer: true,
        sourceId: "codex-pr",
        outcome: "clean",
      }],
    });
  });

  it("uses the stable-lineage owner instead of mixing exact-head progress", async () => {
    const store = createStore();
    const lineage = {
      kind: "candidate" as const,
      candidateId: `sha256:${"6".repeat(64)}`,
    };
    await recordLaneAttempt(store, {
      ...attempt,
      lineage,
      sourceId: "delegated-agent",
      outcome: "clean",
      consumedPass: true,
    });
    await recordLaneAttempt(store, {
      ...attempt,
      attemptId: "attempt-2",
      sourceId: "coderabbit-pr",
      outcome: "rate-limited",
      consumedPass: false,
    });

    await expect(readLaneProgressAcrossLineage(store, {
      lane: "standard",
      repositoryId: "repo-1",
      headSha: objectId("c"),
      lineageHeadShas: [objectId("c")],
      lineage,
    })).resolves.toEqual({
      status: "recorded",
      completedPasses: 1,
      completePasses: 0,
      attempts: [
        expect.objectContaining({
          attemptId: "attempt-1",
          sourceId: "delegated-agent",
          outcome: "clean",
        }),
      ],
    });
  });
});
