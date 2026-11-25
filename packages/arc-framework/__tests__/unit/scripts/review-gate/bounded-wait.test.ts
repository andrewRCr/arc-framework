/** Provider-neutral bounded wait behavior. */

import { describe, expect, it } from "vitest";

import { boundedWait, type BoundedWaitClock } from "../../../../src/scripts/review-gate/bounded-wait.js";

describe("bounded wait", () => {
  it.each([0, 75])("observes a completion after the final sleep crosses the deadline by %s ms", async overshoot => {
    let now = 0;
    const result = await boundedWait({
      timeoutMs: 2_000, pollIntervalMs: 500,
      clock: { now: () => now, sleep: async milliseconds => {
        now += milliseconds;
        if (now >= 2_000) now += overshoot;
      } },
      attempt: async ({ signal }) => {
        if (now < 2_000) return { kind: "continue" };
        await new Promise(resolve => setTimeout(resolve, 1));
        signal.throwIfAborted();
        return { kind: "return", value: { state: "complete", observedAt: now } };
      },
      deadline: () => ({ state: "deadline", observedAt: now }),
    });
    expect(result).toEqual({ state: "complete", observedAt: 2_000 + overshoot });
  });

  it("returns the deadline after one final pending observation without another sleep", async () => {
    let now = 0;
    let observations = 0;
    const result = await boundedWait({
      timeoutMs: 2_000, pollIntervalMs: 500,
      clock: { now: () => now, sleep: async milliseconds => { now += milliseconds; } },
      attempt: async () => { observations += 1; return { kind: "continue" }; },
      deadline: elapsedMs => ({ state: "deadline", elapsedMs, observations }),
    });
    expect(result).toEqual({ state: "deadline", elapsedMs: 2_000, observations: 4 });
  });

  it("bounds a final observation that waits for cancellation", async () => {
    let now = 0;
    let finalReadAborted = false;
    const result = await boundedWait({
      timeoutMs: 2_000, pollIntervalMs: 500,
      clock: { now: () => now, sleep: async milliseconds => { now += milliseconds; } },
      attempt: async ({ signal }) => {
        if (now < 2_000) return { kind: "continue" };
        await new Promise<never>((_resolve, reject) => {
          signal.addEventListener("abort", () => { finalReadAborted = true; reject(signal.reason); }, { once: true });
        });
        throw new Error("cancelled observation must reject");
      },
      deadline: elapsedMs => ({ state: "deadline", elapsedMs, finalReadAborted }),
    });
    expect(result).toEqual({ state: "deadline", elapsedMs: 2_000, finalReadAborted: true });
  }, 10_000);

  it("propagates an unrelated timeout from the final observation", async () => {
    let now = 0;
    const failure = new DOMException("provider timed out", "TimeoutError");
    await expect(boundedWait({
      timeoutMs: 2_000, pollIntervalMs: 500,
      clock: { now: () => now, sleep: async milliseconds => { now += milliseconds; } },
      attempt: async () => {
        if (now >= 2_000) throw failure;
        return { kind: "continue" };
      },
      deadline: () => "deadline",
    })).rejects.toBe(failure);
  });

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
