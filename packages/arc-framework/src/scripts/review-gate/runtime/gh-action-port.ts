/** Developer-authenticated GitHub action port implemented through the `gh` process boundary. */

import { arrayAt, integerAt, objectAt, stringAt } from "../core/validation.js";
import { hashContent } from "../../../lib/manifest/hash.js";
import type { ActionComment, DeveloperActionPort } from "./action-main.js";

/** Minimal injected process runner used by repository-only launchers. */
export interface ProcessRunner {
  run(command: string, args: string[]): Promise<{ stdout: string }>;
}

/** Classified process-boundary failure shared by developer-authenticated launchers. */
export class GhProcessError extends Error {
  readonly kind: "authentication-failure" | "host-failure";

  constructor(kind: "authentication-failure" | "host-failure") {
    super(kind);
    this.name = "GhProcessError";
    this.kind = kind;
  }
}

function repositoryPath(repositoryRef: string): string {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repositoryRef)) {
    throw new Error("gh-action: invalid repository reference");
  }
  return `repos/${repositoryRef}`;
}

function parseJson(text: string, path: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${path}: malformed JSON`);
  }
}

function actorId(input: unknown, path: string): string {
  const value = objectAt(input, path).id;
  return String(integerAt(value, `${path}.id`, 1));
}

function comment(input: unknown, path: string): ActionComment {
  const record = objectAt(input, path);
  return {
    commentId: String(integerAt(record.id, `${path}.id`, 1)),
    actorIdentity: actorId(record.user, `${path}.user`),
    body: stringAt(record.body, `${path}.body`),
    createdAt: stringAt(record.created_at, `${path}.created_at`),
  };
}

async function assertActorAndHead(
  target: GhDeveloperActionPort,
  input: { repositoryRef: string; pullRequestNumber: number; expectedActorIdentity: string; expectedHeadSha: string },
): Promise<void> {
  if (await target.currentActorIdentity() !== input.expectedActorIdentity) throw new Error("gh-action: actor mismatch");
  const pull = objectAt(
    await target.readJson(`${repositoryPath(input.repositoryRef)}/pulls/${input.pullRequestNumber}`),
    "pull-request",
  );
  const head = stringAt(objectAt(pull.head, "pull-request.head").sha, "pull-request.head.sha");
  if (head !== input.expectedHeadSha) throw new Error("gh-action: stale head");
}

function flattenedPages(input: unknown): unknown[] {
  const pages = arrayAt(input, "comments", (page) => page);
  return pages.flatMap((page): unknown[] => Array.isArray(page) ? page as unknown[] : [page]);
}

/** Exact comment and dispatch operations under the current developer's `gh` identity. */
export class GhDeveloperActionPort implements DeveloperActionPort {
  private readonly process: ProcessRunner;

  constructor(process: ProcessRunner) {
    this.process = process;
  }

  /** Canonical JSON read shared by repository-only developer launchers. */
  async readJson(path: string): Promise<unknown> {
    if (!/^(?:user|repos\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_?=&./-]+)$/u.test(path)) {
      throw new Error("gh-action: invalid API path");
    }
    const result = await this.process.run("gh", ["api", path]);
    return parseJson(result.stdout, "gh-read");
  }

  async currentActorIdentity(): Promise<string> {
    return actorId(await this.readJson("user"), "gh-user");
  }

  async postComment(input: {
    repositoryRef: string;
    pullRequestNumber: number;
    body: string;
  }): Promise<{ kind: "created"; comment: ActionComment } | { kind: "ambiguous" }> {
    try {
      const result = await this.process.run("gh", [
        "api",
        `${repositoryPath(input.repositoryRef)}/issues/${input.pullRequestNumber}/comments`,
        "--method",
        "POST",
        "--field",
        `body=${input.body}`,
      ]);
      return { kind: "created", comment: comment(parseJson(result.stdout, "created-comment"), "created-comment") };
    } catch {
      return { kind: "ambiguous" };
    }
  }

  async findComments(input: {
    repositoryRef: string;
    pullRequestNumber: number;
    actorIdentity: string;
    body: string;
    notBefore: string;
  }): Promise<ActionComment[]> {
    const result = await this.process.run("gh", [
      "api",
      `${repositoryPath(input.repositoryRef)}/issues/${input.pullRequestNumber}/comments?per_page=100`,
      "--paginate",
      "--slurp",
    ]);
    return flattenedPages(parseJson(result.stdout, "comments"))
      .map((value, index) => comment(value, `comments[${index}]`))
      .filter((candidate) => candidate.actorIdentity === input.actorIdentity
        && candidate.body === input.body
        && candidate.createdAt >= input.notBefore);
  }

  async dispatchReconcile(input: {
    repositoryRef: string;
    pullRequestNumber: number;
    headSha: string;
  }): Promise<void> {
    const repository = repositoryPath(input.repositoryRef);
    const result = await this.process.run("gh", ["api", repository]);
    const defaultBranch = stringAt(objectAt(parseJson(result.stdout, "repository"), "repository").default_branch,
      "repository.default_branch");
    await this.process.run("gh", [
      "api",
      `${repository}/actions/workflows/review-gate.yml/dispatches`,
      "--method",
      "POST",
      "--field",
      `ref=${defaultBranch}`,
      "--field",
      `inputs[pull_request]=${input.pullRequestNumber}`,
      "--field",
      `inputs[head_sha]=${input.headSha}`,
    ]);
  }

  /** Post one direct reply at the original inline review comment. */
  async postInlineReply(input: {
    repositoryRef: string;
    pullRequestNumber: number;
    commentId: string;
    expectedActorIdentity: string;
    expectedHeadSha: string;
    body: string;
  }): Promise<{ kind: "created"; reply: ActionComment & { bodyDigest: string } } | { kind: "ambiguous" }> {
    await assertActorAndHead(this, input);
    try {
      const result = await this.process.run("gh", [
        "api",
        `${repositoryPath(input.repositoryRef)}/pulls/${input.pullRequestNumber}/comments/${input.commentId}/replies`,
        "--method", "POST", "--field", `body=${input.body}`,
      ]);
      const reply = comment(parseJson(result.stdout, "inline-reply"), "inline-reply");
      if (reply.actorIdentity !== input.expectedActorIdentity || reply.body !== input.body) return { kind: "ambiguous" };
      return { kind: "created", reply: { ...reply, bodyDigest: hashContent(reply.body) } };
    } catch {
      return { kind: "ambiguous" };
    }
  }

  /** Resolve one review thread through the developer's GraphQL mutation authority. */
  async resolveReviewThread(input: {
    repositoryRef: string;
    pullRequestNumber: number;
    threadId: string;
    expectedActorIdentity: string;
    expectedHeadSha: string;
  }): Promise<{ kind: "resolved"; threadId: string } | { kind: "ambiguous" }> {
    await assertActorAndHead(this, input);
    try {
      const query = "mutation($pullRequestReviewThreadId:ID!){resolveReviewThread(input:{threadId:$pullRequestReviewThreadId}){thread{id isResolved}}}";
      const result = await this.process.run("gh", [
        "api", "graphql", "--raw-field", `query=${query}`, "-F", `pullRequestReviewThreadId=${input.threadId}`,
      ]);
      const data = objectAt(parseJson(result.stdout, "thread-resolution"), "thread-resolution");
      const mutation = objectAt(objectAt(data.data, "thread-resolution.data").resolveReviewThread, "resolveReviewThread");
      const thread = objectAt(mutation.thread, "resolveReviewThread.thread");
      return thread.id === input.threadId && thread.isResolved === true
        ? { kind: "resolved", threadId: input.threadId }
        : { kind: "ambiguous" };
    } catch {
      return { kind: "ambiguous" };
    }
  }
}
