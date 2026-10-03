/** `gh api` implementation of the hosted-review GitHub boundary. */

import { execa } from "execa";

import type {
  HostedGitHubCheckRun,
  HostedGitHubCommitStatus,
  HostedGitHubIssueComment,
  HostedGitHubPort,
  HostedGitHubReview,
  HostedGitHubThread,
  HostedGitHubWriteResult,
} from "./github.js";
import { HostedGitHubReadError } from "./github.js";
import type { HostedArtifact, HostedTarget } from "./request.js";
import type { HostedSettlementReply } from "./settle.js";

export interface HostedProcessRunner {
  run(
    args: string[],
    options?: { signal?: AbortSignal; allowFailure?: boolean },
  ): Promise<{ stdout: string; stderr: string }>;
}

export class HostedProcessError extends Error {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
  readonly httpStatus: number | null;

  constructor(
    message: string,
    stderr: string,
    exitCode: number | null = null,
    httpStatus: number | null = null,
    stdout = "",
  ) {
    super(message);
    this.name = "HostedProcessError";
    this.stdout = stdout;
    this.stderr = stderr;
    this.exitCode = exitCode;
    this.httpStatus = httpStatus;
  }
}

function parseHttpStatus(detail: string): number | null {
  const match = /\bHTTP ([1-5][0-9]{2})\b/u.exec(detail);
  return match?.[1] === undefined ? null : Number(match[1]);
}

/** Production `gh` runner with captured output and abort propagation. */
export const hostedGhRunner: HostedProcessRunner = {
  run: async (args, options) => {
    try {
      const result = await execa("gh", args, {
        stdin: "ignore",
        timeout: 60_000,
        reject: options?.allowFailure !== true,
        ...(options?.signal === undefined ? {} : { cancelSignal: options.signal }),
      });
      if (options?.signal?.aborted === true || result.isCanceled) {
        const reason = options?.signal?.reason as unknown;
        throw reason instanceof Error ? reason : new DOMException("The operation was aborted.", "AbortError");
      }
      if (result.timedOut) {
        throw new DOMException("The hosted process timed out.", "TimeoutError");
      }
      return { stdout: result.stdout, stderr: result.stderr };
    } catch (error) {
      if (options?.signal?.aborted === true) {
        const reason = options.signal.reason as unknown;
        throw reason instanceof Error ? reason : new DOMException("The operation was aborted.", "AbortError");
      }
      if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
        throw error;
      }
      const record = typeof error === "object" && error !== null ? error as Record<string, unknown> : {};
      const stdout = typeof record.stdout === "string" ? record.stdout : "";
      const stderr = typeof record.stderr === "string" ? record.stderr : "";
      const message = error instanceof Error ? error.message : String(error);
      throw new HostedProcessError(
        message,
        stderr,
        typeof record.exitCode === "number" ? record.exitCode : null,
        parseHttpStatus(`${message}\n${stderr}`),
        stdout,
      );
    }
  },
};

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new HostedGitHubReadError("terminal-failure", `${path}: expected an object`);
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new HostedGitHubReadError("terminal-failure", `${path}: expected a non-empty string`);
  }
  return value;
}

function integerString(value: unknown, path: string): string {
  if ((typeof value !== "number" && typeof value !== "string") || !/^[1-9][0-9]*$/u.test(String(value))) {
    throw new HostedGitHubReadError("terminal-failure", `${path}: expected a positive integer identity`);
  }
  return String(value);
}

function parse(text: string, path: string): unknown {
  try {
    return JSON.parse(text, (key: string, value: unknown, context?: { source: string }) => {
      if ((key === "id" || key === "in_reply_to_id")
        && typeof value === "number" && !Number.isSafeInteger(value)) {
        // Numeric primitives retain their original JSON token in the Node 24+ reviver context.
        const source = context?.source;
        if (source === undefined) throw new Error("JSON identity token is unavailable");
        return source;
      }
      return value;
    }) as unknown;
  } catch {
    throw new HostedGitHubReadError("terminal-failure", `${path}: malformed JSON`);
  }
}

function pages(text: string, path: string): unknown[] {
  const value = parse(text, path);
  if (!Array.isArray(value)) throw new HostedGitHubReadError("terminal-failure", `${path}: expected page array`);
  return value.flatMap((page) => {
    if (!Array.isArray(page)) throw new HostedGitHubReadError("terminal-failure", `${path}: expected array page`);
    return page as unknown[];
  });
}

