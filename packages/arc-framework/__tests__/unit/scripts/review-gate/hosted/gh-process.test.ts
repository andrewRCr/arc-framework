import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockExeca, mockDelay } = vi.hoisted(() => ({ mockExeca: vi.fn(), mockDelay: vi.fn() }));
vi.mock("execa", () => ({ execa: mockExeca }));
vi.mock("node:timers/promises", () => ({ setTimeout: mockDelay }));

import {
  GhHostedReviewPort,
  HostedProcessError,
  hostedGhRunner,
  type HostedProcessRunner,
} from "../../../../../src/scripts/review-gate/hosted/gh-process.js";
import { CodeRabbitHostedAdapter } from "../../../../../src/scripts/review-gate/hosted/coderabbit.js";
import {
  awaitHostedReview,
  type HostedAwaitClock,
} from "../../../../../src/scripts/review-gate/hosted/await.js";
import type { HostedTarget } from "../../../../../src/scripts/review-gate/hosted/request.js";
import { settleHostedFinding } from "../../../../../src/scripts/review-gate/hosted/settle.js";
import { createHostedHandleFixture } from "../../../../fixtures/hosted-review.js";
import { createGhRequiredChecksPort } from "../../../../../src/scripts/review-gate/hosts/github/checks-await.js";

function resetMockDefaults() {
  vi.resetAllMocks();
  mockDelay.mockResolvedValue(undefined);
}

beforeEach(resetMockDefaults);

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
    fullDatabaseId: id,
    body: `comment ${id}`,
    url: `https://github.com/owner/repo/pull/42#discussion_r${id}`,
    path: "src/a.ts",
    line: id,
    originalLine: id,
    commit: { oid: HEAD },
    pullRequestReview: { id: "PRR_1" },
    replyTo: null,
    author: { databaseId: 123 },
  };
}

