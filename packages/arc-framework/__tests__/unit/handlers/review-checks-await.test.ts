/** Timing composition and exact-target failure-log behavior at the review checks handler boundary. */

import { describe, expect, it } from "vitest";

import { handleReviewChecksAwait, type ReviewChecksAwaitOptions } from "../../../src/handlers/review.js";

const configuredTiming = async () => ({
  "review.checks_await_timeout_seconds": "900",
  "review.checks_await_initial_poll_interval_seconds": "5",
});

describe("handleReviewChecksAwait exact-target log stops", () => {
  const headSha = "a".repeat(40);

  it.each([
    {
      label: "stale failed-log target",
      failureLogs: {
        schemaVersion: 1 as const,
        mode: "review-failed-check-logs" as const,
        repository: "owner/repo",
        pullRequest: 42,
        headSha,
        state: "stale-target" as const,
        nextAction: "stop" as const,
        actualHeadSha: "b".repeat(40),
      },
      expected: {
        state: "stale-target",
        nextAction: "stop",
        actualHeadSha: "b".repeat(40),
      },
    },
    {
      label: "mismatched failed-log repository",
      failureLogs: {
        schemaVersion: 1 as const,
        mode: "review-failed-check-logs" as const,
        repository: "owner/repo",
        pullRequest: 42,
        headSha,
        state: "target-mismatch" as const,
        nextAction: "stop" as const,
        actualRepository: "other/repo",
      },
      expected: {
        state: "target-mismatch",
        nextAction: "stop",
        actualRepository: "other/repo",
      },
    },
  ])("promotes a $label to the command result", async ({ failureLogs, expected }) => {
    const output: string[] = [];
    await handleReviewChecksAwait({
      repository: "owner/repo",
      pullRequest: "42",
      headSha,
      timeoutMs: "2000",
      pollIntervalMs: "500",
    }, {
      readTimingSettings: configuredTiming,
      awaitChecks: async () => ({
        schemaVersion: 1,
        mode: "review-checks-await",
        repository: "owner/repo",
        pullRequest: 42,
        headSha,
        state: "pending",
        nextAction: "await",
        checks: [{ name: "merge-ok", state: "pending" }],
        diagnosticFailures: [{ name: "Integration Tests", state: "failed" }],
        elapsedMs: 500,
      }),
      retrieveFailureLogs: async () => failureLogs,
      write: (text) => output.push(text),
      setExitCode: () => { throw new Error("typed target stops must not set an exit code"); },
    });

    const result: unknown = JSON.parse(output.join(""));
    expect(result).toMatchObject(expected);
    expect(result).not.toHaveProperty("failureLogs");
  });
});

describe("handleReviewChecksAwait timing", () => {
  const target = { repository: "owner/repo", pullRequest: "42", headSha: "a".repeat(40) };

  async function run(options: ReviewChecksAwaitOptions, timeoutSeconds = "900") {
    const output: string[] = [];
    const awaited: { timeoutMs: number; pollIntervalMs: number }[] = [];
    let exitCode: number | undefined;
    await handleReviewChecksAwait(options, {
      readTimingSettings: async () => ({
        "review.checks_await_timeout_seconds": timeoutSeconds,
        "review.checks_await_initial_poll_interval_seconds": "5",
      }),
      awaitChecks: async (input) => {
        awaited.push({ timeoutMs: input.timeoutMs, pollIntervalMs: input.pollIntervalMs });
        return {
          schemaVersion: 1,
          mode: "review-checks-await",
          repository: input.repository,
          pullRequest: input.pullRequest,
          headSha: input.headSha,
          state: "green",
          nextAction: "complete",
          checks: [{ name: "merge-ok", state: "green" }],
        };
      },
      write: (text) => output.push(text),
      setExitCode: (code) => { exitCode = code; },
    });
    return { awaited, exitCode, result: JSON.parse(output.join("")) as unknown };
  }

  it.each([
    { label: "takes the configured bound when no flag is given", flags: {}, expected: [900_000, 5_000] },
    {
      label: "lets both flags override the configured bound",
      flags: { timeoutMs: "10000", pollIntervalMs: "10000" },
      expected: [10_000, 10_000],
    },
    { label: "caps the configured interval to a shorter flagged bound", flags: { timeoutMs: "2000" }, expected: [2_000, 2_000] },
  ])("$label", async ({ flags, expected }) => {
    const { awaited, exitCode } = await run({ ...target, ...flags });
    expect(awaited).toEqual([{ timeoutMs: expected[0], pollIntervalMs: expected[1] }]);
    expect(exitCode).toBeUndefined();
  });

  it.each([
    {
      label: "an invalid configured bound",
      flags: {},
      timeoutSeconds: "0",
      detail: "Invalid required-check await timing setting: review.checks_await_timeout_seconds",
    },
    {
      label: "a flagged interval longer than its bound",
      flags: { timeoutMs: "1000", pollIntervalMs: "2000" },
      timeoutSeconds: "900",
      detail: "--poll-interval-ms must not exceed --timeout-ms",
    },
  ])("refuses $label as invalid input without waiting", async ({ flags, timeoutSeconds, detail }) => {
    const { awaited, exitCode, result } = await run({ ...target, ...flags }, timeoutSeconds);
    expect(awaited).toEqual([]);
    expect(exitCode).toBe(64);
    expect(result).toMatchObject({ state: "blocked", nextAction: "stop", reason: "invalid-input", detail });
  });
});
