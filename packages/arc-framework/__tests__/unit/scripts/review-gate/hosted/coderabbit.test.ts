import { describe, expect, it } from "vitest";

import {
  CodeRabbitHostedAdapter,
  CODERABBIT_HOSTED_REGISTRATION,
} from "../../../../../src/scripts/review-gate/hosted/coderabbit.js";
import {
  HostedGitHubReadError,
  type HostedGitHubCommitStatus,
  type HostedGitHubIssueComment,
  type HostedGitHubPort,
  type HostedGitHubReview,
  type HostedGitHubThread,
} from "../../../../../src/scripts/review-gate/hosted/github.js";
import type {
  HostedRequestHandle,
  HostedTarget,
} from "../../../../../src/scripts/review-gate/hosted/request.js";

const HEAD = "a".repeat(40);
const REQUESTED_AT = "2026-07-23T12:00:00.000Z";
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
    readCommitStatuses: () => Promise.resolve([]),
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

function completionStatus(overrides: Partial<HostedGitHubCommitStatus> = {}): HostedGitHubCommitStatus {
  return {
    context: "CodeRabbit",
    state: "success",
    description: "Review completed",
    createdAt: "2026-07-23T12:05:00.000Z",
    updatedAt: "2026-07-23T12:05:00.000Z",
    ...overrides,
  };
}

function summaryComment(
  reviewedHead = HEAD,
  overrides: Partial<HostedGitHubIssueComment> = {},
): HostedGitHubIssueComment {
  return {
    id: "IC_SUMMARY",
    url: "https://github.com/owner/repo/pull/42#issuecomment-summary",
    actorIdentity: "136622811",
    appId: "347564",
    body: `<!-- recent_review_start -->

No actionable comments were generated in the recent review. 🎉

Reviewing files that changed between ${"b".repeat(40)} and ${reviewedHead}.

<!-- recent_review_end -->`,
    createdAt: "2026-07-23T11:00:00.000Z",
    updatedAt: "2026-07-23T12:05:00.000Z",
    ...overrides,
  };
}

function commandReply(overrides: Partial<HostedGitHubIssueComment> = {}): HostedGitHubIssueComment {
  return {
    id: "IC_REPLY",
    url: "https://github.com/owner/repo/pull/42#issuecomment-reply",
    actorIdentity: "136622811",
    appId: "347564",
    body: `<!-- CodeRabbit review command invocation: invocation-id -->
<summary>✅ Action performed</summary>

Review finished.`,
    createdAt: "2026-07-23T12:01:00.000Z",
    updatedAt: "2026-07-23T12:05:00.000Z",
    ...overrides,
  };
}

function requestHandle(): HostedRequestHandle {
  return {
    schemaVersion: 1,
    provider: "coderabbit-pr",
    requestedCoverage: "incremental",
    effectiveCoverage: "incremental",
    target,
    artifact: {
      kind: "issue-comment",
      id: "IC_REQUEST",
      url: "https://github.com/owner/repo/pull/42#issuecomment-request",
      createdAt: REQUESTED_AT,
    },
  };
}

