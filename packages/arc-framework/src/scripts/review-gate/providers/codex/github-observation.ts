/** GitHub-backed hosted Codex review and clean-comment observations. */

import { arrayAt, integerAt, objectAt, stringAt, timestampAt } from "../../core/validation.js";
import {
  hasExplicitPurePolishMarker,
  normalizeProviderFindingClassification,
} from "../../core/finding-records.js";
import type { ReviewSeverity } from "../../core/review-primitives.js";
import type { GitHubGraphQLClient } from "../../hosts/github/api/graphql.js";
import type { GitHubRestClient } from "../../hosts/github/api/rest.js";
import { resolveReviews, resolveThreads } from "../../hosts/github/native-review.js";
import type { CodexApi, CodexRunContext, CodexSignal } from "./adapter.js";

export interface CodexObservationLocator {
  resolveRun(requestIdentity: string): Promise<{ pullNumber: number; context: CodexRunContext }>;
  resolveCurrent(): Promise<{ pullNumber: number; context: CodexRunContext } | null>;
}

export interface GitHubCodexObservationDeps {
  rest: GitHubRestClient;
  gql: GitHubGraphQLClient;
  owner: string;
  repo: string;
  expectedAppId: string;
  expectedBotUserId: string;
  locator: CodexObservationLocator;
  resolveCommitPrefix: (prefix: string, frozenHeadSha: string) => Promise<string | null>;
}

interface IssueCommentRecord {
  nodeId: string;
  appId: string;
  botUserId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  url: string;
}

