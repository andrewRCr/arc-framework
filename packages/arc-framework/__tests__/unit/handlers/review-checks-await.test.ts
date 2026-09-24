/** Exact-target failure-log behavior at the review checks handler boundary. */

import { describe, expect, it } from "vitest";

import { handleReviewChecksAwait } from "../../../src/handlers/review.js";

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
