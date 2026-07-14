import { describe, expect, it } from "vitest";

import { GitHubGraphQLClient } from "../../../../../../src/scripts/review-gate/hosts/github/api/graphql.js";
import { GitHubRestClient } from "../../../../../../src/scripts/review-gate/hosts/github/api/rest.js";
import {
  GitHubCodexObservationApi,
  type CodexObservationLocator,
} from "../../../../../../src/scripts/review-gate/providers/codex/github-observation.js";
import type { CodexRunContext } from "../../../../../../src/scripts/review-gate/providers/codex/adapter.js";
import { fetchFake, response, type FetchStep } from "../../hosts/github/api/fetch-fake.js";

const HEAD = "a".repeat(40);
const APP_ID = "1144995";
const BOT_ID = "199175422";

function context(): CodexRunContext {
  return {
    requestIdentity: "request-1",
    requirementId: "independent-analysis",
    policyVersion: "b".repeat(64),
    rubricVersion: "independent-analysis/v1",
    baseRef: "main",
    diffBaseSha: "c".repeat(40),
    headSha: HEAD,
    changeSetId: "d".repeat(64),
    coverage: "full",
    coverageFromSha: "c".repeat(40),
    coverageThroughSha: HEAD,
    reviewRunId: "request-1",
    observedAt: "2026-07-12T20:00:00Z",
    triggerEventId: "IC_trigger",
    triggerOccurredAt: "2026-07-12T20:00:00Z",
    guidanceDigest: "e".repeat(64),
  };
}

function api(
  restSteps: FetchStep[],
  gqlSteps: FetchStep[],
  resolvePrefix: (prefix: string, headSha: string) => Promise<string | null> = async () => HEAD,
) {
  const restFake = fetchFake(restSteps);
  const gqlFake = fetchFake(gqlSteps);
  const locator: CodexObservationLocator = {
    resolveRun: async () => ({ pullNumber: 7, context: context() }),
    resolveCurrent: async () => ({ pullNumber: 7, context: context() }),
  };
  return new GitHubCodexObservationApi({
    rest: new GitHubRestClient({ fetch: restFake.fetch, token: "t", sleep: restFake.sleep, maxReadAttempts: 1 }),
    gql: new GitHubGraphQLClient({ fetch: gqlFake.fetch, token: "t", sleep: gqlFake.sleep, maxReadAttempts: 1 }),
    owner: "o",
    repo: "r",
    expectedAppId: APP_ID,
    expectedBotUserId: BOT_ID,
    locator,
    resolveCommitPrefix: resolvePrefix,
  });
}

function threads(nodes: unknown[] = []): FetchStep {
  return response(200, JSON.stringify({
    data: { repository: { pullRequest: { reviewThreads: {
      nodes,
      pageInfo: { hasNextPage: false, endCursor: null },
    } } } },
  }));
}

describe("GitHub hosted Codex observation", () => {
  it("pins an unedited clean comment to the Codex App, bot, and uniquely resolved head", async () => {
    const body = `Codex Review:\n\nDidn't find any major issues.\n\nReviewed commit: ${HEAD.slice(0, 12)}`;
    const observation = api([
      response(200, JSON.stringify([])),
      response(200, JSON.stringify([{
        node_id: "IC_clean",
        html_url: "https://github.test/comment/1",
        user: { id: Number(BOT_ID) },
        performed_via_github_app: { id: Number(APP_ID) },
        body,
        created_at: "2026-07-12T20:04:00Z",
        updated_at: "2026-07-12T20:04:00Z",
      }])),
    ], [threads()]);

    await expect(observation.readSignals("request-1")).resolves.toContainEqual({
      kind: "issue-comment",
      nodeId: "IC_clean",
      appId: APP_ID,
      botUserId: BOT_ID,
      body,
      createdAt: "2026-07-12T20:04:00Z",
      updatedAt: "2026-07-12T20:04:00Z",
      resolvedCommitSha: HEAD,
      url: "https://github.test/comment/1",
    });
  });

  it("correlates P1 inline findings to the pinned full-commit review and thread", async () => {
    const observation = api([
      response(200, JSON.stringify([{
        node_id: "PRR_1",
        html_url: "https://github.test/review/1",
        user: { id: Number(BOT_ID), node_id: "BOT_1", login: "chatgpt-codex-connector[bot]", type: "Bot" },
        state: "COMMENTED",
        commit_id: HEAD,
        submitted_at: "2026-07-12T20:04:00Z",
        body: "",
      }])),
      response(200, JSON.stringify([])),
    ], [threads([{
      id: "T_1",
      isResolved: false,
      resolvedBy: null,
      comments: {
        nodes: [{
          id: "PRRC_1",
          body: "P1: unsafe path traversal",
          url: "https://github.test/discussion/1",
          path: "src/a.ts",
          line: 7,
          originalLine: 7,
          commit: { oid: HEAD },
          originalCommit: { oid: HEAD },
          pullRequestReview: { id: "PRR_1" },
          author: { __typename: "Bot", id: "BOT_1", databaseId: Number(BOT_ID), login: "chatgpt-codex-connector[bot]" },
        }],
        pageInfo: { hasNextPage: false },
      },
    }])]);

    await expect(observation.readSignals("request-1")).resolves.toContainEqual({
      kind: "finding",
      findingId: "T_1",
      commentNodeId: "PRRC_1",
      threadNodeId: "T_1",
      reviewNodeId: "PRR_1",
      botUserId: BOT_ID,
      locus: "src/a.ts:7",
      severity: "high",
      url: "https://github.test/discussion/1",
    });
  });

  it("retains unknown or ambiguous reviewed markers as non-resolving observations", async () => {
    const body = "Codex Review:\n\nDidn't find any major issues.\n\nReviewed commit: deadbee";
    const observation = api([
      response(200, JSON.stringify([])),
      response(200, JSON.stringify([{
        node_id: "IC_clean",
        html_url: "https://github.test/comment/1",
        user: { id: Number(BOT_ID) },
        performed_via_github_app: { id: Number(APP_ID) },
        body,
        created_at: "2026-07-12T20:04:00Z",
        updated_at: "2026-07-12T20:04:00Z",
      }])),
    ], [threads()], async () => null);

    await expect(observation.readSignals("request-1")).resolves.toContainEqual(
      expect.objectContaining({ kind: "issue-comment", resolvedCommitSha: null }),
    );
  });
});