describe("CodeRabbit hosted adapter", () => {
  it.each([
    ["readHead", "rate-limited"],
    ["currentActorIdentity", "transient-unavailable"],
    ["readHead", "terminal-failure"],
  ] as const)("normalizes pre-effect %s %s failures", async (boundary, kind) => {
    const failure = new HostedGitHubReadError(kind, `${boundary}-${kind}`);
    const adapter = new CodeRabbitHostedAdapter(port({
      [boundary]: () => Promise.reject(failure),
    }));

    await expect(adapter.request(target, "complete")).resolves.toEqual(
      kind === "terminal-failure"
        ? { kind, reason: `${boundary}-${kind}` }
        : { kind },
    );
  });

  it("requests and normalizes clean and finding results under immutable identity", async () => {
    const clean = new CodeRabbitHostedAdapter(port({ readReviews: () => Promise.resolve([review()]) }));
    const findings = new CodeRabbitHostedAdapter(port({
      readReviews: () => Promise.resolve([review({
        state: "changes-requested",
        body: "Review complete.",
      })]),
      readThreads: () => Promise.resolve([findingThread("_🟠 Major_ broken boundary")]),
    }));

    await expect(clean.request(target, "complete")).resolves.toMatchObject({
      kind: "created",
      effectiveCoverage: "complete",
      artifact: { id: "IC_1" },
    });
    await expect(clean.observeHandle(target)).resolves.toMatchObject({ kind: "clean" });
    await expect(findings.observeHandle(target)).resolves.toMatchObject({
      kind: "findings",
      findings: [{
        origin: "review-thread",
        threadId: "PRRT_1",
        settlement: "reply-and-resolve",
        severity: "major",
      }],
    });
    expect(CODERABBIT_HOSTED_REGISTRATION.identities.botUserId).toBe("136622811");
    expect(CODERABBIT_HOSTED_REGISTRATION.identities.appOwnerId).toBe("132028505");
    expect(CODERABBIT_HOSTED_REGISTRATION.identities.appId).toBe("347564");
  });

  it("recognizes exact-head clean completion without a new review object", async () => {
    const adapter = new CodeRabbitHostedAdapter(port({
      readIssueComments: () => Promise.resolve([summaryComment(), commandReply()]),
      readCommitStatuses: () => Promise.resolve([completionStatus()]),
    }));

    await expect(adapter.observe(requestHandle())).resolves.toMatchObject({ kind: "clean" });
  });

  it.each([
    {
      name: "stale summary",
      comments: [summaryComment(HEAD, { updatedAt: "2026-07-23T11:59:59.000Z" }), commandReply()],
      checks: [completionStatus()],
    },
    {
      name: "mismatched reviewed head",
      comments: [summaryComment("c".repeat(40)), commandReply()],
      checks: [completionStatus()],
    },
    {
      name: "untrusted summary",
      comments: [summaryComment(HEAD, { appId: "999" }), commandReply()],
      checks: [completionStatus()],
    },
    {
      name: "missing command reply",
      comments: [summaryComment()],
      checks: [completionStatus()],
    },
    {
      name: "missing completion status",
      comments: [summaryComment(), commandReply()],
      checks: [],
    },
  ])("keeps $name pending without the complete structural proof", async ({ comments, checks }) => {
    const adapter = new CodeRabbitHostedAdapter(port({
      readIssueComments: () => Promise.resolve(comments),
      readCommitStatuses: () => Promise.resolve(checks),
    }));

    await expect(adapter.observe(requestHandle())).resolves.toEqual({ kind: "pending" });
  });

  it.each([
    ["empty-body", ""],
    ["prose-only", "Review complete. No actionable comments."],
  ])("accepts %s approved reviews when structured findings are empty", async (_name, body) => {
    const adapter = new CodeRabbitHostedAdapter(port({
      readReviews: () => Promise.resolve([review({ body })]),
    }));

    await expect(adapter.observeHandle(target)).resolves.toMatchObject({ kind: "clean" });
  });

  it.each(["-1", "1.5"])("rejects a present malformed actionable count of %s", async (count) => {
    const adapter = new CodeRabbitHostedAdapter(port({
      readReviews: () => Promise.resolve([review({
        body: `**Actionable comments posted: ${count}**`,
      })]),
    }));

    await expect(adapter.observeHandle(target)).resolves.toEqual({
      kind: "terminal-failure",
      reason: "malformed-provider-actionable-count",
    });
  });

  it.each([
    ["complete", "@coderabbitai full review"],
    ["incremental", "@coderabbitai review"],
  ] as const)("maps %s coverage to the provider command", async (coverage, command) => {
    let posted = "";
    const adapter = new CodeRabbitHostedAdapter(port({
      createIssueComment: (_target, body) => {
        posted = body;
        return Promise.resolve({
          kind: "created",
          artifact: {
            kind: "issue-comment",
            id: "IC_1",
            url: "https://github.com/owner/repo/pull/42#issuecomment-1",
            createdAt: "2026-07-23T12:00:00.000Z",
          },
          actorIdentity: "1234",
          body,
        });
      },
    }));

    await expect(adapter.request(target, coverage)).resolves.toMatchObject({
      kind: "created",
      effectiveCoverage: coverage,
    });
    expect(posted).toBe(command);
  });

  it("binds provider checks to the GitHub App owner rather than the bot account", async () => {
    const check = {
      name: "CodeRabbit",
      status: "completed",
      conclusion: "failure",
      summary: "",
    };
    const wrongOwner = new CodeRabbitHostedAdapter(port({
      readCheckRuns: () => Promise.resolve([{ ...check, appOwnerIdentity: "136622811" }]),
    }));
    const appOwner = new CodeRabbitHostedAdapter(port({
      readCheckRuns: () => Promise.resolve([{ ...check, appOwnerIdentity: "132028505" }]),
    }));

    await expect(wrongOwner.observeHandle(target)).resolves.toEqual({ kind: "pending" });
    await expect(appOwner.observeHandle(target)).resolves.toEqual({
      kind: "terminal-failure",
      reason: "provider-check-failure",
    });
  });

  it("returns review-body nitpicks as triage-only findings", async () => {
    const adapter = new CodeRabbitHostedAdapter(port({
      readReviews: () => Promise.resolve([review({
        body: `<details>
<summary>🧹 Nitpick comments (1)</summary><blockquote>

<details>
<summary>src/a.ts (1)</summary><blockquote>

\`7-9\`: _📐 Maintainability & Code Quality_ | _🔵 Trivial_ | _⚡ Quick win_

**Keep the boundary explicit.**

The contract should distinguish findings that have no review thread.

<!-- cr-comment:v1:abcdef1234567890abcdef12 -->

</blockquote></details>
</blockquote></details>`,
      })]),
    }));

    await expect(adapter.observeHandle(target)).resolves.toMatchObject({
      kind: "findings",
      findings: [{
        findingId: "PRR_1:abcdef1234567890abcdef12",
        origin: "review-body",
        reviewId: "PRR_1",
        fingerprint: "abcdef1234567890abcdef12",
        settlement: "not-applicable",
        severity: "minor",
        locus: "src/a.ts:7-9",
      }],
    });
    const result = await adapter.observeHandle(target);
    expect(result.kind).toBe("findings");
    if (result.kind === "findings") {
      expect(result.findings[0]).not.toHaveProperty("commentId");
      expect(result.findings[0]).not.toHaveProperty("threadId");
    }
  });

  it("normalizes outside-diff comments under the same no-settlement contract", async () => {
    const adapter = new CodeRabbitHostedAdapter(port({
      readReviews: () => Promise.resolve([review({
        body: `**Actionable comments posted: 0**

<details>
<summary>📌 Outside diff comments (1)</summary><blockquote>

<details>
<summary>src/legacy.ts (1)</summary><blockquote>

\`12\`: _🩺 Stability & Availability_ | _🟡 Minor_ | _⚡ Quick win_

**Preserve the compatibility boundary.**

This finding has no inline review thread.

<!-- cr-comment:v1:1234567890abcdef12345678 -->

</blockquote></details>
</blockquote></details>`,
      })]),
    }));

    await expect(adapter.observeHandle(target)).resolves.toMatchObject({
      kind: "findings",
      findings: [{
        origin: "review-body",
        settlement: "not-applicable",
        locus: "src/legacy.ts:12",
      }],
    });
  });

  it.each([
    {
      name: "inline count",
      review: review({ state: "changes-requested", body: "**Actionable comments posted: 2**" }),
      threads: [findingThread("_🟠 Major_ broken boundary")],
      reason: "provider-actionable-finding-count-mismatch",
    },
    {
      name: "review-body count",
      review: review({
        body: `**Actionable comments posted: 0**

<details>
<summary>🧹 Nitpick comments (2)</summary><blockquote>

<details>
<summary>src/a.ts (1)</summary><blockquote>

\`7\`: _📐 Maintainability & Code Quality_ | _🔵 Trivial_ | _⚡ Quick win_

**One advertised finding is missing.**

<!-- cr-comment:v1:abcdef1234567890abcdef12 -->

</blockquote></details>
</blockquote></details>`,
      }),
      threads: [],
      reason: "provider-nitpick-group-count-mismatch",
    },
  ])("fails closed when the advertised $name cannot be reconciled", async (input) => {
    const adapter = new CodeRabbitHostedAdapter(port({
      readReviews: () => Promise.resolve([input.review]),
      readThreads: () => Promise.resolve(input.threads),
    }));

    await expect(adapter.observeHandle(target)).resolves.toEqual({
      kind: "terminal-failure",
      reason: input.reason,
    });
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

    await expect(rateLimited.request(target, "complete")).resolves.toEqual({ kind: "rate-limited" });
    await expect(transient.observeHandle(target)).resolves.toEqual({ kind: "transient-unavailable" });
    await expect(malformed.observeHandle(target)).resolves.toMatchObject({ kind: "terminal-failure" });
  });

  it("threads bounded-await cancellation through every hosted read", async () => {
    const signal = new AbortController().signal;
    const observed: Array<AbortSignal | undefined> = [];
    const adapter = new CodeRabbitHostedAdapter(port({
      readHead: (_target, options) => {
        observed.push(options?.signal);
        return Promise.resolve(HEAD);
      },
      readReviews: (_target, options) => {
        observed.push(options?.signal);
        return Promise.resolve([]);
      },
      readThreads: (_target, options) => {
        observed.push(options?.signal);
        return Promise.resolve([]);
      },
      readCheckRuns: (_target, options) => {
        observed.push(options?.signal);
        return Promise.resolve([]);
      },
      readCommitStatuses: (_target, options) => {
        observed.push(options?.signal);
        return Promise.resolve([]);
      },
      readIssueComments: (_target, options) => {
        observed.push(options?.signal);
        return Promise.resolve([]);
      },
    }));

    await adapter.readHead({
      schemaVersion: 1,
      provider: "coderabbit-pr",
      requestedCoverage: "complete",
      effectiveCoverage: "complete",
      target,
      artifact: {
        kind: "issue-comment",
        id: "IC_1",
        url: "https://github.com/owner/repo/pull/42#issuecomment-1",
        createdAt: "2026-07-23T12:00:00.000Z",
      },
    }, { signal });
    await adapter.observe({
      schemaVersion: 1,
      provider: "coderabbit-pr",
      requestedCoverage: "complete",
      effectiveCoverage: "complete",
      target,
      artifact: {
        kind: "issue-comment",
        id: "IC_1",
        url: "https://github.com/owner/repo/pull/42#issuecomment-1",
        createdAt: "2026-07-23T12:00:00.000Z",
      },
    }, { signal });

    expect(observed).toEqual([signal, signal, signal, signal, signal, signal]);
  });
});
