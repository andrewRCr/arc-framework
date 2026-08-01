/** GitHub host adapter for planning-lane ownership eligibility facts. */

import { execa } from "execa";

import type {
  PlanningLaneOwnershipFacts,
  PlanningLaneOwnershipSurface,
} from "./planning-lane-ownership.js";

export interface PlanningLaneGitHubApi {
  get(path: string): Promise<unknown>;
}

export class PlanningLaneGitHubApiError extends Error {
  readonly httpStatus: number | null;

  constructor(message: string, httpStatus: number | null = null, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "PlanningLaneGitHubApiError";
    this.httpStatus = httpStatus;
  }
}

function processHttpStatus(value: unknown): number | null {
  const detail = value instanceof Error ? value.message : String(value);
  const stderr = typeof value === "object" && value !== null && "stderr" in value
    && typeof value.stderr === "string" ? value.stderr : "";
  const match = /\bHTTP ([1-5][0-9]{2})\b/u.exec(`${detail}\n${stderr}`);
  return match?.[1] === undefined ? null : Number(match[1]);
}

/** Authenticated `gh api` reader used by the packaged command. */
export const planningLaneGhApi: PlanningLaneGitHubApi = {
  get: async (path) => {
    try {
      const result = await execa("gh", ["api", path], {
        stdin: "ignore",
        timeout: 60_000,
      });
      return JSON.parse(result.stdout) as unknown;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`GitHub response for ${path} was not valid JSON`, { cause: error });
      }
      throw new PlanningLaneGitHubApiError(
        error instanceof Error ? error.message : String(error),
        processHttpStatus(error),
        error,
      );
    }
  },
};

function record(value: unknown, locus: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${locus}: expected object`);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, locus: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${locus}: expected array`);
  return value;
}

function branchProtectionSurface(value: unknown, context: string): PlanningLaneOwnershipSurface {
  const protection = record(value, "branch-protection");
  if (protection.required_status_checks === null || protection.required_status_checks === undefined) {
    return { state: "checked", requiredContext: false, baseCurrency: false };
  }
  const checks = record(protection.required_status_checks, "branch-protection.required_status_checks");
  const contexts = checks.contexts === undefined
    ? []
    : array(checks.contexts, "branch-protection.required_status_checks.contexts")
      .filter((entry): entry is string => typeof entry === "string");
  const appChecks = checks.checks === undefined
    ? []
    : array(checks.checks, "branch-protection.required_status_checks.checks")
      .map((entry, index) => record(entry, `branch-protection.required_status_checks.checks[${index}]`).context)
      .filter((entry): entry is string => typeof entry === "string");
  return {
    state: "checked",
    requiredContext: [...contexts, ...appChecks].includes(context),
    baseCurrency: checks.strict === true,
  };
}

function ruleSurface(value: unknown, context: string): PlanningLaneOwnershipSurface {
  const rules = array(value, "rules");
  const statusRules = rules.map((entry, index) => record(entry, `rules[${index}]`))
    .filter((rule) => rule.type === "required_status_checks");
  const parameters = statusRules.map((rule, index) =>
    record(rule.parameters, `rules.required_status_checks[${index}].parameters`));
  const requiredContext = parameters.some((parameter, index) =>
    array(
      parameter.required_status_checks,
      `rules.required_status_checks[${index}].parameters.required_status_checks`,
    ).some((entry, entryIndex) =>
      record(
        entry,
        `rules.required_status_checks[${index}].parameters.required_status_checks[${entryIndex}]`,
      ).context === context));
  return {
    state: "checked",
    requiredContext,
    baseCurrency: parameters.some((parameter) => parameter.strict_required_status_checks_policy === true),
  };
}

function mergeQueueSurface(value: unknown): PlanningLaneOwnershipSurface {
  const configured = array(value, "merge-queue-rules")
    .map((entry, index) => record(entry, `merge-queue-rules[${index}]`))
    .some((rule) => rule.type === "merge_queue");
  return {
    state: "checked",
    requiredContext: false,
    baseCurrency: configured,
  };
}

async function readSurface(
  read: () => Promise<unknown>,
  parse: (value: unknown) => PlanningLaneOwnershipSurface,
  notFoundIsAbsent: boolean,
): Promise<PlanningLaneOwnershipSurface> {
  try {
    return parse(await read());
  } catch (error) {
    if (error instanceof PlanningLaneGitHubApiError) {
      if (notFoundIsAbsent && error.httpStatus === 404) {
        return { state: "checked", requiredContext: false, baseCurrency: false };
      }
      if (error.httpStatus === 403 || error.httpStatus === 404) return { state: "forbidden" };
    }
    throw error;
  }
}

/**
 * Read each enumerated GitHub enforcement surface independently.
 *
 * @param repository - GitHub owner/name repository identity.
 * @param branch - Base branch governed by the merge policy.
 * @param context - Required status context to locate.
 * @param api - Authenticated GitHub API read boundary.
 * @returns Normalized facts for the pure eligibility policy.
 */
export async function readGitHubPlanningLaneOwnershipFacts(
  repository: string,
  branch: string,
  context: string,
  api: PlanningLaneGitHubApi,
): Promise<PlanningLaneOwnershipFacts> {
  const encodedBranch = encodeURIComponent(branch);
  const protectionPath = `repos/${repository}/branches/${encodedBranch}/protection`;
  const rulesPath = `repos/${repository}/rules/branches/${encodedBranch}?per_page=100`;
  const [branchProtection, rules, mergeQueue] = await Promise.all([
    readSurface(() => api.get(protectionPath), (value) => branchProtectionSurface(value, context), true),
    readSurface(() => api.get(rulesPath), (value) => ruleSurface(value, context), false),
    readSurface(() => api.get(rulesPath), mergeQueueSurface, false),
  ]);
  return { branchProtection, rules, mergeQueue };
}
