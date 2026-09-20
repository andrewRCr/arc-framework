/** GitHub failed-check job and direct-log behavior. */

import { describe, expect, it } from "vitest";

import { createGhFailedCheckLogsPort } from
  "../../../../../../src/scripts/review-gate/hosts/github/failed-check-logs.js";
import type { HostedProcessRunner } from
  "../../../../../../src/scripts/review-gate/hosted/gh-process.js";

const HEAD = "1234567890abcdef1234567890abcdef12345678";

describe("GitHub failed check logs", () => {
  it("resolves exact Actions job bindings and downloads a completed job log directly", async () => {
    const runner: HostedProcessRunner = {
      run: async (args) => {
        const command = args.join(" ");
        if (command.startsWith("pr checks 42 --repo owner/repo")) {
          return {
            stdout: JSON.stringify([
              {
                name: "Integration Tests",
                state: "FAILURE",
                bucket: "fail",
                link: "https://github.com/owner/repo/actions/runs/91/job/92",
              },
              {
                name: "external-check",
                state: "FAILURE",
                bucket: "fail",
                link: "https://checks.example.test/result/7",
              },
            ]),
            stderr: "",
          };
        }
        if (command === "api repos/owner/repo/actions/jobs/92") {
          return {
            stdout: JSON.stringify({
              id: 92,
              run_id: 91,
              head_sha: HEAD,
              name: "Integration Tests",
              status: "completed",
              conclusion: "failure",
              html_url: "https://github.com/owner/repo/actions/runs/91/job/92",
            }),
            stderr: "",
          };
        }
        if (command === "api repos/owner/repo/actions/jobs/92/logs") {
          return { stdout: "failure output\n", stderr: "" };
        }
        throw new Error(`unexpected GitHub command: ${command}`);
      },
    };
    const port = createGhFailedCheckLogsPort(runner);

    const discovery = await port.readFailedJobs("owner/repo", 42, AbortSignal.timeout(1_000));

    expect(discovery).toEqual({
      jobs: [{
        name: "Integration Tests",
        runId: "91",
        jobId: "92",
        headSha: HEAD,
        url: "https://github.com/owner/repo/actions/runs/91/job/92",
      }],
      failures: [{
        name: "external-check",
        url: "https://checks.example.test/result/7",
        reason: "not-github-actions-job",
        detail: "The failed check is not backed by an exact GitHub Actions run and job URL.",
      }],
    });
    await expect(port.readJobLog(
      "owner/repo",
      discovery.jobs[0]!,
      AbortSignal.timeout(1_000),
    )).resolves.toBe("failure output\n");
  });

  it("degrades a completed-job metadata mismatch without fetching its log", async () => {
    const runner: HostedProcessRunner = {
      run: async (args) => {
        const command = args.join(" ");
        if (command.startsWith("pr checks 42 --repo owner/repo")) {
          return {
            stdout: JSON.stringify([{
              name: "Integration Tests",
              state: "FAILURE",
              bucket: "fail",
              link: "https://github.com/owner/repo/actions/runs/91/job/92",
            }]),
            stderr: "",
          };
        }
        if (command === "api repos/owner/repo/actions/jobs/92") {
          return {
            stdout: JSON.stringify({
              id: 92,
              run_id: 99,
              head_sha: HEAD,
              name: "Integration Tests",
              status: "completed",
              conclusion: "failure",
              html_url: "https://github.com/owner/repo/actions/runs/99/job/92",
            }),
            stderr: "",
          };
        }
        throw new Error(`unexpected GitHub command: ${command}`);
      },
    };
    const port = createGhFailedCheckLogsPort(runner);

    await expect(port.readFailedJobs("owner/repo", 42, AbortSignal.timeout(1_000))).resolves.toEqual({
      jobs: [],
      failures: [{
        name: "Integration Tests",
        runId: "91",
        jobId: "92",
        url: "https://github.com/owner/repo/actions/runs/91/job/92",
        reason: "binding-mismatch",
        detail: "Failed check job metadata does not match its exact check-run binding.",
      }],
    });
  });

  it("keeps other failed jobs available when one job returns malformed metadata", async () => {
    const runner: HostedProcessRunner = {
      run: async (args) => {
        const command = args.join(" ");
        if (command.startsWith("pr checks 42 --repo owner/repo")) {
          return {
            stdout: JSON.stringify([
              {
                name: "Integration Tests",
                state: "FAILURE",
                bucket: "fail",
                link: "https://github.com/owner/repo/actions/runs/91/job/92",
              },
              {
                name: "E2E Tests",
                state: "FAILURE",
                bucket: "fail",
                link: "https://github.com/owner/repo/actions/runs/91/job/93",
              },
            ]),
            stderr: "",
          };
        }
        if (command === "api repos/owner/repo/actions/jobs/92") {
          return {
            stdout: JSON.stringify({
              id: 92,
              run_id: 91,
              head_sha: HEAD,
              name: "Integration Tests",
              status: "completed",
              conclusion: "failure",
            }),
            stderr: "",
          };
        }
        if (command === "api repos/owner/repo/actions/jobs/93") {
          return { stdout: JSON.stringify({ id: 93, run_id: 91 }), stderr: "" };
        }
        throw new Error(`unexpected GitHub command: ${command}`);
      },
    };
    const port = createGhFailedCheckLogsPort(runner);

    await expect(port.readFailedJobs("owner/repo", 42, AbortSignal.timeout(1_000))).resolves.toEqual({
      jobs: [{
        name: "Integration Tests",
        runId: "91",
        jobId: "92",
        headSha: HEAD,
        url: "https://github.com/owner/repo/actions/runs/91/job/92",
      }],
      failures: [{
        name: "E2E Tests",
        runId: "91",
        jobId: "93",
        url: "https://github.com/owner/repo/actions/runs/91/job/93",
        reason: "job-unavailable",
        detail: "Failed check job metadata was unavailable: failed-job.status: expected a non-empty string",
      }],
    });
  });
});
