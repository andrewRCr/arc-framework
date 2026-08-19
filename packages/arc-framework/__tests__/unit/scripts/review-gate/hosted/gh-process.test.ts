import { describe, expect, it, vi } from "vitest";

const { mockExeca } = vi.hoisted(() => ({ mockExeca: vi.fn() }));
vi.mock("execa", () => ({ execa: mockExeca }));

import {
  GhHostedReviewPort,
  hostedGhRunner,
  type HostedProcessRunner,
} from "../../../../../src/scripts/review-gate/hosted/gh-process.js";
import { CodeRabbitHostedAdapter } from "../../../../../src/scripts/review-gate/hosted/coderabbit.js";
import {
  awaitHostedReview,
  type HostedAwaitClock,
} from "../../../../../src/scripts/review-gate/hosted/await.js";
import type { HostedTarget } from "../../../../../src/scripts/review-gate/hosted/request.js";

const HEAD = "a".repeat(40);
const target: HostedTarget = { repository: "owner/repo", pullRequest: 42, headSha: HEAD };

function runner(outputs: unknown[]) {
  const calls: Array<{ args: string[]; options?: { signal?: AbortSignal } }> = [];
  const boundary: HostedProcessRunner = {
    run: (args, options) => {
      calls.push({ args, ...(options === undefined ? {} : { options }) });
      return Promise.resolve({ stdout: JSON.stringify(outputs.shift()), stderr: "" });
    },
  };
  return { boundary, calls };
}

function review(state: string) {
  return {
    node_id: `PRR_${state}`,
    html_url: `https://github.com/owner/repo/pull/42#${state}`,
    user: { id: 123 },
    state,
    commit_id: HEAD,
    body: "",
    submitted_at: state === "PENDING" ? null : "2026-07-24T12:00:00Z",
  };
}

function comment(id: number) {
  return {
    id: `PRRC_${id}`,
    databaseId: id,
    body: `comment ${id}`,
    url: `https://github.com/owner/repo/pull/42#discussion_r${id}`,
    path: "src/a.ts",
    line: id,
    originalLine: id,
    commit: { oid: HEAD },
    pullRequestReview: { id: "PRR_1" },
    author: { databaseId: 123 },
  };
}

