/** Lean CodeRabbit hosted-review adapter. */

import {
  diagnostic,
  finding,
  parseCodeRabbitReviewBody,
  type UnorderedFinding,
} from "./coderabbit-body.js";
export { parseCodeRabbitReviewBody } from "./coderabbit-body.js";
export type { CodeRabbitReviewBodyParseResult } from "./coderabbit-body.js";

import type {
  HostedCoverageEvidence,
  HostedObservation,
  HostedReviewObserver,
} from "./await.js";
import { HostedFindingsSchema } from "./await.js";
import {
  HostedGitHubReadError,
  normalizeHostedGitHubReadFailure,
  type HostedGitHubPort,
  type HostedGitHubIssueComment,
  type HostedGitHubReview,
  type HostedGitHubThread,
  type HostedGitHubThreadComment,
} from "./github.js";
import type {
  HostedRequestHandle,
  HostedRequestOutcome,
  HostedReviewAdapter,
  HostedReviewCoverage,
  HostedTarget,
} from "./request.js";
import type { IncrementalReviewScope } from "../core/incremental-review-scope.js";

const COMMANDS = {
  complete: "@coderabbitai full review",
  incremental: "@coderabbitai review",
} as const satisfies Record<HostedReviewCoverage, string>;
const BOT_USER_ID = "136622811";
const APP_OWNER_ID = "132028505";
const APP_ID = "347564";
const COMPLETE_REPLY = /^[ \t]*Full review finished\.[ \t]*$/imu;
const INCREMENTAL_REPLY = /^[ \t]*Review finished\.[ \t]*$/imu;
const COMMAND_INVOCATION_MARKER = /<!--\s*CodeRabbit review command invocation:\s*[^>]+-->/giu;
const RESOLVED_THREAD_REPLY_FOOTER = new RegExp(
  String.raw`(?:^|\r?\n)✅ Review thread resolved\.\s*`
    + String.raw`_You are interacting with an AI system\._\s*`
    + String.raw`<!-- This is an auto-generated reply by CodeRabbit -->\s*$`,
  "u",
);

export const CODERABBIT_HOSTED_REGISTRATION = {
  id: "coderabbit-pr",
  commands: COMMANDS,
  correctionReview: "native-incremental",
  identities: { botUserId: BOT_USER_ID, appOwnerId: APP_OWNER_ID, appId: APP_ID },
} as const;

function recentReviewBody(comment: HostedGitHubIssueComment): string | null {
  const starts = [...comment.body.matchAll(/<!--\s*recent_review_start\s*-->/giu)];
  const ends = [...comment.body.matchAll(/<!--\s*recent_review_end\s*-->/giu)];
  if (starts.length !== 1 || ends.length !== 1) return null;
  const start = starts[0];
  const end = ends[0];
  if (start === undefined || end === undefined || end.index <= start.index) return null;
  return comment.body.slice(start.index + start[0].length, end.index);
}

function summaryReportsNoFindings(
  comment: HostedGitHubIssueComment,
  requestedAt: string,
): boolean {
  if (comment.updatedAt < requestedAt) return false;
  const recent = recentReviewBody(comment);
  return recent !== null
    && /\bno actionable comments were generated in the recent review\b/iu.test(recent);
}

function summaryCompletesHead(
  comment: HostedGitHubIssueComment,
  target: HostedTarget,
  requestedAt: string,
): boolean {
  if (!summaryReportsNoFindings(comment, requestedAt)) return false;
  const recent = recentReviewBody(comment);
  if (recent === null) return false;
  const ranges = [...recent.matchAll(/\bbetween\s+[a-f0-9]{7,40}\s+and\s+([a-f0-9]{7,40})\b/giu)];
  const reviewedHead = ranges[0]?.[1]?.toLowerCase();
  return ranges.length === 1 && reviewedHead !== undefined && target.headSha.startsWith(reviewedHead);
}

