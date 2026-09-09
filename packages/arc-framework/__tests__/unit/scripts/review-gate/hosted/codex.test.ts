import { describe, expect, it } from "vitest";

import {
  CodexHostedAdapter,
  CODEX_HOSTED_REGISTRATION,
} from "../../../../../src/scripts/review-gate/hosted/codex.js";
import type {
  HostedGitHubIssueComment,
  HostedGitHubPort,
  HostedGitHubReview,
  HostedGitHubThread,
} from "../../../../../src/scripts/review-gate/hosted/github.js";
import { HostedGitHubReadError } from "../../../../../src/scripts/review-gate/hosted/github.js";
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
    readCommitStatuses: () => Promise.resolve([]),
    findReplies: () => Promise.resolve([]),
    postReply: () => Promise.resolve({ kind: "ambiguous" }),
    readThread: () => Promise.resolve({ kind: "missing" }),
    resolveThread: () => Promise.resolve({ kind: "ambiguous" }),
    ...overrides,
  };
}

function codexReview(): HostedGitHubReview {
  return {
    id: "PRR_1",
    url: "https://github.com/owner/repo/pull/42#pullrequestreview-1",
    actorIdentity: "199175422",
    state: "commented",
    headSha: HEAD,
    body: "",
    submittedAt: "2026-07-23T12:05:00.000Z",
  };
}

function findingThread(body = "[P1] boundary failure"): HostedGitHubThread {
  return {
    id: "PRRT_1",
    isResolved: false,
    comments: [{
      id: "123",
      reviewId: "PRR_1",
      actorIdentity: "199175422",
      body,
      url: "https://github.com/owner/repo/pull/42#discussion_r1",
      path: "src/a.ts",
      line: 7,
      headSha: HEAD,
    }],
  };
}

function cleanComment(body: string): HostedGitHubIssueComment {
  return {
    id: "IC_CODEX",
    url: "https://github.com/owner/repo/pull/42#issuecomment-codex",
    actorIdentity: "199175422",
    appId: "1144995",
    body,
    createdAt: "2026-07-23T12:05:00.000Z",
    updatedAt: "2026-07-23T12:05:00.000Z",
  };
}

