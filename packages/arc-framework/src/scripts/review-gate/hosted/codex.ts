/** Lean Codex hosted-review adapter. */

import { captureReviewFindingSourceLabel } from "../core/finding-records.js";
import type { HostedObservation, HostedReviewObserver } from "./await.js";
import { parseCodexReviewBody } from "./codex-body.js";
import {
  HostedGitHubReadError,
  normalizeHostedGitHubReadFailure,
  type HostedGitHubIssueComment,
  type HostedGitHubPort,
  type HostedGitHubReview,
  type HostedGitHubThreadComment,
} from "./github.js";
import type {
  HostedRequestHandle,
  HostedRequestOutcome,
  HostedReviewAdapter,
  HostedReviewCoverage,
  HostedTarget,
} from "./request.js";

const COMMAND = "@codex review";
const EFFECTIVE_COVERAGE = "complete";
const APP_ID = "1144995";
const BOT_USER_ID = "199175422";
const REVIEW_HEADING = /^(?:Codex Review:|\*\*Codex Review:\*\*)/mu;

export const CODEX_HOSTED_REGISTRATION = {
  id: "codex-pr",
  commands: {
    complete: COMMAND,
  },
  identities: { appId: APP_ID, botUserId: BOT_USER_ID },
} as const;

function severity(body: string): "critical" | "major" | "minor" | null {
  switch (/\bP([0-3])\b/u.exec(body)?.[1]) {
    case "0":
      return "critical";
    case "1":
      return "major";
    case "2":
    case "3":
      return "minor";
    case undefined:
    default:
      return null;
  }
}

function finding(
  threadId: string,
  comment: HostedGitHubThreadComment,
  sourceOrdinal: number,
): Extract<HostedObservation, { kind: "findings" }>["findings"][number] | null {
  const parsedSeverity = severity(comment.body);
  if (parsedSeverity === null || comment.line === null) return null;
  return {
    findingId: threadId,
    origin: "review-thread",
    commentId: comment.id,
    threadId,
    settlement: "reply-and-resolve",
    severity: parsedSeverity,
    locus: `${comment.path}:${comment.line}`,
    url: comment.url,
    sourceOrdinal,
    ...captureReviewFindingSourceLabel({ body: comment.body }),
  };
}