function nativeIncrementalCoverageEvidence(
  comments: readonly HostedGitHubIssueComment[],
  target: HostedTarget,
  scope: IncrementalReviewScope | null,
  requestArtifactId: string,
  requestedAt: string,
  requestBoundary: string | null,
  commandArtifactVisible: boolean,
): HostedCoverageEvidence {
  const unestablished = (
    reason: Extract<HostedCoverageEvidence, { status: "unestablished" }>["reason"],
  ): HostedCoverageEvidence => ({
    schemaVersion: 1,
    kind: "provider-native-incremental",
    sourceId: "coderabbit-pr",
    requestArtifactId,
    status: "unestablished",
    reason,
  });
  if (!commandArtifactVisible) return unestablished("provider-incremental-range-ambiguous");
  if (scope === null) return unestablished("provider-incremental-range-missing");
  const ranges = comments.flatMap((comment) => {
    if (comment.updatedAt < requestedAt || !precedesBoundary(comment.updatedAt, requestBoundary)) return [];
    const recent = recentReviewBody(comment);
    if (recent === null) return [];
    return [...recent.matchAll(
      /\bbetween\s+([a-f0-9]{7,40})\s+and\s+([a-f0-9]{7,40})\b/giu,
    )].map((match) => ({
      base: match[1]?.toLowerCase(),
      head: match[2]?.toLowerCase(),
      comment,
    }));
  });
  if (ranges.length === 0) return unestablished("provider-incremental-range-missing");
  const range = ranges[0];
  if (ranges.length !== 1 || range?.base === undefined || range.head === undefined) {
    return unestablished("provider-incremental-range-ambiguous");
  }
  if (!scope.predecessorHeadSha.startsWith(range.base) || !target.headSha.startsWith(range.head)) {
    return unestablished("provider-incremental-range-mismatch");
  }
  return {
    schemaVersion: 1,
    kind: "provider-native-incremental",
    sourceId: "coderabbit-pr",
    requestArtifactId,
    status: "established",
    baselineSha: range.base,
    headSha: range.head,
    providerGeneration: {
      artifactId: range.comment.id,
      url: range.comment.url,
      createdAt: range.comment.createdAt,
      updatedAt: range.comment.updatedAt,
      actorIdentity: BOT_USER_ID,
      appId: APP_ID,
    },
  };
}

function commandReplyCompleted(
  comment: HostedGitHubIssueComment,
  requestedAt: string,
  coverage: HostedReviewCoverage | null,
): boolean {
  const completionMatches = coverage === "complete"
    ? COMPLETE_REPLY.test(comment.body)
    : coverage === "incremental"
      ? INCREMENTAL_REPLY.test(comment.body)
      : COMPLETE_REPLY.test(comment.body) || INCREMENTAL_REPLY.test(comment.body);
  return comment.createdAt >= requestedAt
    && commandInvocationMarkerCount(comment.body) > 0
    && /<summary>\s*✅\s*Action performed\s*<\/summary>/iu.test(comment.body)
    && completionMatches;
}

function commandInvocationMarkerCount(body: string): number {
  return [...body.matchAll(COMMAND_INVOCATION_MARKER)].length;
}

function hasSingleCommandInvocationMarker(body: string): boolean {
  return commandInvocationMarkerCount(body) === 1;
}

function refusalReason(body: string): string | null {
  const refusalSummaries = [...body.matchAll(
    /<summary>\s*⚠️\s*Action not completed\s*<\/summary>/giu,
  )];
  const reasons = [...body.matchAll(/^[ \t]*(Review skipped:[^\r\n]+?)[ \t]*$/gimu)];
  return hasSingleCommandInvocationMarker(body) && refusalSummaries.length === 1 && reasons.length === 1
    ? reasons[0]?.[1]?.trim() ?? null
    : null;
}

function isRequestCommand(comment: HostedGitHubIssueComment): boolean {
  return requestCommandCoverage(comment) !== null;
}

function requestCommandCoverage(comment: HostedGitHubIssueComment): HostedReviewCoverage | null {
  const body = comment.body.trim();
  if (body === COMMANDS.complete) return "complete";
  if (body === COMMANDS.incremental) return "incremental";
  return null;
}

