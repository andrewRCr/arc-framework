/** Authenticated command rate limits preserve request attribution and source fallback. */

import { describe, expect, it } from "vitest";

import { createHostedHandleFixture } from "../../../../fixtures/hosted-review.js";
import { CodeRabbitHostedAdapter } from "../../../../../src/scripts/review-gate/hosted/coderabbit.js";
import { awaitHostedReview } from "../../../../../src/scripts/review-gate/hosted/await.js";
import type {
  HostedGitHubIssueComment,
  HostedGitHubPort,
} from "../../../../../src/scripts/review-gate/hosted/github.js";
import type { HostedReviewCoverage } from "../../../../../src/scripts/review-gate/hosted/request.js";
import { resolveReviewPolicy } from "../../../../../src/scripts/review-gate/policy/review-policy-driver.js";
import { projectStandardReviewObligation } from
  "../../../../../src/scripts/review-gate/policy/standard-review-projection.js";

const headSha = "a".repeat(40);
const target = { repository: "owner/repo", pullRequest: 42, headSha };
const requestedAt = "2026-10-03T15:59:58Z";
const rateLimitBody = `<!-- This is an auto-generated reply by CodeRabbit -->
<!-- CodeRabbit review command invocation: v2:8241e8f15b9245d8ec1c78b43e6530c7402e4763ec9aa93132ead6c5f23433ba -->
<details>
<summary>⚠️ Action not completed</summary>

Review rate limited.

</details>`;

function requestComment(coverage: HostedReviewCoverage): HostedGitHubIssueComment {
  return {
    id: "IC_REQUEST",
    url: "https://github.com/owner/repo/pull/42#issuecomment-request",
    actorIdentity: "1234",
    body: coverage === "complete" ? "@coderabbitai full review" : "@coderabbitai review",
    createdAt: requestedAt,
    updatedAt: requestedAt,
  };
}

function rateLimitReply(overrides: Partial<HostedGitHubIssueComment> = {}): HostedGitHubIssueComment {
  return {
    id: "IC_REPLY",
    url: "https://github.com/owner/repo/pull/42#issuecomment-reply",
    actorIdentity: "136622811",
    appId: "347564",
    body: rateLimitBody,
    createdAt: "2026-10-03T16:00:06Z",
    updatedAt: "2026-10-03T16:00:06Z",
    ...overrides,
  };
}

function readPort(comments: HostedGitHubIssueComment[]): HostedGitHubPort {
  return {
    currentActorIdentity: () => Promise.resolve("1234"),
    readHead: () => Promise.resolve(headSha),
    createIssueComment: () => Promise.reject(new Error("Observation does not create requests")),
    readReviews: () => Promise.resolve([]),
    readThreads: () => Promise.resolve([]),
    readIssueComments: () => Promise.resolve(comments),
    readCheckRuns: () => Promise.resolve([]),
    readCommitStatuses: () => Promise.resolve([]),
    findReplies: () => Promise.resolve([]),
    postReply: () => Promise.resolve({ kind: "ambiguous" }),
    readThread: () => Promise.resolve({ kind: "missing" }),
    resolveThread: () => Promise.resolve({ kind: "ambiguous" }),
  };
}

function handle(coverage: HostedReviewCoverage) {
  const request = requestComment(coverage);
  return createHostedHandleFixture({
    provider: "coderabbit-pr",
    requestedCoverage: coverage,
    effectiveCoverage: coverage,
    target,
    artifact: {
      kind: "issue-comment",
      id: request.id,
      url: request.url,
      createdAt: requestedAt,
    },
  });
}

