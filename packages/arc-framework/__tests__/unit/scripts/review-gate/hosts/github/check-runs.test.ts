import { describe, expect, it } from "vitest";

import type { GateProjection } from "../../../../../../src/scripts/review-gate/core/execution.js";
import { GitHubRestClient } from "../../../../../../src/scripts/review-gate/hosts/github/api/rest.js";
import {
  CheckRunPublishError,
  buildCheckExternalId,
  confirmPendingGateCheck,
  findAuthoritativeCheckRuns,
  publishGateCheck,
  parseGateStateMarker,
  reviewGateConcurrency,
  type CheckRunMutation,
  type CheckWriteState,
  type GitHubCheckRun,
  type GitHubCheckRunApi,
  GitHubRestCheckRunApi,
} from "../../../../../../src/scripts/review-gate/hosts/github/check-runs.js";
import { fetchFake, response } from "./api/fetch-fake.js";

const SHA = "a".repeat(40);
const CHANGE_SET = "b".repeat(64);
const APP_ID = "4268856";
const NAME = "merge-ok";

function projection(conclusion: GateProjection["conclusion"] = "pending", summary = "analysis: queued"): GateProjection {
  return {
    schemaVersion: 1,
    conclusion,
    summary,
    blockers: conclusion === "failure" ? [{ code: "review-failed", detail: "<script>bad</script> `cmd`" }] : [],
    requirementExecutions: [{ requirementId: "analysis", state: conclusion === "success" ? "clean" : "queued", sourceIdentity: "agent", detail: "blocking" }],
    receiptRefs: ["https://github.com/acme/repo/pull/7#issuecomment-1"],
    policyDecision: { lane: "reviewed", reviewRisk: "sensitive", disposition: "required", reasons: ["workflow-sensitive"], policyVersion: "c".repeat(64) },
    ciState: conclusion,
    ledgerVersion: 4,
    evidence: [{ requirementId: "analysis", sourceIdentity: "agent", coverage: "full", evidenceRef: "https://github.com/acme/repo/pull/7#discussion_r1" }],
  };
}

function run(overrides: Partial<GitHubCheckRun> = {}): GitHubCheckRun {
  return {
    id: 1,
    nodeId: "CR_1",
    name: NAME,
    externalId: buildCheckExternalId(7, CHANGE_SET, NAME),
    appId: APP_ID,
    status: "completed",
    conclusion: "success",
    createdAt: "2026-07-11T10:00:00Z",
    htmlUrl: "https://github.com/acme/repo/runs/1",
    ...overrides,
  };
}

class MemoryChecks implements GitHubCheckRunApi {
  readonly runs: GitHubCheckRun[];
  readonly listQueries: Array<{ appId: string; checkName: string; headSha: string }> = [];
  readonly mutations: Array<{ id: number | null; value: CheckRunMutation }> = [];
  failUpdateId: number | null = null;
  private nextId = 20;

  constructor(runs: GitHubCheckRun[] = []) {
    this.runs = runs;
  }

  async list(headSha: string, appId: string, checkName: string): Promise<GitHubCheckRun[]> {
    this.listQueries.push({ appId, checkName, headSha });
    return this.runs;
  }

  async create(value: CheckRunMutation): Promise<GitHubCheckRun> {
    this.mutations.push({ id: null, value });
    const created = run({ id: this.nextId, nodeId: `CR_${this.nextId}`, status: value.status, conclusion: value.conclusion ?? null });
    this.nextId += 1;
    this.runs.push(created);
    return created;
  }

  async update(id: number, value: CheckRunMutation): Promise<GitHubCheckRun> {
    this.mutations.push({ id, value });
    if (id === this.failUpdateId) throw new Error("update failed");
    const index = this.runs.findIndex((item) => item.id === id);
    const prior = this.runs[index];
    if (prior === undefined) throw new Error("missing run");
    const updated = { ...prior, status: value.status, conclusion: value.conclusion ?? null };
    this.runs[index] = updated;
    return updated;
  }
}

function state(overrides: Partial<CheckWriteState> = {}): CheckWriteState {
  return { headSha: SHA, changeSetId: CHANGE_SET, ...overrides };
}

const scope = {
  owner: "acme",
  repo: "repo",
  pullNumber: 7,
  headSha: SHA,
  changeSetId: CHANGE_SET,
  contextName: NAME,
  expectedAppId: APP_ID,
};

