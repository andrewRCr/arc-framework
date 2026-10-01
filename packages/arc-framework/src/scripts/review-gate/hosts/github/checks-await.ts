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

function positiveInteger(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${path}: expected a positive integer`);
  }
  return value;
}

/**
 * Bind a check link to the exact GitHub Actions run and job that produced it.
 *
 * @param repository - The `owner/name` the link must belong to.
 * @param value - The check's link as GitHub reports it.
 * @returns The run and job identities with the normalized URL, or null for any other link.
 */
export function githubActionsJobBinding(
  repository: string,
  value: unknown,
): { runId: string; jobId: string; url: string } | null {
  if (typeof value !== "string" || value.length === 0) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const match = /^\/([^/]+)\/([^/]+)\/actions\/runs\/([1-9][0-9]*)\/job\/([1-9][0-9]*)\/?$/u
    .exec(url.pathname);
  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com" || match === null) return null;
  const [, owner, name, runId, jobId] = match;
  if (owner === undefined || name === undefined || runId === undefined || jobId === undefined) return null;
  const linkedRepository = `${owner}/${name}`;
  if (linkedRepository.toLowerCase() !== repository.toLowerCase()) return null;
  return { runId, jobId, url: url.toString() };
}

/** One workflow run on a pull request's head, reduced to what supersession needs. */
interface HeadWorkflowRun {
  id: string;
  workflowId: string;
  runNumber: number;
  status: string;
}

function headWorkflowRuns(value: unknown): HeadWorkflowRun[] {
  const page = record(value, "head-runs");
  if (!Array.isArray(page.workflow_runs)) throw new Error("head-runs.workflow_runs: expected an array");
  return page.workflow_runs.map((item, index) => {
    const path = `head-runs.workflow_runs[${index}]`;
    const run = record(item, path);
    return {
      id: String(positiveInteger(run.id, `${path}.id`)),
      workflowId: String(positiveInteger(run.workflow_id, `${path}.workflow_id`)),
      runNumber: positiveInteger(run.run_number, `${path}.run_number`),
      status: string(run.status, `${path}.status`),
    };
  });
}

/** Name the runs that a newer, still-running run of the same workflow on the same head replaces. */
function supersededRunIds(runs: readonly HeadWorkflowRun[]): Set<string> {
  return new Set(runs.filter((run) => runs.some((newer) => (
    newer.workflowId === run.workflowId
    && newer.runNumber > run.runNumber
    && newer.status !== "completed"
  ))).map(({ id }) => id));
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

function classicStrictCurrentness(value: unknown): boolean {
  const branch = record(value, "branch");
  if (branch.protection === undefined || branch.protection === null) return false;
  const protection = record(branch.protection, "branch.protection");
  if (protection.required_status_checks === undefined || protection.required_status_checks === null) return false;
  const checks = record(protection.required_status_checks, "branch.protection.required_status_checks");
  if (checks.strict === undefined) return false;
  if (typeof checks.strict !== "boolean") {
    throw new Error("branch.protection.required_status_checks.strict: expected a boolean");
  }
  return checks.strict;
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

function rulesetStrictCurrentness(value: unknown): boolean {
  if (!Array.isArray(value)) throw new Error("branch-rules: expected page array");
  return value.some((page, pageIndex) => {
    if (!Array.isArray(page)) throw new Error(`branch-rules[${pageIndex}]: expected an array page`);
    return page.some((item, ruleIndex) => {
      const rule = record(item, `branch-rules[${pageIndex}][${ruleIndex}]`);
      if (rule.type !== "required_status_checks") return false;
      const parameters = record(
        rule.parameters,
        `branch-rules[${pageIndex}][${ruleIndex}].parameters`,
      );
      const strict = parameters.strict_required_status_checks_policy;
      if (strict === undefined) return false;
      if (typeof strict !== "boolean") {
        throw new Error(
          `branch-rules[${pageIndex}][${ruleIndex}].parameters.strict_required_status_checks_policy: expected a boolean`,
        );
      }
      return strict;
    });
  });
}

export interface GhRequiredStatusPolicy {
  contexts: string[];
  strictCurrentness: boolean;
}

/** Read applicable classic and ruleset required-status policy for one exact base ref. */
export async function readGhRequiredStatusPolicy(
  runner: HostedProcessRunner,
  repository: string,
  baseRef: string,
  signal: AbortSignal,
): Promise<GhRequiredStatusPolicy> {
  const encodedBaseRef = encodeURIComponent(baseRef);
  const [branchResult, rulesResult] = await Promise.all([
    runner.run(["api", `repos/${repository}/branches/${encodedBaseRef}`], { signal }),
    runner.run([
      "api", "--paginate", "--slurp",
      `repos/${repository}/rules/branches/${encodedBaseRef}?per_page=100`,
    ], { signal }),
  ]);
  const branch = parse(branchResult.stdout, "branch");
  const rules = parse(rulesResult.stdout, "branch-rules");
  return {
    contexts: [...new Set([...classicRequiredContexts(branch), ...rulesetRequiredContexts(rules)])],
    strictCurrentness: classicStrictCurrentness(branch) || rulesetStrictCurrentness(rules),
  };
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

/** Refuse conflicting duplicate display-name states until GitHub's rollup converges. */
function coalesceCheckRows(checks: readonly RequiredCheck[]): RequiredCheck[] {
  const result: RequiredCheck[] = [];
  const indexes = new Map<string, number>();
  for (const check of checks) {
    const index = indexes.get(check.name);
    if (index === undefined) {
      indexes.set(check.name, result.length);
      result.push(check);
      continue;
    }
    const existing = result[index];
    if (existing !== undefined && existing.state !== check.state) {
      result[index] = { name: check.name, state: "pending" };
    }
  }
  return result;
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
      const { contexts } = await readGhRequiredStatusPolicy(runner, repository, baseRef, signal);
      const currentBaseRef = pullRequestBaseRef(await readPullRequest(repository, pullRequest, signal));
      if (currentBaseRef === baseRef) return contexts;
    }
  }

  /**
   * Read a failure as pending while a newer run of its workflow on the same head is still going: that run posts the
   * head's result under the same name. GitHub lists the newest runs first, so a failure from a run older than the
   * first hundred keeps its reported state.
   */
  async function settleSupersededFailures(
    repository: string,
    pullRequest: number,
    rows: readonly (RequiredCheck & { runId: string | null })[],
    signal: AbortSignal,
  ): Promise<RequiredCheck[]> {
    const checks = rows.map(({ name, state }) => ({ name, state }));
    if (!rows.some(({ state, runId }) => state === "failed" && runId !== null)) return checks;
    const headSha = pullRequestHeadSha(await readPullRequest(repository, pullRequest, signal));
    const superseded = supersededRunIds(headWorkflowRuns(parse((await runner.run([
      "api", `repos/${repository}/actions/runs?head_sha=${headSha}&per_page=100`,
    ], { signal })).stdout, "head-runs")));
    return rows.map(({ name, state, runId }) => ({
      name,
      state: state === "failed" && runId !== null && superseded.has(runId) ? "pending" : state,
    }));
  }

  async function readChecks(
    repository: string,
    pullRequest: number,
    signal: AbortSignal,
    requiredOnly: boolean,
  ): Promise<RequiredCheck[]> {
    const result = await runner.run([
      "pr", "checks", String(pullRequest), "--repo", repository,
      ...(requiredOnly ? ["--required"] : []),
      "--json", "name,state,bucket,link",
    ], { signal, allowFailure: true });
    const noReportedChecks = result.stdout.trim() === ""
      && /no (?:required )?checks reported/iu.test(result.stderr);
    const path = requiredOnly ? "required-checks" : "observed-checks";
    const value = noReportedChecks ? [] : parse(result.stdout, path);
    if (!Array.isArray(value)) throw new Error(`${path}: expected an array`);
    const rows = value.map((item, index) => {
      const check = record(item, `${path}[${index}]`);
      if (typeof check.name !== "string" || check.name === "") {
        throw new Error(`${path}[${index}].name: expected a non-empty string`);
      }
      return {
        name: check.name,
        state: checkState(check.bucket, check.state, `${path}[${index}]`),
        runId: githubActionsJobBinding(repository, check.link)?.runId ?? null,
      };
    });
    const checks = await settleSupersededFailures(repository, pullRequest, rows, signal);
    return requiredOnly ? coalesceCheckRows(checks) : checks;
  }

  return {
    resolveRepository: async (signal) => {
      const value = record(parse(
        (await runner.run(["repo", "view", "--json", "nameWithOwner"], { signal })).stdout,
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
      const observed = await readChecks(repository, pullRequest, signal, true);
      if (observed.some(({ state }) => state !== "green")) return observed;
      return mergeConfiguredChecks(
        observed,
        await readConfiguredContexts(repository, pullRequest, signal),
      );
    },
    readObservedChecks: async (repository, pullRequest, signal) => {
      return readChecks(repository, pullRequest, signal, false);
    },
  };
}
