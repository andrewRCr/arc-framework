/** Lean Codex hosted-review adapter. */

import type { HostedObservation, HostedReviewObserver } from "./await.js";
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
    incremental: COMMAND,
  },
  identities: { appId: APP_ID, botUserId: BOT_USER_ID },
} as const;

function severity(body: string): "blocker" | "major" | "minor" | null {
  switch (/\bP([0-3])\b/u.exec(body)?.[1]) {
    case "0":
      return "blocker";
    case "1":
      return "major";
    case "2":
    case "3":
      return "minor";
    default:
      return null;
  }
}

function finding(
  threadId: string,
  comment: HostedGitHubThreadComment,
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
    const command = CODEX_HOSTED_REGISTRATION.commands[coverage];
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
      const candidateComments = review === undefined ? [] : threads.flatMap((thread) =>
        thread.comments
          .filter((comment) =>
            comment.actorIdentity === BOT_USER_ID
            && comment.headSha === target.headSha
            && comment.reviewId === review.id)
          .map((comment) => ({ threadId: thread.id, comment })));
      const findings = candidateComments.flatMap(({ threadId, comment }) => {
        const parsed = finding(threadId, comment);
        return parsed === null ? [] : [parsed];
      });
      if (candidateComments.length !== findings.length) {
        return { kind: "terminal-failure", reason: "malformed-provider-finding" };
      }
      if (findings.length > 0 && review !== undefined) {
        return { kind: "findings", reviewUrl: review.url, findings };
      }
      if (clean !== undefined) return { kind: "clean", reviewUrl: clean.url };
      return { kind: "pending" };
    } catch (error) {
      if (error instanceof HostedGitHubReadError) {
        return error.kind === "terminal-failure"
          ? { kind: "terminal-failure", reason: error.message }
          : { kind: error.kind };
      }
      throw error;
    }
  }
}
