import { describe, expect, it } from "vitest";

import {
  runAwait,
  type AwaitClock,
  type AwaitHostPort,
  type AwaitTransition,
  type ReviewAwaitState,
  type WaitRead,
} from "../../../../../src/scripts/review-gate/runtime/await.js";

const HEAD = "a".repeat(40);

class FakeClock implements AwaitClock {
  current = 0;
  sleeps: number[] = [];

  now(): number { return this.current; }

  sleep(milliseconds: number): Promise<void> {
    this.sleeps.push(milliseconds);
    this.current += milliseconds;
    return Promise.resolve();
  }
}

function sequence<T>(values: WaitRead<T>[]): () => Promise<WaitRead<T>> {
  let index = 0;
  return async () => values[Math.min(index++, values.length - 1)] ?? { kind: "malformed-projection" };
}

function port(input: {
  heads?: WaitRead<string>[];
  ci?: WaitRead<"pending" | "failure" | "success">[];
  review?: WaitRead<ReviewAwaitState>[];
}): AwaitHostPort {
  return {
    readPullRequestHead: sequence(input.heads ?? [{ kind: "ok", value: HEAD }]),
    readCiState: sequence(input.ci ?? [{ kind: "ok", value: "pending" }]),
    readReviewState: sequence(input.review ?? [{ kind: "ok", value: { conclusion: "pending", blockerCodes: [], ledgerVersion: 1, receiptRefs: [] } }]),
  };
}

const base = {
  repositoryRef: "owner/repo",
  pullRequestNumber: 7,
  expectedHeadSha: HEAD,
  intervalMs: 1_000,
  timeoutMs: 10_000,
} as const;

describe("passive review-gate await state machine", () => {
  it("emits only changed normalized states and returns success", async () => {
    const clock = new FakeClock();
    const transitions: AwaitTransition[] = [];
    const result = await runAwait({
      ...base,
      kind: "ci",
      host: port({ ci: [
        { kind: "ok", value: "pending" },
        { kind: "ok", value: "pending" },
        { kind: "ok", value: "success" },
      ] }),
      clock,
      backoff: (_attempt, interval) => interval,
      output: { emit: async (transition) => { transitions.push(transition); } },
    });

    expect(transitions.map((item) => item.state)).toEqual([
      { conclusion: "pending" },
      { conclusion: "success" },
    ]);
    expect(result).toMatchObject({ kind: "success", waitKind: "ci", expectedHeadSha: HEAD });
    expect(clock.sleeps).toEqual([1_000, 1_000]);
  });

  it("returns typed failure and stale-head terminals", async () => {
    const failure = await runAwait({
      ...base,
      kind: "review",
      host: port({ review: [{ kind: "ok", value: { conclusion: "failure", blockerCodes: ["open-findings"], ledgerVersion: 4, receiptRefs: ["receipt:1"] } }] }),
      clock: new FakeClock(),
      backoff: () => 1_000,
      output: { emit: async () => undefined },
    });
    expect(failure).toMatchObject({ kind: "failure", state: { blockerCodes: ["open-findings"], ledgerVersion: 4 } });

    const stale = await runAwait({
      ...base,
      kind: "ci",
      host: port({ heads: [{ kind: "ok", value: "b".repeat(40) }] }),
      clock: new FakeClock(),
      backoff: () => 1_000,
      output: { emit: async () => undefined },
    });
    expect(stale).toEqual({ kind: "stale-head", waitKind: "ci", expectedHeadSha: HEAD, actualHeadSha: "b".repeat(40) });
  });

  it.each(["authentication-failure", "host-failure", "malformed-projection"] as const)(
    "returns the %s attention terminal",
    async (kind) => {
      const result = await runAwait({
        ...base,
        kind: "review",
        host: port({ review: [{ kind }] }),
        clock: new FakeClock(),
        backoff: () => 1_000,
        output: { emit: async () => undefined },
      });
      expect(result).toEqual({ kind, waitKind: "review", expectedHeadSha: HEAD });
    },
  );

  it("bounds backoff by the timeout and returns a typed timeout", async () => {
    const clock = new FakeClock();
    const result = await runAwait({
      ...base,
      kind: "ci",
      timeoutMs: 2_500,
      host: port({}),
      clock,
      backoff: (attempt, interval) => interval * (attempt + 1),
      output: { emit: async () => undefined },
    });
    expect(clock.sleeps).toEqual([1_000, 1_500]);
    expect(result).toEqual({ kind: "timeout", waitKind: "ci", expectedHeadSha: HEAD, elapsedMs: 2_500 });
  });
});
