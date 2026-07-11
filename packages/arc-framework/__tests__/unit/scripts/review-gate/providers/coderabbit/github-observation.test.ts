import { describe, expect, it } from "vitest";

import { GitHubGraphQLClient } from "../../../../../../src/scripts/review-gate/hosts/github/api/graphql.js";
import { GitHubRestClient } from "../../../../../../src/scripts/review-gate/hosts/github/api/rest.js";
import {
  GitHubCodeRabbitObservationApi,
  type CodeRabbitObservationLocator,
} from "../../../../../../src/scripts/review-gate/providers/coderabbit/github-observation.js";
import type { CodeRabbitRunContext } from "../../../../../../src/scripts/review-gate/providers/coderabbit/adapter.js";
import { fetchFake, response, type FetchStep } from "../../hosts/github/api/fetch-fake.js";

const BOT_ID = "136622811";
const HEAD = "c".repeat(40);

function context(): CodeRabbitRunContext {
  return {
    requestIdentity: "request-1",
    requirementId: "independent-analysis",
    policyVersion: "a".repeat(64),
    rubricVersion: "independent-analysis/v1",
    baseRef: "main",
    diffBaseSha: "b".repeat(40),
    headSha: HEAD,
    changeSetId: "d".repeat(64),
    coverage: "full",
    coverageFromSha: "b".repeat(40),
    coverageThroughSha: HEAD,
    reviewRunId: "PRR_1",
    observedAt: "2026-07-11T20:00:00.000Z",
    trigger: "controller",
  };
}

function locator(input: {
  candidateTailStart?: string | null;
  current?: { pullNumber: number; context: CodeRabbitRunContext; candidateTailStart: string | null } | null;
} = {}): CodeRabbitObservationLocator {
  const value = {
    pullNumber: 7,
    context: context(),
    candidateTailStart: input.candidateTailStart ?? null,
  };
  return {
    resolveRun: async () => value,
    resolveCurrent: async () => input.current === undefined ? value : input.current,
  };
}

function api(restSteps: FetchStep[], gqlSteps: FetchStep[], observationLocator = locator()) {
  const restFake = fetchFake(restSteps);
  const gqlFake = fetchFake(gqlSteps);
  return {
    api: new GitHubCodeRabbitObservationApi({
      rest: new GitHubRestClient({ fetch: restFake.fetch, token: "t", sleep: restFake.sleep, maxReadAttempts: 1 }),
      gql: new GitHubGraphQLClient({ fetch: gqlFake.fetch, token: "t", sleep: gqlFake.sleep, maxReadAttempts: 1 }),
      owner: "o",
      repo: "r",
      expectedBotUserId: BOT_ID,
      locator: observationLocator,
    }),
    restFake,
  };
}

function graphqlThreads(nodes: unknown[] = []): FetchStep {
  return response(200, JSON.stringify({
    data: { repository: { pullRequest: { reviewThreads: {
      nodes,
      pageInfo: { hasNextPage: false, endCursor: null },
    } } } },
  }));
}

function currentArtifacts(summary = "review complete"): FetchStep[] {
  return [
    response(200, JSON.stringify({ check_runs: [{
      name: "CodeRabbit",
      status: "completed",
      conclusion: "success",
      app: { owner: { id: Number(BOT_ID) } },
      output: { summary },
    }] })),
    response(200, JSON.stringify([{
      node_id: "PRR_1",
      html_url: "https://github.test/pull/7#pullrequestreview-1",
      user: { id: Number(BOT_ID), node_id: "BOT_1", login: "coderabbitai[bot]", type: "Bot" },
      state: "APPROVED",
      commit_id: HEAD,
      submitted_at: "2026-07-11T20:00:00Z",
    }])),
    response(200, JSON.stringify([{
      node_id: "IC_1",
      user: { id: Number(BOT_ID) },
      body: "review complete",
      created_at: "2026-07-11T20:00:00Z",
      updated_at: "2026-07-11T20:00:00Z",
    }])),
  ];
}

