/** Developer-authenticated GitHub action port implemented through the `gh` process boundary. */

import { arrayAt, integerAt, objectAt, stringAt } from "../core/validation.js";
import type { ActionComment, DeveloperActionPort } from "./action-main.js";

/** Minimal injected process runner used by repository-only launchers. */
export interface ProcessRunner {
  run(command: string, args: string[]): Promise<{ stdout: string }>;
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

  async currentActorIdentity(): Promise<string> {
    const result = await this.process.run("gh", ["api", "user"]);
    return actorId(parseJson(result.stdout, "gh-user"), "gh-user");
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
}