function connectionPage(
  value: unknown,
  path: string,
): { nodes: unknown[]; nextCursor: string | null } {
  const connection = record(value, path);
  if (!Array.isArray(connection.nodes)) {
    throw new HostedGitHubReadError("terminal-failure", `${path}.nodes: expected an array`);
  }
  const pageInfo = record(connection.pageInfo, `${path}.pageInfo`);
  if (typeof pageInfo.hasNextPage !== "boolean") {
    throw new HostedGitHubReadError("terminal-failure", `${path}.pageInfo.hasNextPage: expected a boolean`);
  }
  if (!pageInfo.hasNextPage) return { nodes: connection.nodes, nextCursor: null };
  return {
    nodes: connection.nodes,
    nextCursor: string(pageInfo.endCursor, `${path}.pageInfo.endCursor`),
  };
}

function apiPath(target: HostedTarget, suffix: string): string {
  return `repos/${target.repository}/${suffix}`;
}

function readFailure(error: unknown): never {
  if (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name)) throw error;
  if (error instanceof HostedGitHubReadError) throw error;
  const detail = error instanceof HostedProcessError ? `${error.message}\n${error.stderr}` : String(error);
  if (/\b(?:rate[ -]?limit|HTTP 429)\b/iu.test(detail)) {
    throw new HostedGitHubReadError("rate-limited", detail);
  }
  if (/\b(?:timeout|timed out|network|connection|TLS|HTTP 5[0-9]{2})\b/iu.test(detail)) {
    throw new HostedGitHubReadError("transient-unavailable", detail);
  }
  throw new HostedGitHubReadError("terminal-failure", detail);
}

function writeFailure(error: unknown): HostedGitHubWriteResult {
  const detail = error instanceof HostedProcessError ? `${error.message}\n${error.stderr}` : String(error);
  if (/\b(?:rate[ -]?limit|HTTP 429)\b/iu.test(detail)) return { kind: "rate-limited" };
  if (/\bHTTP 4[0-9]{2}\b/u.test(detail)) return { kind: "terminal-failure", reason: detail };
  return { kind: "ambiguous-delivery" };
}

function issueComment(value: unknown, path: string): HostedGitHubIssueComment {
  const item = record(value, path);
  const app = item.performed_via_github_app === null || item.performed_via_github_app === undefined
    ? null
    : record(item.performed_via_github_app, `${path}.performed_via_github_app`);
  return {
    id: string(item.node_id, `${path}.node_id`),
    url: string(item.html_url, `${path}.html_url`),
    actorIdentity: integerString(record(item.user, `${path}.user`).id, `${path}.user.id`),
    ...(app === null ? {} : { appId: integerString(app.id, `${path}.performed_via_github_app.id`) }),
    body: string(item.body, `${path}.body`),
    createdAt: string(item.created_at, `${path}.created_at`),
    updatedAt: string(item.updated_at, `${path}.updated_at`),
  };
}

/** Developer-authenticated GitHub reads and mutations for hosted review. */
export class GhHostedReviewPort implements HostedGitHubPort {
  private readonly runner: HostedProcessRunner;

  constructor(runner: HostedProcessRunner) {
    this.runner = runner;
  }

  private async read(args: string[], options?: { signal?: AbortSignal }): Promise<string> {
    try {
      return (await this.runner.run(["api", ...args], options)).stdout;
    } catch (error) {
      return readFailure(error);
    }
  }

  async currentActorIdentity(): Promise<string> {
    const value = record(parse(await this.read(["user"]), "user"), "user");
    return integerString(value.id, "user.id");
  }

  async readHead(target: HostedTarget, options?: { signal?: AbortSignal }): Promise<string> {
    const value = record(parse(
      await this.read([apiPath(target, `pulls/${target.pullRequest}`)], options),
      "pull-request",
    ), "pull-request");
    return string(record(value.head, "pull-request.head").sha, "pull-request.head.sha");
  }

  async createIssueComment(target: HostedTarget, body: string): Promise<HostedGitHubWriteResult> {
    try {
      const output = await this.runner.run([
        "api",
        apiPath(target, `issues/${target.pullRequest}/comments`),
        "--method",
        "POST",
        "--raw-field",
        `body=${body}`,
      ]);
      const comment = issueComment(parse(output.stdout, "created-comment"), "created-comment");
      const artifact: HostedArtifact = {
        kind: "issue-comment",
        id: comment.id,
        url: comment.url,
        createdAt: comment.createdAt,
      };
      return { kind: "created", artifact, actorIdentity: comment.actorIdentity, body: comment.body };
    } catch (error) {
      return writeFailure(error);
    }
  }

