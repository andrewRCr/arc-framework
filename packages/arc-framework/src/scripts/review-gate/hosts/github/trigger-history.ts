/** Complete PR comment and immutable label-timeline history with canonical provenance. */

import { hashContent } from "../../../../lib/manifest/hash.js";
import { arrayAt, integerAt, objectAt, stringAt, timestampAt } from "../../core/validation.js";
import type { GitHubRestClient } from "./api/rest.js";

export interface GitHubHistoryComment {
  id: number;
  nodeId: string;
  actorIdentity: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface GitHubHistoryLabelEvent {
  nodeId: string;
  actorIdentity: string;
  label: string;
  occurredAt: string;
  mutation: "applied" | "removed";
}

export interface GitHubTriggerHistoryApi {
  listIssueComments(): Promise<GitHubHistoryComment[]>;
  listLabelEvents(): Promise<GitHubHistoryLabelEvent[]>;
}

export interface GitHubTriggerHistoryEvent {
  eventId: string;
  eventKind: "comment" | "label";
  actorIdentity: string;
  contentDigest: string;
  occurredAt: string;
  observedHeadSha: string;
  mutation: "created" | "edited" | "applied" | "removed";
  authenticatedEventRef: string;
  providerIdentity: string | null;
  classification: "trigger" | "other";
}

export type GitHubTriggerClassifier = (input: {
  eventKind: "comment" | "label";
  content: string;
}) => { providerIdentity: string; classification: "trigger" | "other" } | null;

function actorIdentity(input: unknown, path: string): string {
  return String(integerAt(objectAt(input, path).id, `${path}.id`, 1));
}

function parseComment(input: unknown, path: string): GitHubHistoryComment {
  const record = objectAt(input, path);
  return {
    id: integerAt(record.id, `${path}.id`, 1),
    nodeId: stringAt(record.node_id, `${path}.node_id`),
    actorIdentity: actorIdentity(record.user, `${path}.user`),
    body: stringAt(record.body, `${path}.body`),
    createdAt: timestampAt(record.created_at, `${path}.created_at`),
    updatedAt: timestampAt(record.updated_at, `${path}.updated_at`),
  };
}

function parseLabelEvent(input: unknown, path: string): GitHubHistoryLabelEvent | null {
  const record = objectAt(input, path);
  const event = stringAt(record.event, `${path}.event`);
  if (event !== "labeled" && event !== "unlabeled") return null;
  return {
    nodeId: stringAt(record.node_id, `${path}.node_id`),
    actorIdentity: actorIdentity(record.actor, `${path}.actor`),
    label: stringAt(objectAt(record.label, `${path}.label`).name, `${path}.label.name`),
    occurredAt: timestampAt(record.created_at, `${path}.created_at`),
    mutation: event === "labeled" ? "applied" : "removed",
  };
}

/** REST implementation whose client guarantees complete Link pagination or failure. */
export class GitHubRestTriggerHistoryApi implements GitHubTriggerHistoryApi {
  private readonly rest: GitHubRestClient;
  private readonly path: string;

  constructor(rest: GitHubRestClient, owner: string, repo: string, pullRequestNumber: number) {
    this.rest = rest;
    this.path = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${pullRequestNumber}`;
  }

  async listIssueComments(): Promise<GitHubHistoryComment[]> {
    const outcome = await this.rest.getPaginated(`${this.path}/comments`, {
      query: { per_page: 100 },
      parsePage: (value) => arrayAt(value, "comments", parseComment),
    });
    if (outcome.kind !== "ok") throw new Error(`trigger-history-comments-${outcome.kind}`);
    return outcome.value;
  }

  async listLabelEvents(): Promise<GitHubHistoryLabelEvent[]> {
    const outcome = await this.rest.getPaginated(`${this.path}/timeline`, {
      query: { per_page: 100 },
      parsePage: (value) => arrayAt(value, "timeline", (item, path) => parseLabelEvent(item, path))
        .filter((item): item is GitHubHistoryLabelEvent => item !== null),
    });
    if (outcome.kind !== "ok") throw new Error(`trigger-history-timeline-${outcome.kind}`);
    return outcome.value;
  }
}

/** Read one complete PR-wide event sequence and bind the canonical head observed by this scan. */
export class GitHubTriggerHistoryReader {
  private readonly api: GitHubTriggerHistoryApi;
  private readonly classify: GitHubTriggerClassifier;

  constructor(api: GitHubTriggerHistoryApi, classify: GitHubTriggerClassifier = () => null) {
    this.api = api;
    this.classify = classify;
  }

  async read(observedHeadSha: string): Promise<GitHubTriggerHistoryEvent[]> {
    const [comments, labels] = await Promise.all([
      this.api.listIssueComments(),
      this.api.listLabelEvents(),
    ]);
    return [
      ...comments.map((comment): GitHubTriggerHistoryEvent => {
        const classified = this.classify({ eventKind: "comment", content: comment.body });
        return {
          eventId: comment.nodeId,
          eventKind: "comment",
          actorIdentity: comment.actorIdentity,
          contentDigest: hashContent(comment.body),
          occurredAt: comment.updatedAt,
          observedHeadSha,
          mutation: comment.updatedAt === comment.createdAt ? "created" : "edited",
          authenticatedEventRef: `github:issue-comment:${comment.id}`,
          providerIdentity: classified?.providerIdentity ?? null,
          classification: classified?.classification ?? "other",
        };
      }),
      ...labels.map((label): GitHubTriggerHistoryEvent => {
        const content = `label:${label.label}`;
        const classified = this.classify({ eventKind: "label", content });
        return {
          eventId: label.nodeId,
          eventKind: "label",
          actorIdentity: label.actorIdentity,
          contentDigest: hashContent(content),
          occurredAt: label.occurredAt,
          observedHeadSha,
          mutation: label.mutation,
          authenticatedEventRef: `github:timeline:${label.nodeId}`,
          providerIdentity: classified?.providerIdentity ?? null,
          classification: classified?.classification ?? "other",
        };
      }),
    ].sort((left, right) => {
      const time = left.occurredAt.localeCompare(right.occurredAt);
      return time === 0 ? left.eventId.localeCompare(right.eventId) : time;
    });
  }
}
