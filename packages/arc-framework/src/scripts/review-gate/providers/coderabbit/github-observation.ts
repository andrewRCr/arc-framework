/** GitHub-backed CodeRabbit observation and bounded capacity signals. */

import { arrayAt, integerAt, objectAt, optionalAt, stringAt } from "../../core/validation.js";
import type { GitHubGraphQLClient } from "../../hosts/github/api/graphql.js";
import type { GitHubRestClient } from "../../hosts/github/api/rest.js";
import { resolveReviews, resolveThreads } from "../../hosts/github/native-review.js";
import type { CodeRabbitApi, CodeRabbitRunContext, CodeRabbitSignal } from "./adapter.js";
import type { FindingSeverity } from "../../core/evidence.js";

const CODERABBIT_CHECK = "CodeRabbit";

/** Canonical request/run lookup supplied by receipt-backed runtime composition. */
export interface CodeRabbitObservationLocator {
  resolveRun(requestIdentity: string): Promise<{
    pullNumber: number;
    context: CodeRabbitRunContext;
    candidateTailStart: string | null;
  }>;
  resolveCurrent(): Promise<{
    pullNumber: number;
    context: CodeRabbitRunContext;
    candidateTailStart: string | null;
  } | null>;
}

/** Dependencies pinned to the repository and policy-pinned CodeRabbit bot identity. */
export interface GitHubCodeRabbitObservationDeps {
  rest: GitHubRestClient;
  gql: GitHubGraphQLClient;
  owner: string;
  repo: string;
  expectedBotUserId: string;
  locator: CodeRabbitObservationLocator;
}

interface CheckSignalRecord {
  headSha: string;
  name: string;
  status: string;
  conclusion: string | null;
  appOwnerId: string | null;
  summary: string;
}

type ParsedCheckSignalRecord = Omit<CheckSignalRecord, "headSha">;

