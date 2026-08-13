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

  it("maps a deadline abort through the same deadline result", async () => {
    const clock: BoundedWaitClock = {
      now: () => 250,
      sleep: async () => undefined,
    };

    await expect(boundedWait({
      timeoutMs: 2_000,
      pollIntervalMs: 500,
      clock,
      attempt: async () => { throw new DOMException("timed out", "TimeoutError"); },
      deadline: (elapsedMs) => ({ state: "deadline" as const, elapsedMs }),
    })).resolves.toEqual({ state: "deadline", elapsedMs: 0 });
  });
});