function cleanForHead(comment: HostedGitHubIssueComment, headSha: string): boolean {
  if (!REVIEW_HEADING.test(comment.body)
    || !/\bdid(?:n't| not) find any major issues\b/iu.test(comment.body)) {
    return false;
  }
  const markers = [...comment.body.matchAll(
    /^(?:\*\*)?Reviewed commit:(?:\*\*)?\s*`?([a-f0-9]{7,40})`?\s*$/gimu,
  )];
  const marker = markers[0]?.[1]?.toLowerCase();
  return markers.length === 1 && marker !== undefined && headSha.startsWith(marker);
}

function connectedAccountFailure(comment: HostedGitHubIssueComment): boolean {
  return REVIEW_HEADING.test(comment.body)
    && /Connect your ChatGPT account to use Codex\./u.test(comment.body);
}

function newestReview(reviews: HostedGitHubReview[]): HostedGitHubReview | undefined {
  return [...reviews].sort((left, right) => right.submittedAt.localeCompare(left.submittedAt))[0];
}

/** Codex request and exact-head observation through the common GitHub port. */
export class CodexHostedAdapter implements HostedReviewAdapter, HostedReviewObserver {
  readonly id = CODEX_HOSTED_REGISTRATION.id;
  readonly identities = CODEX_HOSTED_REGISTRATION.identities;
  private readonly github: HostedGitHubPort;

  constructor(github: HostedGitHubPort) {
    this.github = github;
  }

  async request(
    target: HostedTarget,
    coverage: HostedReviewCoverage,
  ): Promise<HostedRequestOutcome> {
    if (coverage === "incremental") return { kind: "terminal-failure",
      reason: "Hosted incremental review is unavailable. Run a local fix check on delegated-agent or request a complete hosted pass." };
    let actorIdentity: string;
    try {
      if (await this.github.readHead(target) !== target.headSha) {
        return { kind: "terminal-failure", reason: "stale-target" };
      }
      actorIdentity = await this.github.currentActorIdentity();
    } catch (error) {
      const outcome = normalizeHostedGitHubReadFailure(error);
      if (outcome !== null) return outcome;
      throw error;
    }
    const command = CODEX_HOSTED_REGISTRATION.commands.complete;
    const result = await this.github.createIssueComment(target, command);
    if (result.kind !== "created") return result;
    if (result.actorIdentity !== actorIdentity || result.body !== command) {
      return { kind: "ambiguous-delivery" };
    }
    return {
      kind: "created",
      artifact: result.artifact,
      effectiveCoverage: EFFECTIVE_COVERAGE,
    };
  }

  readHead(handle: HostedRequestHandle, options?: { signal?: AbortSignal }): Promise<string> {
    return this.github.readHead(handle.target, options);
  }

  observe(handle: HostedRequestHandle, options?: { signal?: AbortSignal }): Promise<HostedObservation> {
    return this.observeSince(handle.target, handle.artifact.createdAt, options);
  }

  observeHandle(target: HostedTarget): Promise<HostedObservation> {
    return this.observeSince(target, "1970-01-01T00:00:00.000Z");
  }

  private async observeSince(
    target: HostedTarget,
    requestedAt: string,
    options?: { signal?: AbortSignal },
  ): Promise<HostedObservation> {
    try {
      const [reviews, threads, comments] = await Promise.all([
        this.github.readReviews(target, options),
        this.github.readThreads(target, options),
        this.github.readIssueComments(target, options),
      ]);
      const providerComments = comments.filter((comment) =>
        comment.actorIdentity === BOT_USER_ID
        && comment.appId === APP_ID
        && comment.createdAt === comment.updatedAt
        && comment.createdAt >= requestedAt);
      if (providerComments.some(connectedAccountFailure)) {
        return { kind: "terminal-failure", reason: "connected-account-required" };
      }
      const clean = providerComments.find((comment) => cleanForHead(comment, target.headSha));

      const providerReviews = reviews.filter((review) =>
        review.actorIdentity === BOT_USER_ID
        && review.headSha === target.headSha
        && review.submittedAt >= requestedAt);
      const review = newestReview(providerReviews);
      const reviewIds = new Set(providerReviews.map(({ id }) => id));
      const candidateComments = review === undefined ? [] : threads.flatMap((thread) =>
        thread.comments
          .filter((comment) =>
            comment.actorIdentity === BOT_USER_ID
            && comment.headSha === target.headSha
            && reviewIds.has(comment.reviewId))
          .map((comment) => ({ threadId: thread.id, comment })));
      const findings = candidateComments.flatMap(({ threadId, comment }, index) => {
        const parsed = finding(threadId, comment, index + 1);
        return parsed === null ? [] : [parsed];
      });
      if (candidateComments.length !== findings.length) {
        return { kind: "terminal-failure", reason: "malformed-provider-finding" };
      }
      const bodyFindings: Extract<HostedObservation, { kind: "findings" }>["findings"] = [];
      for (const candidate of [...providerReviews].sort((left, right) =>
        left.submittedAt.localeCompare(right.submittedAt) || left.id.localeCompare(right.id))) {
        const parsed = parseCodexReviewBody(candidate, target);
        if (parsed.kind === "malformed") {
          return { kind: "terminal-failure", reason: "malformed-provider-finding" };
        }
        bodyFindings.push(...parsed.findings.map((item, index) => ({
          ...item, sourceOrdinal: findings.length + bodyFindings.length + index + 1,
        })));
      }
      const allFindings = [...findings, ...bodyFindings];
      if (allFindings.length > 0 && review !== undefined) {
        return { kind: "findings", reviewUrl: review.url, findings: allFindings };
      }
      if (clean !== undefined) return { kind: "clean", reviewUrl: clean.url };
      return { kind: "pending" };
    } catch (error) {
      // A retryable read failure is left to the waiting caller, which keeps polling; only a terminal one ends it.
      if (error instanceof HostedGitHubReadError && error.kind === "terminal-failure") {
        return { kind: "terminal-failure", reason: error.message };
      }
      throw error;
    }
  }
}