function authenticatedReplySettlesRequest(
  comment: HostedGitHubIssueComment,
  request: HostedGitHubIssueComment,
): boolean {
  const coverage = requestCommandCoverage(request);
  return coverage !== null
    && comment.actorIdentity === BOT_USER_ID
    && comment.appId === APP_ID
    && (commandReplyCompleted(comment, request.createdAt, coverage)
      || (comment.createdAt >= request.createdAt && refusalReason(comment.body) !== null));
}

function earlierRequestGenerationsSettled(
  comments: readonly HostedGitHubIssueComment[],
  requestId: string,
): boolean {
  const requests = comments
    .filter(isRequestCommand)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
  const requestIndex = requests.findIndex((comment) => comment.id === requestId);
  if (requestIndex < 0) return false;
  for (let index = 0; index < requestIndex; index += 1) {
    const earlierRequest = requests[index];
    const nextRequest = requests[index + 1];
    if (earlierRequest === undefined || nextRequest === undefined
      || earlierRequest.createdAt === nextRequest.createdAt) {
      return false;
    }
    const settled = comments.some((comment) =>
      authenticatedReplySettlesRequest(comment, earlierRequest)
      && comment.createdAt < nextRequest.createdAt);
    if (!settled) return false;
  }
  return true;
}

function correlatedRefusalReason(
  comments: readonly HostedGitHubIssueComment[],
  request: HostedRequestHandle["artifact"],
  coverage: HostedReviewCoverage,
): string | null {
  if (request.kind !== "issue-comment") return null;
  const requestMatches = comments.filter((comment) => comment.id === request.id);
  const requestComment = requestMatches[0];
  if (requestMatches.length !== 1
    || requestComment === undefined
    || requestComment.url !== request.url
    || requestComment.createdAt !== request.createdAt
    || requestComment.body.trim() !== COMMANDS[coverage]) {
    return null;
  }

  const competingRequest = comments.some((comment) =>
    comment.id !== request.id
    && isRequestCommand(comment)
    && comment.createdAt === request.createdAt);
  if (competingRequest || !earlierRequestGenerationsSettled(comments, request.id)) return null;
  const nextRequest = comments
    .filter((comment) =>
      comment.id !== request.id
      && isRequestCommand(comment)
      && comment.createdAt > request.createdAt)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))[0];
  const providerReplies = comments
    .filter((comment) =>
      comment.actorIdentity === BOT_USER_ID
      && comment.appId === APP_ID
      && comment.createdAt >= request.createdAt
      && (nextRequest === undefined || comment.createdAt < nextRequest.createdAt))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
  for (const reply of providerReplies) {
    const reason = refusalReason(reply.body);
    if (reason !== null) return reason;
  }
  return null;
}

function orderedTerminalReviews(reviews: HostedGitHubReview[]): HostedGitHubReview[] {
  return [...reviews].sort((left, right) => {
    const submitted = left.submittedAt.localeCompare(right.submittedAt);
    return submitted === 0 ? left.id.localeCompare(right.id) : submitted;
  });
}

type RequestGenerationBoundary =
  | { readonly status: "bound"; readonly timestamp: string | null; readonly commandArtifactVisible: boolean }
  | { readonly status: "missing-artifact" }
  | { readonly status: "overlap" };

