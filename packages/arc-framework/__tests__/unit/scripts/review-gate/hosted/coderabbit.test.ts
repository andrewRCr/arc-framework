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
  HostedReviewCoverage,
  HostedRequestHandle,
  HostedTarget,
} from "../../../../../src/scripts/review-gate/hosted/request.js";
import { createHostedHandleFixture } from "../../../../fixtures/hosted-review.js";

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
      replyToReviewId: null,
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

function requestComment(
  coverage: HostedReviewCoverage = "complete",
  overrides: Partial<HostedGitHubIssueComment> = {},
): HostedGitHubIssueComment {
  return {
    id: "IC_REQUEST",
    url: "https://github.com/owner/repo/pull/42#issuecomment-request",
    actorIdentity: "1234",
    body: coverage === "complete" ? "@coderabbitai full review" : "@coderabbitai review",
    createdAt: REQUESTED_AT,
    updatedAt: REQUESTED_AT,
    ...overrides,
  };
}

function earlierRequestComment(): HostedGitHubIssueComment {
  return requestComment("incremental", {
    id: "IC_EARLIER_REQUEST",
    url: "https://github.com/owner/repo/pull/42#issuecomment-earlier-request",
    createdAt: "2026-07-23T11:59:00.000Z",
    updatedAt: "2026-07-23T11:59:00.000Z",
  });
}

function earlierCommandReply(
  overrides: Partial<HostedGitHubIssueComment> = {},
): HostedGitHubIssueComment {
  return commandReply({
    id: "IC_EARLIER_REPLY",
    url: "https://github.com/owner/repo/pull/42#issuecomment-earlier-reply",
    createdAt: "2026-07-23T11:59:30.000Z",
    updatedAt: "2026-07-23T11:59:30.000Z",
    ...overrides,
  });
}

function refusalReply(overrides: Partial<HostedGitHubIssueComment> = {}): HostedGitHubIssueComment {
  return {
    id: "IC_REFUSAL",
    url: "https://github.com/owner/repo/pull/42#issuecomment-refusal",
    actorIdentity: "136622811",
    appId: "347564",
    body: `<!-- This is an auto-generated reply by CodeRabbit -->
<!-- CodeRabbit review command invocation: v2:2231a0bd83a0f44c86025a20d7f21fd762788d0d2e3ab0c6be13162a04e42597 -->
<details>
<summary>⚠️ Action not completed</summary>

Review skipped: 200 files exceed the limit of 150.

</details>`,
    createdAt: "2026-07-23T12:00:08.000Z",
    updatedAt: "2026-07-23T12:00:14.000Z",
    ...overrides,
  };
}

