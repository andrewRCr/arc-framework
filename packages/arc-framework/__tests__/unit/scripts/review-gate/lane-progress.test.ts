import { describe, expect, it } from "vitest";

import {
  LaneProgressStateSchema,
  type ReviewOperationState,
} from "../../../../src/scripts/review-gate/core/operation-state-schema.js";
import {
  hostedAwaitLaneOutcome,
  laneProgressOperationId,
  recordHostedAwaitAttempt,
  recordLaneAttempt,
} from "../../../../src/scripts/review-gate/lane-progress.js";

const objectId = (character: string): string => character.repeat(40);

function createStore() {
  const store = {
    state: null as ReviewOperationState | null,
    version: 0,
    readOperation: async () => ({ version: store.version, state: store.state }),
    publishOperation: async (next: ReviewOperationState, expectedVersion: number) => {
      if (expectedVersion !== store.version) throw new Error("operation-state-version-conflict");
      store.state = next;
      store.version += 1;
      return { version: store.version };
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
    const readOperation = store.readOperation.bind(store);
    store.readOperation = async () => {
      const result = await readOperation();
      store.version += 1;
      return result;
    };
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
      result: { schemaVersion: 1, mode: "review-hosted-await", handle, state: "rate-limited", nextAction: "try-next-source" },
      now: "2026-08-15T12:00:00Z",
    });
    expect(state?.lane).toBe("standard");
    expect(state?.repositoryId).toBe("andrewRCr/arc-framework");
    expect(state?.changeRequestId).toBe("pull/42");
    expect(state?.attempts).toEqual([{ sourceId: "coderabbit-pr", outcome: "rate-limited" }]);
    expect(state?.completedPasses).toBe(0);
  });

  it("consumes a pass only for a verdict-bearing outcome", async () => {
    const store = createStore();
    const state = await recordHostedAwaitAttempt(store, {
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
      result: { schemaVersion: 1, mode: "review-hosted-await", handle, state: "pending", nextAction: "await", elapsedMs: 10 },
      now: "2026-08-15T12:00:00Z",
    });
    expect(state).toBeNull();
    expect(store.state).toBeNull();
  });
});