function nextRequestBoundary(
  comments: HostedGitHubIssueComment[],
  request: HostedRequestHandle["artifact"],
  coverage: HostedReviewCoverage,
): RequestGenerationBoundary {
  const commandComments = comments.filter((comment) => {
    const body = comment.body.trim();
    return body === COMMANDS.complete || body === COMMANDS.incremental;
  });
  const exactArtifact = comments.filter(({ id }) => id === request.id);
  if (exactArtifact.length > 1) return { status: "overlap" };
  if (exactArtifact[0] !== undefined
    && (exactArtifact[0].createdAt !== request.createdAt
      || exactArtifact[0].url !== request.url
      || exactArtifact[0].body.trim() !== COMMANDS[coverage])) return { status: "overlap" };
  if (commandComments.length === 0) {
    return { status: "missing-artifact" };
  }
  if (exactArtifact[0] === undefined) {
    return { status: "missing-artifact" };
  }
  if (commandComments.some((comment) => (
    comment.id !== request.id && comment.createdAt === request.createdAt
  ))) return { status: "overlap" };
  if (!earlierRequestGenerationsSettled(comments, request.id)) {
    return { status: "overlap" };
  }
  const next = commandComments
    .filter((comment) => comment.id !== request.id && comment.createdAt > request.createdAt)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt)
      || left.id.localeCompare(right.id))[0];
  return { status: "bound", timestamp: next?.createdAt ?? null, commandArtifactVisible: true };
}

function precedesBoundary(timestamp: string, boundary: string | null): boolean {
  return boundary === null || timestamp < boundary;
}

function findingSequenceKey(item: UnorderedFinding): string {
  return item.origin === "review-body"
    ? `review-body:${item.fingerprint}`
    : `review-thread:${item.threadId}`;
}

function findingSequenceContent(item: UnorderedFinding): string {
  return JSON.stringify({
    origin: item.origin,
    settlement: item.settlement,
    severity: item.severity,
    nit: item.nit ?? false,
    locus: item.locus,
    sourceLabel: item.sourceLabel ?? null,
    sourceLabelTruncated: item.sourceLabelTruncated ?? false,
    ...(item.origin === "review-body"
      ? { fingerprint: item.fingerprint, body: item.body }
      : { threadId: item.threadId }),
  });
}

function deduplicateTerminalFindings(findings: UnorderedFinding[]):
  | { kind: "deduplicated"; findings: UnorderedFinding[] }
  | { kind: "malformed"; reason: string } {
  const retained = new Map<string, { finding: UnorderedFinding; content: string }>();
  for (const item of findings) {
    const key = findingSequenceKey(item);
    const content = findingSequenceContent(item);
    const existing = retained.get(key);
    if (existing === undefined) {
      retained.set(key, { finding: item, content });
    } else if (existing.content !== content) {
      return {
        kind: "malformed",
        reason: diagnostic("provider-finding-identity-conflict", { identity: key }),
      };
    }
  }
  return { kind: "deduplicated", findings: [...retained.values()].map(({ finding }) => finding) };
}

function isPriorThreadResolutionReply(comment: HostedGitHubThreadComment, reviewId: string): boolean {
  return comment.actorIdentity === BOT_USER_ID
    && comment.replyToReviewId !== null
    && comment.replyToReviewId !== reviewId
    && RESOLVED_THREAD_REPLY_FOOTER.test(comment.body);
}

function isConfirmationOnlyReview(review: HostedGitHubReview, threads: readonly HostedGitHubThread[]): boolean {
  if (review.state !== "commented" || review.body.trim() !== "") return false;
  const comments = threads.flatMap((thread) => thread.comments.filter((comment) => comment.reviewId === review.id));
  return comments.length > 0 && comments.every((comment) => isPriorThreadResolutionReply(comment, review.id));
}