describe("hosted GitHub process boundary", () => {
  it("preserves cancellation metadata when allowFailure keeps the process promise resolved", async () => {
    mockExeca.mockResolvedValueOnce({ stdout: "", stderr: "", isCanceled: true, timedOut: false });

    await expect(hostedGhRunner.run(["pr", "checks"], { allowFailure: true }))
      .rejects.toMatchObject({ name: "AbortError" });
  });

  it("preserves timeout metadata when allowFailure keeps the process promise resolved", async () => {
    mockExeca.mockResolvedValueOnce({ stdout: "", stderr: "", isCanceled: false, timedOut: true });

    await expect(hostedGhRunner.run(["pr", "checks"], { allowFailure: true }))
      .rejects.toMatchObject({ name: "TimeoutError" });
  });

  it("preserves a deadline abort through the production port and await composition", async () => {
    const boundary: HostedProcessRunner = {
      run: () => Promise.reject(new DOMException("timed out", "TimeoutError")),
    };
    const adapter = new CodeRabbitHostedAdapter(new GhHostedReviewPort(boundary));
    const clock: HostedAwaitClock = {
      now: () => 0,
      sleep: () => Promise.resolve(),
    };

    await expect(awaitHostedReview({
      schemaVersion: 1,
      handle: {
        schemaVersion: 1,
        provider: "coderabbit-pr",
        requestedCoverage: "complete",
        effectiveCoverage: "complete",
        target,
        artifact: {
          kind: "issue-comment",
          id: "IC_1",
          url: "https://github.com/owner/repo/pull/42#issuecomment-1",
          createdAt: "2026-07-24T12:00:00Z",
        },
      },
      timeoutMs: 1_000,
      pollIntervalMs: 100,
    }, {
      observers: [adapter],
      clock,
    })).resolves.toMatchObject({
      state: "pending",
      nextAction: "await",
    });
  });

  it("ignores dismissed and pending reviews without rejecting the complete read", async () => {
    const mock = runner([[[review("DISMISSED"), review("PENDING"), review("COMMENTED")]]]);
    const port = new GhHostedReviewPort(mock.boundary);

    await expect(port.readReviews(target)).resolves.toMatchObject([
      { id: "PRR_COMMENTED", state: "commented" },
    ]);
  });

  it("paginates check runs and combines every returned page", async () => {
    const mock = runner([[
      { check_runs: [{ name: "first", status: "completed", conclusion: "success", app: null, output: null }] },
      { check_runs: [{ name: "second", status: "completed", conclusion: "success", app: null, output: null }] },
    ]]);
    const port = new GhHostedReviewPort(mock.boundary);

    await expect(port.readCheckRuns(target)).resolves.toMatchObject([
      { name: "first" },
      { name: "second" },
    ]);
    expect(mock.calls[0]?.args).toEqual(expect.arrayContaining(["--paginate", "--slurp"]));
  });

  it("preserves threads whose comment author is unavailable", async () => {
    const mock = runner([{
      data: {
        repository: {
          pullRequest: {
            reviewThreads: {
              nodes: [{
                id: "PRRT_1",
                isResolved: false,
                comments: {
                  nodes: [{
                    id: "PRRC_1",
                    databaseId: 1,
                    body: "comment",
                    url: "https://github.com/owner/repo/pull/42#discussion_r1",
                    path: "src/a.ts",
                    line: 7,
                    originalLine: 7,
                    commit: { oid: HEAD },
                    pullRequestReview: { id: "PRR_1" },
                    author: null,
                  }],
                  pageInfo: { hasNextPage: false },
                },
              }],
              pageInfo: { hasNextPage: false },
            },
          },
        },
      },
    }]);
    const port = new GhHostedReviewPort(mock.boundary);

    await expect(port.readThreads(target)).resolves.toMatchObject([{
      comments: [{ actorIdentity: null, id: "1" }],
    }]);
  });

  it("paginates both review threads and comments without dropping either connection", async () => {
    const mock = runner([
      {
        data: {
          repository: {
            pullRequest: {
              reviewThreads: {
                nodes: [{
                  id: "PRRT_1",
                  isResolved: false,
                  comments: {
                    nodes: [comment(1)],
                    pageInfo: { hasNextPage: true, endCursor: "COMMENTS_1" },
                  },
                }],
                pageInfo: { hasNextPage: true, endCursor: "THREADS_1" },
              },
            },
          },
        },
      },
      {
        data: {
          repository: {
            pullRequest: {
              reviewThreads: {
                nodes: [{
                  id: "PRRT_2",
                  isResolved: true,
                  comments: {
                    nodes: [comment(3)],
                    pageInfo: { hasNextPage: false, endCursor: null },
                  },
                }],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          },
        },
      },
      {
        data: {
          node: {
            id: "PRRT_1",
            comments: {
              nodes: [comment(2)],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        },
      },
    ]);
    const port = new GhHostedReviewPort(mock.boundary);

    await expect(port.readThreads(target)).resolves.toMatchObject([
      { id: "PRRT_1", comments: [{ id: "1" }, { id: "2" }] },
      { id: "PRRT_2", comments: [{ id: "3" }] },
    ]);
    expect(mock.calls[1]?.args).toEqual(expect.arrayContaining(["-F", "threadCursor=THREADS_1"]));
    expect(mock.calls[2]?.args).toEqual(expect.arrayContaining([
      "-F",
      "id=PRRT_1",
      "-F",
      "commentCursor=COMMENTS_1",
    ]));
  });

  it("passes caller cancellation into the gh runner", async () => {
    const mock = runner([[[]]]);
    const port = new GhHostedReviewPort(mock.boundary);
    const signal = new AbortController().signal;

    await port.readReviews(target, { signal });

    expect(mock.calls[0]?.options?.signal).toBe(signal);
  });
});