describe("GitHub CodeRabbit observation API", () => {
  it("normalizes current pinned-bot artifacts as diagnostics without controller findings", async () => {
    const { api: observation } = api(currentArtifacts(), [graphqlThreads([{
      id: "T_1",
      isResolved: true,
      resolvedBy: { __typename: "Bot", id: "BOT_1", databaseId: Number(BOT_ID), login: "coderabbitai[bot]" },
    }])]);

    const signals = await observation.readSignals("request-1");
    expect(signals).toEqual(expect.arrayContaining([
      { kind: "status", state: "success", headSha: HEAD },
      expect.objectContaining({ kind: "review", state: "APPROVED", botUserId: BOT_ID }),
      { kind: "walkthrough", text: "review complete", mutable: false },
      { kind: "thread-resolution", threadNodeId: "T_1", resolvedByBotUserId: BOT_ID },
    ]));
    expect(signals.some((signal) => signal.kind === "finding")).toBe(false);
  });

  it("drops stale-head and wrong-bot artifacts", async () => {
    const { api: observation } = api([
      response(200, JSON.stringify({ check_runs: [] })),
      response(200, JSON.stringify([{
        node_id: "PRR_1",
        html_url: "https://github.test/review",
        user: { id: 999, node_id: "BOT_999", login: "other[bot]", type: "Bot" },
        state: "APPROVED",
        commit_id: "e".repeat(40),
        submitted_at: "2026-07-11T20:00:00Z",
      }])),
      response(200, JSON.stringify([])),
    ], [graphqlThreads()]);

    await expect(observation.readSignals("request-1")).resolves.toEqual([]);
  });

  it("binds checks, comments, and thread resolutions to the pinned bot id", async () => {
    const { api: observation } = api([
      response(200, JSON.stringify({ check_runs: [{
        name: "CodeRabbit",
        status: "completed",
        conclusion: "success",
        app: { owner: { id: 999 } },
        output: { summary: "review complete" },
      }] })),
      response(200, JSON.stringify([])),
      response(200, JSON.stringify([{
        node_id: "IC_999",
        user: { id: 999 },
        body: "foreign provider comment",
        created_at: "2026-07-11T20:00:00Z",
        updated_at: "2026-07-11T20:00:00Z",
      }])),
    ], [graphqlThreads([{
      id: "T_999",
      isResolved: true,
      resolvedBy: { __typename: "Bot", id: "BOT_999", databaseId: 999, login: "other[bot]" },
    }])]);

    await expect(observation.readSignals("request-1")).resolves.toEqual([]);
  });

  it("reports exhausted capacity only for an explicit current durable quota signal", async () => {
    const { api: observation } = api(currentArtifacts("rate limit reached"), [graphqlThreads()]);
    await expect(observation.readCapacity()).resolves.toBe("exhausted");
  });

  it("retains the observed head for a candidate-tail check signal", async () => {
    const tail = "e".repeat(40);
    const { api: observation } = api([
      response(200, JSON.stringify({ check_runs: [] })),
      response(200, JSON.stringify({ check_runs: [{
        name: "CodeRabbit",
        status: "in_progress",
        conclusion: null,
        app: { owner: { id: Number(BOT_ID) } },
        output: { summary: "reviewing lifecycle tail" },
      }] })),
      response(200, JSON.stringify([])),
      response(200, JSON.stringify([])),
    ], [graphqlThreads()], locator({ candidateTailStart: tail }));

    await expect(observation.readSignals("request-1")).resolves.toContainEqual({
      kind: "status",
      state: "pending",
      headSha: tail,
    });
  });

  it("does not treat a tail-only quota message as current capacity exhaustion", async () => {
    const tail = "e".repeat(40);
    const { api: observation, restFake } = api([
      response(200, JSON.stringify({ check_runs: [] })),
    ], [], locator({ candidateTailStart: tail }));

    await expect(observation.readCapacity()).resolves.toBe("not-observable");
    expect(restFake.calls.map((call) => new URL(call.url).pathname)).toEqual([
      `/repos/o/r/commits/${HEAD}/check-runs`,
    ]);
  });

  it("reports capacity as not observable when no current request exists", async () => {
    const { api: observation } = api([], [], locator({ current: null }));

    await expect(observation.readCapacity()).resolves.toBe("not-observable");
  });

  it("fails capacity lookup closed when the current check cannot be normalized", async () => {
    const { api: observation } = api([response(200, JSON.stringify({ check_runs: "invalid" }))], []);

    await expect(observation.readCapacity()).resolves.toBe("lookup-failed");
  });

  it("fails closed when a pinned-bot artifact is malformed", async () => {
    const { api: observation } = api([
      response(200, JSON.stringify({ check_runs: [] })),
      response(200, JSON.stringify([])),
      response(200, JSON.stringify([{ node_id: "IC_1", user: { id: Number(BOT_ID) } }])),
    ], [graphqlThreads()]);

    await expect(observation.readSignals("request-1")).rejects.toThrow("coderabbit-comments-schema-error");
  });
});
