/** Provider-neutral bounded wait behavior. */

import { describe, expect, it } from "vitest";

import { boundedWait, type BoundedWaitClock } from "../../../../src/scripts/review-gate/bounded-wait.js";

describe("bounded wait", () => {
  it("backs off within the deadline and returns a distinguishable deadline value", async () => {
    let now = 0;
    const sleeps: number[] = [];
    const clock: BoundedWaitClock = {
      now: () => now,
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
        now += milliseconds;
      },
    };

    const result = await boundedWait({
      timeoutMs: 2_000,
      pollIntervalMs: 500,
      clock,
      attempt: async () => ({ kind: "continue" }),
      deadline: (elapsedMs) => ({ state: "deadline" as const, elapsedMs }),
    });

    expect(result).toEqual({ state: "deadline", elapsedMs: 2_000 });
    expect(sleeps).toEqual([500, 1_000, 500]);
  });

  it("maps only its own deadline abort through the deadline result", async () => {
    const clock: BoundedWaitClock = {
      now: () => Date.now(),
      sleep: async () => undefined,
    };

    const result = await boundedWait({
      timeoutMs: 5,
      pollIntervalMs: 500,
      clock,
      attempt: async ({ signal }) => await new Promise((_, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      }),
      deadline: (elapsedMs) => ({ state: "deadline" as const, elapsedMs }),
    });

    expect(result.state).toBe("deadline");
  });

  it("does not mistake a provider TimeoutError for its own deadline", async () => {
    const providerTimeout = new DOMException("provider timed out", "TimeoutError");
    await expect(boundedWait({
      timeoutMs: 2_000,
      pollIntervalMs: 500,
      clock: { now: () => 250, sleep: async () => undefined },
      attempt: async () => { throw providerTimeout; },
      deadline: () => ({ state: "deadline" as const }),
    })).rejects.toBe(providerTimeout);
  });
});
