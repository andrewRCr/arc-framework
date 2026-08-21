/** GitHub required-check observations for one pull request. */

import type { HostedProcessRunner } from "../../hosted/gh-process.js";
import type { RequiredCheck, RequiredChecksPort } from "../../checks-await.js";
import { GitObjectIdSchema } from "../../core/gate-contract-v2-schema.js";

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

function string(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${path}: expected a non-empty string`);
  }
  return value;
}

function stringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${path}: expected an array`);
  return value.map((item, index) => string(item, `${path}[${index}]`));
}

function pullRequestBaseRef(value: unknown): string {
  const pullRequest = record(value, "pull-request");
  const base = record(pullRequest.base, "pull-request.base");
  return string(base.ref, "pull-request.base.ref");
}

function pullRequestHeadSha(value: unknown): string {
  const pullRequest = record(value, "pull-request");
  const head = record(pullRequest.head, "pull-request.head");
  if (typeof head.sha !== "string" || !GitObjectIdSchema.safeParse(head.sha).success) {
    throw new Error("pull-request.head.sha: expected a 40-hex object id");
  }
  return head.sha;
}

function classicRequiredContexts(value: unknown): string[] {
  const branch = record(value, "branch");
  if (branch.protection === undefined || branch.protection === null) return [];
  const protection = record(branch.protection, "branch.protection");
  if (protection.required_status_checks === undefined || protection.required_status_checks === null) return [];
  const checks = record(protection.required_status_checks, "branch.protection.required_status_checks");
  return checks.contexts === undefined
    ? []
    : stringArray(checks.contexts, "branch.protection.required_status_checks.contexts");
}

function rulesetRequiredContexts(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error("branch-rules: expected page array");
  return value.flatMap((page, pageIndex) => {
    if (!Array.isArray(page)) throw new Error(`branch-rules[${pageIndex}]: expected an array page`);
    return page.flatMap((item, ruleIndex) => {
      const rule = record(item, `branch-rules[${pageIndex}][${ruleIndex}]`);
      if (rule.type !== "required_status_checks") return [];
      const parameters = record(
        rule.parameters,
        `branch-rules[${pageIndex}][${ruleIndex}].parameters`,
      );
      if (!Array.isArray(parameters.required_status_checks)) {
        throw new Error(
          `branch-rules[${pageIndex}][${ruleIndex}].parameters.required_status_checks: expected an array`,
        );
      }
      return parameters.required_status_checks.map((entry, checkIndex) => string(
        record(
          entry,
          `branch-rules[${pageIndex}][${ruleIndex}].parameters.required_status_checks[${checkIndex}]`,
        ).context,
        `branch-rules[${pageIndex}][${ruleIndex}].parameters.required_status_checks[${checkIndex}].context`,
      ));
    });
  });
}

function mergeConfiguredChecks(
  observed: readonly RequiredCheck[],
  configuredContexts: readonly string[],
): RequiredCheck[] {
  const result = [...observed];
  const observedNames = new Set(observed.map(({ name }) => name));
  for (const context of configuredContexts) {
    if (observedNames.has(context)) continue;
    observedNames.add(context);
    result.push({ name: context, state: "pending" });
  }
  return result;
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
  async function readPullRequest(
    repository: string,
    pullRequest: number,
    signal: AbortSignal,
  ): Promise<unknown> {
    return parse((await runner.run([
      "api", `repos/${repository}/pulls/${pullRequest}`,
    ], { signal })).stdout, "pull-request");
  }

  async function readConfiguredContexts(
    repository: string,
    pullRequest: number,
    signal: AbortSignal,
  ): Promise<string[]> {
    for (;;) {
      const baseRef = pullRequestBaseRef(await readPullRequest(repository, pullRequest, signal));
      const encodedBaseRef = encodeURIComponent(baseRef);
      const [branchResult, rulesResult] = await Promise.all([
        runner.run(["api", `repos/${repository}/branches/${encodedBaseRef}`], { signal }),
        runner.run([
          "api", "--paginate", "--slurp",
          `repos/${repository}/rules/branches/${encodedBaseRef}?per_page=100`,
        ], { signal }),
      ]);
      const contexts = [...new Set([
        ...classicRequiredContexts(parse(branchResult.stdout, "branch")),
        ...rulesetRequiredContexts(parse(rulesResult.stdout, "branch-rules")),
      ])];
      const currentBaseRef = pullRequestBaseRef(await readPullRequest(repository, pullRequest, signal));
      if (currentBaseRef === baseRef) return contexts;
    }
  }

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
      return pullRequestHeadSha(await readPullRequest(repository, pullRequest, signal));
    },
    readRequiredChecks: async (repository, pullRequest, signal) => {
      const result = await runner.run([
        "pr", "checks", String(pullRequest), "--repo", repository, "--required",
        "--json", "name,state,bucket",
      ], { signal, allowFailure: true });
      const noReportedChecks = result.stdout.trim() === ""
        && /no required checks reported/iu.test(result.stderr);
      const value = noReportedChecks ? [] : parse(result.stdout, "required-checks");
      if (!Array.isArray(value)) throw new Error("required-checks: expected an array");
      const observed = value.map((item, index) => {
        const check = record(item, `required-checks[${index}]`);
        if (typeof check.name !== "string" || check.name === "") {
          throw new Error(`required-checks[${index}].name: expected a non-empty string`);
        }
        return { name: check.name, state: checkState(check.bucket, check.state, `required-checks[${index}]`) };
      });
      if (observed.some(({ state }) => state !== "green")) return observed;
      return mergeConfiguredChecks(
        observed,
        await readConfiguredContexts(repository, pullRequest, signal),
      );
    },
  };
}
