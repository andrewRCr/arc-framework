import { describe, expect, it } from "vitest";

import {
  CodeRabbitHostedAdapter,
  CODERABBIT_HOSTED_REGISTRATION,
} from "../../../../../src/scripts/review-gate/hosted/coderabbit.js";
import {
  HostedGitHubReadError,
  type HostedGitHubPort,
  type HostedGitHubReview,
  type HostedGitHubThread,
} from "../../../../../src/scripts/review-gate/hosted/github.js";
import type { HostedTarget } from "../../../../../src/scripts/review-gate/hosted/request.js";

const HEAD = "a".repeat(40);
const target: HostedTarget = { repository: "owner/repo", pullRequest: 42, headSha: HEAD };

function port(overrides: Partial<HostedGitHubPort> = {}): HostedGitHubPort {
  return {
    currentActorIdentity: () => Promise.resolve("1234"),
    readHead: () => Promise.resolve(HEAD),
    createIssueComment: (_target, body) => Promise.resolve({
      kind: "created",
      artifact: {
        kind: "issue-comment",
        id: "IC_1",
        url: "https://github.com/owner/repo/pull/42#issuecomment-1",
        createdAt: "2026-07-23T12:00:00.000Z",
      },
      actorIdentity: "1234",
      body,
    }),
    readReviews: () => Promise.resolve([]),
    readThreads: () => Promise.resolve([]),
    readIssueComments: () => Promise.resolve([]),
    readCheckRuns: () => Promise.resolve([]),
    findReplies: () => Promise.resolve([]),
    postReply: () => Promise.resolve({ kind: "ambiguous" }),
    readThread: () => Promise.resolve({ kind: "missing" }),
    resolveThread: () => Promise.resolve({ kind: "ambiguous" }),
    ...overrides,
  };
}

function review(input: Partial<HostedGitHubReview> = {}): HostedGitHubReview {
  return {
    id: "PRR_1",
    url: "https://github.com/owner/repo/pull/42#pullrequestreview-1",
    actorIdentity: "136622811",
    state: "approved",
    headSha: HEAD,
    body: "**Actionable comments posted: 0**",
    submittedAt: "2026-07-23T12:05:00.000Z",
    ...input,
  };
}

function findingThread(body: string): HostedGitHubThread {
  return {
    id: "PRRT_1",
    isResolved: false,
    comments: [{
      id: "123",
      reviewId: "PRR_1",
      actorIdentity: "136622811",
      body,
      url: "https://github.com/owner/repo/pull/42#discussion_r1",
      path: "src/a.ts",
      line: 7,
      headSha: HEAD,
    }],
  };
}

describe("CodeRabbit hosted adapter", () => {
  it("requests and normalizes clean and finding results under immutable identity", async () => {
    const clean = new CodeRabbitHostedAdapter(port({ readReviews: () => Promise.resolve([review()]) }));
    const findings = new CodeRabbitHostedAdapter(port({
      readReviews: () => Promise.resolve([review({ state: "changes-requested", body: "" })]),
      readThreads: () => Promise.resolve([findingThread("_🟠 Major_ broken boundary")]),
    }));

    await expect(clean.request(target)).resolves.toMatchObject({ kind: "created", artifact: { id: "IC_1" } });
    await expect(clean.observeHandle(target)).resolves.toMatchObject({ kind: "clean" });
    await expect(findings.observeHandle(target)).resolves.toMatchObject({
      kind: "findings",
      findings: [{ threadId: "PRRT_1", severity: "major" }],
    });
    expect(CODERABBIT_HOSTED_REGISTRATION.identities.botUserId).toBe("136622811");
  });

  it("keeps rate limiting, transient reads, and malformed terminal output distinct", async () => {
    const rateLimited = new CodeRabbitHostedAdapter(port({
      createIssueComment: () => Promise.resolve({ kind: "rate-limited" }),
    }));
    const transient = new CodeRabbitHostedAdapter(port({
      readReviews: () => Promise.reject(new HostedGitHubReadError("transient-unavailable")),
    }));
    const malformed = new CodeRabbitHostedAdapter(port({
      readReviews: () => Promise.resolve([review({ state: "changes-requested", body: "" })]),
      readThreads: () => Promise.resolve([findingThread("severity omitted")]),
    }));

    await expect(rateLimited.request(target)).resolves.toEqual({ kind: "rate-limited" });
    await expect(transient.observeHandle(target)).resolves.toEqual({ kind: "transient-unavailable" });
    await expect(malformed.observeHandle(target)).resolves.toMatchObject({ kind: "terminal-failure" });
  });
});
