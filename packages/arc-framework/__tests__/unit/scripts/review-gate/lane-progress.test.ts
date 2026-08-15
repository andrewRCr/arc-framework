import { describe, expect, it } from "vitest";

import {
  LaneProgressStateSchema,
  type ReviewOperationState,
} from "../../../../src/scripts/review-gate/core/operation-state-schema.js";
import { createReviewTarget } from "../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import {
  frontlineLaneOutcome,
  hostedAwaitLaneOutcome,
  laneProgressOperationId,
  recordFrontlineAttempt,
  recordHostedAwaitAttempt,
  readLaneProgress,
  recordLaneAttempt,
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
    expect(state.attempts).toEqual([{ sourceId: "coderabbit-pr", outcome: "rate-limited" }]);
  });

  it("appends later attempts in the order they were recorded", async () => {
    const store = createStore();
    await recordLaneAttempt(store, { ...attempt, outcome: "rate-limited", consumedPass: false });
    await recordLaneAttempt(store, {
      ...attempt,
      sourceId: "codex-pr",
      outcome: "transient-unavailable",
      consumedPass: false,
    });
    const state = await recordLaneAttempt(store, {
      ...attempt,
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
      sourceId: "coderabbit-pr",
      outcome: "clean",
      chunkSeriesComplete: true,
    });
  });

  it("surfaces a concurrent write rather than silently overwriting it", async () => {
    const store = createStore();
    await recordLaneAttempt(store, { ...attempt, outcome: "clean", consumedPass: true });
    store.drift = 1;
    await expect(recordLaneAttempt(store, { ...attempt, outcome: "findings", consumedPass: true }))
      .rejects.toThrow(/version-conflict/u);
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

  it("treats a deadline yield as no concluded attempt", () => {
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

describe("hosted await lane recording", () => {
  it("records a concluded hosted attempt against the standard lane", async () => {
    const store = createStore();
    const state = await recordHostedAwaitAttempt(store, {
      repositoryId: "repo-1",
      result: { schemaVersion: 1, mode: "review-hosted-await", handle, state: "rate-limited", nextAction: "try-next-source" },
      now: "2026-08-15T12:00:00Z",
    });
    expect(state?.lane).toBe("standard");
    expect(state?.repositoryId).toBe("repo-1");
    expect(state?.changeRequestId).toBe("pull/42");
    expect(state?.attempts).toEqual([{ sourceId: "coderabbit-pr", outcome: "rate-limited" }]);
    expect(state?.completedPasses).toBe(0);
  });

  it("consumes a pass only for a verdict-bearing outcome", async () => {
    const store = createStore();
    const state = await recordHostedAwaitAttempt(store, {
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
    });
    expect(state?.completedPasses).toBe(1);
  });

  it("records nothing when the bounded call only yielded at its deadline", async () => {
    const store = createStore();
    const state = await recordHostedAwaitAttempt(store, {
      repositoryId: "repo-1",
      result: { schemaVersion: 1, mode: "review-hosted-await", handle, state: "pending", nextAction: "await", elapsedMs: 10 },
      now: "2026-08-15T12:00:00Z",
    });
    expect(state).toBeNull();
    expect(store.state).toBeNull();
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
      outcome: frontlineOutcome("unavailable", { class: "rate-limited" }),
      now: "2026-08-15T12:00:00Z",
    });
    expect(state?.lane).toBe("frontline");
    expect(state?.repositoryId).toBe("repo-1");
    expect(state?.changeRequestId).toBeNull();
    expect(state?.headSha).toBe(objectId("c"));
    expect(state?.attempts).toEqual([{ sourceId: "coderabbit", outcome: "rate-limited" }]);
    expect(state?.completedPasses).toBe(0);
  });

  it("consumes a pass for a verdict-bearing frontline outcome", async () => {
    const store = createStore();
    const state = await recordFrontlineAttempt(store, {
      outcome: frontlineOutcome("findings", null),
      now: "2026-08-15T12:00:00Z",
    });
    expect(state?.completedPasses).toBe(1);
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
        { sourceId: "coderabbit-pr", outcome: "rate-limited" },
        { sourceId: "codex-pr", outcome: "findings" },
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
});
