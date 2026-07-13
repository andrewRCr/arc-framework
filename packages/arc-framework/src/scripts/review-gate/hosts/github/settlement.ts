/** Read-only App-authenticated settlement provenance queries. */

import { GitHubGraphQLClient } from "./api/graphql.js";
import { GitHubRestClient } from "./api/rest.js";

export interface SettlementReply {
  commentId: string;
  actorIdentity: string;
  body: string;
  createdAt: string;
}

export interface SettlementThread {
  threadId: string;
  isResolved: boolean;
  resolvedByActorIdentity: string | null;
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${path}: invalid object`);
  return value as Record<string, unknown>;
}

function reply(value: unknown): SettlementReply & { inReplyToId: string } {
  const item = record(value, "reply");
  const user = typeof item.user === "object" && item.user !== null && !Array.isArray(item.user)
    ? item.user as Record<string, unknown>
    : null;
  const actorId = user?.id;
  return {
    commentId: String(item.id),
    inReplyToId: String(item.in_reply_to_id),
    actorIdentity: typeof actorId === "string" || typeof actorId === "number" ? String(actorId) : "",
    body: typeof item.body === "string" ? item.body : "",
    createdAt: typeof item.created_at === "string" ? item.created_at : "",
  };
}

/** Canonical read side used after developer-authenticated mutations. */
export class GitHubSettlementReader {
  private readonly rest: GitHubRestClient;
  private readonly graphql: GitHubGraphQLClient;
  private readonly repositoryPath: string;

  constructor(rest: GitHubRestClient, graphql: GitHubGraphQLClient, owner: string, repo: string) {
    this.rest = rest;
    this.graphql = graphql;
    this.repositoryPath = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  }

  async findReplies(input: {
    pullRequestNumber: number;
    commentId: string;
    actorIdentity: string;
    body: string;
    notBefore: string;
  }): Promise<SettlementReply[]> {
    const outcome = await this.rest.getPaginated(`${this.repositoryPath}/pulls/${input.pullRequestNumber}/comments`, {
      query: { per_page: 100 },
      parsePage: (value) => {
        if (!Array.isArray(value)) throw new Error("review comments: expected array");
        return value.map(reply);
      },
    });
    if (outcome.kind !== "ok") throw new Error(`settlement-reply-read-failed:${outcome.kind}`);
    return outcome.value.filter((candidate) => candidate.inReplyToId === input.commentId
      && candidate.actorIdentity === input.actorIdentity
      && candidate.body === input.body
      && Date.parse(candidate.createdAt) >= Date.parse(input.notBefore))
      .map((candidate) => ({
        commentId: candidate.commentId,
        actorIdentity: candidate.actorIdentity,
        body: candidate.body,
        createdAt: candidate.createdAt,
      }));
  }

  async readThread(threadId: string): Promise<SettlementThread> {
    const outcome = await this.graphql.query({
      query: "query($id:ID!){node(id:$id){... on PullRequestReviewThread{id isResolved resolvedBy{id}}}}",
      variables: { id: threadId },
      parse: (value) => {
        const node = record(record(value, "data").node, "data.node");
        const resolvedBy = node.resolvedBy === null ? null : record(node.resolvedBy, "data.node.resolvedBy");
        return {
          threadId: String(node.id),
          isResolved: node.isResolved === true,
          resolvedByActorIdentity: resolvedBy === null ? null : String(resolvedBy.id),
        };
      },
    });
    if (outcome.kind !== "ok" || outcome.value.threadId !== threadId) {
      throw new Error(`settlement-thread-read-failed:${outcome.kind}`);
    }
    return outcome.value;
  }
}
