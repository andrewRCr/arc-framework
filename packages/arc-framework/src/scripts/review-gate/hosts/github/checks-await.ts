/** GitHub required-check observations for one pull request. */

import type { HostedProcessRunner } from "../../hosted/gh-process.js";
import type { RequiredCheck, RequiredChecksPort } from "../../checks-await.js";

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

function checkState(bucket: unknown, state: unknown, path: string): RequiredCheck["state"] {
  if (bucket === "pass" || bucket === "skipping") return "green";
  if (bucket === "fail" || bucket === "cancel") return "failed";
  if (bucket === "pending") return "pending";
  if (["SUCCESS", "SKIPPED", "NEUTRAL"].includes(String(state))) return "green";
  if (["FAILURE", "ERROR", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED"].includes(String(state))) return "failed";
  if (["PENDING", "EXPECTED", "QUEUED", "IN_PROGRESS"].includes(String(state))) return "pending";
  throw new Error(`${path}: unsupported check state`);
}

/** Build a GitHub CLI-backed required-check port. */
export function createGhRequiredChecksPort(runner: HostedProcessRunner): RequiredChecksPort {
  return {
    resolveRepository: async () => {
      const value = record(parse(
        (await runner.run(["repo", "view", "--json", "nameWithOwner"])).stdout,
        "repository",
      ), "repository");
      if (typeof value.nameWithOwner !== "string" || value.nameWithOwner === "") {
        throw new Error("repository.nameWithOwner: expected a non-empty string");
      }
      return value.nameWithOwner;
    },
    readHead: async (repository, pullRequest, signal) => {
      const value = record(parse((await runner.run([
        "api", `repos/${repository}/pulls/${pullRequest}`,
      ], { signal })).stdout, "pull-request"), "pull-request");
      const head = record(value.head, "pull-request.head");
      if (typeof head.sha !== "string" || !/^[0-9a-f]{40}$/u.test(head.sha)) {
        throw new Error("pull-request.head.sha: expected a 40-hex object id");
      }
      return head.sha;
    },
    readRequiredChecks: async (repository, pullRequest, signal) => {
      const result = await runner.run([
        "pr", "checks", String(pullRequest), "--repo", repository, "--required",
        "--json", "name,state,bucket",
      ], { signal, allowFailure: true });
      if (result.stdout.trim() === "" && /no required checks reported/iu.test(result.stderr)) return [];
      const value = parse(result.stdout, "required-checks");
      if (!Array.isArray(value)) throw new Error("required-checks: expected an array");
      return value.map((item, index) => {
        const check = record(item, `required-checks[${index}]`);
        if (typeof check.name !== "string" || check.name === "") {
          throw new Error(`required-checks[${index}].name: expected a non-empty string`);
        }
        return { name: check.name, state: checkState(check.bucket, check.state, `required-checks[${index}]`) };
      });
    },
  };
}
