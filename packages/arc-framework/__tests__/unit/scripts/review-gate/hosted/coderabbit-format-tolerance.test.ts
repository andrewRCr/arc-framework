/**
 * CodeRabbit's hosted review keeps changing its wording and layout. These cases hold the reader to one rule: it either
 * reads every finding, stops naming the review for a manual read, or keeps waiting while the review is unfinished. It
 * never records a review it could not fully read as clean, and never waits on a finished one.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { CodeRabbitHostedAdapter } from "../../../../../src/scripts/review-gate/hosted/coderabbit.js";
import { parseCodeRabbitReviewBody } from "../../../../../src/scripts/review-gate/hosted/coderabbit-body.js";
import type {
  HostedGitHubIssueComment,
  HostedGitHubPort,
  HostedGitHubReview,
} from "../../../../../src/scripts/review-gate/hosted/github.js";
import type { HostedTarget } from "../../../../../src/scripts/review-gate/hosted/request.js";
import { createHostedHandleFixture } from "../../../../fixtures/hosted-review.js";

const HEAD = "a".repeat(40);
const target: HostedTarget = { repository: "owner/repo", pullRequest: 42, headSha: HEAD };
const LOCUS = "packages/arc-framework/__tests__/integration/git-executor-cancellation.test.ts:181-181";
const additionalCommentsBody = readFileSync(new URL(
  "../../../../fixtures/coderabbit-hosted/additional-comments-review-body.txt", import.meta.url), "utf8");
const unmarkedCompletionReply = readFileSync(new URL(
  "../../../../fixtures/coderabbit-hosted/unmarked-completion-reply.txt", import.meta.url), "utf8");

function port(reviews: HostedGitHubReview[], comments: HostedGitHubIssueComment[]): HostedGitHubPort {
  return {
    currentActorIdentity: () => Promise.resolve("1234"),
    readHead: () => Promise.resolve(HEAD),
    createIssueComment: () => Promise.reject(new Error("no request expected")),
    readReviews: () => Promise.resolve(reviews),
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

function review(body = additionalCommentsBody, state: HostedGitHubReview["state"] = "commented"): HostedGitHubReview {
  return {
    id: "PRR_1",
    url: "https://github.com/owner/repo/pull/42#pullrequestreview-1",
    actorIdentity: "136622811",
    state,
    headSha: HEAD,
    body,
    submittedAt: "2026-07-23T12:05:00.000Z",
  };
}

function request(): HostedGitHubIssueComment {
  return {
    id: "IC_REQUEST",
    url: "https://github.com/owner/repo/pull/42#issuecomment-request",
    actorIdentity: "1234",
    body: "@coderabbitai full review",
    createdAt: "2026-07-23T12:00:00.000Z",
    updatedAt: "2026-07-23T12:00:00.000Z",
  };
}

function reply(body = unmarkedCompletionReply, updatedAt = "2026-07-23T12:05:07.000Z"): HostedGitHubIssueComment {
  return {
    id: "IC_REPLY",
    url: "https://github.com/owner/repo/pull/42#issuecomment-reply",
    actorIdentity: "136622811",
    appId: "347564",
    body,
    createdAt: "2026-07-23T12:00:06.000Z",
    updatedAt,
  };
}

function handle(): ReturnType<typeof createHostedHandleFixture> {
  return createHostedHandleFixture({
    provider: "coderabbit-pr",
    requestedCoverage: "complete",
    effectiveCoverage: "complete",
    target,
    artifact: {
      kind: "issue-comment",
      id: "IC_REQUEST",
      url: "https://github.com/owner/repo/pull/42#issuecomment-request",
      createdAt: "2026-07-23T12:00:00.000Z",
    },
  });
}

function observe(reviews: HostedGitHubReview[], comments: HostedGitHubIssueComment[]) {
  return new CodeRabbitHostedAdapter(port(reviews, comments)).observe(handle());
}

describe("CodeRabbit hosted review wording and layout changes", () => {
  it("reads a finding under a section label it does not know, without a completion icon or finding marker", async () => {
    await expect(observe([review()], [request(), reply()])).resolves.toEqual({
      kind: "findings",
      reviewUrl: review().url,
      findings: [expect.objectContaining({
        origin: "review-body",
        reviewId: "PRR_1",
        settlement: "not-applicable",
        severity: "minor",
        locus: LOCUS,
        sourceOrdinal: 1,
      })],
    });
  });

  it("does not mark an unlabelled minor finding as a nit", () => {
    const parsed = parseCodeRabbitReviewBody(review());
    if (parsed.kind !== "parsed") throw new Error(parsed.reason);
    expect(parsed.findings).toHaveLength(1);
    expect(parsed.findings[0]).not.toHaveProperty("nit");
  });

  it("stops at once naming the review when a finished reply's wording is unrecognized", async () => {
    const result = await observe([review()], [request(), reply(unmarkedCompletionReply.replace(
      "Full review finished.", "All set."))]);

    expect(result).toMatchObject({ kind: "terminal-failure" });
    if (result.kind !== "terminal-failure") throw new Error("expected a stop");
    expect(result.reason).toContain(review().url);
    expect(result.reason).toContain(HEAD);
  });

  it("settles on completion wording CodeRabbit rephrases", async () => {
    await expect(observe([review()], [request(), reply(unmarkedCompletionReply.replace(
      "Full review finished.", "✅ Full review completed!"))])).resolves.toMatchObject({ kind: "findings" });
  });

  it("stops naming the review when the finished reply reports a review other than the one requested", async () => {
    const result = await observe([review()], [request(), reply(unmarkedCompletionReply.replace(
      "Full review finished.", "Review finished."))]);

    expect(result).toMatchObject({ kind: "terminal-failure" });
    if (result.kind !== "terminal-failure") throw new Error("expected a stop");
    expect(result.reason).toContain(review().url);
  });

  it("keeps waiting while the tagged reply still reports the review running after the review posts", async () => {
    await expect(observe([review()], [request(), reply(unmarkedCompletionReply.replace(
      "Full review finished.", "Full review triggered."))])).resolves.toEqual({ kind: "pending" });
  });

  it("keeps waiting while the tagged reply was last edited before the review", async () => {
    await expect(observe([review()], [request(), reply(unmarkedCompletionReply.replace(
      "Full review finished.", "Full review triggered."), "2026-07-23T12:00:06.000Z")]))
      .resolves.toEqual({ kind: "pending" });
  });

  it("never records an approved review as clean when a finding-shaped item sits outside a counted section", async () => {
    const uncounted = additionalCommentsBody.replace("Additional comments: 1</summary>", "Additional comments</summary>");
    const result = await observe([review(uncounted, "approved")], [request(), reply()]);

    expect(result).toMatchObject({ kind: "terminal-failure" });
    if (result.kind !== "terminal-failure") throw new Error("expected a stop");
    expect(result.reason).toContain("provider-body-finding-unattributed");
    expect(result.reason).toContain(review().url);
  });
});

describe("CodeRabbit review bodies without per-finding markers", () => {
  it("derives the same fingerprint for the same item and a different one for changed text", () => {
    const first = parseCodeRabbitReviewBody(review());
    const again = parseCodeRabbitReviewBody(review());
    const changed = parseCodeRabbitReviewBody(review(additionalCommentsBody.replace("Remove the direct", "Drop the direct")));
    if (first.kind !== "parsed" || again.kind !== "parsed" || changed.kind !== "parsed") throw new Error("expected parses");

    expect(first.findings[0]?.fingerprint).toBe(again.findings[0]?.fingerprint);
    expect(first.findings[0]?.fingerprint).not.toBe(changed.findings[0]?.fingerprint);
  });

  it("reads an unmarked nitpick section's minor items as nits", () => {
    const parsed = parseCodeRabbitReviewBody(review(additionalCommentsBody.replace(
      "Additional comments: 1", "Nitpick comments (1)")));
    if (parsed.kind !== "parsed") throw new Error(parsed.reason);

    expect(parsed.findings).toEqual([expect.objectContaining({ locus: LOCUS, severity: "minor", nit: true })]);
  });

  it("refuses an unmarked group whose items disagree with its count", () => {
    const parsed = parseCodeRabbitReviewBody(review(additionalCommentsBody
      .replace("Additional comments: 1", "Additional comments: 2")
      .replace("git-executor-cancellation.test.ts: 1", "git-executor-cancellation.test.ts: 2")));

    expect(parsed).toMatchObject({ kind: "malformed", reason: expect.stringContaining("finding-count-mismatch") });
  });

  it("counts a finding section with an unknown label and ignores counted sections that hold no findings", () => {
    const parsed = parseCodeRabbitReviewBody(review());
    if (parsed.kind !== "parsed") throw new Error(parsed.reason);

    expect(parsed.supplementalCounts).toEqual({ nitpick: 0, "outside-diff": 0, other: 1 });
  });
});

describe("CodeRabbit caution callouts without per-finding markers", () => {
  function calloutItem(title: string): string {
    return `
> <details>
> <summary><em>🟠 Major</em> · ${title} · <code>legacy.ts:12</code></summary><blockquote>
>
> \`src/legacy.ts:12\`
> _🩺 Stability & Availability_ | _🟠 Major_
>
> **${title}**
>
> </blockquote></details>`;
  }

  function calloutReview(count: number, ...titles: string[]): HostedGitHubReview {
    return review(`**Actionable comments posted: 0**

> [!CAUTION]
> **⚠️ Outside diff range comments (${count})**
>${titles.map(calloutItem).join("\n>")}`, "approved");
  }

  it("reads each unmarked item as one finding with its own fingerprint", () => {
    const parsed = parseCodeRabbitReviewBody(calloutReview(2, "Guard the first path", "Guard the second path"));
    if (parsed.kind !== "parsed") throw new Error(parsed.reason);

    expect(parsed.supplementalCounts).toEqual({ nitpick: 0, "outside-diff": 2, other: 0 });
    expect(parsed.findings).toEqual([
      expect.objectContaining({ locus: "src/legacy.ts:12", severity: "major", sourceLabel: "Guard the first path" }),
      expect.objectContaining({ locus: "src/legacy.ts:12", severity: "major", sourceLabel: "Guard the second path" }),
    ]);
    expect(parsed.findings[0]?.fingerprint).not.toBe(parsed.findings[1]?.fingerprint);
    expect(parsed.findings[1]?.body).toMatch(/\*\*Guard the second path\*\*$/u);
  });

  it("never records an approved review as clean when its callout header carries no count", () => {
    const uncounted = calloutReview(2, "Guard the first path", "Guard the second path");
    const parsed = parseCodeRabbitReviewBody({
      ...uncounted, body: uncounted.body.replace("Outside diff range comments (2)", "Outside diff range comments"),
    });

    expect(parsed).toMatchObject({ kind: "malformed", reason: expect.stringContaining("provider-body-finding-unattributed") });
    if (parsed.kind !== "malformed") throw new Error("expected a refusal");
    expect(parsed.reason).toContain(review().url);
  });

  it("refuses an unmarked callout whose items disagree with its count", () => {
    expect(parseCodeRabbitReviewBody(calloutReview(2, "Guard the only path"))).toMatchObject({
      kind: "malformed",
      reason: expect.stringContaining("provider-supplemental-section-count-mismatch"),
    });
  });
});
