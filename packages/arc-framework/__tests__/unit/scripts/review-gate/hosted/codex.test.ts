import { describe, expect, it } from "vitest";
import { createHostedHandleFixture } from "../../../../fixtures/hosted-review.js";

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

function bodyReview(priority = "2", location = `https://github.com/owner/repo/blob/${HEAD}/src/a.ts#L7`): HostedGitHubReview {
  return {
    ...codexReview(),
    body: `<!-- codex-code-review-finding:v1 -->


### 💡 Codex Review

${location}
**<sub><sub>![P${priority} Badge](https://img.shields.io/badge/P${priority}-yellow?style=flat)</sub></sub>  Preserve target facts**

Reclassify the changed target before offering an executable continuation.

<details> <summary>ℹ️ About Codex in GitHub</summary>
Provider help, not finding content.
</details>`,
  };
}

function findingThread(body = "[P1] boundary failure"): HostedGitHubThread {
  return {
    id: "PRRT_1",
    isResolved: false,
    comments: [{
      id: "123",
      reviewId: "PRR_1",
      replyToReviewId: null,
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

  it.each([
    ["readReviews", "rate-limited"],
    ["readIssueComments", "transient-unavailable"],
  ] as const)("leaves a retryable %s %s failure to the waiting caller", async (boundary, kind) => {
    const failure = new HostedGitHubReadError(kind, `${boundary}-${kind}`);
    const adapter = new CodexHostedAdapter(port({ [boundary]: () => Promise.reject(failure) }));

    await expect(adapter.observeHandle(target)).rejects.toBe(failure);
  });

  it("reports a terminal read failure as the review's outcome", async () => {
    const adapter = new CodexHostedAdapter(port({
      readThreads: () => Promise.reject(new HostedGitHubReadError("terminal-failure", "threads: malformed JSON")),
    }));

    await expect(adapter.observeHandle(target)).resolves.toEqual({
      kind: "terminal-failure",
      reason: "threads: malformed JSON",
    });
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

  it.each([
    ["0", "critical"], ["1", "major"], ["2", "minor"], ["3", "minor"],
  ])("reads a native review-body P%s finding as %s without inventing a thread", async (priority, expected) => {
    const review = bodyReview(priority);
    const adapter = new CodexHostedAdapter(port({ readReviews: () => Promise.resolve([review]) }));

    const observed = await adapter.observeHandle(target);
    expect(observed).toMatchObject({
      kind: "findings",
      reviewUrl: review.url,
      findings: [{
        origin: "review-body", reviewId: review.id, settlement: "not-applicable",
        severity: expected, locus: "src/a.ts:7", url: review.url, sourceOrdinal: 1,
        sourceLabel: "Preserve target facts",
        body: expect.stringContaining("Reclassify the changed target"),
        fingerprint: expect.any(String), findingId: expect.any(String),
      }],
    });
    if (observed.kind !== "findings") throw new Error("finding expected");
    expect(observed.findings[0]).not.toHaveProperty("threadId");
    expect(observed.findings[0]).not.toHaveProperty("commentId");
    expect(observed.findings[0]).toHaveProperty("body", expect.not.stringContaining("Provider help"));
    expect(await adapter.observeHandle(target)).toEqual(observed);
  });

  it("reads a code-wrapped location and retains a line range", async () => {
    const review = bodyReview("2", `\`https://github.com/owner/repo/blob/${HEAD}/src/a.ts#L7-L9\``);
    const adapter = new CodexHostedAdapter(port({ readReviews: () => Promise.resolve([review]) }));
    await expect(adapter.observeHandle(target)).resolves.toMatchObject({
      kind: "findings", findings: [{ locus: "src/a.ts:7-9" }],
    });
  });

  it("retains all review-body findings alongside inline findings in capture order", async () => {
    const first = { ...bodyReview(), id: "PRR_0", submittedAt: "2026-07-23T12:04:00.000Z" };
    const second = bodyReview("1");
    const adapter = new CodexHostedAdapter(port({
      readReviews: () => Promise.resolve([second, first]),
      readThreads: () => Promise.resolve([findingThread()]),
    }));
    await expect(adapter.observeHandle(target)).resolves.toMatchObject({
      kind: "findings", findings: [
        { origin: "review-thread", sourceOrdinal: 1 },
        { origin: "review-body", reviewId: "PRR_0", severity: "minor", sourceOrdinal: 2 },
        { origin: "review-body", reviewId: "PRR_1", severity: "major", sourceOrdinal: 3 },
      ],
    });
  });

  it.each([
    ["wrong repository", bodyReview("2", `https://github.com/other/repo/blob/${HEAD}/src/a.ts#L7`).body],
    ["wrong head", bodyReview("2", `https://github.com/owner/repo/blob/${"b".repeat(40)}/src/a.ts#L7`).body],
    ["missing location", bodyReview("2", "").body],
    ["missing priority", bodyReview("9").body],
    ["empty finding", bodyReview().body.replace("Reclassify the changed target before offering an executable continuation.", "")],
    ["duplicate marker", bodyReview().body + "\n<!-- codex-code-review-finding:v1 -->"],
  ])("reports a malformed marked body: %s", async (_name, body) => {
    const adapter = new CodexHostedAdapter(port({
      readReviews: () => Promise.resolve([{ ...codexReview(), body }]),
      readIssueComments: () => Promise.resolve([cleanComment(
        `Codex Review: Didn't find any major issues.\n\nReviewed commit: \`${HEAD}\``,
      )]),
    }));
    await expect(adapter.observeHandle(target)).resolves.toEqual({
      kind: "terminal-failure", reason: "malformed-provider-finding",
    });
  });

  it.each([
    ["another actor", { actorIdentity: "1234" }],
    ["another target", { headSha: "b".repeat(40) }],
    ["an earlier request", { submittedAt: "2026-07-23T11:59:00.000Z" }],
  ])("ignores a review-body finding from %s", async (_name, overrides) => {
    const adapter = new CodexHostedAdapter(port({
      readReviews: () => Promise.resolve([{ ...bodyReview(), ...overrides }]),
    }));
    const handle = createHostedHandleFixture({
      provider: "codex-pr", target,
      artifact: {
        kind: "issue-comment", id: "IC_1",
        url: "https://github.com/owner/repo/pull/42#issuecomment-1",
        createdAt: "2026-07-23T12:00:00.000Z",
      },
    });
    await expect(adapter.observe(handle)).resolves.toEqual({ kind: "pending" });
  });

  it("does not promote an unmarked review body to a finding or clean result", async () => {
    const adapter = new CodexHostedAdapter(port({
      readReviews: () => Promise.resolve([{
        ...bodyReview(), body: bodyReview().body.replace("<!-- codex-code-review-finding:v1 -->", ""),
      }]),
    }));
    await expect(adapter.observeHandle(target)).resolves.toEqual({ kind: "pending" });
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