describe("CodeRabbit command rate limits", () => {
  it.each(["complete", "incremental"] as const)(
    "continues %s review at the next source without spending the admitted pass",
    async (coverage) => {
      const adapter = new CodeRabbitHostedAdapter(readPort([
        requestComment(coverage), rateLimitReply(),
      ]));
      let now = Date.parse(requestedAt);
      const result = await awaitHostedReview({
        schemaVersion: 1,
        handle: handle(coverage),
        timeoutMs: 2_000,
        pollIntervalMs: 500,
      }, {
        observers: [adapter],
        attentionAfterMs: 900_000,
        clock: {
          now: () => now,
          sleep: (milliseconds) => { now += milliseconds; return Promise.resolve(); },
        },
      });
      expect(result).toMatchObject({ state: "rate-limited", nextAction: "try-next-source" });
      if (result.state !== "rate-limited") throw new Error("Rate-limit continuation was not returned");
      const policy = resolveReviewPolicy({
        schemaVersion: 1,
        target,
        lane: "standard",
        frontlineActive: false,
        standardReview: projectStandardReviewObligation({
          schemaVersion: 1,
          authorSelfReview: "required",
          frontlineAction: "attempt",
          standardReview: "required",
          retrigger: "incremental",
          assuranceMode: "none",
          reasons: ["routine-code"],
        }),
        completedPasses: 0,
        attempts: [{ sourceId: "coderabbit-pr", outcome: result.state }],
        scopeSelection: { mode: "whole-target", target },
        sources: ["coderabbit-pr", "codex-pr"],
        maxPasses: 2,
      });
      expect(policy).toMatchObject({
        state: "ready",
        nextAction: "hosted-request",
        payload: { sourceId: "codex-pr", pass: 1, consumedPass: false },
      });
    },
  );
  it("settles an earlier rate-limited generation before attributing the current refusal", async () => {
    const earlierRequest = requestComment("complete");
    const earlierReply = rateLimitReply({
      id: "IC_EARLIER_REPLY",
      createdAt: "2026-10-03T15:59:05Z",
      updatedAt: "2026-10-03T15:59:05Z",
    });
    const adapter = new CodeRabbitHostedAdapter(readPort([
      { ...earlierRequest, id: "IC_EARLIER_REQUEST", createdAt: "2026-10-03T15:59:00Z" },
      earlierReply,
      requestComment("complete"),
      rateLimitReply(),
    ]));
    await expect(adapter.observe(handle("complete"))).resolves.toEqual({ kind: "rate-limited" });
  });

  it.each([
    { name: "a foreign actor", comments: [requestComment("complete"), rateLimitReply({ actorIdentity: "999" })] },
    { name: "a foreign app", comments: [requestComment("complete"), rateLimitReply({ appId: "999" })] },
    { name: "an absent request", comments: [rateLimitReply()] },
    { name: "an earlier reply", comments: [requestComment("complete"), rateLimitReply({
      createdAt: "2026-10-03T15:59:00Z", updatedAt: "2026-10-03T15:59:00Z",
    })] },
    { name: "a missing invocation marker", comments: [requestComment("complete"), rateLimitReply({
      body: rateLimitBody.replace("CodeRabbit review command invocation:", "Unrelated marker:"),
    })] },
    { name: "multiple invocation markers", comments: [requestComment("complete"), rateLimitReply({
      body: rateLimitBody + "\n<!-- CodeRabbit review command invocation: duplicate -->",
    })] },
    { name: "competing refusal reasons", comments: [requestComment("complete"), rateLimitReply({
      body: rateLimitBody.replace("Review rate limited.", "Review rate limited.\nReview skipped: too many files."),
    })] },
  ])("keeps $name from becoming a source fallback", async ({ comments }) => {
    const adapter = new CodeRabbitHostedAdapter(readPort(comments));
    await expect(adapter.observe(handle("complete"))).resolves.toEqual({ kind: "pending" });
  });

  it("rejects a changed request artifact instead of falling back", async () => {
    const adapter = new CodeRabbitHostedAdapter(readPort([
      { ...requestComment("complete"), url: "https://github.com/owner/repo/pull/42#different" },
      rateLimitReply(),
    ]));
    await expect(adapter.observe(handle("complete"))).resolves.toEqual({
      kind: "terminal-failure", reason: "provider-request-generation-overlap",
    });
  });

  it("does not attribute a rate-limit reply beyond a newer request", async () => {
    const adapter = new CodeRabbitHostedAdapter(readPort([
      requestComment("complete"),
      { ...requestComment("complete"), id: "IC_LATER_REQUEST", createdAt: "2026-10-03T16:00:02Z" },
      rateLimitReply(),
    ]));
    await expect(adapter.observe(handle("complete"))).resolves.toEqual({ kind: "pending" });
  });
});