describe("Codex hosted adapter", () => {
  it.each([
    ["readHead", "rate-limited"],
    ["currentActorIdentity", "transient-unavailable"],
    ["readHead", "terminal-failure"],
  ] as const)("normalizes pre-effect %s %s failures", async (boundary, kind) => {
    const failure = new HostedGitHubReadError(kind, `${boundary}-${kind}`);
    const adapter = new CodexHostedAdapter(port({
      [boundary]: () => Promise.reject(failure),
    }));

    await expect(adapter.request(target, "incremental")).resolves.toEqual(
      kind === "terminal-failure"
        ? { kind, reason: `${boundary}-${kind}` }
        : { kind },
    );
  });

  it("fails open to complete coverage when incremental review is unavailable", async () => {
    const posted: string[] = [];
    const adapter = new CodexHostedAdapter(port({
      createIssueComment: (_target, body) => {
        posted.push(body);
        return Promise.resolve({
          kind: "created",
          artifact: {
            kind: "issue-comment",
            id: "IC_2",
            url: "https://github.com/owner/repo/pull/42#issuecomment-2",
            createdAt: "2026-07-23T12:00:00.000Z",
          },
          actorIdentity: "1234",
          body,
        });
      },
    }));

    await expect(adapter.request(target, "complete")).resolves.toMatchObject({
      kind: "created",
      effectiveCoverage: "complete",
    });
    await expect(adapter.request(target, "incremental")).resolves.toMatchObject({
      kind: "created",
      effectiveCoverage: "complete",
    });
    expect(posted).toEqual(["@codex review", "@codex review"]);
    expect(CODEX_HOSTED_REGISTRATION).toMatchObject({
      id: "codex-pr",
      identities: { appId: "1144995", botUserId: "199175422" },
    });
  });

  it("normalizes clean and finding output without guidance evidence", async () => {
    const clean = new CodexHostedAdapter(port({
      readIssueComments: () => Promise.resolve([{
        id: "IC_CODEX",
        url: "https://github.com/owner/repo/pull/42#issuecomment-codex",
        actorIdentity: "199175422",
        appId: "1144995",
        body: `Codex Review:\n\nDidn't find any major issues.\n\nReviewed commit: \`${HEAD}\``,
        createdAt: "2026-07-23T12:05:00.000Z",
        updatedAt: "2026-07-23T12:05:00.000Z",
      }]),
    }));
    const findings = new CodexHostedAdapter(port({
      readReviews: () => Promise.resolve([codexReview()]),
      readThreads: () => Promise.resolve([findingThread()]),
    }));

    await expect(clean.observeHandle(target)).resolves.toMatchObject({ kind: "clean" });
    await expect(findings.observeHandle(target)).resolves.toMatchObject({
      kind: "findings",
      findings: [{
        severity: "major",
        locus: "src/a.ts:7",
        sourceOrdinal: 1,
        sourceLabel: "[P1] boundary failure",
      }],
    });
  });

  it.each([
    ["P0", "critical"],
    ["P1", "major"],
    ["P2", "minor"],
    ["P3", "minor"],
  ] as const)("normalizes native %s findings to ARC severity %s", async (nativeSeverity, arcSeverity) => {
    const adapter = new CodexHostedAdapter(port({
      readReviews: () => Promise.resolve([codexReview()]),
      readThreads: () => Promise.resolve([findingThread(`[${nativeSeverity}] boundary failure`)]),
    }));

    await expect(adapter.observeHandle(target)).resolves.toMatchObject({
      kind: "findings",
      findings: [{ severity: arcSeverity }],
    });
  });

  it("recognizes layout-varied clean output with one exact reviewed-head marker", async () => {
    const adapter = new CodexHostedAdapter(port({
      readIssueComments: () => Promise.resolve([cleanComment(
        `**Codex Review:** Didn't find any major issues. Keep it up!

**Reviewed commit:** \`${HEAD.slice(0, 10)}\`

<details><summary>About Codex</summary>Non-semantic provider help.</details>`,
      )]),
    }));

    await expect(adapter.observeHandle(target)).resolves.toMatchObject({ kind: "clean" });
  });

  it("recognizes connected-account failure under a bold provider heading", async () => {
    const adapter = new CodexHostedAdapter(port({
      readIssueComments: () => Promise.resolve([cleanComment(
        "**Codex Review:**\n\nConnect your ChatGPT account to use Codex.",
      )]),
    }));

    await expect(adapter.observeHandle(target)).resolves.toEqual({
      kind: "terminal-failure",
      reason: "connected-account-required",
    });
  });

  it.each([
    {
      name: "mismatched reviewed head",
      body: `Codex Review: Didn't find any major issues.\n\nReviewed commit: \`${"b".repeat(10)}\``,
    },
    {
      name: "multiple reviewed-head markers",
      body: `Codex Review: Didn't find any major issues.

Reviewed commit: \`${HEAD.slice(0, 10)}\`
Reviewed commit: \`${HEAD.slice(0, 12)}\``,
    },
  ])("keeps $name pending", async ({ body }) => {
    const adapter = new CodexHostedAdapter(port({
      readIssueComments: () => Promise.resolve([cleanComment(body)]),
    }));

    await expect(adapter.observeHandle(target)).resolves.toEqual({ kind: "pending" });
  });

  it("does not let clean-summary wording mask exact-head findings", async () => {
    const adapter = new CodexHostedAdapter(port({
      readReviews: () => Promise.resolve([codexReview()]),
      readThreads: () => Promise.resolve([findingThread()]),
      readIssueComments: () => Promise.resolve([cleanComment(
        `Codex Review: Didn't find any major issues.\n\nReviewed commit: \`${HEAD}\``,
      )]),
    }));

    await expect(adapter.observeHandle(target)).resolves.toMatchObject({
      kind: "findings",
      findings: [{ severity: "major", locus: "src/a.ts:7" }],
    });
  });
});
