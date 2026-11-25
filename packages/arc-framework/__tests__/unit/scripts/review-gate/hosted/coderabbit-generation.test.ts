/** CodeRabbit attribution while GitHub's review inputs are temporarily incomplete. */

import { describe, expect, it, vi } from "vitest";

import { awaitHostedReview } from "../../../../../src/scripts/review-gate/hosted/await.js";
import { CodeRabbitHostedAdapter } from "../../../../../src/scripts/review-gate/hosted/coderabbit.js";
import type {
  HostedGitHubIssueComment,
  HostedGitHubPort,
  HostedGitHubReview,
  HostedGitHubThread,
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
    await expect(adapter.observe(handle)).resolves.toEqual({ kind: "pending" });
    admittedCommandVisible = true;
    await expect(adapter.observe(handle)).resolves.toMatchObject({
      kind: "clean",
      reviewUrl: firstReview.url,
    });
  });
});

describe("CodeRabbit thread visibility after review submission", () => {
  const reviewWithFinding: HostedGitHubReview = {
    ...firstReview, state: "changes-requested", body: "**Actionable comments posted: 1**",
  };

  function thread(reviewId: string): HostedGitHubThread {
    return {
      id: "PRRT_1",
      isResolved: false,
      comments: [{
        id: "123", reviewId, replyToReviewId: null, actorIdentity: firstReview.actorIdentity,
        body: "_🟠 Major_ broken boundary",
        url: "https://github.com/owner/repo/pull/42#discussion_r1",
        path: "src/a.ts", line: 7, headSha,
      }],
    };
  }

  function adapterWithThreads(readThreads: HostedGitHubPort["readThreads"]): CodeRabbitHostedAdapter {
    return new CodeRabbitHostedAdapter({
      ...readPort(() => [admittedRequest]),
      readReviews: () => Promise.resolve([reviewWithFinding]),
      readThreads,
    });
  }

  it("continues hosted await when a thread appears after its exact-head review", async () => {
    let now = Date.parse(reviewWithFinding.submittedAt) + 1_000;
    const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
    const readThreads = vi.fn<HostedGitHubPort["readThreads"]>()
      .mockResolvedValueOnce([])
      .mockResolvedValue([thread(reviewWithFinding.id)]);

    try {
      await expect(awaitHostedReview({
        schemaVersion: 1, handle, timeoutMs: 5_000, pollIntervalMs: 1_000,
      }, {
        observers: [adapterWithThreads(readThreads)], attentionAfterMs: 15 * 60_000,
        clock: {
          now: () => now,
          sleep: (milliseconds) => { now += milliseconds; return Promise.resolve(); },
        },
      })).resolves.toMatchObject({
        state: "findings",
        findings: [{ findingId: "PRRT_1:123" }],
      });
      expect(readThreads).toHaveBeenCalledTimes(2);
    } finally {
      clock.mockRestore();
    }
  });

  it("refuses a shortfall after the visibility window without counting another review's thread", async () => {
    const submittedAt = Date.parse(reviewWithFinding.submittedAt);
    const clock = vi.spyOn(Date, "now");
    const adapter = adapterWithThreads(() => Promise.resolve([thread(laterReview.id)]));

    try {
      clock.mockReturnValue(submittedAt + 29_999);
      await expect(adapter.observe(handle)).resolves.toEqual({ kind: "pending" });
      clock.mockReturnValue(submittedAt + 30_000);
      await expect(adapter.observe(handle)).resolves.toMatchObject({
        kind: "terminal-failure", reason: expect.stringContaining("provider-actionable-finding-count-mismatch"),
      });
    } finally {
      clock.mockRestore();
    }
  });
});
