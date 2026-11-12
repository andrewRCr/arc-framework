/** Distinct inline comments in one provider thread retain distinct finding identities. */

import { describe, expect, it } from "vitest";

import { CodeRabbitHostedAdapter } from "../../../../../src/scripts/review-gate/hosted/coderabbit.js";
import type { HostedGitHubPort, HostedGitHubThread } from
  "../../../../../src/scripts/review-gate/hosted/github.js";
import { createHostedHandleFixture } from "../../../../fixtures/hosted-review.js";

const headSha = "a".repeat(40);
const requestedAt = "2026-07-23T12:00:00.000Z";
const target = { repository: "owner/repo", pullRequest: 42, headSha };
const thread: HostedGitHubThread = {
  id: "PRRT_1",
  isResolved: false,
  comments: ["123", "124"].map((id) => ({
    id,
    reviewId: "PRR_1",
    replyToReviewId: null,
    actorIdentity: "136622811",
    body: `_🟠 Major_ concern ${id}`,
    url: `https://github.com/owner/repo/pull/42#discussion_r${id}`,
    path: "src/a.ts",
    line: 7,
    headSha,
  })),
};

function port(): HostedGitHubPort {
  return {
    currentActorIdentity: () => Promise.resolve("1234"),
    readHead: () => Promise.resolve(headSha),
    createIssueComment: () => Promise.reject(new Error("not used")),
    readReviews: () => Promise.resolve([{
      id: "PRR_1", url: "https://github.com/owner/repo/pull/42#pullrequestreview-1",
      actorIdentity: "136622811", state: "changes-requested", headSha,
      body: "**Actionable comments posted: 2**", submittedAt: "2026-07-23T12:05:00.000Z",
    }]),
    readThreads: () => Promise.resolve([thread]),
    readIssueComments: () => Promise.resolve([{
      id: "IC_REQUEST", url: "https://github.com/owner/repo/pull/42#issuecomment-request",
      actorIdentity: "1234", body: "@coderabbitai full review",
      createdAt: requestedAt, updatedAt: requestedAt,
    }]),
    readCheckRuns: () => Promise.resolve([]),
    readCommitStatuses: () => Promise.resolve([]),
    findReplies: () => Promise.resolve([]),
    postReply: () => Promise.resolve({ kind: "ambiguous" }),
    readThread: () => Promise.resolve({ kind: "missing" }),
    resolveThread: () => Promise.resolve({ kind: "ambiguous" }),
  };
}

describe("CodeRabbit finding identity", () => {
  it("retains two actionable comments from one review thread", async () => {
    const handle = createHostedHandleFixture({
      provider: "coderabbit-pr", requestedCoverage: "complete", effectiveCoverage: "complete",
      target,
      artifact: { kind: "issue-comment", id: "IC_REQUEST",
        url: "https://github.com/owner/repo/pull/42#issuecomment-request", createdAt: requestedAt },
    });
    const result = await new CodeRabbitHostedAdapter(port()).observe(handle);
    expect(result).toMatchObject({ kind: "findings" });
    if (result.kind !== "findings") return;
    expect(result.findings.map(({ findingId }) => findingId)).toEqual(["PRRT_1:123", "PRRT_1:124"]);
    expect(result.findings.map(({ sourceOrdinal }) => sourceOrdinal)).toEqual([1, 2]);
  });
});
