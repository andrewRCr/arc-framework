/** Lean CodeRabbit hosted-review adapter. */

import type { HostedObservation, HostedReviewObserver } from "./await.js";
import {
  HostedGitHubReadError,
  type HostedGitHubPort,
  type HostedGitHubReview,
  type HostedGitHubThreadComment,
} from "./github.js";
import type {
  HostedRequestHandle,
  HostedRequestOutcome,
  HostedReviewAdapter,
  HostedTarget,
} from "./request.js";

const COMMAND = "@coderabbitai full review";
const BOT_USER_ID = "136622811";

export const CODERABBIT_HOSTED_REGISTRATION = {
  id: "coderabbit-pr",
  requestCommand: COMMAND,
  identities: { botUserId: BOT_USER_ID },
} as const;

function severity(body: string): "blocker" | "major" | "minor" | null {
  const match = /_([🔴🟠🟡🔵]?)\s*(Critical|Major|Minor|Trivial)_/iu.exec(body);
  switch (match?.[2]?.toLowerCase()) {
    case "critical":
      return "blocker";
    case "major":
      return "major";
    case "minor":
    case "trivial":
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
    commentId: comment.id,
    threadId,
    severity: parsedSeverity,
    locus: `${comment.path}:${comment.line}`,
    url: comment.url,
  };
}

function newestTerminalReview(reviews: HostedGitHubReview[]): HostedGitHubReview | undefined {
  return [...reviews].sort((left, right) => right.submittedAt.localeCompare(left.submittedAt))[0];
}

/** CodeRabbit request and exact-head observation through the lean GitHub port. */
export class CodeRabbitHostedAdapter implements HostedReviewAdapter, HostedReviewObserver {
  readonly id = CODERABBIT_HOSTED_REGISTRATION.id;
  readonly requestCommand = COMMAND;
  readonly identities = CODERABBIT_HOSTED_REGISTRATION.identities;
  private readonly github: HostedGitHubPort;

  constructor(github: HostedGitHubPort) {
    this.github = github;
  }

  async request(target: HostedTarget): Promise<HostedRequestOutcome> {
    if (await this.github.readHead(target) !== target.headSha) {
      return { kind: "terminal-failure", reason: "stale-target" };
    }
    const actorIdentity = await this.github.currentActorIdentity();
    const result = await this.github.createIssueComment(target, COMMAND);
    if (result.kind !== "created") return result;
    if (result.actorIdentity !== actorIdentity || result.body !== COMMAND) {
      return { kind: "ambiguous-delivery" };
    }
    return { kind: "created", artifact: result.artifact };
  }

  readHead(handle: HostedRequestHandle, options?: { signal?: AbortSignal }): Promise<string> {
    return this.github.readHead(handle.target, options);
  }

  async observe(
    handle: HostedRequestHandle,
    options?: { signal?: AbortSignal },
  ): Promise<HostedObservation> {
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
      const [checks, reviews, threads] = await Promise.all([
        this.github.readCheckRuns(target, options),
        this.github.readReviews(target, options),
        this.github.readThreads(target, options),
      ]);
      const providerChecks = checks.filter((check) =>
        check.name === "CodeRabbit" && check.appOwnerIdentity === BOT_USER_ID);
      if (providerChecks.some((check) => /\b(?:quota|rate[ -]?limit)\b/iu.test(check.summary))) {
        return { kind: "rate-limited" };
      }
      const failedCheck = providerChecks.find((check) =>
        check.status === "completed" && check.conclusion !== null && check.conclusion !== "success");
      if (failedCheck !== undefined) {
        return { kind: "terminal-failure", reason: `provider-check-${failedCheck.conclusion}` };
      }

      const providerReviews = reviews.filter((review) =>
        review.actorIdentity === BOT_USER_ID
        && review.headSha === target.headSha
        && review.submittedAt >= requestedAt);
      const review = newestTerminalReview(providerReviews);
      if (review === undefined) return { kind: "pending" };
      const candidateComments = threads.flatMap((thread) =>
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
      if (findings.length > 0) return { kind: "findings", reviewUrl: review.url, findings };
      if (review.state === "approved" && /^\*\*Actionable comments posted: 0\*\*$/mu.test(review.body)) {
        return { kind: "clean", reviewUrl: review.url };
      }
      return review.state === "changes-requested"
        ? { kind: "terminal-failure", reason: "changes-requested-without-findings" }
        : { kind: "pending" };
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
