import { describe, expect, it, vi } from "vitest";

import { DeliveryReviewMemberVehicleSchema } from
  "../../../../../src/lib/delivery/review-vehicle.js";
import {
  HostedAwaitResultSchema,
  HostedReviewBodyFindingSchema,
  HostedThreadFindingSchema,
  awaitHostedReview,
  type HostedAwaitClock,
  type HostedReviewObserver,
} from "../../../../../src/scripts/review-gate/hosted/await.js";
import { createHostedHandleFixture } from "../../../../fixtures/hosted-review.js";

const HEAD = "a".repeat(40);
const handle = createHostedHandleFixture({
  target: { repository: "owner/repo", pullRequest: 42, headSha: HEAD },
  artifact: {
    kind: "issue-comment",
    id: "IC_kwDO123",
    url: "https://github.com/owner/repo/pull/42#issuecomment-1",
    createdAt: "2026-07-23T12:00:00.000Z",
  },
});
const deliveryVehicle = DeliveryReviewMemberVehicleSchema.parse({
    kind: "delivery-member",
    planId: "123e4567-e89b-12d3-a456-426614174000",
    deliverableId: `sha256:${"d".repeat(64)}`,
    workUnitId: "example",
    head: HEAD,
});
const deliveryHandle = createHostedHandleFixture({
  target: handle.target,
  artifact: handle.artifact,
  vehicle: deliveryVehicle,
});

const CREATED_AT_MS = Date.parse(handle.artifact.createdAt);
const ATTENTION_AFTER_MS = 15 * 60 * 1_000;