function repositoryPath(owner: string, repo: string): string {
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

/** Map a hosted-Codex priority marker to the neutral severity vocabulary. */
export function parseCodexFindingSeverity(body: string): ReviewSeverity | null {
  const match = /\bP([0-3])\b/u.exec(body);
  const providerSeverity = match?.[1] === "0" ? "critical"
    : match?.[1] === "1" ? "high"
      : match?.[1] === "2" ? "medium"
        : match?.[1] === "3" ? "low"
          : null;
  return providerSeverity === null
    ? null
    : normalizeProviderFindingClassification(providerSeverity, false).severity;
}

/** Extract normalized reviewed-commit markers from a hosted-Codex comment. */
export function parseCodexCommitMarkers(body: string): string[] {
  return [...body.matchAll(/^Reviewed commit:\s*`?([a-f0-9]{7,40})`?\s*$/gimu)]
    .flatMap((match) => match[1] === undefined ? [] : [match[1].toLowerCase()]);
}

/** Concrete GitHub observation API for hosted Codex. */
export class GitHubCodexObservationApi implements Pick<CodexApi, "readRunContext" | "readSignals" | "readCapacity"> {
  private readonly rest: GitHubRestClient;
  private readonly gql: GitHubGraphQLClient;
  private readonly path: string;
  private readonly owner: string;
  private readonly repo: string;
  private readonly expectedBotUserId: string;
  private readonly locator: CodexObservationLocator;
  private readonly resolveCommitPrefix: GitHubCodexObservationDeps["resolveCommitPrefix"];

  constructor(input: GitHubCodexObservationDeps) {
    this.rest = input.rest;
    this.gql = input.gql;
    this.path = repositoryPath(input.owner, input.repo);
    this.owner = input.owner;
    this.repo = input.repo;
    this.expectedBotUserId = input.expectedBotUserId;
    this.locator = input.locator;
    this.resolveCommitPrefix = input.resolveCommitPrefix;
  }

  async readRunContext(requestIdentity: string): Promise<CodexRunContext> {
    return (await this.locator.resolveRun(requestIdentity)).context;
  }

  private async readComments(pullNumber: number): Promise<IssueCommentRecord[]> {
    const outcome = await this.rest.getPaginated(`${this.path}/issues/${pullNumber}/comments`, {
      query: { per_page: 100 },
      parsePage: (value) => arrayAt(value, "comments", (item, path) => {
        const record = objectAt(item, path);
        const app = record.performed_via_github_app === null || record.performed_via_github_app === undefined
          ? null
          : objectAt(record.performed_via_github_app, `${path}.performed_via_github_app`);
        return {
          nodeId: stringAt(record.node_id, `${path}.node_id`),
          appId: app === null ? "" : String(integerAt(app.id, `${path}.performed_via_github_app.id`, 1)),
          botUserId: String(integerAt(objectAt(record.user, `${path}.user`).id, `${path}.user.id`, 1)),
          body: stringAt(record.body, `${path}.body`),
          createdAt: timestampAt(record.created_at, `${path}.created_at`),
          updatedAt: timestampAt(record.updated_at, `${path}.updated_at`),
          url: stringAt(record.html_url, `${path}.html_url`),
        };
      }),
    });
    if (outcome.kind !== "ok") throw new Error(`codex-comments-${outcome.kind}`);
    return outcome.value;
  }

  async readSignals(requestIdentity: string): Promise<CodexSignal[]> {
    const run = await this.locator.resolveRun(requestIdentity);
    const reviews = await resolveReviews(this.rest, { owner: this.owner, repo: this.repo, number: run.pullNumber });
    if (reviews.kind !== "ok") throw new Error(`codex-reviews-${reviews.kind}`);
    const comments = await this.readComments(run.pullNumber);
    const threads = await resolveThreads(this.gql, { owner: this.owner, repo: this.repo, number: run.pullNumber });
    if (threads.kind !== "ok") throw new Error(`codex-threads-${threads.kind}`);

    const providerReviews = reviews.value.filter((review) => review.actor.identity === this.expectedBotUserId);
    const reviewSignals = providerReviews.flatMap((review): CodexSignal[] => review.submittedAt === null ? [] : [{
      kind: "review",
      nodeId: review.reviewId,
      state: review.state === "approved" ? "APPROVED"
        : review.state === "changes-requested" ? "CHANGES_REQUESTED" : "COMMENTED",
      headSha: review.commitId,
      botUserId: review.actor.identity,
      url: review.url,
      observedAt: review.submittedAt,
    }]);
    const findings = threads.value.flatMap((thread): CodexSignal[] => (thread.comments ?? []).flatMap((comment) => {
      const review = providerReviews.find((candidate) => candidate.reviewId === comment.reviewId
        && candidate.state === "commented"
        && candidate.commitId === run.context.headSha);
      const findingSeverity = parseCodexFindingSeverity(comment.body);
      const line = comment.line ?? comment.originalLine;
      if (
        review === undefined
        || comment.actor.identity !== this.expectedBotUserId
        || comment.commitId !== run.context.headSha
        || findingSeverity === null
        || line === null
      ) return [];
      return [{
        kind: "finding",
        findingId: thread.threadId,
        commentNodeId: comment.commentId,
        threadNodeId: thread.threadId,
        reviewNodeId: review.reviewId,
        botUserId: comment.actor.identity,
        locus: `${comment.path}:${line}`,
        severity: findingSeverity,
        ...(findingSeverity === "minor" && hasExplicitPurePolishMarker(comment.body)
          ? { nit: true as const }
          : {}),
        url: comment.url,
      }];
    }));
    const commentSignals: CodexSignal[] = [];
    for (const comment of comments) {
      const markers = parseCodexCommitMarkers(comment.body);
      const resolvedCommitSha = markers.length === 1
        ? await this.resolveCommitPrefix(markers[0] ?? "", run.context.headSha)
        : null;
      commentSignals.push({ kind: "issue-comment", ...comment, resolvedCommitSha });
    }
    return [...reviewSignals, ...findings, ...commentSignals];
  }

  async readCapacity(): Promise<"not-observable" | "lookup-failed" | "exhausted"> {
    try {
      return await this.locator.resolveCurrent() === null ? "not-observable" : "not-observable";
    } catch {
      return "lookup-failed";
    }
  }
}
