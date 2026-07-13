import { describe, expect, it } from "vitest";

import type { ReviewRequest } from "../../../../../../src/scripts/review-gate/core/execution.js";
import { GitHubRestClient } from "../../../../../../src/scripts/review-gate/hosts/github/api/rest.js";
import { buildCodexReviewCommand } from "../../../../../../src/scripts/review-gate/providers/codex/adapter.js";
import {
  GitHubCodexTriggerApi,
  type CodexRequestLocator,
} from "../../../../../../src/scripts/review-gate/providers/codex/github-trigger.js";
import { fetchFake, response } from "../../hosts/github/api/fetch-fake.js";

const HEAD = "a".repeat(40);
const COMMAND = buildCodexReviewCommand("b".repeat(64));

function request(): ReviewRequest {
  return {
    schemaVersion: 1,
    repositoryId: "100",
    changeRequestId: "PR_1",
    changeSetId: "c".repeat(64),
    policyVersion: "d".repeat(64),
    semanticsVersion: "review-gate/v1",
    rubricVersion: "independent-analysis/v1",
    requirementId: "independent-analysis",
    sourceIdentity: "codex-pr",
    coverage: "full",
    coverageFromSha: "e".repeat(40),
    coverageThroughSha: HEAD,
    generation: 0,
    actorIdentity: "302312524",
    requestMechanism: "user-trigger",
    requiredActorIdentity: "7",
    requestCommand: COMMAND,
  };
}

describe("GitHub hosted Codex trigger acknowledgement", () => {
  it("adopts exactly one immutable post-reservation comment by the required actor", async () => {
    const fake = fetchFake([response(200, JSON.stringify([{
      node_id: "IC_trigger",
      html_url: "https://github.test/comment/1",
      user: { id: 7 },
      body: COMMAND,
      created_at: "2026-07-12T20:01:00Z",
      updated_at: "2026-07-12T20:01:00Z",
    }]))]);
    const locator: CodexRequestLocator = {
      resolve: async () => ({ state: "current", pullNumber: 7, reservedAt: "2026-07-12T20:00:00Z" }),
    };
    const trigger = new GitHubCodexTriggerApi({
      rest: new GitHubRestClient({ fetch: fake.fetch, token: "t", sleep: fake.sleep, maxReadAttempts: 1 }),
      owner: "o",
      repo: "r",
      locator,
    });

    await expect(trigger.acknowledgeUserTrigger(request())).resolves.toMatchObject({
      kind: "acknowledged",
      trigger: {
        eventKind: "comment",
        eventId: "IC_trigger",
        actorIdentity: "7",
        occurredAt: "2026-07-12T20:01:00Z",
        headSha: HEAD,
      },
      durableRef: "https://github.test/comment/1",
    });
  });

  it("keeps missing, edited, duplicate, or foreign comments unresolved", async () => {
    const candidates = [{
      node_id: "IC_1",
      html_url: "https://github.test/comment/1",
      user: { id: 7 },
      body: COMMAND,
      created_at: "2026-07-12T20:01:00Z",
      updated_at: "2026-07-12T20:02:00Z",
    }, {
      node_id: "IC_2",
      html_url: "https://github.test/comment/2",
      user: { id: 999 },
      body: COMMAND,
      created_at: "2026-07-12T20:01:00Z",
      updated_at: "2026-07-12T20:01:00Z",
    }];
    const fake = fetchFake([response(200, JSON.stringify(candidates))]);
    const trigger = new GitHubCodexTriggerApi({
      rest: new GitHubRestClient({ fetch: fake.fetch, token: "t", sleep: fake.sleep, maxReadAttempts: 1 }),
      owner: "o",
      repo: "r",
      locator: { resolve: async () => ({ state: "current", pullNumber: 7, reservedAt: "2026-07-12T20:00:00Z" }) },
    });

    await expect(trigger.acknowledgeUserTrigger(request())).resolves.toEqual({ kind: "ambiguous" });
  });
});
