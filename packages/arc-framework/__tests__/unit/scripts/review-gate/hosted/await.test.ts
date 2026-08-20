import { describe, expect, it } from "vitest";

import {
  HostedAwaitResultSchema,
  awaitHostedReview,
  type HostedAwaitClock,
  type HostedReviewObserver,
} from "../../../../../src/scripts/review-gate/hosted/await.js";
import type { HostedRequestHandle } from "../../../../../src/scripts/review-gate/hosted/request.js";

const HEAD = "a".repeat(40);
const handle: HostedRequestHandle = {
  schemaVersion: 1,
  provider: "coderabbit-pr",
  requestedCoverage: "complete",
  effectiveCoverage: "complete",
  target: { repository: "owner/repo", pullRequest: 42, headSha: HEAD },
  artifact: {
    kind: "issue-comment",
    id: "IC_kwDO123",
    url: "https://github.com/owner/repo/pull/42#issuecomment-1",
    createdAt: "2026-07-23T12:00:00.000Z",
  },
};

function clock(): HostedAwaitClock {
  let now = 0;
  return {
    now: () => now,
    sleep: (milliseconds) => {
      now += milliseconds;
      return Promise.resolve();
    },
  };
}

function observer(observe: HostedReviewObserver["observe"]): HostedReviewObserver {
  return {
    id: "coderabbit-pr",
    readHead: () => Promise.resolve(HEAD),
    observe,
  };
}

describe("hosted review await", () => {
  it("accepts the durable response source attached to a findings result", () => {
    expect(HostedAwaitResultSchema.safeParse({
      schemaVersion: 1,
      mode: "review-hosted-await",
      handle,
      state: "findings",
      nextAction: "triage",
      reviewUrl: "https://github.com/owner/repo/pull/42#pullrequestreview-1",
      findings: [{
        findingId: "PRRT_1",
        origin: "review-thread",
        commentId: "PRRC_1",
        threadId: "PRRT_1",
        settlement: "reply-and-resolve",
        severity: "major",
        locus: "src/index.ts:7",
        url: "https://github.com/owner/repo/pull/42#discussion_r1",
      }],
      responseSourceRef: "arc-review-source:v1:hosted:lane-progress%2F1:hosted%2F1",
    }).success).toBe(true);
  });

  it("returns a resumable pending state at the bounded deadline", async () => {
    const result = await awaitHostedReview({
      schemaVersion: 1,
      handle,
      timeoutMs: 2_000,
      pollIntervalMs: 500,
    }, {
      clock: clock(),
      observers: [observer(() => Promise.resolve({ kind: "pending" }))],
    });

    expect(result).toMatchObject({
      state: "pending",
      nextAction: "await",
      handle,
      elapsedMs: 2_000,
    });
  });

  it.each([
    ["clean", { kind: "clean", reviewUrl: "https://github.com/owner/repo/pull/42#pullrequestreview-1" }],
    ["findings", {
      kind: "findings",
      reviewUrl: "https://github.com/owner/repo/pull/42#pullrequestreview-1",
      findings: [{
        findingId: "PRRT_1",
        origin: "review-thread",
        commentId: "PRRC_1",
        threadId: "PRRT_1",
        settlement: "reply-and-resolve",
        severity: "major",
        locus: "src/a.ts:7",
        url: "https://github.com/owner/repo/pull/42#discussion_r1",
      }],
    }],
    ["rate-limited", { kind: "rate-limited" }],
    ["transient-unavailable", { kind: "transient-unavailable" }],
  ] as const)("normalizes terminal %s observations", async (state, observation) => {
    const result = await awaitHostedReview({
      schemaVersion: 1,
      handle,
      timeoutMs: 2_000,
      pollIntervalMs: 500,
    }, {
      clock: clock(),
      observers: [observer(() => Promise.resolve(observation))],
    });

    expect(result.state).toBe(state);
  });

  it("returns stale-target before accepting a provider result", async () => {
    const stale = observer(() => Promise.resolve({ kind: "clean", reviewUrl: "https://example.com/review" }));
    stale.readHead = () => Promise.resolve("b".repeat(40));

    const result = await awaitHostedReview({
      schemaVersion: 1,
      handle,
      timeoutMs: 2_000,
      pollIntervalMs: 500,
    }, { clock: clock(), observers: [stale] });

    expect(result).toMatchObject({
      state: "stale-target",
      nextAction: "stop",
      expectedHeadSha: HEAD,
      actualHeadSha: "b".repeat(40),
    });
  });

  it("preserves request identity across repeated bounded calls", async () => {
    const input = { schemaVersion: 1 as const, handle, timeoutMs: 500, pollIntervalMs: 500 };
    const dependencies = {
      clock: clock(),
      observers: [observer(() => Promise.resolve({ kind: "pending" as const }))],
    };

    const first = await awaitHostedReview(input, dependencies);
    const second = await awaitHostedReview(input, { ...dependencies, clock: clock() });

    expect(first.handle).toEqual(handle);
    expect(second.handle).toEqual(handle);
  });

  it.each(["readHead", "observe"] as const)(
    "returns resumable pending when %s is aborted at the bounded deadline",
    async (boundary) => {
      const waitForAbort = (signal: AbortSignal | undefined): Promise<never> => new Promise((_, reject) => {
        if (signal === undefined) return reject(new Error("missing bounded-wait signal"));
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
      const aborted = observer((_handle, options) => boundary === "observe"
        ? waitForAbort(options?.signal)
        : Promise.resolve({ kind: "pending" as const }));
      if (boundary === "readHead") {
        aborted.readHead = (_handle, options) => waitForAbort(options?.signal);
      }

      const result = await awaitHostedReview({
        schemaVersion: 1,
        handle,
        timeoutMs: 5,
        pollIntervalMs: 5,
      }, {
        clock: { now: () => Date.now(), sleep: async () => undefined },
        observers: [aborted],
      });

      expect(result).toMatchObject({
        state: "pending",
        nextAction: "await",
        handle,
      });
    },
  );
});