describe("hosted GitHub process boundary", () => {
  it("recovers a hosted head read after one HTTP 503", async () => {
    const run = vi.fn<HostedProcessRunner["run"]>()
      .mockRejectedValueOnce(new HostedProcessError("HTTP 503", "gh: Service Unavailable (HTTP 503)", 1, 503))
      .mockResolvedValueOnce({ stdout: JSON.stringify({ head: { sha: HEAD } }), stderr: "" });

    await expect(new GhHostedReviewPort({ run }).readHead(target)).resolves.toBe(HEAD);
  });

  it("names an exhausted hosted read, then permits a later repaired read", async () => {
    const unavailable = () => new HostedProcessError("HTTP 502", "gh: Bad Gateway (HTTP 502)", 1, 502);
    const run = vi.fn<HostedProcessRunner["run"]>()
      .mockRejectedValueOnce(unavailable()).mockRejectedValueOnce(unavailable())
      .mockResolvedValueOnce({ stdout: JSON.stringify({ head: { sha: HEAD } }), stderr: "" });
    const port = new GhHostedReviewPort({ run });

    await expect(port.readHead(target)).rejects.toThrow(/GET repos\/owner\/repo\/pulls\/42.*HTTP 502/u);
    await expect(port.readHead(target)).resolves.toBe(HEAD);
  });

  it("aborts a hosted read during backoff and permits a fresh read after cancellation", async () => {
    const controller = new AbortController();
    const reason = new DOMException("Review wait cancelled", "AbortError");
    const run = vi.fn<HostedProcessRunner["run"]>()
      .mockRejectedValueOnce(new HostedProcessError("HTTP 503", "HTTP 503", 1, 503))
      .mockResolvedValueOnce({ stdout: JSON.stringify({ head: { sha: HEAD } }), stderr: "" });
    const port = new GhHostedReviewPort({ run });
    mockDelay.mockImplementationOnce(async (_ms, _value, options: { signal: AbortSignal }) => {
      controller.abort(reason);
      options.signal.throwIfAborted();
    });
    await expect(port.readHead(target, { signal: controller.signal })).rejects.toBe(reason);
    await expect(port.readHead(target)).resolves.toBe(HEAD);
  });

  it.each([400, 403, 404, 429])("does not retry HTTP %s, leaving the next read reachable", async (status) => {
    const run = vi.fn<HostedProcessRunner["run"]>()
      .mockRejectedValueOnce(new HostedProcessError(`HTTP ${status}`, `HTTP ${status}`, 1, status))
      .mockResolvedValueOnce({ stdout: JSON.stringify({ head: { sha: HEAD } }), stderr: "" });
    const port = new GhHostedReviewPort({ run });
    await expect(port.readHead(target)).rejects.toThrow(`HTTP ${status}`);
    await expect(port.readHead(target)).resolves.toBe(HEAD);
  });

  it("retains review-not-found semantics without consuming the next response", async () => {
    const run = vi.fn<HostedProcessRunner["run"]>()
      .mockRejectedValueOnce(new HostedProcessError("Not Found", "HTTP 404", 1, 404))
      .mockResolvedValueOnce({ stdout: JSON.stringify({ state: "COMMENTED", user: { id: 123 }, commit_id: HEAD }), stderr: "" });
    const port = new GhHostedReviewPort({ run });
    await expect(port.readReview(target, 7)).resolves.toBeNull();
    await expect(port.readReview(target, 7)).resolves.toMatchObject({ state: "commented", commitSha: HEAD });
  });

  it("retries a GraphQL query that uses POST fields", async () => {
    const run = vi.fn<HostedProcessRunner["run"]>()
      .mockRejectedValueOnce(new HostedProcessError("HTTP 500", "HTTP 500", 1, 500))
      .mockResolvedValueOnce({ stdout: JSON.stringify({ data: { repository: { pullRequest: {
        reviewThreads: { nodes: [], pageInfo: { hasNextPage: false } },
      } } } }), stderr: "" });
    await expect(new GhHostedReviewPort({ run }).readThreads(target)).resolves.toEqual([]);
  });

  it("preserves a deadline that fires during backoff", async () => {
    const controller = new AbortController();
    const reason = new DOMException("Wait budget exhausted", "TimeoutError");
    mockExeca.mockRejectedValueOnce(new HostedProcessError("HTTP 503", "HTTP 503", 1, 503));
    mockDelay.mockImplementationOnce(async (_ms, _value, options: { signal: AbortSignal }) => {
      controller.abort(reason);
      options.signal.throwIfAborted();
    });
    await expect(new GhHostedReviewPort(hostedGhRunner).readHead(target, { signal: controller.signal }))
      .rejects.toBe(reason);
  });

  it("does not consume a response after cancellation before the read", async () => {
    const controller = new AbortController();
    const reason = new DOMException("Cancelled", "AbortError");
    controller.abort(reason);
    mockExeca.mockResolvedValueOnce({ stdout: JSON.stringify({ head: { sha: HEAD } }), stderr: "" })
      .mockResolvedValueOnce({ stdout: JSON.stringify({ head: { sha: "b".repeat(40) } }), stderr: "" });
    const port = new GhHostedReviewPort(hostedGhRunner);
    await expect(port.readHead(target, { signal: controller.signal })).rejects.toBe(reason);
    await expect(port.readHead(target)).resolves.toBe(HEAD);
  });

  it("retries failed HTTP 503 metadata even when checks allow meaningful nonzero exits", async () => {
    mockExeca
      .mockResolvedValueOnce({ failed: true, exitCode: 1, stdout: "", stderr: "gh: Service Unavailable (HTTP 503)" })
      .mockResolvedValueOnce({ failed: true, exitCode: 8, stdout: JSON.stringify([
        { name: "build", state: "IN_PROGRESS", bucket: "pending" },
        { name: "test", state: "FAILURE", bucket: "fail" },
      ]), stderr: "" });
    await expect(createGhRequiredChecksPort(hostedGhRunner)
      .readObservedChecks(target.repository, target.pullRequest, new AbortController().signal))
      .resolves.toEqual([{ name: "build", state: "pending" }, { name: "test", state: "failed" }]);
  });

  it.each([
    ["implicit POST", ["api", "repos/owner/repo/issues/42/comments", "-f", "body=hello"]],
    ["explicit POST", ["api", "repos/owner/repo/issues/42/comments", "--method", "POST", "-f", "body=hello"]],
    ["GraphQL mutation", ["api", "graphql", "-f", "query=mutation{resolveReviewThread(input:{threadId:\"T\"}){thread{id}}}"]],
  ])("keeps the raw runner single-attempt for %s", async (_kind, args) => {
    mockExeca.mockRejectedValueOnce(new HostedProcessError("HTTP 503", "HTTP 503", 1, 503))
      .mockResolvedValueOnce({ stdout: "created", stderr: "" });
    await expect(hostedGhRunner.run(args)).rejects.toMatchObject({ httpStatus: 503 });
    await expect(hostedGhRunner.run(args)).resolves.toMatchObject({ stdout: "created" });
  });

  it("does not replay a GraphQL thread mutation after an ambiguous 503", async () => {
    const run = vi.fn<HostedProcessRunner["run"]>()
      .mockRejectedValueOnce(new HostedProcessError("HTTP 503", "HTTP 503", 1, 503))
      .mockResolvedValueOnce({ stdout: JSON.stringify({ data: { resolveReviewThread: {
        thread: { id: "T", isResolved: true },
      } } }), stderr: "" });
    const port = new GhHostedReviewPort({ run });
    await expect(port.resolveThread(target, "T")).resolves.toEqual({ kind: "ambiguous" });
    await expect(port.resolveThread(target, "T")).resolves.toEqual({ kind: "resolved" });
  });

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
      run: (args, options) => {
        if (args.length === 0) throw new Error("expected a hosted command");
        return new Promise((_resolve, reject) => {
          const signal = options?.signal;
          if (signal === undefined) throw new Error("expected a bounded-wait signal");
          const rejectWithReason = () => reject(signal.reason);
          if (signal.aborted) rejectWithReason();
          else signal.addEventListener("abort", rejectWithReason, { once: true });
        });
      },
    };
    const adapter = new CodeRabbitHostedAdapter(new GhHostedReviewPort(boundary));
    const clock: HostedAwaitClock = {
      now: () => 0,
      sleep: () => Promise.resolve(),
    };

    await expect(awaitHostedReview({
      schemaVersion: 1,
      handle: createHostedHandleFixture({
        provider: "coderabbit-pr",
        target,
        requestedCoverage: "complete",
        effectiveCoverage: "complete",
        artifact: {
          kind: "issue-comment",
          id: "IC_1",
          url: "https://github.com/owner/repo/pull/42#issuecomment-1",
          createdAt: "2026-07-24T12:00:00Z",
        },
      }),
      timeoutMs: 10,
      pollIntervalMs: 5,
    }, {
      observers: [adapter],
      clock,
      attentionAfterMs: Number.MAX_SAFE_INTEGER,
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
    const mock = runner([
      [
        { check_runs: [{ name: "first", status: "completed", conclusion: "success", app: null, output: null }] },
        { check_runs: [{ name: "second", status: "completed", conclusion: "success", app: null, output: null }] },
      ],
    ]);
    const port = new GhHostedReviewPort(mock.boundary);

    await expect(port.readCheckRuns(target)).resolves.toMatchObject([
      { name: "first" },
      { name: "second" },
    ]);
    expect(mock.calls[0]?.args).toEqual(expect.arrayContaining(["--paginate", "--slurp"]));
  });

  it("normalizes exact-head commit statuses", async () => {
    const mock = runner([[[{
      context: "CodeRabbit",
      state: "success",
      description: "Review completed",
      created_at: "2026-07-24T12:05:00Z",
      updated_at: "2026-07-24T12:05:01Z",
    }]]]);
    const port = new GhHostedReviewPort(mock.boundary);

    await expect(port.readCommitStatuses(target)).resolves.toEqual([{
      context: "CodeRabbit",
      state: "success",
      description: "Review completed",
      createdAt: "2026-07-24T12:05:00Z",
      updatedAt: "2026-07-24T12:05:01Z",
    }]);
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
                    fullDatabaseId: 1,
                    body: "comment",
                    url: "https://github.com/owner/repo/pull/42#discussion_r1",
                    path: "src/a.ts",
                    line: 7,
                    originalLine: 7,
                    commit: { oid: HEAD },
                    pullRequestReview: { id: "PRR_1" },
                    replyTo: null,
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
              nodes: [{ ...comment(2), replyTo: { pullRequestReview: { id: "PRR_OLD" } } }],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        },
      },
    ]);
    const port = new GhHostedReviewPort(mock.boundary);

    await expect(port.readThreads(target)).resolves.toMatchObject([
      { id: "PRRT_1", comments: [
        { id: "1", replyToReviewId: null },
        { id: "2", replyToReviewId: "PRR_OLD" },
      ] },
      { id: "PRRT_2", comments: [{ id: "3", replyToReviewId: null }] },
    ]);
    expect(mock.calls[1]?.args).toEqual(expect.arrayContaining(["-F", "threadCursor=THREADS_1"]));
    expect(mock.calls[2]?.args).toEqual(expect.arrayContaining([
      "-F",
      "id=PRRT_1",
      "-F",
      "commentCursor=COMMENTS_1",
    ]));
  });

  it("preserves full-width comment identities on initial and paginated reads", async () => {
    const firstId = "4169384475";
    const nextId = "9223372036854775807";
    const boundary: HostedProcessRunner = {
      run: (args) => {
        const query = args.find((arg) => arg.startsWith("query=")) ?? "";
        const paged = args.includes("commentCursor=COMMENTS_1");
        const commentId = paged ? nextId : firstId;
        const node = {
          ...comment(paged ? 2 : 1),
          id: `PRRC_${commentId}`,
          url: `https://github.com/owner/repo/pull/42#discussion_r${commentId}`,
          ...(query.includes("fullDatabaseId")
            ? { fullDatabaseId: commentId }
            : { fullDatabaseId: undefined, databaseId: null }),
        };
        const comments = {
          nodes: [node],
          pageInfo: { hasNextPage: !paged, endCursor: paged ? null : "COMMENTS_1" },
        };
        const data = paged
          ? { node: { id: "PRRT_1", comments } }
          : { repository: { pullRequest: { reviewThreads: {
              nodes: [{ id: "PRRT_1", isResolved: false, comments }],
              pageInfo: { hasNextPage: false, endCursor: null },
            } } } };
        return Promise.resolve({ stdout: JSON.stringify({ data }), stderr: "" });
      },
    };

    await expect(new GhHostedReviewPort(boundary).readThreads(target)).resolves.toMatchObject([{
      id: "PRRT_1",
      comments: [{ id: firstId, actorIdentity: "123" }, { id: nextId, actorIdentity: "123" }],
    }]);
  });

  it.each([null, 0, -1, 1.5, "1e3", "01"])("refuses an invalid full-width comment identity: %s", async (id) => {
    const mock = runner([{ data: { repository: { pullRequest: { reviewThreads: {
      nodes: [{
        id: "PRRT_1",
        isResolved: false,
        comments: {
          nodes: [{ ...comment(1), fullDatabaseId: id }],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      }],
      pageInfo: { hasNextPage: false, endCursor: null },
    } } } } }]);

    await expect(new GhHostedReviewPort(mock.boundary).readThreads(target)).rejects.toMatchObject({
      message: "threads[0].comments[0].fullDatabaseId: expected a positive integer identity",
    });
  });

  it.each([
    ["9007199254740992", "9007199254740995"],
    ["9007199254740993", "9007199254740997"],
  ])("matches only replies to the exact REST parent %s", async (commentId, replyId) => {
    const boundary: HostedProcessRunner = {
      run: async () => ({
        stdout: '[[{"id":9007199254740995,"in_reply_to_id":9007199254740992,'
          + '"user":{"id":123},"body":"Approved disposition"},'
          + '{"id":9007199254740997,"in_reply_to_id":9007199254740993,'
          + '"user":{"id":123},"body":"Approved disposition"}]]',
        stderr: "",
      }),
    };

    await expect(new GhHostedReviewPort(boundary).findReplies({
      target, commentId, actorIdentity: "123", body: "Approved disposition",
    })).resolves.toEqual([{
      id: replyId, actorIdentity: "123", body: "Approved disposition", inReplyToId: commentId,
    }]);
  });

  it("preserves a newly posted REST reply identity above the safe integer limit", async () => {
    const boundary: HostedProcessRunner = {
      run: async () => ({ stdout: '{"id":9223372036854775807}', stderr: "" }),
    };

    await expect(new GhHostedReviewPort(boundary).postReply({
      target, commentId: "9007199254740993", body: "Approved disposition",
    })).resolves.toEqual({ kind: "created", id: "9223372036854775807" });
  });

  it("reuses an existing REST reply across settlement and its retry for a large comment identity", async () => {
    const commentId = "9007199254740993";
    const replyId = "9007199254740995";
    const replyBody = "Approved disposition";
    let resolved = false;
    const replies = [replyId];
    const boundary: HostedProcessRunner = {
      run: async (args) => {
        const route = args[1];
        let output: unknown;
        if (route === "user") output = { id: 123 };
        else if (route === "repos/owner/repo/pulls/42") output = { head: { sha: HEAD } };
        else if (route === "repos/owner/repo/pulls/42/comments?per_page=100") {
          return {
            stdout: `[[${replies.map((id) => `{"id":${id},"in_reply_to_id":${commentId},`
              + `"user":{"id":123},"body":${JSON.stringify(replyBody)}}`).join(",")}]]`,
            stderr: "",
          };
        } else if (route === `repos/owner/repo/pulls/42/comments/${commentId}/replies`) {
          replies.push("9007199254740997");
          return { stdout: '{"id":9007199254740997}', stderr: "" };
        } else if (route === "graphql") {
          const query = args.find((arg) => arg.startsWith("query=")) ?? "";
          if (query.includes("resolveReviewThread")) {
            resolved = true;
            output = { data: { resolveReviewThread: { thread: { id: "PRRT_1", isResolved: true } } } };
          } else {
            output = { data: { repository: { pullRequest: { reviewThreads: {
              nodes: [{ id: "PRRT_1", isResolved: resolved, comments: {
                nodes: [
                  { ...comment(1), fullDatabaseId: commentId, id: `PRRC_${commentId}`,
                    url: `https://github.com/owner/repo/pull/42#discussion_r${commentId}` },
                  ...replies.map((id, index) => ({
                    ...comment(index + 2), fullDatabaseId: id, id: `PRRC_${id}`, body: replyBody,
                    url: `https://github.com/owner/repo/pull/42#discussion_r${id}`,
                    replyTo: { pullRequestReview: { id: "PRR_1" } },
                  })),
                ],
                pageInfo: { hasNextPage: false, endCursor: null },
              } }],
              pageInfo: { hasNextPage: false, endCursor: null },
            } } } } };
          }
        } else throw new Error(`Unexpected hosted route: ${route}`);
        return { stdout: JSON.stringify(output), stderr: "" };
      },
    };
    const request = {
      schemaVersion: 1,
      response: {
        attemptRef: "arc-review-source:v1:hosted:lane-progress%2F1:hosted%2F1",
        dispositionSetId: `sha256:${"d".repeat(64)}`,
        findingId: "finding-1",
      },
      target,
      fixTarget: null,
      actorIdentity: "123",
      finding: { commentId, threadId: "PRRT_1" },
      disposition: "reject",
      reply: replyBody,
    };
    const port = new GhHostedReviewPort(boundary);

    await expect(settleHostedFinding(request, { port })).resolves.toMatchObject({
      state: "settled", nextAction: "complete", replyId,
    });
    await expect(settleHostedFinding(request, { port })).resolves.toMatchObject({
      state: "already-settled", nextAction: "complete", replyId,
    });
    expect(replies).toEqual([replyId]);
  });

  it("passes caller cancellation into the gh runner", async () => {
    const mock = runner([[[]]]);
    const port = new GhHostedReviewPort(mock.boundary);
    const signal = new AbortController().signal;

    await port.readReviews(target, { signal });

    expect(mock.calls[0]?.options?.signal).toBe(signal);
  });
});
