import { describe, expect, it } from "vitest";

import {
  CodexHostedAdapter,
  CODEX_HOSTED_REGISTRATION,
} from "../../../../../src/scripts/review-gate/hosted/codex.js";
import type {
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

function findingThread(): HostedGitHubThread {
  return {
    id: "PRRT_1",
    isResolved: false,
    comments: [{
      id: "123",
      reviewId: "PRR_1",
      actorIdentity: "199175422",
      body: "[P1] boundary failure",
      url: "https://github.com/owner/repo/pull/42#discussion_r1",
      path: "src/a.ts",
      line: 7,
      headSha: HEAD,
    }],
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
      findings: [{ severity: "major", locus: "src/a.ts:7" }],
    });
  });
});
