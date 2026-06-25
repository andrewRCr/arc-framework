/**
 * Unit tests for runNotesPushWithRetry — the notes-leg auto-retry primitive.
 *
 * Covers the non-interactive auto-retry loop: a transient failure that resolves
 * on retry never surfaces an offer; a persistent failure exhausts a bounded
 * retry budget and yields a structured retry-offer; terminal (non-transient)
 * outcomes skip auto-retry and surface the offer immediately. The primitive
 * never prompts — it returns the offer for the caller (the agent/workflow
 * layer) to resolve.
 */

import { describe, it, expect } from "vitest";

import type { PairedPushNotesPusherResult } from "../../src/commands/user/types.js";

const {
  runNotesPushWithRetry,
  DEFAULT_NOTES_PUSH_RETRY,
} = await import("../../src/commands/user/notes-push-retry.js");

// --- Test fixtures ---

/**
 * Attempt stub returning a fixed sequence of outcomes, one per call. The last
 * entry repeats once the sequence is exhausted, so a "persistent failure" is a
 * single-element sequence.
 */
function sequenceAttempt(
  outcomes: PairedPushNotesPusherResult[],
): { attempt: () => Promise<PairedPushNotesPusherResult>; count: () => number } {
  let i = 0;
  return {
    attempt: async () => {
      const outcome = outcomes[Math.min(i, outcomes.length - 1)];
      i += 1;
      return outcome!;
    },
    count: () => i,
  };
}

/** Sleep stub that records each delay it was asked to wait, without waiting. */
function recordingSleep(): { sleep: (ms: number) => Promise<void>; delays: number[] } {
  const delays: number[] = [];
  return {
    sleep: async (ms: number) => {
      delays.push(ms);
    },
    delays,
  };
}

describe("runNotesPushWithRetry", () => {
  it("a transient failure that succeeds on auto-retry resolves; no offer is produced", async () => {
    const { attempt, count } = sequenceAttempt([
      { status: "failed", error: new Error("transient blip") },
      { status: "success" },
    ]);
    const { sleep } = recordingSleep();

    const result = await runNotesPushWithRetry(attempt, DEFAULT_NOTES_PUSH_RETRY, sleep);

    expect(result.kind).toBe("resolved");
    expect(result.result).toEqual({ status: "success" });
    expect(result.autoRetries).toBe(1);
    expect(count()).toBe(2);
  });

  it("a persistent transient failure exhausts a bounded budget and surfaces a retry-offer", async () => {
    const lastError = new Error("still down");
    const { attempt, count } = sequenceAttempt([{ status: "failed", error: lastError }]);
    const { sleep, delays } = recordingSleep();

    const result = await runNotesPushWithRetry(
      attempt,
      { maxAutoRetries: 2, backoffMs: [10, 20] },
      sleep,
    );

    expect(result.kind).toBe("retry-offer");
    expect(result.result).toEqual({ status: "failed", error: lastError });
    expect(result.autoRetries).toBe(2);
    // Bounded: one initial attempt + maxAutoRetries, never an unbounded spin.
    expect(count()).toBe(3);
    expect(delays).toEqual([10, 20]);
  });

  it("a non-transient failure skips auto-retry and surfaces the offer immediately", async () => {
    const { attempt, count } = sequenceAttempt([{ status: "no-remote" }]);
    const { sleep, delays } = recordingSleep();

    const result = await runNotesPushWithRetry(
      attempt,
      { maxAutoRetries: 2, backoffMs: [10, 20] },
      sleep,
    );

    expect(result.kind).toBe("retry-offer");
    expect(result.result).toEqual({ status: "no-remote" });
    expect(result.autoRetries).toBe(0);
    expect(count()).toBe(1);
    expect(delays).toEqual([]);
  });
});
