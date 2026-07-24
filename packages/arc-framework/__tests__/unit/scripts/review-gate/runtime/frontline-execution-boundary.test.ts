import { describe, expect, it } from "vitest";

import {
  executeBoundedFrontlineCarrier,
} from "../../../../../src/scripts/review-gate/runtime/frontline-execution-boundary.js";

describe("bounded frontline execution", () => {
  it("passes remaining time and an abort signal that expires a hung carrier", async () => {
    const observed = await executeBoundedFrontlineCarrier({
      timeoutMs: 10,
      execute: ({ remainingMs, signal }) => new Promise<{ remainingMs: number; aborted: boolean }>((resolve) => {
        signal.addEventListener("abort", () => {
          resolve({ remainingMs, aborted: signal.aborted });
        }, { once: true });
      }),
    });

    expect(observed.aborted).toBe(true);
    expect(observed.remainingMs).toBeGreaterThan(0);
    expect(observed.remainingMs).toBeLessThanOrEqual(10);
  });
});
