import { describe, expect, it } from "vitest";

import {
  GhHostedReviewPort,
  type HostedProcessRunner,
} from "../../../../../src/scripts/review-gate/hosted/gh-process.js";
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

describe("hosted GitHub process boundary", () => {
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

  it("passes caller cancellation into the gh runner", async () => {
    const mock = runner([[[]]]);
    const port = new GhHostedReviewPort(mock.boundary);
    const signal = new AbortController().signal;

    await port.readReviews(target, { signal });

    expect(mock.calls[0]?.options?.signal).toBe(signal);
  });
});
