/** GitHub failed-check job discovery and direct log retrieval. */

import type {
  FailedCheckJobBinding,
  FailedCheckLogFailure,
  FailedCheckLogsPort,
} from "../../failed-check-logs.js";
import type { HostedProcessRunner } from "../../hosted/gh-process.js";
import { createGhRequiredChecksPort, githubActionsJobBinding } from "./checks-await.js";

function parse(text: string, path: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(`${path}: malformed JSON`, { cause: error });
  }
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path}: expected an object`);
  }
  return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${path}: expected a non-empty string`);
  }
  return value;
}

function positiveIdentifier(value: unknown, path: string): string {
  if ((typeof value !== "number" && typeof value !== "string")
    || !/^[1-9][0-9]*$/u.test(String(value))) {
    throw new Error(`${path}: expected a positive integer identity`);
  }
  return String(value);
}

function detailFrom(error: unknown): string {
  const value = error instanceof Error ? error.message : String(error);
  return value.replace(/\s+/gu, " ").trim().slice(0, 1_024) || "No diagnostic detail was returned.";
}

function isFailedCheck(bucket: unknown, state: unknown): boolean {
  if (bucket === "fail" || bucket === "cancel") return true;
  return ["FAILURE", "ERROR", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED", "STARTUP_FAILURE"]
    .includes(String(state));
}

function unsupportedFailure(name: string, link: unknown): FailedCheckLogFailure {
  return {
    name,
    ...(typeof link === "string" && link.length > 0 ? { url: link } : {}),
    reason: "not-github-actions-job",
    detail: "The failed check is not backed by an exact GitHub Actions run and job URL.",
  };
}

async function resolveJob(
  runner: HostedProcessRunner,
  repository: string,
  name: string,
  binding: { runId: string; jobId: string; url: string },
  signal: AbortSignal,
): Promise<FailedCheckJobBinding | FailedCheckLogFailure> {
  let value: Record<string, unknown>;
  try {
    value = record(parse((await runner.run([
      "api", `repos/${repository}/actions/jobs/${binding.jobId}`,
    ], { signal })).stdout, "failed-job"), "failed-job");
  } catch (error) {
    return {
      name,
      ...binding,
      reason: "job-unavailable",
      detail: `Failed check job metadata was unavailable: ${detailFrom(error)}`,
    };
  }
  const status = nonEmptyString(value.status, "failed-job.status");
  if (status !== "completed") {
    return {
      name,
      ...binding,
      reason: "job-not-complete",
      detail: `Failed check job is ${status}, not completed.`,
    };
  }
  const metadata = {
    jobId: positiveIdentifier(value.id, "failed-job.id"),
    runId: positiveIdentifier(value.run_id, "failed-job.run_id"),
    headSha: nonEmptyString(value.head_sha, "failed-job.head_sha"),
    name: nonEmptyString(value.name, "failed-job.name"),
    conclusion: nonEmptyString(value.conclusion, "failed-job.conclusion").toLowerCase(),
  };
  const failedConclusions = new Set([
    "failure", "cancelled", "timed_out", "action_required", "startup_failure",
  ]);
  if (metadata.jobId !== binding.jobId
    || metadata.runId !== binding.runId
    || metadata.name !== name
    || !failedConclusions.has(metadata.conclusion)) {
    return {
      name,
      ...binding,
      reason: "binding-mismatch",
      detail: "Failed check job metadata does not match its exact check-run binding.",
    };
  }
  return {
    name,
    runId: binding.runId,
    jobId: binding.jobId,
    headSha: metadata.headSha,
    url: binding.url,
  };
}

/**
 * Build a GitHub CLI-backed failed-check log port.
 *
 * @param runner - Process boundary used for GitHub CLI reads.
 * @returns A port that resolves failed jobs and downloads their logs directly.
 */
export function createGhFailedCheckLogsPort(runner: HostedProcessRunner): FailedCheckLogsPort {
  const target = createGhRequiredChecksPort(runner);
  return {
    resolveRepository: (signal) => target.resolveRepository(signal),
    readHead: (repository, pullRequest, signal) => target.readHead(repository, pullRequest, signal),
    readFailedJobs: async (repository, pullRequest, signal): Promise<{
      jobs: FailedCheckJobBinding[];
      failures: FailedCheckLogFailure[];
    }> => {
      const output = await runner.run([
        "pr", "checks", String(pullRequest), "--repo", repository,
        "--json", "name,state,bucket,link",
      ], { signal, allowFailure: true });
      const values = parse(output.stdout, "failed-checks");
      if (!Array.isArray(values)) throw new Error("failed-checks: expected an array");
      const jobs: FailedCheckJobBinding[] = [];
      const failures: FailedCheckLogFailure[] = [];
      for (const [index, value] of values.entries()) {
        const check = record(value, `failed-checks[${index}]`);
        if (!isFailedCheck(check.bucket, check.state)) continue;
        const name = nonEmptyString(check.name, `failed-checks[${index}].name`);
        const binding = githubActionsJobBinding(repository, check.link);
        if (binding === null) {
          failures.push(unsupportedFailure(name, check.link));
          continue;
        }
        let resolved: FailedCheckJobBinding | FailedCheckLogFailure;
        try {
          resolved = await resolveJob(runner, repository, name, binding, signal);
        } catch (error) {
          resolved = {
            name,
            ...binding,
            reason: "job-unavailable",
            detail: `Failed check job metadata was unavailable: ${detailFrom(error)}`,
          };
        }
        if ("reason" in resolved) failures.push(resolved);
        else jobs.push(resolved);
      }
      return { jobs, failures };
    },
    readJobLog: async (repository, job, signal) => {
      const output = await runner.run([
        "api", `repos/${repository}/actions/jobs/${job.jobId}/logs`,
      ], { signal });
      if (output.stdout.length === 0) throw new Error("The completed failed job returned an empty log.");
      return output.stdout;
    },
  };
}