/** CodeRabbit request and exact-head observation through the lean GitHub port. */
export class CodeRabbitHostedAdapter implements HostedReviewAdapter, HostedReviewObserver {
  readonly id = CODERABBIT_HOSTED_REGISTRATION.id;
  readonly identities = CODERABBIT_HOSTED_REGISTRATION.identities;
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
    const command = COMMANDS[coverage];
    const result = await this.github.createIssueComment(target, command);
    if (result.kind !== "created") return result;
    if (result.actorIdentity !== actorIdentity || result.body !== command) {
      return { kind: "ambiguous-delivery" };
    }
    return { kind: "created", artifact: result.artifact, effectiveCoverage: coverage };
  }

  readHead(handle: HostedRequestHandle, options?: { signal?: AbortSignal }): Promise<string> {
    return this.github.readHead(handle.target, options);
  }

  async observe(
    handle: HostedRequestHandle,
    options?: { signal?: AbortSignal },
  ): Promise<HostedObservation> {
    return this.observeSince(
      handle.target,
      handle.artifact,
      handle.effectiveCoverage,
      handle.requestedCoverage === "incremental"
        ? handle.admission.correctionScope ?? null
        : null,
      options,
    );
  }

  observeHandle(target: HostedTarget): Promise<HostedObservation> {
    return this.observeSince(target, null, null, null);
  }

  private async observeSince(
    target: HostedTarget,
    requestArtifact: HostedRequestHandle["artifact"] | null,
    coverage: HostedReviewCoverage | null,
    correctionScope: IncrementalReviewScope | null,
    options?: { signal?: AbortSignal },
  ): Promise<HostedObservation> {
    try {
      const requestedAt = requestArtifact?.createdAt ?? "1970-01-01T00:00:00.000Z";
      const [checks, statuses, reviews, threads, comments] = await Promise.all([
        this.github.readCheckRuns(target, options),
        this.github.readCommitStatuses(target, options),
        this.github.readReviews(target, options),
        this.github.readThreads(target, options),
        this.github.readIssueComments(target, options),
      ]);
      const refusal = requestArtifact === null || coverage === null
        ? null
        : correlatedRefusalReason(comments, requestArtifact, coverage);
      if (refusal !== null) {
        return { kind: "terminal-failure", reason: `provider-request-refused: ${refusal}` };
      }
      const providerChecks = checks.filter((check) =>
        check.name === "CodeRabbit" && check.appOwnerIdentity === APP_OWNER_ID);
      if (providerChecks.some((check) => /\b(?:quota|rate[ -]?limit)\b/iu.test(check.summary))) {
        return { kind: "rate-limited" };
      }
      const failedCheck = providerChecks.find((check) =>
        check.status === "completed" && check.conclusion !== null && check.conclusion !== "success");
      if (failedCheck !== undefined) {
        return { kind: "terminal-failure", reason: `provider-check-${failedCheck.conclusion}` };
      }

      const generationBoundary = coverage === null || requestArtifact === null
        ? { status: "bound" as const, timestamp: null, commandArtifactVisible: false }
        : nextRequestBoundary(comments, requestArtifact, coverage);
      if (generationBoundary.status === "overlap") {
        return { kind: "terminal-failure", reason: "provider-request-generation-overlap" };
      }
      if (generationBoundary.status === "missing-artifact") {
        return { kind: "pending" };
      }
      const requestBoundary = generationBoundary.timestamp;
      const providerReviews = reviews.filter((review) =>
        review.actorIdentity === BOT_USER_ID
        && review.headSha === target.headSha
        && review.submittedAt >= requestedAt
        && precedesBoundary(review.submittedAt, requestBoundary));
      const completeSequence = orderedTerminalReviews(providerReviews.filter((candidate) =>
        !isConfirmationOnlyReview(candidate, threads)));
      const orderedReviews = coverage === null ? completeSequence.slice(-1) : completeSequence;
      const review = orderedReviews.at(-1);
      const providerComments = comments.filter((comment) =>
        comment.actorIdentity === BOT_USER_ID
        && comment.appId === APP_ID
        && precedesBoundary(comment.createdAt, requestBoundary));
      const coverageEvidence = coverage === "incremental" && requestArtifact !== null
        ? nativeIncrementalCoverageEvidence(
            providerComments,
            target,
            correctionScope,
            requestArtifact.id,
            requestedAt,
            requestBoundary,
            generationBoundary.commandArtifactVisible,
          )
        : null;
      if (review === undefined) {
        const completedStatus = statuses.find((status) =>
          status.context === "CodeRabbit"
          && status.state === "success"
          && status.createdAt >= requestedAt
          && precedesBoundary(status.createdAt, requestBoundary)
          && /\breview completed\b/iu.test(status.description));
        const completedReply = providerComments.find((comment) =>
          commandReplyCompleted(comment, requestedAt, coverage));
        const completedSummary = providerComments.find((comment) =>
          precedesBoundary(comment.updatedAt, requestBoundary)
          && (coverage === "incremental"
            ? summaryReportsNoFindings(comment, requestedAt)
            : summaryCompletesHead(comment, target, requestedAt)));
        if (completedStatus !== undefined && completedReply !== undefined && completedSummary !== undefined) {
          return {
            kind: "clean",
            reviewUrl: completedSummary.url,
            ...(coverageEvidence === null ? {} : { coverageEvidence }),
          };
        }
        if (requestBoundary !== null) {
          const laterProviderReply = comments.some((comment) =>
            comment.actorIdentity === BOT_USER_ID
            && comment.appId === APP_ID
            && comment.createdAt >= requestBoundary);
          return laterProviderReply
            ? { kind: "pending" }
            : { kind: "terminal-failure", reason: "provider-request-generation-overlap" };
        }
        return { kind: "pending" };
      }
      if (coverage !== null && review.state === "commented") {
        const completedReply = providerComments.some((comment) =>
          commandReplyCompleted(comment, requestedAt, coverage)
          && comment.updatedAt >= review.submittedAt
          && precedesBoundary(comment.updatedAt, requestBoundary));
        if (!completedReply) return { kind: "pending" };
      }
      const terminalFindings: UnorderedFinding[] = [];
      for (const terminalReview of orderedReviews) {
        const parsedBody = parseCodeRabbitReviewBody(terminalReview);
        if (parsedBody.kind === "malformed") {
          return { kind: "terminal-failure", reason: parsedBody.reason };
        }
        const candidateComments = threads.flatMap((thread) =>
          thread.comments
            .filter((comment) =>
              comment.actorIdentity === BOT_USER_ID
              && comment.headSha === target.headSha
              && comment.reviewId === terminalReview.id
              && !isPriorThreadResolutionReply(comment, terminalReview.id))
            .map((comment) => ({ threadId: thread.id, comment })));
        const parsedComments = candidateComments.map(({ threadId, comment }) => ({
          threadId,
          comment,
          parsed: finding(threadId, comment),
        }));
        const rejectedComment = parsedComments.find((candidate) => candidate.parsed === null);
        if (rejectedComment !== undefined) {
          const { threadId, comment } = rejectedComment;
          const context = {
            threadId,
            commentId: comment.id,
            path: comment.path,
            ...(comment.line === null ? {} : { line: comment.line }),
          };
          return {
            kind: "terminal-failure",
            reason: comment.line === null
              ? diagnostic("provider-thread-finding-locus-unavailable", context)
              : diagnostic("provider-thread-finding-severity-unrecognized", context),
          };
        }
        const findings = parsedComments.map((candidate) => candidate.parsed)
          .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null);
        if (parsedBody.actionableCount !== null && findings.length !== parsedBody.actionableCount) {
          return {
            kind: "terminal-failure",
            reason: diagnostic("provider-actionable-finding-count-mismatch", {
              advertised: parsedBody.actionableCount,
              inline: findings.length,
              outsideDiff: parsedBody.supplementalCounts["outside-diff"],
              nitpick: parsedBody.supplementalCounts.nitpick,
            }),
          };
        }
        terminalFindings.push(...findings, ...parsedBody.findings);
      }
      const deduplicated = deduplicateTerminalFindings(terminalFindings);
      if (deduplicated.kind === "malformed") {
        return { kind: "terminal-failure", reason: deduplicated.reason };
      }
      const allFindings = HostedFindingsSchema.parse(
        deduplicated.findings.map((finding, index) => ({
          ...finding,
          sourceOrdinal: index + 1,
        })),
      );
      if (allFindings.length > 0) {
        return {
          kind: "findings",
          reviewUrl: review.url,
          findings: allFindings,
          ...(coverageEvidence === null ? {} : { coverageEvidence }),
        };
      }
      if (review.state === "approved") {
        return {
          kind: "clean",
          reviewUrl: review.url,
          ...(coverageEvidence === null ? {} : { coverageEvidence }),
        };
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
