import { describe, expect, it } from "vitest";

import { GitHubGraphQLClient } from "../../../../../../src/scripts/review-gate/hosts/github/api/graphql.js";
import { GitHubRestClient } from "../../../../../../src/scripts/review-gate/hosts/github/api/rest.js";
import { GitHubSettlementReader } from "../../../../../../src/scripts/review-gate/hosts/github/settlement.js";
import { fetchFake, response } from "./api/fetch-fake.js";

describe("App-authenticated settlement reads", () => {
  it("finds only an exact actor/body/time reply and reads exact thread resolution", async () => {
    const fake = fetchFake([
      response(200, JSON.stringify([{ id: 81, in_reply_to_id: 41, user: { id: 7 }, body: "Fixed", created_at: "2026-07-12T21:00:00Z" }])),
      response(200, JSON.stringify({ data: { node: { id: "PRRT_1", isResolved: true, resolvedBy: { id: "7" } } } })),
    ]);
    const rest = new GitHubRestClient({ fetch: fake.fetch, token: "app-token", sleep: fake.sleep, maxReadAttempts: 1 });
    const graphql = new GitHubGraphQLClient({ fetch: fake.fetch, token: "app-token", sleep: fake.sleep, maxReadAttempts: 1 });
    const reader = new GitHubSettlementReader(rest, graphql, "o", "r");
    await expect(reader.findReplies({ pullRequestNumber: 7, commentId: "41", actorIdentity: "7", body: "Fixed", notBefore: "2026-07-12T20:59:00Z" }))
      .resolves.toEqual([{ commentId: "81", actorIdentity: "7", body: "Fixed", createdAt: "2026-07-12T21:00:00Z" }]);
    await expect(reader.readThread("PRRT_1")).resolves.toEqual({ threadId: "PRRT_1", isResolved: true, resolvedByActorIdentity: "7" });
  });

  it("fails closed on unavailable or stale canonical state", async () => {
    const fake = fetchFake([response(500, "failure")]);
    const reader = new GitHubSettlementReader(
      new GitHubRestClient({ fetch: fake.fetch, token: "app-token", sleep: fake.sleep, maxReadAttempts: 1 }),
      new GitHubGraphQLClient({ fetch: fake.fetch, token: "app-token", sleep: fake.sleep, maxReadAttempts: 1 }),
      "o", "r",
    );
    await expect(reader.findReplies({ pullRequestNumber: 7, commentId: "41", actorIdentity: "7", body: "Fixed", notBefore: "2026-07-12T20:59:00Z" }))
      .rejects.toThrow("settlement-reply-read-failed");
  });
});
