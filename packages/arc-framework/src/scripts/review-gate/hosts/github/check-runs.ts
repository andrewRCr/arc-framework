/** App-owned GitHub check-run lookup, projection, and stale-writer guards. */

import type { GateProjection } from "../../core/execution.js";
import { integerAt, objectAt, stringAt } from "../../core/validation.js";
import type { GitHubRestClient } from "./api/rest.js";

/** Validated host check-run identity and current conclusion. */
export interface GitHubCheckRun {
  id: number;
  nodeId: string;
  name: string;
  externalId: string;
  appId: string;
  status: string;
  conclusion: string | null;
  createdAt: string;
  htmlUrl: string;
}

/** GitHub check output after neutral-to-host mapping. */
export interface CheckRunOutput {
  title: string;
  summary: string;
}

/** Create/update payload shared by the injected check boundary. */
export interface CheckRunMutation {
  name: string;
  externalId: string;
  headSha: string;
  status: "in_progress" | "completed";
  conclusion: "failure" | "success" | null;
  output: CheckRunOutput;
}

/** Injected check-run API boundary. */
export interface GitHubCheckRunApi {
  list(headSha: string, appId: string, checkName: string): Promise<GitHubCheckRun[]>;
  create(value: CheckRunMutation): Promise<GitHubCheckRun>;
  update(id: number, value: CheckRunMutation): Promise<GitHubCheckRun>;
}

/** Immutable coordinates for one required check context. */
export interface CheckRunScope {
  owner: string;
  repo: string;
  pullNumber: number;
  headSha: string;
  changeSetId: string;
  contextName: string;
  expectedAppId: string;
}

/** Canonical state read immediately before a check write. */
export interface CheckWriteState {
  headSha: string;
  changeSetId: string;
}

/** Fail-closed publishing error. */
export class CheckRunPublishError extends Error {
  readonly code: string;

  constructor(code: string, detail?: string) {
    super(detail === undefined ? code : `${code}: ${detail}`);
    this.name = "CheckRunPublishError";
    this.code = code;
  }
}

/** Result retaining duplicate state until live source/context behavior is proven. */
export interface CheckRunPublishResult {
  checkRun: GitHubCheckRun;
  duplicateRunIds: number[];
}

/** Deterministic identity for one PR/change-set/context projection. */
export function buildCheckExternalId(pullNumber: number, changeSetId: string, contextName: string): string {
  return `arc-review-gate:${pullNumber}:${changeSetId}:${contextName}`;
}

/** Locate only exact external-id/name checks attributed to the pinned App. */
export async function findAuthoritativeCheckRuns(
  api: GitHubCheckRunApi,
  scope: CheckRunScope,
): Promise<GitHubCheckRun[]> {
  const externalId = buildCheckExternalId(scope.pullNumber, scope.changeSetId, scope.contextName);
  const runs = await api.list(scope.headSha, scope.expectedAppId, scope.contextName);
  return runs
    .filter((run) =>
      run.externalId === externalId
      && run.name === scope.contextName
      && run.appId === scope.expectedAppId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id - left.id);
}

/** Confirm the pinned App's stable aggregate check is pending on the exact head. */
export async function confirmPendingGateCheck(
  api: GitHubCheckRunApi,
  scope: CheckRunScope,
): Promise<boolean> {
  const matches = await findAuthoritativeCheckRuns(api, scope);
  return matches.length > 0 && matches.every((run) => run.status === "in_progress" && run.conclusion === null);
}