  async readReviews(target: HostedTarget, options?: { signal?: AbortSignal }): Promise<HostedGitHubReview[]> {
    const values = pages(await this.read([
      apiPath(target, `pulls/${target.pullRequest}/reviews?per_page=100`),
      "--paginate",
      "--slurp",
    ], options), "reviews");
    return values.flatMap((value, index) => {
      const item = record(value, `reviews[${index}]`);
      const state = string(item.state, `reviews[${index}].state`);
      if (["DISMISSED", "PENDING"].includes(state)) return [];
      if (!["APPROVED", "CHANGES_REQUESTED", "COMMENTED"].includes(state)) {
        throw new HostedGitHubReadError("terminal-failure", `reviews[${index}].state: unsupported ${state}`);
      }
      return [{
        id: string(item.node_id, `reviews[${index}].node_id`),
        url: string(item.html_url, `reviews[${index}].html_url`),
        actorIdentity: integerString(record(item.user, `reviews[${index}].user`).id, `reviews[${index}].user.id`),
        state: state === "APPROVED" ? "approved"
          : state === "CHANGES_REQUESTED" ? "changes-requested" : "commented",
        headSha: string(item.commit_id, `reviews[${index}].commit_id`),
        body: typeof item.body === "string" ? item.body : "",
        submittedAt: string(item.submitted_at, `reviews[${index}].submitted_at`),
      }];
    });
  }

  async readIssueComments(
    target: HostedTarget,
    options?: { signal?: AbortSignal },
  ): Promise<HostedGitHubIssueComment[]> {
    return pages(await this.read([
      apiPath(target, `issues/${target.pullRequest}/comments?per_page=100`),
      "--paginate",
      "--slurp",
    ], options), "issue-comments").map((value, index) => issueComment(value, `issue-comments[${index}]`));
  }

  async readCheckRuns(
    target: HostedTarget,
    options?: { signal?: AbortSignal },
  ): Promise<HostedGitHubCheckRun[]> {
    const rawPages = parse(await this.read([
      apiPath(target, `commits/${target.headSha}/check-runs?filter=all&per_page=100`),
      "--paginate",
      "--slurp",
    ], options), "check-runs");
    if (!Array.isArray(rawPages)) {
      throw new HostedGitHubReadError("terminal-failure", "check-runs: expected page array");
    }
    const entries = rawPages.flatMap((page, pageIndex) => {
      const value = record(page, `check-runs.pages[${pageIndex}]`);
      if (!Array.isArray(value.check_runs)) {
        throw new HostedGitHubReadError(
          "terminal-failure",
          `check-runs.pages[${pageIndex}].check_runs: expected an array`,
        );
      }
      return value.check_runs as unknown[];
    });
    return entries.map((entry, index) => {
      const item = record(entry, `check-runs[${index}]`);
      const app = item.app === null || item.app === undefined ? null : record(item.app, `check-runs[${index}].app`);
      const owner = app?.owner === null || app?.owner === undefined
        ? null
        : record(app.owner, `check-runs[${index}].app.owner`);
      const output = item.output === null || item.output === undefined
        ? null
        : record(item.output, `check-runs[${index}].output`);
      return {
        name: string(item.name, `check-runs[${index}].name`),
        status: string(item.status, `check-runs[${index}].status`),
        conclusion: item.conclusion === null ? null : string(item.conclusion, `check-runs[${index}].conclusion`),
        appOwnerIdentity: owner === null ? null : integerString(owner.id, `check-runs[${index}].app.owner.id`),
        summary: typeof output?.summary === "string" ? output.summary : "",
      };
    });
  }