describe("authoritative check lookup", () => {
  it("enumerates all check history with GitHub's app/name/all filters", async () => {
    const fake = fetchFake([response(200, JSON.stringify({
      total_count: 1,
      check_runs: [{
        id: 1,
        node_id: "CR_1",
        name: NAME,
        external_id: buildCheckExternalId(7, CHANGE_SET, NAME),
        app: { id: Number(APP_ID) },
        status: "completed",
        conclusion: "success",
        created_at: null,
        started_at: "2026-07-11T10:00:00Z",
        html_url: "https://github.com/acme/repo/runs/1",
      }],
    }))]);
    const rest = new GitHubRestClient({ fetch: fake.fetch, token: "token", sleep: fake.sleep, maxReadAttempts: 1 });
    const api = new GitHubRestCheckRunApi(rest, "acme", "repo", APP_ID);
    await expect(api.list(SHA, APP_ID, NAME)).resolves.toEqual([
      expect.objectContaining({ createdAt: "2026-07-11T10:00:00Z" }),
    ]);
    const url = new URL(fake.calls[0]?.url ?? "");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      app_id: APP_ID,
      check_name: NAME,
      filter: "all",
      per_page: "100",
    });
  });

  it("retains the path-specific schema diagnostic when a check run is malformed", async () => {
    const fake = fetchFake([response(200, JSON.stringify({
      total_count: 1,
      check_runs: [{
        id: 1,
        node_id: "CR_1",
        name: NAME,
        external_id: buildCheckExternalId(7, CHANGE_SET, NAME),
        app: { id: Number(APP_ID) },
        status: "completed",
        conclusion: "success",
        html_url: "https://github.com/acme/repo/runs/1",
      }],
    }))]);
    const rest = new GitHubRestClient({ fetch: fake.fetch, token: "token", sleep: fake.sleep, maxReadAttempts: 1 });
    const api = new GitHubRestCheckRunApi(rest, "acme", "repo", APP_ID);

    await expect(api.list(SHA, APP_ID, NAME)).rejects.toThrow(
      "check-list-failed: schema-error: checkRun.started_at: expected a non-empty string",
    );
  });

  it("queries by app/name/all-history and requires exact external id plus App source", async () => {
    const api = new MemoryChecks([
      run(),
      run({ id: 2, appId: "15368" }),
      run({ id: 3, externalId: "arc-review-gate:7:other:merge-ok" }),
      run({ id: 4, name: "other" }),
    ]);
    const found = await findAuthoritativeCheckRuns(api, scope);
    expect(found.map((item) => item.id)).toEqual([1]);
    expect(api.listQueries).toEqual([{ headSha: SHA, appId: APP_ID, checkName: NAME }]);
  });

  it("updates an unchanged canonical run instead of creating a new one", async () => {
    const api = new MemoryChecks([run()]);
    const result = await publishGateCheck({ api, scope, projection: projection("success"), anchorReceiptCount: 4, readCurrentState: async () => state() });
    expect(result.checkRun.id).toBe(1);
    expect(api.mutations).toHaveLength(1);
    expect(api.mutations[0]?.id).toBe(1);
  });

  it("confirms only an exact pinned-App pending aggregate check", async () => {
    await expect(confirmPendingGateCheck(
      new MemoryChecks([run({ status: "in_progress", conclusion: null })]),
      scope,
    )).resolves.toBe(true);
    await expect(confirmPendingGateCheck(
      new MemoryChecks([run({ status: "completed", conclusion: "failure" })]),
      scope,
    )).resolves.toBe(false);
    await expect(confirmPendingGateCheck(
      new MemoryChecks([run({ status: "in_progress", conclusion: null, appId: "15368" })]),
      scope,
    )).resolves.toBe(false);
  });
});

