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

  it("a deterministic notes conflict skips auto-retry — re-pushing hits the same merge", async () => {
    const { attempt, count } = sequenceAttempt([
      { status: "failed-nontty-conflict", message: "could not auto-merge" },
    ]);
    const { sleep, delays } = recordingSleep();

    const result = await runNotesPushWithRetry(
      attempt,
      { maxAutoRetries: 2, backoffMs: [10, 20] },
      sleep,
    );

    expect(result.kind).toBe("retry-offer");
    expect(result.result).toEqual({ status: "failed-nontty-conflict", message: "could not auto-merge" });
    expect(result.autoRetries).toBe(0);
    expect(count()).toBe(1);
    expect(delays).toEqual([]);
  });

  it("normalizes a rejected attempt into a transient failure rather than throwing", async () => {
    // A delegate that rejects (instead of returning `failed`) must not escape the
    // primitive — otherwise it would abort the paired push after the worktree leg
    // landed, skipping the marker cleanup. The rejection is treated as transient.
    let calls = 0;
    const attempt = async (): Promise<PairedPushNotesPusherResult> => {
      calls += 1;
      if (calls === 1) throw new Error("connection reset");
      return { status: "success" };
    };
    const { sleep } = recordingSleep();

    const result = await runNotesPushWithRetry(attempt, DEFAULT_NOTES_PUSH_RETRY, sleep);

    expect(result.kind).toBe("resolved");
    expect(result.result).toEqual({ status: "success" });
    expect(result.autoRetries).toBe(1);
    expect(calls).toBe(2);
  });

  it("a persistently rejecting attempt surfaces a retry-offer, never throwing", async () => {
    const attempt = async (): Promise<PairedPushNotesPusherResult> => {
      throw new Error("still down");
    };
    const { sleep } = recordingSleep();

    const result = await runNotesPushWithRetry(attempt, { maxAutoRetries: 2, backoffMs: [1, 1] }, sleep);

    expect(result.kind).toBe("retry-offer");
    expect(result.result.status).toBe("failed");
    expect(result.autoRetries).toBe(2);
  });
});