  async readCommitStatuses(
    target: HostedTarget,
    options?: { signal?: AbortSignal },
  ): Promise<HostedGitHubCommitStatus[]> {
    const rawStatuses = await this.read([
      apiPath(target, `commits/${target.headSha}/statuses?per_page=100`),
      "--paginate",
      "--slurp",
    ], options);
    return pages(rawStatuses, "commit-statuses").map((entry, index) => {
      const item = record(entry, `commit-statuses[${index}]`);
      const state = string(item.state, `commit-statuses[${index}].state`).toLowerCase();
      if (!["pending", "success", "failure", "error"].includes(state)) {
        throw new HostedGitHubReadError(
          "terminal-failure",
          `commit-statuses[${index}].state: unsupported ${state}`,
        );
      }
      const normalizedState: HostedGitHubCommitStatus["state"] = state === "error"
        ? "failure"
        : state as HostedGitHubCommitStatus["state"];
      return {
        context: string(item.context, `commit-statuses[${index}].context`),
        state: normalizedState,
        description: typeof item.description === "string" ? item.description : "",
        createdAt: string(item.created_at, `commit-statuses[${index}].created_at`),
        updatedAt: string(item.updated_at, `commit-statuses[${index}].updated_at`),
      };
    });
  }

  async readThreads(target: HostedTarget, options?: { signal?: AbortSignal }): Promise<HostedGitHubThread[]> {
    const commentFields = "id fullDatabaseId body url path line originalLine commit{oid} "
      + "pullRequestReview{id} replyTo{pullRequestReview{id}} "
      + "author{... on User{databaseId} ... on Bot{databaseId}}";
    const query = `query($owner:String!,$repo:String!,$number:Int!,$threadCursor:String){repository(owner:$owner,name:$repo){pullRequest(number:$number){reviewThreads(first:100,after:$threadCursor){nodes{id isResolved comments(first:100){nodes{${commentFields}} pageInfo{hasNextPage endCursor}}} pageInfo{hasNextPage endCursor}}}}}`;
    const commentQuery = `query($id:ID!,$commentCursor:String){node(id:$id){... on PullRequestReviewThread{id comments(first:100,after:$commentCursor){nodes{${commentFields}} pageInfo{hasNextPage endCursor}}}}}`;
    const [owner, repo] = target.repository.split("/");
    const threadNodes: unknown[] = [];
    const seenThreadCursors = new Set<string>();
    let threadCursor: string | null = null;
    do {
      const output = await this.read([
        "graphql",
        "--raw-field", `query=${query}`,
        "-F", `owner=${owner ?? ""}`,
        "-F", `repo=${repo ?? ""}`,
        "-F", `number=${target.pullRequest}`,
        ...(threadCursor === null ? [] : ["-F", `threadCursor=${threadCursor}`]),
      ], options);
      const data = record(parse(output, "threads"), "threads");
      const repository = record(record(data.data, "threads.data").repository, "threads.data.repository");
      const pull = record(repository.pullRequest, "threads.data.repository.pullRequest");
      const page = connectionPage(pull.reviewThreads, "threads.reviewThreads");
      threadNodes.push(...page.nodes);
      threadCursor = page.nextCursor;
      if (threadCursor !== null && seenThreadCursors.has(threadCursor)) {
        throw new HostedGitHubReadError("terminal-failure", "threads: repeated pagination cursor");
      }
      if (threadCursor !== null) seenThreadCursors.add(threadCursor);
    } while (threadCursor !== null);

    const result: HostedGitHubThread[] = [];
    for (const [index, node] of threadNodes.entries()) {
      const thread = record(node, `threads[${index}]`);
      const threadId = string(thread.id, `threads[${index}].id`);
      const firstCommentPage = connectionPage(thread.comments, `threads[${index}].comments`);
      const commentNodes = [...firstCommentPage.nodes];
      const seenCommentCursors = new Set<string>();
      let commentCursor = firstCommentPage.nextCursor;
      while (commentCursor !== null) {
        if (seenCommentCursors.has(commentCursor)) {
          throw new HostedGitHubReadError(
            "terminal-failure",
            `threads[${index}].comments: repeated pagination cursor`,
          );
        }
        seenCommentCursors.add(commentCursor);
        const output = await this.read([
          "graphql",
          "--raw-field", `query=${commentQuery}`,
          "-F", `id=${threadId}`,
          "-F", `commentCursor=${commentCursor}`,
        ], options);
        const data = record(parse(output, `threads[${index}].comments`), `threads[${index}].comments`);
        const pagedThread = record(
          record(data.data, `threads[${index}].comments.data`).node,
          `threads[${index}].comments.data.node`,
        );
        if (pagedThread.id !== threadId) {
          throw new HostedGitHubReadError(
            "terminal-failure",
            `threads[${index}].comments: paged thread identity mismatch`,
          );
        }
        const page = connectionPage(pagedThread.comments, `threads[${index}].comments`);
        commentNodes.push(...page.nodes);
        commentCursor = page.nextCursor;
      }
      result.push({
        id: threadId,
        isResolved: thread.isResolved === true,
        comments: commentNodes.map((comment, commentIndex) => {
          const path = `threads[${index}].comments[${commentIndex}]`;
          const item = record(comment, path);
          const rawLine = item.line ?? item.originalLine;
          const author = item.author === null || item.author === undefined
            ? null
            : record(item.author, `${path}.author`);
          return {
            id: integerString(item.fullDatabaseId, `${path}.fullDatabaseId`),
            reviewId: string(record(item.pullRequestReview, `${path}.pullRequestReview`).id, `${path}.reviewId`),
            replyToReviewId: item.replyTo === null
              ? null
              : string(record(
                  record(item.replyTo, `${path}.replyTo`).pullRequestReview,
                  `${path}.replyTo.pullRequestReview`,
                ).id, `${path}.replyTo.reviewId`),
            actorIdentity: author === null || author.databaseId === null || author.databaseId === undefined
              ? null
              : integerString(author.databaseId, `${path}.author.databaseId`),
            body: string(item.body, `${path}.body`),
            url: string(item.url, `${path}.url`),
            path: string(item.path, `${path}.path`),
            line: typeof rawLine === "number" && Number.isInteger(rawLine) && rawLine > 0 ? rawLine : null,
            headSha: string(record(item.commit, `${path}.commit`).oid, `${path}.commit.oid`),
          };
        }),
      });
    }
    return result;
  }

