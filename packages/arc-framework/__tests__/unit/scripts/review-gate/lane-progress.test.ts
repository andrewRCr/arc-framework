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
import {
  frontlineLaneOutcome,
  bindHostedAttemptDisposition,
  hostedAwaitLaneOutcome,
  hostedLaneAttemptId,
  laneProgressOperationId,
  recordFrontlineAttempt,
  recordHostedAwaitAttempt,
  recordHostedRequestUnavailableAttempt,
  readLaneProgress,
  readLaneProgressAcrossLineage,
  recordLaneAttempt,
  settleLaneAttempt,
  settleHostedAttemptFinding,
} from "../../../../src/scripts/review-gate/lane-progress.js";

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
    expect(state.changeRequestId).toBe("pull/42");
    expect(state.headSha).toBe(objectId("c"));
    expect(state.attempts).toEqual([{
      attemptId: "attempt-1",
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

const handle = {
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
const deliveryHandle = { ...handle, vehicle: deliveryVehicle };
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
  acceptableSources: [{ sourceKind: "hosted", qualifier: handle.provider }],
  initialAdmission: "automatic",
});
if (hostedRequirement === null) throw new Error("expected hosted review requirement");
const hostedContext = {
  reviewTarget: hostedReviewTarget,
  requirement: hostedRequirement,
  actorIdentity: "github-user-1",
};
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
  acceptableSources: [{ sourceKind: "hosted", qualifier: handle.provider }],
  initialAdmission: "automatic",
});
if (deliveryHostedRequirement === null) throw new Error("expected delivery hosted review requirement");
const deliveryHostedContext = {
  reviewTarget: deliveryHostedReviewTarget,
  requirement: deliveryHostedRequirement,
  actorIdentity: "github-user-1",
};

describe("hosted await lane recording", () => {
  it("durably records safe request-time unavailability for fallback after restart", async () => {
    const store = createStore();
    const state = await recordHostedRequestUnavailableAttempt(store, {
      repositoryId: "repo-1",
      ...deliveryHostedContext,
      request: {
        schemaVersion: 1,
        target: handle.target,
        provider: "coderabbit-pr",
        coverage: "complete",
        vehicle: deliveryVehicle,
      },
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

  it("records a concluded hosted attempt against the standard lane", async () => {
    const store = createStore();
    const state = await recordHostedAwaitAttempt(store, {
      repositoryId: "repo-1",
      ...hostedContext,
      result: { schemaVersion: 1, mode: "review-hosted-await", handle, state: "rate-limited", nextAction: "try-next-source" },
      now: "2026-08-15T12:00:00Z",
    });
    expect(state?.lane).toBe("standard");
    expect(state?.repositoryId).toBe("repo-1");
    expect(state?.changeRequestId).toBe("pull/42");
    expect(state?.attempts).toEqual([expect.objectContaining({
      attemptId: expect.any(String),
      sourceId: "coderabbit-pr",
      outcome: "rate-limited",
    })]);
    expect(state?.completedPasses).toBe(0);
  });

  it("retains incremental coverage without consuming a complete-review pass", async () => {
    const store = createStore();
    const incrementalHandle = {
      ...deliveryHandle,
      requestedCoverage: "incremental" as const,
      effectiveCoverage: "incremental" as const,
    };
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

    expect(state?.completedPasses).toBe(0);
    expect(state?.attempts[0]?.hosted).toMatchObject({
      requestedCoverage: "incremental",
      effectiveCoverage: "incremental",
    });
  });

  it("retains a delivery selector on the concluded hosted attempt", async () => {
    const store = createStore();
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

  it("records nothing when the bounded call only yielded at its deadline", async () => {
    const store = createStore();
    const state = await recordHostedAwaitAttempt(store, {
      repositoryId: "repo-1",
      ...hostedContext,
      result: { schemaVersion: 1, mode: "review-hosted-await", handle, state: "pending", nextAction: "await", elapsedMs: 10 },
      now: "2026-08-15T12:00:00Z",
    });
    expect(state).toBeNull();
    expect(store.state).toBeNull();
  });

  it("records nothing when unattended waiting requests inspection or extension", async () => {
    const store = createStore();
    const state = await recordHostedAwaitAttempt(store, {
      repositoryId: "repo-1",
      ...hostedContext,
      result: {
        schemaVersion: 1,
        mode: "review-hosted-await",
        handle,
        state: "pending",
        nextAction: "inspect-or-extend",
        ageMs: 900_000,
        attentionAfterMs: 900_000,
      },
      now: "2026-08-15T12:00:00Z",
    });

    expect(state).toBeNull();
    expect(store.state).toBeNull();
  });

  it("settles only the approved hosted finding set and is idempotent per finding", async () => {
    const store = createStore();
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

function frontlineOutcome(
  outcome: string,
  reason: { class: string } | null,
): Parameters<typeof recordFrontlineAttempt>[1]["outcome"] {
  return {
    schemaVersion: 1,
    semanticsVersion: "frontline-review/v1",
    source: { sourceId: "coderabbit", kind: "agent", handle: { agent: "coderabbit" } },
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
    const state = await recordFrontlineAttempt(store, {
      attemptId: "frontline-attempt-1",
      outcome: frontlineOutcome("unavailable", { class: "rate-limited" }),
      now: "2026-08-15T12:00:00Z",
    });
    expect(state?.lane).toBe("frontline");
    expect(state?.repositoryId).toBe("repo-1");
    expect(state?.changeRequestId).toBeNull();
    expect(state?.headSha).toBe(objectId("c"));
    expect(state?.attempts).toEqual([{
      attemptId: expect.any(String),
      sourceId: "coderabbit",
      outcome: "rate-limited",
      chunkSeriesComplete: false,
    }]);
    expect(state?.completedPasses).toBe(0);
  });

  it("consumes a pass for a verdict-bearing frontline outcome", async () => {
    const store = createStore();
    const state = await recordFrontlineAttempt(store, {
      attemptId: "frontline-attempt-1",
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
      attempts: [
        { attemptId: "attempt-1", sourceId: "coderabbit-pr", outcome: "rate-limited" },
        { attemptId: "attempt-2", sourceId: "codex-pr", outcome: "findings" },
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
      attempts: [{ attemptId: "attempt-2", sourceId: "codex-pr", outcome: "clean" }],
    });
  });
});
