import { describe, expect, it } from "vitest";

import { GitHubRestClient } from "../../../../../../src/scripts/review-gate/hosts/github/api/rest.js";
import {
  GitHubReviewCommandCommentReader,
  GitHubReviewCommandCommentError,
} from "../../../../../../src/scripts/review-gate/hosts/github/command-comments.js";
import { fetchFake, response, type FetchStep } from "./api/fetch-fake.js";

function reader(steps: FetchStep[]) {
  const fake = fetchFake(steps);
  const rest = new GitHubRestClient({ fetch: fake.fetch, token: "t", sleep: fake.sleep, maxReadAttempts: 1 });
  return { reader: new GitHubReviewCommandCommentReader(rest, "o", "r", 7), fake };
}

describe("GitHub review command comments", () => {
  it("retains immutable comment and actor identities with durable host provenance", async () => {
    const { reader: target, fake } = reader([response(200, JSON.stringify([{
      id: 99,
      node_id: "IC_99",
      body: "/review-gate require analysis inspect this change",
      created_at: "2026-07-11T20:00:00Z",
      updated_at: "2026-07-11T20:01:00Z",
      html_url: "https://github.test/pull/7#issuecomment-99",
      user: { id: 7, node_id: "U_7", login: "alice-renamed", type: "User" },
    }]))]);

    await expect(target.list()).resolves.toEqual([{
      commentId: 99,
      commentNodeId: "IC_99",
      actor: { login: "alice-renamed", expectedActorId: "7" },
      actorNodeId: "U_7",
      body: "/review-gate require analysis inspect this change",
      createdAt: "2026-07-11T20:00:00Z",
      updatedAt: "2026-07-11T20:01:00Z",
      durableRef: "https://github.test/pull/7#issuecomment-99",
    }]);
    expect(fake.calls.map((call) => [new URL(call.url).pathname, new URL(call.url).searchParams.get("per_page")]))
      .toEqual([["/repos/o/r/issues/7/comments", "100"]]);
  });

  it("fails closed rather than returning a partial command list for malformed host data", async () => {
    const { reader: target } = reader([response(200, JSON.stringify([{
      id: 99,
      node_id: "IC_99",
      body: "/review-gate require analysis inspect this change",
      created_at: "2026-07-11T20:00:00Z",
      updated_at: "2026-07-11T20:01:00Z",
      user: { id: 7, node_id: "U_7", login: "alice", type: "User" },
    }]))]);

    await expect(target.list()).rejects.toMatchObject({
      name: GitHubReviewCommandCommentError.name,
      code: "command-comments-schema-error",
    });
  });
});