function clock(startAt = CREATED_AT_MS): HostedAwaitClock {
  let now = startAt;
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

  it.each([
    [HostedThreadFindingSchema, {
      findingId: "PRRT_1",
      origin: "review-thread",
      commentId: "PRRC_1",
      threadId: "PRRT_1",
      settlement: "reply-and-resolve",
      locus: "src/index.ts:7",
      url: "https://github.com/owner/repo/pull/42#discussion_r1",
    }],
    [HostedReviewBodyFindingSchema, {
      findingId: "PRR_1:0",
      origin: "review-body",
      reviewId: "PRR_1",
      fingerprint: "finding-fingerprint",
      settlement: "not-applicable",
      locus: "src/index.ts:7",
      url: "https://github.com/owner/repo/pull/42#pullrequestreview-1",
      body: "Finding body",
    }],
  ] as const)("accepts critical and rejects retired blocker in hosted finding schemas", (schema, finding) => {
    expect(schema.safeParse({ ...finding, severity: "critical" }).success).toBe(true);
    expect(schema.safeParse({ ...finding, severity: "blocker" }).success).toBe(false);
  });

  it("accepts a pending result that asks for inspection or an explicit extension", () => {
    expect(HostedAwaitResultSchema.safeParse({
      schemaVersion: 1,
      mode: "review-hosted-await",
      handle,
      action: { schemaVersion: 1, handle },
      state: "pending",
      nextAction: "inspect-or-extend",
      ageMs: ATTENTION_AFTER_MS,
      attentionAfterMs: ATTENTION_AFTER_MS,
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
      attentionAfterMs: ATTENTION_AFTER_MS,
      observers: [observer(() => Promise.resolve({ kind: "pending" }))],
    });

    expect(result).toMatchObject({
      state: "pending",
      nextAction: "await",
      handle,
      action: { schemaVersion: 1, handle },
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
      attentionAfterMs: ATTENTION_AFTER_MS,
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
    }, { clock: clock(), attentionAfterMs: ATTENTION_AFTER_MS, observers: [stale] });

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
      attentionAfterMs: ATTENTION_AFTER_MS,
      observers: [observer(() => Promise.resolve({ kind: "pending" as const }))],
    };

    const first = await awaitHostedReview(input, dependencies);
    const second = await awaitHostedReview(input, { ...dependencies, clock: clock() });

    expect(first.handle).toEqual(handle);
    expect(second.handle).toEqual(handle);
  });

  it("round-trips the exact delivery selector through a terminal await result", async () => {
    const result = await awaitHostedReview({
      schemaVersion: 1,
      handle: deliveryHandle,
      timeoutMs: 500,
      pollIntervalMs: 500,
    }, {
      clock: clock(),
      attentionAfterMs: ATTENTION_AFTER_MS,
      observers: [observer(() => Promise.resolve({
        kind: "clean",
        reviewUrl: "https://github.com/owner/repo/pull/42#pullrequestreview-2",
      }))],
    });

    expect(result).toMatchObject({ state: "clean", handle: deliveryHandle });
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
        attentionAfterMs: Number.MAX_SAFE_INTEGER,
        observers: [aborted],
      });

      expect(result).toMatchObject({
        state: "pending",
        nextAction: "await",
        handle,
      });
    },
  );

  it("checks once and requests attention after unattended waiting reaches its limit", async () => {
    const observe = vi.fn(() => Promise.resolve({ kind: "pending" as const }));
    const result = await awaitHostedReview({
      schemaVersion: 1,
      handle,
      timeoutMs: 2_000,
      pollIntervalMs: 500,
    }, {
      clock: clock(CREATED_AT_MS + ATTENTION_AFTER_MS),
      attentionAfterMs: ATTENTION_AFTER_MS,
      observers: [observer(observe)],
    });

    expect(result).toMatchObject({
      state: "pending",
      nextAction: "inspect-or-extend",
      handle,
      action: { schemaVersion: 1, handle },
      ageMs: ATTENTION_AFTER_MS,
      attentionAfterMs: ATTENTION_AFTER_MS,
    });
    expect(observe).toHaveBeenCalledOnce();
  });

  it("accepts a completed result from the same handle after attention was requested", async () => {
    const input = { schemaVersion: 1 as const, handle, timeoutMs: 500, pollIntervalMs: 500 };
    const replay = await awaitHostedReview(input, {
      clock: clock(CREATED_AT_MS + ATTENTION_AFTER_MS + 60_000),
      attentionAfterMs: ATTENTION_AFTER_MS,
      observers: [observer(() => Promise.resolve({
        kind: "clean" as const,
        reviewUrl: "https://github.com/owner/repo/pull/42#pullrequestreview-2",
      }))],
    });

    expect(replay).toMatchObject({
      state: "clean",
      nextAction: "complete",
      handle,
    });
  });

  it("caps automatic waiting at the remaining unattended interval", async () => {
    const observe = vi.fn(() => Promise.resolve({ kind: "pending" as const }));
    const result = await awaitHostedReview({
      schemaVersion: 1,
      handle,
      timeoutMs: 2_000,
      pollIntervalMs: 500,
    }, {
      clock: clock(CREATED_AT_MS + ATTENTION_AFTER_MS - 500),
      attentionAfterMs: ATTENTION_AFTER_MS,
      observers: [observer(observe)],
    });

    expect(result).toMatchObject({
      state: "pending",
      nextAction: "inspect-or-extend",
      ageMs: ATTENTION_AFTER_MS,
    });
    expect(observe).toHaveBeenCalledOnce();
  });

  it("allows one explicitly extended bounded call without resetting request identity", async () => {
    const observe = vi.fn(() => Promise.resolve({ kind: "pending" as const }));
    const result = await awaitHostedReview({
      schemaVersion: 1,
      handle,
      timeoutMs: 2_000,
      pollIntervalMs: 500,
      continueAfterAttention: true,
    }, {
      clock: clock(CREATED_AT_MS + ATTENTION_AFTER_MS),
      attentionAfterMs: ATTENTION_AFTER_MS,
      observers: [observer(observe)],
    });

    expect(result).toMatchObject({
      state: "pending",
      nextAction: "inspect-or-extend",
      handle,
      ageMs: ATTENTION_AFTER_MS + 2_000,
    });
    expect(observe).toHaveBeenCalledTimes(3);
  });
});
