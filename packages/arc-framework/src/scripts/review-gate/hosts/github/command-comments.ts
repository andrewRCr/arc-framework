/** Read immutable GitHub issue-comment facts for review-command ingestion. */

import type { ReviewCommandComment } from "../../core/command-ingestion.js";
import { arrayAt, integerAt, objectAt, stringAt, timestampAt } from "../../core/validation.js";
import type { GitHubRestClient } from "./api/rest.js";

/** Stable failure code when the comment reader cannot produce complete command facts. */
export class GitHubReviewCommandCommentError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "GitHubReviewCommandCommentError";
    this.code = code;
  }
}

function parseComment(input: unknown, path: string): ReviewCommandComment {
  const comment = objectAt(input, path);
  const actor = objectAt(comment.user, `${path}.user`);
  return {
    commentId: integerAt(comment.id, `${path}.id`, 1),
    commentNodeId: stringAt(comment.node_id, `${path}.node_id`),
    actor: {
      login: stringAt(actor.login, `${path}.user.login`),
      expectedActorId: String(integerAt(actor.id, `${path}.user.id`, 1)),
    },
    actorNodeId: stringAt(actor.node_id, `${path}.user.node_id`),
    body: stringAt(comment.body, `${path}.body`),
    createdAt: timestampAt(comment.created_at, `${path}.created_at`),
    updatedAt: timestampAt(comment.updated_at, `${path}.updated_at`),
    durableRef: stringAt(comment.html_url, `${path}.html_url`),
  };
}

/** Repository-pinned GitHub comment reader for one pull request. */
export class GitHubReviewCommandCommentReader {
  private readonly rest: GitHubRestClient;
  private readonly path: string;

  constructor(rest: GitHubRestClient, owner: string, repo: string, number: number) {
    this.rest = rest;
    this.path = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${number}/comments`;
  }

  /** Enumerate and validate every issue comment before command filtering or authorization. */
  async list(): Promise<ReviewCommandComment[]> {
    const outcome = await this.rest.getPaginated(this.path, {
      query: { per_page: 100 },
      parsePage: (value) => arrayAt(value, "comments", parseComment),
    });
    if (outcome.kind !== "ok") throw new GitHubReviewCommandCommentError(`command-comments-${outcome.kind}`);
    return outcome.value;
  }
}