/** Publish one projection, converging every interrupted duplicate to the same conclusion. */
export async function publishGateCheck(input: {
  api: GitHubCheckRunApi;
  scope: CheckRunScope;
  projection: GateProjection;
  anchorReceiptCount: number | null;
  readCurrentState: () => Promise<CheckWriteState>;
}): Promise<CheckRunPublishResult> {
  const matches = await findAuthoritativeCheckRuns(input.api, input.scope);
  const mutation = renderCheckMutation(input.scope, input.projection, input.anchorReceiptCount);
  if (matches.length === 0) {
    await assertCurrent(input.scope, input.readCurrentState);
    return { checkRun: await input.api.create(mutation), duplicateRunIds: [] };
  }

  const updated = new Map<number, GitHubCheckRun>();
  const failures: string[] = [];
  for (const match of matches) {
    try {
      await assertCurrent(input.scope, input.readCurrentState);
      updated.set(match.id, await input.api.update(match.id, mutation));
    } catch (error) {
      failures.push(`${match.id}:${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (failures.length > 0) throw new CheckRunPublishError("check-update-failed", failures.join(","));

  const elected = matches[0];
  if (elected === undefined) throw new CheckRunPublishError("missing-election");
  const checkRun = updated.get(elected.id);
  if (checkRun === undefined) throw new CheckRunPublishError("missing-election-update");
  return { checkRun, duplicateRunIds: matches.slice(1).map((run) => run.id) };
}

async function assertCurrent(scope: CheckRunScope, readCurrentState: () => Promise<CheckWriteState>): Promise<void> {
  const current = await readCurrentState();
  if (current.headSha !== scope.headSha || current.changeSetId !== scope.changeSetId) {
    throw new CheckRunPublishError("stale-writer");
  }
}

function renderCheckMutation(
  scope: CheckRunScope,
  projection: GateProjection,
  anchorReceiptCount: number | null,
): CheckRunMutation {
  const conclusion = projection.conclusion === "pending" ? null : projection.conclusion;
  return {
    name: scope.contextName,
    externalId: buildCheckExternalId(scope.pullNumber, scope.changeSetId, scope.contextName),
    headSha: scope.headSha,
    status: projection.conclusion === "pending" ? "in_progress" : "completed",
    conclusion,
    output: {
      title: `ARC review gate: ${projection.conclusion}`,
      summary: renderSummary(projection, anchorReceiptCount),
    },
  };
}

function renderSummary(projection: GateProjection, anchorReceiptCount: number | null): string {
  const ledgerVersion = projection.ledgerVersion === null ? "unknown" : String(projection.ledgerVersion);
  const receiptCount = anchorReceiptCount === null ? "unknown" : String(anchorReceiptCount);
  const lines = [
    `**Result:** ${projection.conclusion}`,
    `**Policy:** ${projection.policyDecision.disposition} / ${projection.policyDecision.reviewRisk}`,
    `**CI:** ${projection.ciState}`,
    `**Ledger version/count:** ${ledgerVersion}/${receiptCount}`,
    "",
    escapeText(projection.summary).slice(0, 24_000),
  ];
  if (projection.blockers.length > 0) {
    lines.push("", "**Blockers:**", ...projection.blockers.map((blocker) =>
      `- ${escapeText(blocker.code)}: ${escapeText(blocker.detail).slice(0, 2_000)}`));
  }
  if (projection.receiptRefs.length > 0) {
    lines.push("", "**Receipts:**", ...projection.receiptRefs.map((ref, index) =>
      `- ${durableLink(`receipt ${index + 1}`, ref)}`));
  }
  if (projection.evidence.length > 0) {
    lines.push("", "**Evidence:**", ...projection.evidence.map((evidence, index) =>
      `- ${escapeText(evidence.requirementId)}: ${durableLink(`evidence ${index + 1}`, evidence.evidenceRef)}`));
  }
  return lines.join("\n").slice(0, 65_535);
}

function escapeText(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/`/gu, "&#96;")
    .replace(/\p{Cc}/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function durableLink(label: string, candidate: string): string {
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:") throw new Error("not https");
    return `[${label}](${url.toString().replace(/\)/gu, "%29")})`;
  } catch {
    return `${label}: ${escapeText(candidate).slice(0, 2_048)}`;
  }
}

/** Shared non-cancelling concurrency posture for every effectful PR wake-up. */
export function reviewGateConcurrency(repositoryId: string, pullNumber: number): {
  group: string;
  cancelInProgress: false;
} {
  return { group: `arc-review-gate:${repositoryId}:${pullNumber}`, cancelInProgress: false };
}

function nullableString(value: unknown, path: string): string | null {
  return value === null ? null : stringAt(value, path);
}

function parseCheckRun(input: unknown): GitHubCheckRun {
  const record = objectAt(input, "checkRun");
  const app = objectAt(record.app, "checkRun.app");
  return {
    id: integerAt(record.id, "checkRun.id", 1),
    nodeId: stringAt(record.node_id, "checkRun.node_id"),
    name: stringAt(record.name, "checkRun.name"),
    externalId: stringAt(record.external_id, "checkRun.external_id"),
    appId: String(integerAt(app.id, "checkRun.app.id", 1)),
    status: stringAt(record.status, "checkRun.status"),
    conclusion: nullableString(record.conclusion, "checkRun.conclusion"),
    createdAt: stringAt(record.created_at, "checkRun.created_at"),
    htmlUrl: stringAt(record.html_url, "checkRun.html_url"),
  };
}

/** REST-backed check-run boundary for one repository. */
export class GitHubRestCheckRunApi implements GitHubCheckRunApi {
  private readonly rest: GitHubRestClient;
  private readonly repositoryPath: string;
  private readonly expectedAppId: string;

  constructor(rest: GitHubRestClient, owner: string, repo: string, expectedAppId: string) {
    this.rest = rest;
    this.repositoryPath = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
    this.expectedAppId = expectedAppId;
  }

  async list(headSha: string, appId: string, checkName: string): Promise<GitHubCheckRun[]> {
    const outcome = await this.rest.getPaginated(`${this.repositoryPath}/commits/${headSha}/check-runs`, {
      query: { app_id: appId, check_name: checkName, filter: "all", per_page: 100 },
      parsePage: (value) => {
        const record = objectAt(value, "checkRuns");
        if (!Array.isArray(record.check_runs)) throw new Error("checkRuns.check_runs: expected an array");
        return record.check_runs.map(parseCheckRun);
      },
    });
    if (outcome.kind !== "ok") throw new CheckRunPublishError("check-list-failed", outcome.kind);
    return outcome.value;
  }

  async create(value: CheckRunMutation): Promise<GitHubCheckRun> {
    const body = mutationBody(value, true);
    const outcome = await this.rest.write("POST", `${this.repositoryPath}/check-runs`, {
      body,
      parse: parseCheckRun,
      reconcile: async () => {
        try {
          const matches = await this.list(value.headSha, this.expectedAppId, value.name);
          return { kind: "ok", status: 200, value: matches.find((run) => run.externalId === value.externalId) ?? null };
        } catch {
          return { kind: "unavailable", reason: "network" };
        }
      },
    });
    if (outcome.kind !== "ok") throw new CheckRunPublishError("check-create-failed", outcome.kind);
    return outcome.value;
  }

  async update(id: number, value: CheckRunMutation): Promise<GitHubCheckRun> {
    const outcome = await this.rest.write("PATCH", `${this.repositoryPath}/check-runs/${id}`, {
      body: mutationBody(value, false),
      parse: parseCheckRun,
      reconcile: async () => {
        const read = await this.rest.get(`${this.repositoryPath}/check-runs/${id}`, { parse: parseCheckRun });
        return read.kind === "ok" ? { ...read, value: read.value } : read;
      },
    });
    if (outcome.kind !== "ok") throw new CheckRunPublishError("check-update-failed", outcome.kind);
    return outcome.value;
  }
}

function mutationBody(value: CheckRunMutation, includeHead: boolean): Record<string, unknown> {
  return {
    name: value.name,
    external_id: value.externalId,
    ...(includeHead ? { head_sha: value.headSha } : {}),
    status: value.status,
    ...(value.conclusion === null ? {} : { conclusion: value.conclusion }),
    output: value.output,
  };
}