  async readThread(target: HostedTarget, threadId: string) {
    const thread = (await this.readThreads(target)).find((candidate) => candidate.id === threadId);
    return thread === undefined
      ? { kind: "missing" as const }
      : {
        kind: "present" as const,
        isResolved: thread.isResolved,
        commentIds: thread.comments.map((comment) => comment.id),
      };
  }

  async findReplies(input: {
    target: HostedTarget;
    commentId: string;
    actorIdentity: string;
    body: string;
  }): Promise<HostedSettlementReply[]> {
    const values = pages(await this.read([
      apiPath(input.target, `pulls/${input.target.pullRequest}/comments?per_page=100`),
      "--paginate",
      "--slurp",
    ]), "review-comments");
    return values.flatMap((value, index) => {
      const item = record(value, `review-comments[${index}]`);
      const inReplyToId = item.in_reply_to_id;
      if ((typeof inReplyToId !== "number" && typeof inReplyToId !== "string")
        || String(inReplyToId) !== input.commentId) return [];
      const actorIdentity = integerString(record(item.user, `review-comments[${index}].user`).id,
        `review-comments[${index}].user.id`);
      const body = string(item.body, `review-comments[${index}].body`);
      if (actorIdentity !== input.actorIdentity || body !== input.body) return [];
      return [{ id: String(item.id), actorIdentity, body, inReplyToId: input.commentId }];
    });
  }

  async postReply(input: { target: HostedTarget; commentId: string; body: string }) {
    try {
      const output = await this.runner.run([
        "api",
        apiPath(input.target, `pulls/${input.target.pullRequest}/comments/${input.commentId}/replies`),
        "--method", "POST",
        "--raw-field", `body=${input.body}`,
      ]);
      return { kind: "created" as const, id: String(record(parse(output.stdout, "reply"), "reply").id) };
    } catch {
      return { kind: "ambiguous" as const };
    }
  }

  async resolveThread(_target: HostedTarget, threadId: string) {
    const query = "mutation($id:ID!){resolveReviewThread(input:{threadId:$id}){thread{id isResolved}}}";
    try {
      const output = await this.runner.run([
        "api", "graphql", "--raw-field", `query=${query}`, "-F", `id=${threadId}`,
      ]);
      const data = record(parse(output.stdout, "resolve-thread"), "resolve-thread");
      const mutation = record(record(data.data, "resolve-thread.data").resolveReviewThread, "resolveReviewThread");
      const thread = record(mutation.thread, "resolveReviewThread.thread");
      return thread.id === threadId && thread.isResolved === true
        ? { kind: "resolved" as const }
        : { kind: "ambiguous" as const };
    } catch {
      return { kind: "ambiguous" as const };
    }
  }
}
