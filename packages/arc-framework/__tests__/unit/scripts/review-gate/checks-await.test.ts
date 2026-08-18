/** Exact-head required-check await behavior. */

import { describe, expect, it } from "vitest";

import {
  aggregateChecks,
  awaitRequiredChecks,
  type RequiredCheck,
  type RequiredChecksPort,
} from "../../../../src/scripts/review-gate/checks-await.js";
import type { BoundedWaitClock } from "../../../../src/scripts/review-gate/bounded-wait.js";

const headSha = "a".repeat(40);

function clock(): BoundedWaitClock {
  let now = 0;
  return { now: () => now, sleep: async (milliseconds) => { now += milliseconds; } };
}

function port(checks: RequiredCheck[]): RequiredChecksPort {
  return {
    resolveRepository: async () => "owner/repo",
    readHead: async () => headSha,
    readRequiredChecks: async () => checks,
  };
}

describe("aggregateChecks", () => {
  it.each([
    { checks: [], expected: "not-required" },
    { checks: [{ state: "green" }, { state: "green" }], expected: "green" },
    { checks: [{ state: "green" }, { state: "failed" }, { state: "pending" }], expected: "failed" },
    { checks: [{ state: "green" }, { state: "pending" }], expected: "pending" },
  ] as const)("reduces $expected", ({ checks, expected }) => {
    expect(aggregateChecks(checks)).toBe(expected);
  });
});

describe("required-checks await", () => {
  it.each([
    [[], "not-required", "complete"],
    [[{ name: "build", state: "green" }] satisfies RequiredCheck[], "green", "complete"],
    [[{ name: "build", state: "failed" }] satisfies RequiredCheck[], "failed", "stop"],
  ] as const)("returns typed $state observations", async (checks, state, nextAction) => {
    await expect(awaitRequiredChecks({
      pullRequest: 42,
      headSha,
      timeoutMs: 2_000,
      pollIntervalMs: 500,
    }, { port: port([...checks]), clock: clock() })).resolves.toMatchObject({ state, nextAction });
  });

  it("returns pending at the deadline instead of classifying the yield as failure", async () => {
    await expect(awaitRequiredChecks({
      pullRequest: 42,
      headSha,
      timeoutMs: 2_000,
      pollIntervalMs: 500,
    }, { port: port([{ name: "build", state: "pending" }]), clock: clock() })).resolves.toMatchObject({
      state: "pending",
      nextAction: "await",
      elapsedMs: 2_000,
      checks: [{ name: "build", state: "pending" }],
    });
  });

  it("re-reads the head after the terminal sleep and stops when it moved", async () => {
    let now = 0;
    const terminalClock: BoundedWaitClock = {
      now: () => now,
      sleep: async (milliseconds) => { now += milliseconds; },
    };
    await expect(awaitRequiredChecks({
      pullRequest: 42,
      headSha,
      timeoutMs: 2_000,
      pollIntervalMs: 500,
    }, {
      port: {
        ...port([{ name: "build", state: "pending" }]),
        readHead: async () => now < 2_000 ? headSha : "b".repeat(40),
      },
      clock: terminalClock,
    })).resolves.toMatchObject({
      state: "stale-target",
      nextAction: "stop",
      actualHeadSha: "b".repeat(40),
    });
  });

  it("stops when the pull-request head moves before reading checks", async () => {
    await expect(awaitRequiredChecks({
      pullRequest: 42,
      headSha,
      timeoutMs: 2_000,
      pollIntervalMs: 500,
    }, {
      port: { ...port([]), readHead: async () => "b".repeat(40) },
      clock: clock(),
    })).resolves.toMatchObject({
      state: "stale-target",
      nextAction: "stop",
      headSha,
      actualHeadSha: "b".repeat(40),
    });
  });
});
