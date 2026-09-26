/** CodeRabbit request-generation attribution when issue comments are temporarily incomplete. */

import { describe, expect, it } from "vitest";

import { CodeRabbitHostedAdapter } from "../../../../../src/scripts/review-gate/hosted/coderabbit.js";
import type {
  HostedGitHubIssueComment,
  HostedGitHubPort,
  HostedGitHubReview,
} from "../../../../../src/scripts/review-gate/hosted/github.js";
import { createHostedHandleFixture } from "../../../../fixtures/hosted-review.js";

const headSha = "a".repeat(40);
const target = { repository: "owner/repo", pullRequest: 42, headSha };
const requestedAt = "2026-07-23T12:00:00.000Z";
const admittedRequest: HostedGitHubIssueComment = {
  id: "IC_REQUEST",
  url: "https://github.com/owner/repo/pull/42#issuecomment-request",
  actorIdentity: "1234",
  body: "@coderabbitai full review",
  createdAt: requestedAt,
  updatedAt: requestedAt,
};
const laterRequest: HostedGitHubIssueComment = {
  ...admittedRequest,
  id: "IC_LATER_REQUEST",
  url: "https://github.com/owner/repo/pull/42#issuecomment-later-request",
  createdAt: "2026-07-23T12:10:00.000Z",
  updatedAt: "2026-07-23T12:10:00.000Z",
};
const firstReview: HostedGitHubReview = {
  id: "PRR_FIRST",
  url: "https://github.com/owner/repo/pull/42#pullrequestreview-first",
  actorIdentity: "136622811",
  state: "approved",
  headSha,
  body: "**Actionable comments posted: 0**",
  submittedAt: "2026-07-23T12:05:00.000Z",
};
const laterReview: HostedGitHubReview = {
  ...firstReview,
  id: "PRR_LATER",
  url: "https://github.com/owner/repo/pull/42#pullrequestreview-later",
  submittedAt: "2026-07-23T12:12:00.000Z",
};

function readPort(readComments: () => HostedGitHubIssueComment[]): HostedGitHubPort {
  return {
    currentActorIdentity: () => Promise.resolve("1234"),
    readHead: () => Promise.resolve(headSha),
    createIssueComment: () => Promise.reject(new Error("request is not used in observation test")),
    readReviews: () => Promise.resolve([firstReview, laterReview]),
    readThreads: () => Promise.resolve([]),
    readIssueComments: () => Promise.resolve(readComments()),
    readCheckRuns: () => Promise.resolve([]),
    readCommitStatuses: () => Promise.resolve([]),
    findReplies: () => Promise.resolve([]),
    postReply: () => Promise.resolve({ kind: "ambiguous" }),
    readThread: () => Promise.resolve({ kind: "missing" }),
    resolveThread: () => Promise.resolve({ kind: "ambiguous" }),
  };
}

describe("CodeRabbit request generation attribution", () => {
  it("waits for the admitted command before attributing a same-head review", async () => {
    let admittedCommandVisible = false;
    const adapter = new CodeRabbitHostedAdapter(readPort(() => [
      ...(admittedCommandVisible ? [admittedRequest] : []),
      laterRequest,
    ]));
    const handle = createHostedHandleFixture({
      provider: "coderabbit-pr",
      requestedCoverage: "complete",
      effectiveCoverage: "complete",
      target,
      artifact: {
        kind: "issue-comment",
        id: admittedRequest.id,
        url: admittedRequest.url,
        createdAt: requestedAt,
      },
    });

    await expect(adapter.observe(handle)).resolves.toEqual({ kind: "pending" });
    admittedCommandVisible = true;
    await expect(adapter.observe(handle)).resolves.toMatchObject({
      kind: "clean",
      reviewUrl: firstReview.url,
    });
  });
});