function repositoryPath(owner: string, repo: string): string {
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

function parseCheckRecords(value: unknown): ParsedCheckSignalRecord[] {
  const record = objectAt(value, "checkRuns");
  return arrayAt(record.check_runs, "checkRuns.check_runs", (item, path) => {
    const check = objectAt(item, path);
    const app = check.app === null || check.app === undefined ? null : objectAt(check.app, `${path}.app`);
    const owner = app === null || app.owner === null || app.owner === undefined
      ? null
      : objectAt(app.owner, `${path}.app.owner`);
    const output = check.output === null || check.output === undefined ? null : objectAt(check.output, `${path}.output`);
    return {
      name: stringAt(check.name, `${path}.name`),
      status: stringAt(check.status, `${path}.status`),
      conclusion: check.conclusion === null
        ? null
        : optionalAt(check.conclusion, `${path}.conclusion`, stringAt) ?? null,
      appOwnerId: owner === null ? null : String(integerAt(owner.id, `${path}.app.owner.id`, 1)),
      summary: output === null || output.summary === null
        ? ""
        : optionalAt(output.summary, `${path}.output.summary`, stringAt) ?? "",
    };
  });
}

function checkSignals(records: CheckSignalRecord[], expectedBotUserId: string): CodeRabbitSignal[] {
  return records
    .filter((record) => record.name === CODERABBIT_CHECK && record.appOwnerId === expectedBotUserId)
    .flatMap((record): CodeRabbitSignal[] => {
      if (record.status === "completed" && /\b(?:quota|rate[ -]?limit)\b/iu.test(record.summary)) {
        return [{ kind: "quota-rejected", detail: "provider quota reported by CodeRabbit check" }];
      }
      if (record.status !== "completed" || record.conclusion === null) {
        return [{ kind: "status", state: "pending", headSha: record.headSha }];
      }
      return [{
        kind: "status",
        state: record.conclusion === "success" ? "success" : "failure",
        headSha: record.headSha,
      }];
    });
}

function cleanReviewBody(body: string): boolean {
  return /^\*\*Actionable comments posted: 0\*\*$/mu.test(body);
}

function findingSeverity(body: string): FindingSeverity | null {
  const match = /_([🔴🟠🟡🔵]?)\s*(Critical|Major|Minor|Trivial)_/iu.exec(body);
  switch (match?.[2]?.toLowerCase()) {
    case "critical": return "critical";
    case "major": return "high";
    case "minor": return "medium";
    case "trivial": return "low";
    default: return null;
  }
}

/** Concrete diagnostic-only GitHub observation boundary for the CodeRabbit provider adapter. */
export class GitHubCodeRabbitObservationApi implements Pick<CodeRabbitApi, "readRunContext" | "readSignals" | "readCapacity"> {
  private readonly rest: GitHubRestClient;
  private readonly gql: GitHubGraphQLClient;
  private readonly path: string;
  private readonly owner: string;
  private readonly repo: string;
  private readonly expectedBotUserId: string;
  private readonly locator: CodeRabbitObservationLocator;

  constructor(input: GitHubCodeRabbitObservationDeps) {
    this.rest = input.rest;
    this.gql = input.gql;
    this.path = repositoryPath(input.owner, input.repo);
    this.owner = input.owner;
    this.repo = input.repo;
    this.expectedBotUserId = input.expectedBotUserId;
    this.locator = input.locator;
  }

  async readRunContext(requestIdentity: string): Promise<CodeRabbitRunContext> {
    return (await this.locator.resolveRun(requestIdentity)).context;
  }

  private async readCheckRecords(heads: readonly string[]): Promise<CheckSignalRecord[]> {
    const checks: CheckSignalRecord[] = [];
    for (const headSha of heads) {
      const outcome = await this.rest.getPaginated(`${this.path}/commits/${headSha}/check-runs`, {
        query: { filter: "all", per_page: 100 },
        parsePage: parseCheckRecords,
      });
      if (outcome.kind !== "ok") throw new Error(`coderabbit-checks-${outcome.kind}`);
      checks.push(...outcome.value.map((record) => ({ ...record, headSha })));
    }
    return checks;
  }

  async readSignals(requestIdentity: string): Promise<CodeRabbitSignal[]> {
    const run = await this.locator.resolveRun(requestIdentity);
    const eligibleHeads = new Set([run.context.headSha]);
    if (run.candidateTailStart !== null) eligibleHeads.add(run.candidateTailStart);
    const checks = await this.readCheckRecords([...eligibleHeads]);
    const reviews = await resolveReviews(this.rest, { owner: this.owner, repo: this.repo, number: run.pullNumber });
    if (reviews.kind !== "ok") throw new Error(`coderabbit-reviews-${reviews.kind}`);
    const comments = await this.rest.getPaginated(`${this.path}/issues/${run.pullNumber}/comments`, {
      query: { per_page: 100 },
      parsePage: (value) => arrayAt(value, "comments", (item, path) => {
        const comment = objectAt(item, path);
        const user = objectAt(comment.user, `${path}.user`);
        return {
          nodeId: stringAt(comment.node_id, `${path}.node_id`),
          botUserId: String(integerAt(user.id, `${path}.user.id`, 1)),
          body: stringAt(comment.body, `${path}.body`),
          createdAt: stringAt(comment.created_at, `${path}.created_at`),
          updatedAt: stringAt(comment.updated_at, `${path}.updated_at`),
        };
      }),
    });
    if (comments.kind !== "ok") throw new Error(`coderabbit-comments-${comments.kind}`);
    const threads = await resolveThreads(this.gql, { owner: this.owner, repo: this.repo, number: run.pullNumber });
    if (threads.kind !== "ok") throw new Error(`coderabbit-threads-${threads.kind}`);
    const providerReviews = reviews.value.filter((review) =>
      review.actor.identity === this.expectedBotUserId && eligibleHeads.has(review.commitId));
    const findings = threads.value.flatMap((thread): CodeRabbitSignal[] => (thread.comments ?? []).flatMap((comment) => {
      const review = providerReviews.find((candidate) => candidate.reviewId === comment.reviewId
        && candidate.state === "changes-requested"
        && candidate.commitId === run.context.headSha);
      const severity = findingSeverity(comment.body);
      const line = comment.line ?? comment.originalLine;
      if (
        review === undefined
        || comment.actor.identity !== this.expectedBotUserId
        || comment.commitId !== run.context.headSha
        || severity === null
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
        severity,
        url: comment.url,
      }];
    }));
    return [
      ...checkSignals(checks, this.expectedBotUserId),
      ...providerReviews
        .map((review): CodeRabbitSignal => ({
          kind: "review",
          nodeId: review.reviewId,
          state: review.state === "approved" ? "APPROVED"
            : review.state === "changes-requested" ? "CHANGES_REQUESTED" : "COMMENTED",
          headSha: review.commitId,
          botUserId: review.actor.identity,
          url: review.url,
        })),
      ...providerReviews
        .filter((review) => review.state === "approved" && cleanReviewBody(review.body ?? ""))
        .map((review): CodeRabbitSignal => ({
          kind: "clean",
          reviewNodeId: review.reviewId,
          botUserId: review.actor.identity,
          headSha: review.commitId,
          url: review.url,
        })),
      ...findings,
      ...comments.value
        .filter((comment) => comment.botUserId === this.expectedBotUserId)
        .map((comment): CodeRabbitSignal => ({
          kind: "walkthrough",
          text: comment.body,
          mutable: comment.createdAt !== comment.updatedAt,
        })),
      ...threads.value
        .filter((thread) => thread.isResolved && thread.resolvedBy?.identity === this.expectedBotUserId)
        .map((thread): CodeRabbitSignal => ({
          kind: "thread-resolution",
          threadNodeId: thread.threadId,
          resolvedByBotUserId: this.expectedBotUserId,
        })),
    ];
  }

  async readCapacity(): Promise<"not-observable" | "lookup-failed" | "exhausted"> {
    try {
      const current = await this.locator.resolveCurrent();
      if (current === null) return "not-observable";
      const signals = checkSignals(
        await this.readCheckRecords([current.context.headSha]),
        this.expectedBotUserId,
      );
      return signals.some((signal) => signal.kind === "quota-rejected") ? "exhausted" : "not-observable";
    } catch {
      return "lookup-failed";
    }
  }
}
