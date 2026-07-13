/** Canonical adoption of an actor-authenticated hosted Codex trigger comment. */

import { hashContent } from "../../../../lib/manifest/hash.js";
import type { ReviewRequest } from "../../core/execution.js";
import { arrayAt, integerAt, objectAt, stringAt, timestampAt } from "../../core/validation.js";
import type { GitHubRestClient } from "../../hosts/github/api/rest.js";
import type { CodexTriggerOutcome } from "./adapter.js";

export interface CodexRequestLocator {
  resolve(request: ReviewRequest): Promise<{
    state: "current" | "replay" | "stale";
    pullNumber: number;
    reservedAt: string;
  }>;
}

export interface GitHubCodexTriggerDeps {
  rest: GitHubRestClient;
  owner: string;
  repo: string;
  locator: CodexRequestLocator;
}

function repositoryPath(owner: string, repo: string): string {
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

/** Read and adopt the exact comment posted by the required user-trigger actor. */
export class GitHubCodexTriggerApi {
  private readonly rest: GitHubRestClient;
  private readonly path: string;
  private readonly locator: CodexRequestLocator;

  constructor(input: GitHubCodexTriggerDeps) {
    this.rest = input.rest;
    this.path = repositoryPath(input.owner, input.repo);
    this.locator = input.locator;
  }

  async validateCurrent(request: ReviewRequest): Promise<"current" | "replay" | "stale"> {
    return (await this.locator.resolve(request)).state;
  }

  async acknowledgeUserTrigger(request: ReviewRequest): Promise<CodexTriggerOutcome> {
    const current = await this.locator.resolve(request);
    if (current.state !== "current") return { kind: "rejected", reason: current.state };
    if (request.requestCommand === null) return { kind: "rejected", reason: "missing-command" };
    const outcome = await this.rest.getPaginated(`${this.path}/issues/${current.pullNumber}/comments`, {
      query: { per_page: 100 },
      parsePage: (value) => arrayAt(value, "comments", (item, path) => {
        const record = objectAt(item, path);
        return {
          nodeId: stringAt(record.node_id, `${path}.node_id`),
          actorIdentity: String(integerAt(objectAt(record.user, `${path}.user`).id, `${path}.user.id`, 1)),
          body: stringAt(record.body, `${path}.body`),
          createdAt: timestampAt(record.created_at, `${path}.created_at`),
          updatedAt: timestampAt(record.updated_at, `${path}.updated_at`),
          url: stringAt(record.html_url, `${path}.html_url`),
        };
      }),
    });
    if (outcome.kind !== "ok") return { kind: "ambiguous" };
    const candidates = outcome.value.filter((comment) =>
      comment.actorIdentity === request.requiredActorIdentity
      && comment.body === request.requestCommand
      && comment.createdAt === comment.updatedAt
      && comment.createdAt >= current.reservedAt);
    if (candidates.length !== 1) return { kind: "ambiguous" };
    const comment = candidates[0];
    if (comment === undefined) return { kind: "ambiguous" };
    return {
      kind: "acknowledged",
      acknowledgedAt: comment.createdAt,
      durableRef: comment.url,
      trigger: {
        eventKind: "comment",
        eventId: comment.nodeId,
        actorIdentity: comment.actorIdentity,
        contentDigest: hashContent(comment.body),
        occurredAt: comment.createdAt,
        headSha: request.coverageThroughSha,
      },
    };
  }
}
