/** Exact-target failed-check log retrieval behavior. */

import { describe, expect, it } from "vitest";

import {
  retrieveFailedCheckLogs,
  type FailedCheckJobBinding,
  type FailedCheckLogStore,
  type FailedCheckLogsPort,
} from "../../../../src/scripts/review-gate/failed-check-logs.js";

const HEAD = "1234567890abcdef1234567890abcdef12345678";
const MOVED_HEAD = "abcdef1234567890abcdef1234567890abcdef12";

function failedJob(jobId = "92"): FailedCheckJobBinding {
  return {
    name: "Integration Tests",
    runId: "91",
    jobId,
    headSha: HEAD,
    url: `https://github.com/owner/repo/actions/runs/91/job/${jobId}`,
  };
}

function materializingStore(): FailedCheckLogStore {
  return {
    materialize: async (entries) => entries.map(({ job, log }) => ({
      ...job,
      path: `/tmp/job-${job.jobId}-${log.length}.log`,
    })),
  };
}

describe("failed check logs", () => {
  it("returns no diagnostics when the exact target has no failed jobs", async () => {
    const port: FailedCheckLogsPort = {
      resolveRepository: async () => "owner/repo",
      readHead: async () => HEAD,
      readFailedJobs: async () => ({ jobs: [], failures: [] }),
      readJobLog: async () => { throw new Error("no job log should be read"); },
    };
    const store: FailedCheckLogStore = {
      materialize: async () => { throw new Error("no logs should be materialized"); },
    };

    await expect(retrieveFailedCheckLogs(
      { repository: "owner/repo", pullRequest: 42, headSha: HEAD },
      { port, store, signal: AbortSignal.timeout(1_000) },
    )).resolves.toEqual({
      schemaVersion: 1,
      mode: "review-failed-check-logs",
      repository: "owner/repo",
      pullRequest: 42,
      headSha: HEAD,
      state: "none",
      nextAction: "complete",
      logs: [],
      failures: [],
    });
  });

  it("materializes a completed failed job bound to the exact pull-request head", async () => {
    const job = failedJob();
    const port: FailedCheckLogsPort = {
      resolveRepository: async () => "owner/repo",
      readHead: async () => HEAD,
      readFailedJobs: async () => ({ jobs: [job], failures: [] }),
      readJobLog: async () => "failure output\n",
    };
    const store = materializingStore();

    await expect(retrieveFailedCheckLogs(
      { repository: "owner/repo", pullRequest: 42, headSha: HEAD },
      { port, store, signal: AbortSignal.timeout(1_000) },
    )).resolves.toEqual({
      schemaVersion: 1,
      mode: "review-failed-check-logs",
      repository: "owner/repo",
      pullRequest: 42,
      headSha: HEAD,
      state: "retrieved",
      nextAction: "inspect",
      logs: [{ ...job, path: "/tmp/job-92-15.log" }],
      failures: [],
    });
  });

  it("refuses a repository mismatch before reading failed jobs", async () => {
    const port: FailedCheckLogsPort = {
      resolveRepository: async () => "other/repo",
      readHead: async () => { throw new Error("head must not be read"); },
      readFailedJobs: async () => { throw new Error("jobs must not be read"); },
      readJobLog: async () => { throw new Error("logs must not be read"); },
    };

    const result = await retrieveFailedCheckLogs(
      { repository: "owner/repo", pullRequest: 42, headSha: HEAD },
      { port, store: materializingStore(), signal: AbortSignal.timeout(1_000) },
    );

    expect(result).toEqual({
      schemaVersion: 1,
      mode: "review-failed-check-logs",
      repository: "owner/repo",
      pullRequest: 42,
      headSha: HEAD,
      state: "target-mismatch",
      nextAction: "stop",
      actualRepository: "other/repo",
    });
  });

  it("refuses when the pull-request head moves after failed-job discovery", async () => {
    let headRead = 0;
    const port: FailedCheckLogsPort = {
      resolveRepository: async () => "owner/repo",
      readHead: async () => {
        headRead += 1;
        return headRead === 1 ? HEAD : MOVED_HEAD;
      },
      readFailedJobs: async () => ({ jobs: [failedJob()], failures: [] }),
      readJobLog: async () => { throw new Error("logs must not be read after movement"); },
    };
    const store: FailedCheckLogStore = {
      materialize: async () => { throw new Error("moved-target logs must not be materialized"); },
    };

    const result = await retrieveFailedCheckLogs(
      { repository: "owner/repo", pullRequest: 42, headSha: HEAD },
      { port, store, signal: AbortSignal.timeout(1_000) },
    );

    expect(result).toEqual({
      schemaVersion: 1,
      mode: "review-failed-check-logs",
      repository: "owner/repo",
      pullRequest: 42,
      headSha: HEAD,
      state: "stale-target",
      nextAction: "stop",
      actualHeadSha: MOVED_HEAD,
    });
  });

  it("surfaces available logs alongside explicitly unsupported failed checks", async () => {
    const job = failedJob();
    const port: FailedCheckLogsPort = {
      resolveRepository: async () => "owner/repo",
      readHead: async () => HEAD,
      readFailedJobs: async () => ({
        jobs: [job],
        failures: [{
          name: "external-check",
          reason: "not-github-actions-job",
          detail: "The failed check is not backed by a GitHub Actions job.",
        }],
      }),
      readJobLog: async () => "failure output\n",
    };

    const result = await retrieveFailedCheckLogs(
      { repository: "owner/repo", pullRequest: 42, headSha: HEAD },
      { port, store: materializingStore(), signal: AbortSignal.timeout(1_000) },
    );

    expect(result).toEqual({
      schemaVersion: 1,
      mode: "review-failed-check-logs",
      repository: "owner/repo",
      pullRequest: 42,
      headSha: HEAD,
      state: "partial",
      nextAction: "inspect-or-retry",
      logs: [{ ...job, path: "/tmp/job-92-15.log" }],
      failures: [{
        name: "external-check",
        reason: "not-github-actions-job",
        detail: "The failed check is not backed by a GitHub Actions job.",
      }],
    });
  });

  it("degrades explicitly when a completed failed job log is unavailable", async () => {
    const job = failedJob();
    const port: FailedCheckLogsPort = {
      resolveRepository: async () => "owner/repo",
      readHead: async () => HEAD,
      readFailedJobs: async () => ({ jobs: [job], failures: [] }),
      readJobLog: async () => { throw new Error("HTTP 404: log is not ready"); },
    };

    const result = await retrieveFailedCheckLogs(
      { repository: "owner/repo", pullRequest: 42, headSha: HEAD },
      { port, store: materializingStore(), signal: AbortSignal.timeout(1_000) },
    );

    expect(result).toEqual({
      schemaVersion: 1,
      mode: "review-failed-check-logs",
      repository: "owner/repo",
      pullRequest: 42,
      headSha: HEAD,
      state: "unavailable",
      nextAction: "retry",
      cause: "provider",
      detail: "No completed failed-job log was available for the exact target.",
      logs: [],
      failures: [{
        name: job.name,
        runId: job.runId,
        jobId: job.jobId,
        url: job.url,
        reason: "log-unavailable",
        detail: "Failed-job log was unavailable: HTTP 404: log is not ready",
      }],
    });
  });

  it("reports local materialization failure without claiming log availability", async () => {
    const port: FailedCheckLogsPort = {
      resolveRepository: async () => "owner/repo",
      readHead: async () => HEAD,
      readFailedJobs: async () => ({ jobs: [failedJob()], failures: [] }),
      readJobLog: async () => "failure output\n",
    };
    const store: FailedCheckLogStore = {
      materialize: async () => { throw new Error("temporary directory is read-only"); },
    };

    const result = await retrieveFailedCheckLogs(
      { repository: "owner/repo", pullRequest: 42, headSha: HEAD },
      { port, store, signal: AbortSignal.timeout(1_000) },
    );

    expect(result).toEqual({
      schemaVersion: 1,
      mode: "review-failed-check-logs",
      repository: "owner/repo",
      pullRequest: 42,
      headSha: HEAD,
      state: "unavailable",
      nextAction: "retry",
      cause: "local-storage",
      detail: "Failed-job logs could not be materialized: temporary directory is read-only",
      logs: [],
      failures: [],
    });
  });
});