describe("neutral projection publishing", () => {
  it("publishes and parses a bounded versioned aggregate machine marker", async () => {
    const api = new MemoryChecks();
    await publishGateCheck({ api, scope, projection: projection("failure"), anchorReceiptCount: 4, readCurrentState: async () => state() });
    const summary = api.mutations[0]?.value.output.summary ?? "";
    expect(parseGateStateMarker(summary)).toEqual({
      schemaVersion: 1,
      conclusion: "failure",
      blockerCodes: ["review-failed"],
      ledgerVersion: 4,
      receiptRefs: ["https://github.com/acme/repo/pull/7#issuecomment-1"],
    });
    expect(summary.length).toBeLessThanOrEqual(65_535);
    expect(() => parseGateStateMarker("<!-- arc-review-gate-state:v1:not-json -->")).toThrow("malformed-gate-state-marker");
  });

  it("retains a parseable marker when every bounded field is oversized", async () => {
    const oversized = {
      ...projection("failure"),
      blockers: Array.from({ length: 40 }, (_, index) => ({
        code: `${index}-${"b".repeat(1_000)}`,
        detail: "blocked",
      })),
      receiptRefs: Array.from({ length: 40 }, (_, index) => `${index}-${"r".repeat(1_000)}`),
    };
    const api = new MemoryChecks();
    await publishGateCheck({ api, scope, projection: oversized, anchorReceiptCount: 40, readCurrentState: async () => state() });

    const summary = api.mutations[0]?.value.output.summary ?? "";
    const parsed = parseGateStateMarker(summary);
    expect(summary.length).toBeLessThanOrEqual(65_535);
    expect(parsed.blockerCodes).toHaveLength(32);
    expect(parsed.receiptRefs).toHaveLength(32);
    expect(parsed.blockerCodes.every((value) => value.length <= 256)).toBe(true);
    expect(parsed.receiptRefs.every((value) => value.length <= 256)).toBe(true);
  });

  it.each([
    ["pending", "in_progress", null],
    ["failure", "completed", "failure"],
    ["success", "completed", "success"],
  ] as const)("maps %s losslessly", async (conclusion, status, checkConclusion) => {
    const api = new MemoryChecks();
    await publishGateCheck({ api, scope, projection: projection(conclusion), anchorReceiptCount: 4, readCurrentState: async () => state() });
    expect(api.mutations[0]?.value).toMatchObject({ status, conclusion: checkConclusion });
  });

  it("bounds and escapes untrusted projection text while retaining durable links and anchor parity", async () => {
    const api = new MemoryChecks();
    await publishGateCheck({
      api,
      scope,
      projection: projection("failure", `${"x".repeat(70_000)} <tag> \`authority\``),
      anchorReceiptCount: 4,
      readCurrentState: async () => state(),
    });
    const output = api.mutations[0]?.value.output;
    expect(output?.summary.length).toBeLessThanOrEqual(65_535);
    expect(output?.summary).not.toContain("<tag>");
    expect(output?.summary).not.toContain("`authority`");
    expect(output?.summary).toContain("Ledger version/count:** 4/4");
    expect(output?.summary).toContain("[receipt 1](https://github.com/acme/repo/pull/7#issuecomment-1)");
  });

  it("renders unknown ledger coordinates instead of inventing an initial ledger", async () => {
    const api = new MemoryChecks();
    const degraded = {
      ...projection("failure"),
      blockers: [{ code: "ledger-unavailable", detail: "receipt state could not be read" }],
      ledgerVersion: null,
    };

    await publishGateCheck({
      api,
      scope,
      projection: degraded,
      anchorReceiptCount: null,
      readCurrentState: async () => state(),
    });

    expect(api.mutations[0]?.value.output.summary).toContain("Ledger version/count:** unknown/unknown");
  });
});

describe("duplicate, recursion, and stale-writer guards", () => {
  it("elects the newest duplicate and mirrors the canonical conclusion to every match", async () => {
    const api = new MemoryChecks([
      run({ id: 1, createdAt: "2026-07-11T10:00:00Z", conclusion: "success" }),
      run({ id: 2, createdAt: "2026-07-11T11:00:00Z", conclusion: "failure" }),
    ]);
    const result = await publishGateCheck({ api, scope, projection: projection("failure"), anchorReceiptCount: 4, readCurrentState: async () => state() });
    expect(result.checkRun.id).toBe(2);
    expect(result.duplicateRunIds).toEqual([1]);
    expect(api.runs.map((item) => item.conclusion)).toEqual(["failure", "failure"]);
  });

  it("fails closed when any duplicate cannot be updated", async () => {
    const api = new MemoryChecks([run({ id: 1 }), run({ id: 2 })]);
    api.failUpdateId = 1;
    await expect(publishGateCheck({ api, scope, projection: projection("failure"), anchorReceiptCount: 4, readCurrentState: async () => state() }))
      .rejects.toBeInstanceOf(CheckRunPublishError);
  });

  it("surfaces a check-write outage independently of a degraded-ledger failure", async () => {
    const api = new MemoryChecks([run({ conclusion: "success" })]);
    api.failUpdateId = 1;
    const degraded = {
      ...projection("failure"),
      blockers: [{ code: "ledger-unavailable", detail: "receipt state could not be read" }],
      ledgerVersion: null,
    };

    await expect(publishGateCheck({
      api,
      scope,
      projection: degraded,
      anchorReceiptCount: null,
      readCurrentState: async () => state(),
    })).rejects.toMatchObject({ code: "check-update-failed" });
  });

  it("prevents stale reconcilers from writing after the head advances", async () => {
    const api = new MemoryChecks();
    await expect(publishGateCheck({
      api,
      scope,
      projection: projection("success"),
      anchorReceiptCount: 4,
      readCurrentState: async () => state({ headSha: "f".repeat(40) }),
    })).rejects.toMatchObject({ code: "stale-writer" });
    expect(api.mutations).toHaveLength(0);
  });

  it("uses a shared non-cancelling per-PR concurrency group", () => {
    expect(reviewGateConcurrency("100", 7)).toEqual({ group: "arc-review-gate:100:7", cancelInProgress: false });
  });
});