function requestHandle(coverage: HostedReviewCoverage = "incremental"): HostedRequestHandle {
  return createHostedHandleFixture({
    provider: "coderabbit-pr",
    requestedCoverage: coverage,
    effectiveCoverage: coverage,
    target,
    artifact: {
      kind: "issue-comment",
      id: "IC_REQUEST",
      url: "https://github.com/owner/repo/pull/42#issuecomment-request",
      createdAt: REQUESTED_AT,
    },
  });
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
        sourceOrdinal: 1,
        sourceLabel: "_🟠 Major_ broken boundary",
      }],
    });
    expect(CODERABBIT_HOSTED_REGISTRATION.identities.botUserId).toBe("136622811");
    expect(CODERABBIT_HOSTED_REGISTRATION.identities.appOwnerId).toBe("132028505");
    expect(CODERABBIT_HOSTED_REGISTRATION.identities.appId).toBe("347564");
  });

  it.each([
    ["_🔴 Critical_ broken boundary", "critical"],
    ["_🟠 Major_ broken boundary", "major"],
    ["_🟡 Minor_ broken boundary", "minor"],
    ["_🔵 Trivial_ broken boundary", "minor"],
  ] as const)("normalizes native finding %s to ARC severity %s", async (body, arcSeverity) => {
    const adapter = new CodeRabbitHostedAdapter(port({
      readReviews: () => Promise.resolve([review({ state: "changes-requested", body: "Review complete." })]),
      readThreads: () => Promise.resolve([findingThread(body)]),
    }));

    await expect(adapter.observeHandle(target)).resolves.toMatchObject({
      kind: "findings",
      findings: [{ severity: arcSeverity }],
    });
  });

  it("accepts a terminal incremental finding sequence with the admitted native range", async () => {
    const adapter = new CodeRabbitHostedAdapter(port({
      readReviews: () => Promise.resolve([review({
        state: "changes-requested",
        body: "Review complete.",
      })]),
      readThreads: () => Promise.resolve([findingThread("_🟠 Major_ broken boundary")]),
      readIssueComments: () => Promise.resolve([summaryComment()]),
    }));

    await expect(adapter.observe(requestHandle("incremental"))).resolves.toMatchObject({
      kind: "findings",
      findings: [{ severity: "major", locus: "src/a.ts:7" }],
      coverageEvidence: {
        status: "established",
        requestArtifactId: "IC_REQUEST",
        baselineSha: "b".repeat(40),
        headSha: HEAD,
        providerGeneration: { artifactId: "IC_SUMMARY" },
      },
    });
  });

  it("preserves an explicit thread-level nitpick marker", async () => {
    const adapter = new CodeRabbitHostedAdapter(port({
      readReviews: () => Promise.resolve([review({ state: "changes-requested", body: "Review complete." })]),
      readThreads: () => Promise.resolve([findingThread("_🔵 Trivial_\n\nNitpick: simplify the name")]),
    }));

    await expect(adapter.observeHandle(target)).resolves.toMatchObject({
      kind: "findings",
      findings: [{ severity: "minor", nit: true }],
    });
  });

  it.each(["findings", "clean"] as const)(
    "keeps prior-thread confirmations pending until the fresh %s review arrives",
    async (resultKind) => {
      const resolutionBody = `Thanks for the correction.\n\n✅ Review thread resolved.\n\n`
        + `_You are interacting with an AI system._\n\n`
        + `<!-- This is an auto-generated reply by CodeRabbit -->`;
      const priorRoot = {
        ...findingThread("_🟠 Major_ prior concern").comments[0]!,
        id: "prior-finding",
        reviewId: "PRR_PRIOR",
        headSha: "b".repeat(40),
        replyToReviewId: null,
      };
      const firstConfirmation = {
        ...priorRoot,
        id: "confirmation-1",
        reviewId: "PRR_CONFIRM_1",
        headSha: HEAD,
        replyToReviewId: "PRR_PRIOR",
        body: resolutionBody,
      };
      const priorThread: HostedGitHubThread = {
        id: "PRRT_PRIOR",
        isResolved: true,
        comments: [priorRoot, firstConfirmation],
      };
      const reviews: HostedGitHubReview[] = [review({
        id: "PRR_CONFIRM_1",
        state: "commented",
        body: "",
        submittedAt: "2026-07-23T12:02:00.000Z",
      })];
      const threads: HostedGitHubThread[] = [priorThread];
      const adapter = new CodeRabbitHostedAdapter(port({
        readReviews: () => Promise.resolve(reviews),
        readThreads: () => Promise.resolve(threads),
        readIssueComments: () => Promise.resolve([requestComment()]),
      }));

      await expect(adapter.observe(requestHandle("complete"))).resolves.toEqual({ kind: "pending" });

      const fresh = review({
        id: "PRR_FRESH",
        state: resultKind === "findings" ? "changes-requested" : "approved",
        body: `**Actionable comments posted: ${resultKind === "findings" ? 1 : 0}**`,
        submittedAt: "2026-07-23T12:04:00.000Z",
      });
      reviews.push(fresh);
      if (resultKind === "findings") {
        const freshThread = findingThread("_🟠 Major_ new concern");
        threads.push({
          ...freshThread,
          id: "PRRT_FRESH",
          comments: [{
            ...freshThread.comments[0]!,
            id: "fresh-finding",
            reviewId: fresh.id,
            replyToReviewId: null,
          }],
        });
      }
      await expect(adapter.observe(requestHandle("complete"))).resolves.toMatchObject({
        kind: resultKind,
        reviewUrl: fresh.url,
      });

      reviews.push(review({
        id: "PRR_CONFIRM_2",
        state: "commented",
        body: "",
        submittedAt: "2026-07-23T12:05:00.000Z",
      }));
      priorThread.comments.push({
        ...firstConfirmation,
        id: "confirmation-2",
        reviewId: "PRR_CONFIRM_2",
      });
      await expect(adapter.observe(requestHandle("complete"))).resolves.toMatchObject({
        kind: resultKind,
        reviewUrl: fresh.url,
      });
    },
  );

  it("does not discard an ungraded new reply to an older review thread", async () => {
    const oldRoot = {
      ...findingThread("_🟠 Major_ prior concern").comments[0]!,
      id: "old-root",
      reviewId: "PRR_PRIOR",
      headSha: "b".repeat(40),
    };
    const adapter = new CodeRabbitHostedAdapter(port({
      readReviews: () => Promise.resolve([review({ state: "commented", body: "" })]),
      readThreads: () => Promise.resolve([{
        id: "PRRT_PRIOR",
        isResolved: false,
        comments: [oldRoot, {
          ...oldRoot,
          id: "new-ungraded-reply",
          reviewId: "PRR_1",
          replyToReviewId: "PRR_PRIOR",
          headSha: HEAD,
          body: "This new concern has no severity marker.",
        }],
      }]),
      readIssueComments: () => Promise.resolve([requestComment()]),
    }));

    await expect(adapter.observe(requestHandle("complete"))).resolves.toMatchObject({
      kind: "terminal-failure",
      reason: expect.stringContaining("provider-thread-finding-severity-unrecognized"),
    });
  });

  it("keeps a new finding when its review also carries a prior-thread confirmation", async () => {
    const oldRoot = {
      ...findingThread("_🟠 Major_ prior concern").comments[0]!,
      id: "old-root",
      reviewId: "PRR_PRIOR",
      headSha: "b".repeat(40),
    };
    const newFinding = findingThread("_🟠 Major_ fresh concern");
    const adapter = new CodeRabbitHostedAdapter(port({
      readReviews: () => Promise.resolve([review({
        state: "changes-requested",
        body: "**Actionable comments posted: 1**",
      })]),
      readThreads: () => Promise.resolve([{
        id: "PRRT_PRIOR",
        isResolved: true,
        comments: [oldRoot, {
          ...oldRoot,
          id: "confirmation",
          reviewId: "PRR_1",
          replyToReviewId: "PRR_PRIOR",
          headSha: HEAD,
          body: `The correction is verified.\n\n✅ Review thread resolved.\n\n`
            + `_You are interacting with an AI system._\n\n`
            + `<!-- This is an auto-generated reply by CodeRabbit -->`,
        }],
      }, {
        ...newFinding,
        id: "PRRT_FRESH",
        comments: [{ ...newFinding.comments[0]!, id: "fresh-finding" }],
      }]),
      readIssueComments: () => Promise.resolve([requestComment()]),
    }));

    await expect(adapter.observe(requestHandle("complete"))).resolves.toMatchObject({
      kind: "findings",
      findings: [{ findingId: "PRRT_FRESH", commentId: "fresh-finding", severity: "major" }],
    });
  });

  it("recognizes exact-head clean completion without a new review object", async () => {
    const adapter = new CodeRabbitHostedAdapter(port({
      readIssueComments: () => Promise.resolve([summaryComment(), commandReply()]),
      readCommitStatuses: () => Promise.resolve([completionStatus()]),
    }));

    await expect(adapter.observe(requestHandle("incremental"))).resolves.toMatchObject({ kind: "clean" });
  });

  it.each([
    {
      name: "mismatched baseline",
      comments: [summaryComment(HEAD, {
        body: `<!-- recent_review_start -->

Reviewing files that changed between ${"c".repeat(40)} and ${HEAD}.

<!-- recent_review_end -->`,
      })],
      reason: "provider-incremental-range-mismatch",
    },
    {
      name: "missing range",
      comments: [summaryComment(HEAD, {
        body: `<!-- recent_review_start -->

Review complete.

<!-- recent_review_end -->`,
      })],
      reason: "provider-incremental-range-missing",
    },
    {
      name: "untrusted range",
      comments: [summaryComment(HEAD, { appId: "999" })],
      reason: "provider-incremental-range-missing",
    },
    {
      name: "ambiguous ranges",
      comments: [summaryComment(HEAD, {
        body: `<!-- recent_review_start -->

Reviewing files that changed between ${"b".repeat(40)} and ${HEAD}.
Reviewing files that changed between ${"c".repeat(40)} and ${HEAD}.

<!-- recent_review_end -->`,
      })],
      reason: "provider-incremental-range-ambiguous",
    },
  ])("retains a terminal result without crediting $name", async ({ comments, reason }) => {
    const adapter = new CodeRabbitHostedAdapter(port({
      readReviews: () => Promise.resolve([review()]),
      readIssueComments: () => Promise.resolve(comments),
    }));

    await expect(adapter.observe(requestHandle("incremental"))).resolves.toMatchObject({
      kind: "clean",
      coverageEvidence: {
        status: "unestablished",
        requestArtifactId: "IC_REQUEST",
        reason,
      },
    });
  });

  it("fails closed when a different request command shares the admitted artifact timestamp", async () => {
    const adapter = new CodeRabbitHostedAdapter(port({
      readReviews: () => Promise.resolve([review()]),
      readIssueComments: () => Promise.resolve([
        {
          id: "IC_REQUEST",
          url: "https://github.com/owner/repo/pull/42#issuecomment-request",
          actorIdentity: "1234",
          body: "@coderabbitai review",
          createdAt: REQUESTED_AT,
          updatedAt: REQUESTED_AT,
        },
        {
          id: "IC_COMPETING",
          url: "https://github.com/owner/repo/pull/42#issuecomment-competing",
          actorIdentity: "5678",
          body: "@coderabbitai full review",
          createdAt: REQUESTED_AT,
          updatedAt: REQUESTED_AT,
        },
        summaryComment(),
      ]),
    }));

    await expect(adapter.observe(requestHandle("incremental"))).resolves.toEqual({
      kind: "terminal-failure",
      reason: "provider-request-generation-overlap",
    });
  });

  it("does not attribute a late review to a current command while an earlier generation is unresolved", async () => {
    const adapter = new CodeRabbitHostedAdapter(port({
      readReviews: () => Promise.resolve([review()]),
      readIssueComments: () => Promise.resolve([
        earlierRequestComment(),
        requestComment("incremental"),
        summaryComment(),
      ]),
    }));

    await expect(adapter.observe(requestHandle("incremental"))).resolves.toEqual({
      kind: "terminal-failure",
      reason: "provider-request-generation-overlap",
    });
  });

  it("retains clean completion when the reply carries multiple invocation markers", async () => {
    const adapter = new CodeRabbitHostedAdapter(port({
      readIssueComments: () => Promise.resolve([summaryComment(), commandReply({
        body: `<!-- CodeRabbit review command invocation: invocation-id -->
<!-- CodeRabbit review command invocation: duplicate-marker -->
<summary>✅ Action performed</summary>

Review finished.`,
      })]),
      readCommitStatuses: () => Promise.resolve([completionStatus()]),
    }));

    await expect(adapter.observe(requestHandle())).resolves.toMatchObject({ kind: "clean" });
  });

  it("recognizes an authenticated refusal correlated to the exact request comment", async () => {
    const adapter = new CodeRabbitHostedAdapter(port({
      readIssueComments: () => Promise.resolve([requestComment(), refusalReply()]),
    }));

    await expect(adapter.observe(requestHandle("complete"))).resolves.toEqual({
      kind: "terminal-failure",
      reason: "provider-request-refused: Review skipped: 200 files exceed the limit of 150.",
    });
  });

  it("recognizes a refusal created in the request timestamp second", async () => {
    const adapter = new CodeRabbitHostedAdapter(port({
      readIssueComments: () => Promise.resolve([
        requestComment(),
        refusalReply({ createdAt: REQUESTED_AT, updatedAt: REQUESTED_AT }),
      ]),
    }));

    await expect(adapter.observe(requestHandle("complete"))).resolves.toEqual({
      kind: "terminal-failure",
      reason: "provider-request-refused: Review skipped: 200 files exceed the limit of 150.",
    });
  });

  it("refuses attribution while an earlier request remains unresolved", async () => {
    const adapter = new CodeRabbitHostedAdapter(port({
      readIssueComments: () => Promise.resolve([
        earlierRequestComment(),
        requestComment(),
        refusalReply(),
      ]),
    }));

    await expect(adapter.observe(requestHandle("complete"))).resolves.toEqual({
      kind: "terminal-failure",
      reason: "provider-request-generation-overlap",
    });
  });

  it("recognizes the current refusal after an earlier request received an authenticated reply", async () => {
    const adapter = new CodeRabbitHostedAdapter(port({
      readIssueComments: () => Promise.resolve([
        earlierRequestComment(),
        earlierCommandReply(),
        requestComment(),
        refusalReply(),
      ]),
    }));

    await expect(adapter.observe(requestHandle("complete"))).resolves.toEqual({
      kind: "terminal-failure",
      reason: "provider-request-refused: Review skipped: 200 files exceed the limit of 150.",
    });
  });

  it("recognizes the current refusal after an earlier multi-marker completion reply", async () => {
    const adapter = new CodeRabbitHostedAdapter(port({
      readIssueComments: () => Promise.resolve([
        earlierRequestComment(),
        earlierCommandReply({
          body: `<!-- CodeRabbit review command invocation: invocation-id -->
<!-- CodeRabbit review command invocation: duplicate-marker -->
<summary>✅ Action performed</summary>

Review finished.`,
        }),
        requestComment(),
        refusalReply(),
      ]),
    }));

    await expect(adapter.observe(requestHandle("complete"))).resolves.toEqual({
      kind: "terminal-failure",
      reason: "provider-request-refused: Review skipped: 200 files exceed the limit of 150.",
    });
  });

  it.each([
    { name: "untrusted actor", overrides: { actorIdentity: "999" } },
    { name: "untrusted app", overrides: { appId: "999" } },
  ])("refuses attribution after an invocation reply from an $name", async ({ overrides }: {
    overrides: Partial<HostedGitHubIssueComment>;
  }) => {
    const adapter = new CodeRabbitHostedAdapter(port({
      readIssueComments: () => Promise.resolve([
        earlierRequestComment(),
        earlierCommandReply(overrides),
        requestComment(),
        refusalReply(),
      ]),
    }));

    await expect(adapter.observe(requestHandle("complete"))).resolves.toEqual({
      kind: "terminal-failure",
      reason: "provider-request-generation-overlap",
    });
  });

  it.each([
    {
      name: "missing request comment",
      comments: [refusalReply()],
    },
    {
      name: "different request artifact",
      comments: [requestComment("complete", { id: "IC_OTHER" }), refusalReply()],
    },
    {
      name: "different request URL",
      comments: [requestComment("complete", {
        url: "https://github.com/owner/repo/pull/42#issuecomment-other",
      }), refusalReply()],
    },
    {
      name: "different request command",
      comments: [requestComment("incremental"), refusalReply()],
    },
    {
      name: "untrusted provider actor",
      comments: [requestComment(), refusalReply({ actorIdentity: "999" })],
    },
    {
      name: "untrusted provider reply",
      comments: [requestComment(), refusalReply({ appId: "999" })],
    },
    {
      name: "reply before the request",
      comments: [requestComment(), refusalReply({
        createdAt: "2026-07-23T11:59:59.000Z",
        updatedAt: "2026-07-23T11:59:59.000Z",
      })],
    },
    {
      name: "reply after a newer request",
      comments: [
        requestComment(),
        requestComment("incremental", {
          id: "IC_NEXT_REQUEST",
          url: "https://github.com/owner/repo/pull/42#issuecomment-next-request",
          createdAt: "2026-07-23T12:00:04.000Z",
          updatedAt: "2026-07-23T12:00:04.000Z",
        }),
        refusalReply(),
      ],
    },
    {
      name: "generic provider comment",
      comments: [requestComment(), refusalReply({
        body: "A review was not scheduled.",
      })],
    },
  ])("keeps $name pending instead of inferring a refusal", async ({ comments }) => {
    const adapter = new CodeRabbitHostedAdapter(port({
      readIssueComments: () => Promise.resolve(comments),
    }));

    await expect(adapter.observe(requestHandle("complete"))).resolves.toEqual({ kind: "pending" });
  });

  it("does not let an incremental completion discharge a complete request", async () => {
    const incremental = new CodeRabbitHostedAdapter(port({
      readIssueComments: () => Promise.resolve([summaryComment(), commandReply()]),
      readCommitStatuses: () => Promise.resolve([completionStatus()]),
    }));
    const complete = new CodeRabbitHostedAdapter(port({
      readIssueComments: () => Promise.resolve([summaryComment(), commandReply({
        body: `<!-- CodeRabbit review command invocation: invocation-id -->
<summary>✅ Action performed</summary>

Full review finished.`,
      })]),
      readCommitStatuses: () => Promise.resolve([completionStatus()]),
    }));

    await expect(incremental.observe(requestHandle("complete"))).resolves.toEqual({ kind: "pending" });
    await expect(complete.observe(requestHandle("complete"))).resolves.toMatchObject({ kind: "clean" });
  });

  it.each([
    {
      name: "stale summary",
      comments: [summaryComment(HEAD, { updatedAt: "2026-07-23T11:59:59.000Z" }), commandReply()],
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

  it("records unestablished coverage for a mismatched reviewed head", async () => {
    const adapter = new CodeRabbitHostedAdapter(port({
      readIssueComments: () => Promise.resolve([summaryComment("c".repeat(40)), commandReply()]),
      readCommitStatuses: () => Promise.resolve([completionStatus()]),
    }));
    await expect(adapter.observe(requestHandle())).resolves.toMatchObject({
      kind: "clean",
      coverageEvidence: {
        status: "unestablished",
        reason: "provider-incremental-range-mismatch",
      },
    });
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

  it("retains supplemental observations before an empty approval for one request", async () => {
    const supplemental = review({
      id: "PRR_COMMENTED",
      state: "commented",
      submittedAt: "2026-07-23T12:04:55.000Z",
      body: `<details>
<summary>🧹 Nitpick comments (1)</summary><blockquote>

<details>
<summary>src/a.ts (1)</summary><blockquote>

\`7\`: _📐 Maintainability & Code Quality_ | _🔵 Trivial_ | _⚡ Quick win_

**Keep the request-bound observation.**

The later approval is a completion marker, not a replacement result.

<!-- cr-comment:v1:cead8563631e4f6a5cb8cb64 -->

</blockquote></details>
</blockquote></details>`,
    });
    const approval = review({
      id: "PRR_APPROVED",
      body: "",
      submittedAt: "2026-07-23T12:05:00.000Z",
    });
    const adapter = new CodeRabbitHostedAdapter(port({
      readReviews: () => Promise.resolve([approval, supplemental]),
    }));

    await expect(adapter.observe(requestHandle())).resolves.toMatchObject({
      kind: "findings",
      reviewUrl: approval.url,
      findings: [{
        findingId: "PRR_COMMENTED:cead8563631e4f6a5cb8cb64",
        origin: "review-body",
        reviewId: "PRR_COMMENTED",
        sourceOrdinal: 1,
        severity: "minor",
        nit: true,
      }],
    });
  });

  it("does not aggregate a later request generation or another head", async () => {
    const currentApproval = review({
      id: "PRR_CURRENT",
      body: "",
      submittedAt: "2026-07-23T12:03:00.000Z",
    });
    const laterSupplemental = review({
      id: "PRR_LATER",
      state: "commented",
      submittedAt: "2026-07-23T12:05:00.000Z",
      body: `<summary>🧹 Nitpick comments (1)</summary>
<summary>src/later.ts (1)</summary>

\`3\`: _📐 Maintainability & Code Quality_ | _🔵 Trivial_

**Belongs to the later request.**

<!-- cr-comment:v1:111111111111111111111111 -->`,
    });
    const wrongHead = review({
      id: "PRR_WRONG_HEAD",
      headSha: "b".repeat(40),
      state: "commented",
      submittedAt: "2026-07-23T12:02:00.000Z",
      body: laterSupplemental.body,
    });
    const adapter = new CodeRabbitHostedAdapter(port({
      readReviews: () => Promise.resolve([laterSupplemental, wrongHead, currentApproval]),
      readIssueComments: () => Promise.resolve([{
        id: "IC_NEXT_REQUEST",
        url: "https://github.com/owner/repo/pull/42#issuecomment-next",
        actorIdentity: "5678",
        body: "@coderabbitai review",
        createdAt: "2026-07-23T12:04:00.000Z",
        updatedAt: "2026-07-23T12:04:00.000Z",
      }]),
    }));

    await expect(adapter.observe(requestHandle())).resolves.toMatchObject({
      kind: "clean",
      reviewUrl: currentApproval.url,
    });
  });

  it("refuses a request generation superseded before any attributable terminal result", async () => {
    const adapter = new CodeRabbitHostedAdapter(port({
      readReviews: () => Promise.resolve([review({
        id: "PRR_AFTER_NEXT_REQUEST",
        body: "",
        submittedAt: "2026-07-23T12:05:00.000Z",
      })]),
      readIssueComments: () => Promise.resolve([{
        id: "IC_NEXT_REQUEST",
        url: "https://github.com/owner/repo/pull/42#issuecomment-next",
        actorIdentity: "5678",
        body: "@coderabbitai full review",
        createdAt: "2026-07-23T12:04:00.000Z",
        updatedAt: "2026-07-23T12:04:00.000Z",
      }]),
    }));

    await expect(adapter.observe(requestHandle("incremental"))).resolves.toEqual({
      kind: "terminal-failure",
      reason: "provider-request-generation-overlap",
    });
  });

  it("retains a repeated supplemental provider fingerprint exactly once", async () => {
    const body = `<details>
<summary>🧹 Nitpick comments (1)</summary><blockquote>

<details>
<summary>src/a.ts (1)</summary><blockquote>

\`7\`: _📐 Maintainability & Code Quality_ | _🔵 Trivial_

**Repeated provider observation.**

<!-- cr-comment:v1:cead8563631e4f6a5cb8cb64 -->

</blockquote></details>
</blockquote></details>`;
    const adapter = new CodeRabbitHostedAdapter(port({
      readReviews: () => Promise.resolve([
        review({
          id: "PRR_APPROVED",
          body,
          submittedAt: "2026-07-23T12:05:00.000Z",
        }),
        review({
          id: "PRR_COMMENTED",
          state: "commented",
          body,
          submittedAt: "2026-07-23T12:04:55.000Z",
        }),
      ]),
    }));

    const result = await adapter.observe(requestHandle());
    expect(result.kind).toBe("findings");
    if (result.kind === "findings") {
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]).toMatchObject({
        reviewId: "PRR_COMMENTED",
        fingerprint: "cead8563631e4f6a5cb8cb64",
        sourceOrdinal: 1,
      });
    }
  });

  it("keeps handle-less observation on the newest exact-head review", async () => {
    const adapter = new CodeRabbitHostedAdapter(port({
      readReviews: () => Promise.resolve([
        review({ id: "PRR_APPROVED", body: "", submittedAt: "2026-07-23T12:05:00.000Z" }),
        review({
          id: "PRR_OLDER",
          state: "commented",
          submittedAt: "2026-07-23T12:04:00.000Z",
          body: `<summary>🧹 Nitpick comments (1)</summary>
<summary>src/older.ts (1)</summary>

\`2\`: _📐 Maintainability & Code Quality_ | _🔵 Trivial_

**Cannot be request-bound without a handle.**

<!-- cr-comment:v1:222222222222222222222222 -->`,
        }),
      ]),
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
      reason: `provider-actionable-count-invalid: {"value":"${count}"}`,
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
        nit: true,
        locus: "src/a.ts:7-9",
        sourceOrdinal: 1,
        sourceLabel: "**Keep the boundary explicit.**",
      }],
    });
    const result = await adapter.observeHandle(target);
    expect(result.kind).toBe("findings");
    if (result.kind === "findings") {
      expect(result.findings[0]).not.toHaveProperty("commentId");
      expect(result.findings[0]).not.toHaveProperty("threadId");
    }
  });

  it("assigns one capture order after combining thread and review-body findings", async () => {
    const duplicateLabel = "_🟠 Major_ duplicated provider label";
    const adapter = new CodeRabbitHostedAdapter(port({
      readReviews: () => Promise.resolve([review({
        state: "changes-requested",
        body: `**Actionable comments posted: 1**

<details>
<summary>🧹 Nitpick comments (1)</summary><blockquote>

<details>
<summary>src/body.ts (1)</summary><blockquote>

\`4\`: _📐 Maintainability & Code Quality_ | _🔵 Trivial_ | _⚡ Quick win_

${duplicateLabel}

Body details.

<!-- cr-comment:v1:abcdef1234567890abcdef12 -->

</blockquote></details>
</blockquote></details>`,
      })]),
      readThreads: () => Promise.resolve([findingThread(duplicateLabel)]),
    }));

    await expect(adapter.observeHandle(target)).resolves.toMatchObject({
      kind: "findings",
      findings: [
        { origin: "review-thread", sourceOrdinal: 1, sourceLabel: duplicateLabel },
        { origin: "review-body", sourceOrdinal: 2, sourceLabel: duplicateLabel },
      ],
    });
  });

  it("bounds supplemental file groups to their enclosing details section", async () => {
    const adapter = new CodeRabbitHostedAdapter(port({
      readReviews: () => Promise.resolve([review({
        state: "changes-requested",
        body: `**Actionable comments posted: 1**

<details>
<summary>🧹 Nitpick comments (1)</summary><blockquote>

<details>
<summary>src/a.ts (1)</summary><blockquote>

\`7-9\`: _📐 Maintainability & Code Quality_ | _🔵 Trivial_ | _⚡ Quick win_

**Keep the boundary explicit.**

<details>
<summary>🤖 Prompt for AI Agents</summary>

Nested provider guidance is not a file group.

\`999\`: _🔴 Critical_

<!-- cr-comment:v1:feedfacefeedfacefeedface -->

</details>

<!-- cr-comment:v1:abcdef1234567890abcdef12 -->

</blockquote></details>
</blockquote></details>

<details>
<summary>🤖 Prompt to fix review comments</summary>

Provider guidance outside the supplemental section.

</details>

<details>
<summary>ℹ️ Review info</summary>

<details>
<summary>📒 Files selected for processing (7)</summary>
</details>

<details>
<summary>💤 Files with no reviewable changes (1)</summary>
</details>

</details>`,
      })]),
      readThreads: () => Promise.resolve([
        findingThread("_🟡 Minor_ Align the recovered boundary action."),
      ]),
    }));

    const result = await adapter.observeHandle(target);
    expect(result).toMatchObject({
      kind: "findings",
      findings: [
        { origin: "review-thread", locus: "src/a.ts:7" },
        { origin: "review-body", severity: "minor", locus: "src/a.ts:7-9" },
      ],
    });
    if (result.kind !== "findings") return;
    const reviewBodyFinding = result.findings.find((finding) => finding.origin === "review-body");
    expect(reviewBodyFinding?.body).toContain("Nested provider guidance is not a file group.");
    expect(reviewBodyFinding?.body).toContain("cr-comment:v1:feedfacefeedfacefeedface");
  });

  it("ignores details tags inside Markdown code and behind active escapes", async () => {
    const adapter = new CodeRabbitHostedAdapter(port({
      readReviews: () => Promise.resolve([review({
        state: "changes-requested",
        body: `**Actionable comments posted: 0**

<details>
<summary>🧹 Nitpick comments (1)</summary><blockquote>

<details>
<summary>src/a.ts (1)</summary><blockquote>

\`7-9\`: _📐 Maintainability & Code Quality_ | _🔵 Trivial_ | _⚡ Quick win_

**Keep Markdown code examples out of the structural stack.**

The inline literal \`<details>\` is finding content.

The escaped literal \\<details> is finding content.

\`\`\`html
<details>
\`\`\`

<!-- cr-comment:v1:abcdef1234567890abcdef12 -->

</blockquote></details>
</blockquote></details>`,
      })]),
    }));

    await expect(adapter.observeHandle(target)).resolves.toMatchObject({
      kind: "findings",
      findings: [{ origin: "review-body", locus: "src/a.ts:7-9" }],
    });
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

  it("ignores a provider-owned Markdown blockquote around outside-diff comments", async () => {
    const adapter = new CodeRabbitHostedAdapter(port({
      readReviews: () => Promise.resolve([review({
        body: `> [!CAUTION]
> Some comments are outside the diff and can’t be posted inline due to platform limitations.
>
> <details>
> <summary>⚠️ Outside diff range comments (1)</summary><blockquote>
>
> <details>
> <summary>src/legacy.ts (1)</summary><blockquote>
>
> \`12\`: _🩺 Stability & Availability_ | _🟡 Minor_ | _⚡ Quick win_
>
> **Preserve the compatibility boundary.**
>
> This finding has no inline review thread.
>
> <!-- cr-comment:v1:1234567890abcdef12345678 -->
>
> </blockquote></details>
>
> </blockquote></details>`,
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

  it("reads outside-diff findings rendered as a callout with direct finding details", async () => {
    const adapter = new CodeRabbitHostedAdapter(port({
      readReviews: () => Promise.resolve([review({
        body: `**Actionable comments posted: 0**

> [!CAUTION]
> Some comments are outside the diff and cannot be posted inline.
>
> **⚠️ Outside diff range comments (1)**
>
> <details>
> <summary><em>🟠 Major</em> · Preserve the boundary · <code>legacy.ts:12</code></summary><blockquote>
>
> \`src/legacy.ts:12\`
> _🩺 Stability & Availability_ | _🟠 Major_ | _⚡ Quick win_
>
> **Preserve the compatibility boundary.**
>
> This finding has no inline review thread.
>
> <details>
> <summary>🤖 Prompt for AI Agents</summary>
> A nested note is not another finding.
> </details>
>
> <!-- cr-comment:v1:1234567890abcdef12345678 -->
>
> </blockquote></details>`,
      })]),
    }));

    await expect(adapter.observeHandle(target)).resolves.toMatchObject({
      kind: "findings",
      findings: [{
        origin: "review-body",
        settlement: "not-applicable",
        severity: "major",
        locus: "src/legacy.ts:12",
        fingerprint: "1234567890abcdef12345678",
        sourceLabel: "Preserve the boundary",
      }],
    });
  });

  it("keeps the initial callout locus when the finding cites another path", async () => {
    const adapter = new CodeRabbitHostedAdapter(port({
      readReviews: () => Promise.resolve([review({
        body: `**Actionable comments posted: 0**

> [!CAUTION]
> **⚠️ Outside diff range comments (1)**
>
> <details>
> <summary><em>🟠 Major</em> · First locus · <code>legacy.ts:12</code></summary><blockquote>
>
> \`src/legacy.ts:12\`
> _🩺 Stability & Availability_ | _🟠 Major_
>
> **The first locus is the finding location.**
> \`src/related.ts:44\`
> This later reference is supporting context.
>
> <!-- cr-comment:v1:1234567890abcdef12345678 -->
>
> </blockquote></details>`,
      })]),
    }));

    await expect(adapter.observeHandle(target)).resolves.toMatchObject({
      kind: "findings",
      findings: [{
        severity: "major",
        locus: "src/legacy.ts:12",
        body: expect.stringContaining("`src/related.ts:44`"),
      }],
    });
  });

  it("ignores fenced callout examples while reading a real outside-diff group", async () => {
    const adapter = new CodeRabbitHostedAdapter(port({
      readReviews: () => Promise.resolve([review({
        body: `**Actionable comments posted: 0**

\`\`\`md
> [!CAUTION]
> **⚠️ Outside diff range comments (1)**
\`\`\`

> [!CAUTION]
> **⚠️ Outside diff range comments (1)**
>
> <details>
> <summary><em>🟡 Minor</em> · Real finding · <code>legacy.ts:12</code></summary><blockquote>
>
> \`src/legacy.ts:12\`
> _🩺 Stability & Availability_ | _🟡 Minor_
>
> **Preserve the compatibility boundary.**
>
> <!-- cr-comment:v1:1234567890abcdef12345678 -->
>
> </blockquote></details>`,
      })]),
    }));

    await expect(adapter.observeHandle(target)).resolves.toMatchObject({
      kind: "findings",
      findings: [{ locus: "src/legacy.ts:12", severity: "minor" }],
    });
  });

  it("rejects a callout finding with only locus and severity metadata", async () => {
    const adapter = new CodeRabbitHostedAdapter(port({
      readReviews: () => Promise.resolve([review({
        body: `**Actionable comments posted: 0**

> [!CAUTION]
> **⚠️ Outside diff range comments (1)**
>
> <details>
> <summary><em>🟡 Minor</em> · legacy.ts:12</summary><blockquote>
>
> \`src/legacy.ts:12\`
> _🩺 Stability & Availability_ | _🟡 Minor_
>
> <!-- cr-comment:v1:1234567890abcdef12345678 -->
>
> </blockquote></details>`,
      })]),
    }));

    await expect(adapter.observeHandle(target)).resolves.toEqual({
      kind: "terminal-failure",
      reason: "provider-body-finding-empty: "
        + "{\"category\":\"outside-diff\",\"fingerprint\":\"1234567890abcdef12345678\"}",
    });
  });

  it("rejects a callout finding without a severity metadata line", async () => {
    const adapter = new CodeRabbitHostedAdapter(port({
      readReviews: () => Promise.resolve([review({
        body: `**Actionable comments posted: 0**

> [!CAUTION]
> **⚠️ Outside diff range comments (1)**
>
> <details>
> <summary><em>🟡 Minor</em> · legacy.ts:12</summary><blockquote>
>
> \`src/legacy.ts:12\`
>
> **Preserve the compatibility boundary.**
> _🟡 Minor_ appears later, outside the required metadata line.
>
> <!-- cr-comment:v1:1234567890abcdef12345678 -->
>
> </blockquote></details>`,
      })]),
    }));

    await expect(adapter.observeHandle(target)).resolves.toEqual({
      kind: "terminal-failure",
      reason: "provider-body-finding-severity-unrecognized: "
        + "{\"category\":\"outside-diff\",\"fingerprint\":\"1234567890abcdef12345678\"}",
    });
  });

  it("rejects a callout whose advertised outside-diff count exceeds its findings", async () => {
    const adapter = new CodeRabbitHostedAdapter(port({
      readReviews: () => Promise.resolve([review({
        body: `**Actionable comments posted: 0**

> [!CAUTION]
> **⚠️ Outside diff range comments (2)**
>
> <details>
> <summary><em>🟡 Minor</em> · Preserve the boundary · <code>legacy.ts:12</code></summary><blockquote>
>
> \`src/legacy.ts:12\`
> _🩺 Stability & Availability_ | _🟡 Minor_
>
> **Preserve the compatibility boundary.**
>
> <!-- cr-comment:v1:1234567890abcdef12345678 -->
>
> </blockquote></details>`,
      })]),
    }));

    await expect(adapter.observeHandle(target)).resolves.toEqual({
      kind: "terminal-failure",
      reason: "provider-supplemental-section-count-mismatch: "
        + "{\"category\":\"outside-diff\",\"advertised\":2,\"parsed\":1}",
    });
  });

  it("does not require adjacent HTML blockquote tags to recognize supplemental sections", async () => {
    const adapter = new CodeRabbitHostedAdapter(port({
      readReviews: () => Promise.resolve([review({
        body: `<details>
<summary>⚠️ Outside diff range comments (1)</summary>
<blockquote>

<details>
<summary>src/legacy.ts (1)</summary>
<blockquote>

\`12\`: _🩺 Stability & Availability_ | _🟡 Minor_ | _⚡ Quick win_

**Preserve the compatibility boundary.**

<!-- cr-comment:v1:1234567890abcdef12345678 -->

</blockquote></details>
</blockquote></details>`,
      })]),
    }));

    await expect(adapter.observeHandle(target)).resolves.toMatchObject({
      kind: "findings",
      findings: [{ locus: "src/legacy.ts:12" }],
    });
  });

  it("rejects supplemental findings that contain only locus and severity metadata", async () => {
    const adapter = new CodeRabbitHostedAdapter(port({
      readReviews: () => Promise.resolve([review({
        body: `<details>
<summary>⚠️ Outside diff comments (1)</summary><blockquote>
<details>
<summary>src/legacy.ts (1)</summary><blockquote>

\`12\`: _🩺 Stability & Availability_ | _🟡 Minor_

<!-- cr-comment:v1:1234567890abcdef12345678 -->
</blockquote></details>
</blockquote></details>`,
      })]),
    }));

    await expect(adapter.observeHandle(target)).resolves.toEqual({
      kind: "terminal-failure",
      reason: "provider-body-finding-empty: "
        + "{\"category\":\"outside-diff\",\"group\":\"src/legacy.ts\","
        + "\"fingerprint\":\"1234567890abcdef12345678\"}",
    });
  });

  it("identifies the supplemental finding component that could not be parsed", async () => {
    const adapter = new CodeRabbitHostedAdapter(port({
      readReviews: () => Promise.resolve([review({
        body: `<details>
<summary>⚠️ Outside diff comments (1)</summary><blockquote>
<details>
<summary>src/legacy.ts (1)</summary><blockquote>

line 12: _🩺 Stability & Availability_ | _🟡 Minor_

<!-- cr-comment:v1:1234567890abcdef12345678 -->
</blockquote></details>
</blockquote></details>`,
      })]),
    }));

    await expect(adapter.observeHandle(target)).resolves.toEqual({
      kind: "terminal-failure",
      reason: "provider-body-finding-locus-unrecognized: "
        + "{\"category\":\"outside-diff\",\"group\":\"src/legacy.ts\","
        + "\"fingerprint\":\"1234567890abcdef12345678\"}",
    });
  });

  it.each([
    {
      name: "inline count",
      review: review({ state: "changes-requested", body: "**Actionable comments posted: 2**" }),
      threads: [findingThread("_🟠 Major_ broken boundary")],
      reason: "provider-actionable-finding-count-mismatch: "
        + "{\"advertised\":2,\"inline\":1,\"outsideDiff\":0,\"nitpick\":0}",
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
      reason: "provider-supplemental-group-count-mismatch: "
        + "{\"category\":\"nitpick\",\"advertised\":2,\"groupTotal\":1}",
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
    await expect(malformed.observeHandle(target)).resolves.toEqual({
      kind: "terminal-failure",
      reason: "provider-thread-finding-severity-unrecognized: "
        + "{\"threadId\":\"PRRT_1\",\"commentId\":\"123\",\"path\":\"src/a.ts\",\"line\":7}",
    });
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

    await adapter.readHead(createHostedHandleFixture({
      target,
      artifact: {
        kind: "issue-comment",
        id: "IC_1",
        url: "https://github.com/owner/repo/pull/42#issuecomment-1",
        createdAt: "2026-07-23T12:00:00.000Z",
      },
    }), { signal });
    await adapter.observe(createHostedHandleFixture({
      target,
      artifact: {
        kind: "issue-comment",
        id: "IC_1",
        url: "https://github.com/owner/repo/pull/42#issuecomment-1",
        createdAt: "2026-07-23T12:00:00.000Z",
      },
    }), { signal });

    expect(observed).toEqual([signal, signal, signal, signal, signal, signal]);
  });
});
