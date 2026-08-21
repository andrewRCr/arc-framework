/** Lean CodeRabbit hosted-review adapter. */

import type {
  HostedFinding,
  HostedObservation,
  HostedReviewObserver,
} from "./await.js";
import {
  HostedGitHubReadError,
  normalizeHostedGitHubReadFailure,
  type HostedGitHubPort,
  type HostedGitHubIssueComment,
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

const COMMANDS = {
  complete: "@coderabbitai full review",
  incremental: "@coderabbitai review",
} as const satisfies Record<HostedReviewCoverage, string>;
const BOT_USER_ID = "136622811";
const APP_OWNER_ID = "132028505";
const APP_ID = "347564";
const COMPLETE_REPLY = /^[ \t]*Full review finished\.[ \t]*$/imu;
const INCREMENTAL_REPLY = /^[ \t]*Review finished\.[ \t]*$/imu;

export const CODERABBIT_HOSTED_REGISTRATION = {
  id: "coderabbit-pr",
  commands: COMMANDS,
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

function summaryCompletesHead(
  comment: HostedGitHubIssueComment,
  target: HostedTarget,
  requestedAt: string,
): boolean {
  if (comment.updatedAt < requestedAt) return false;
  const recent = recentReviewBody(comment);
  if (recent === null || !/\bno actionable comments were generated in the recent review\b/iu.test(recent)) {
    return false;
  }
  const ranges = [...recent.matchAll(/\bbetween\s+[a-f0-9]{7,40}\s+and\s+([a-f0-9]{7,40})\b/giu)];
  const reviewedHead = ranges[0]?.[1]?.toLowerCase();
  return ranges.length === 1 && reviewedHead !== undefined && target.headSha.startsWith(reviewedHead);
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
    && /<!--\s*CodeRabbit review command invocation:\s*[^>]+-->/iu.test(comment.body)
    && /<summary>\s*✅\s*Action performed\s*<\/summary>/iu.test(comment.body)
    && completionMatches;
}

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
    origin: "review-thread",
    commentId: comment.id,
    threadId,
    settlement: "reply-and-resolve",
    severity: parsedSeverity,
    locus: `${comment.path}:${comment.line}`,
    url: comment.url,
  };
}

type ReviewBodyFinding = Extract<HostedFinding, { origin: "review-body" }>;
type SupplementalCategory = "nitpick" | "outside-diff";

export type CodeRabbitReviewBodyParseResult =
  | {
    kind: "parsed";
    actionableCount: number | null;
    findings: ReviewBodyFinding[];
  }
  | { kind: "malformed"; reason: string };
type SupplementalParseResult =
  | { kind: "parsed"; findings: ReviewBodyFinding[] }
  | Extract<CodeRabbitReviewBodyParseResult, { kind: "malformed" }>;

interface SupplementalSection {
  category: SupplementalCategory;
  count: number;
  headerStart: number;
  start: number;
}

interface SummaryMatch {
  text: string;
  start: number;
  end: number;
}

function nonNegativeInteger(value: string): number | null {
  const normalized = value.trim();
  if (!/^\d+$/u.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function summaryMatches(body: string): SummaryMatch[] {
  return [...body.matchAll(/<summary>([^<\r\n]+)<\/summary><blockquote>/giu)].map((match) => ({
    text: (match[1] as string).trim(),
    start: match.index,
    end: match.index + match[0].length,
  }));
}

function supplementalSection(match: SummaryMatch): SupplementalSection | null {
  const countMatch = /\((\d+)\)\s*$/u.exec(match.text);
  if (countMatch?.[1] === undefined) return null;
  const count = nonNegativeInteger(countMatch[1]);
  if (count === null) return null;
  const label = match.text.slice(0, countMatch.index).toLowerCase();
  if (label.includes("nitpick") && label.includes("comment")) {
    return { category: "nitpick", count, headerStart: match.start, start: match.end };
  }
  if (label.includes("outside") && label.includes("diff") && label.includes("comment")) {
    return { category: "outside-diff", count, headerStart: match.start, start: match.end };
  }
  return null;
}

function malformed(reason: string): CodeRabbitReviewBodyParseResult {
  return { kind: "malformed", reason };
}

function parseSupplementalSection(
  review: HostedGitHubReview,
  body: string,
  section: SupplementalSection,
): SupplementalParseResult {
  const groups = summaryMatches(body).flatMap((match) => {
    const countMatch = /\((\d+)\)\s*$/u.exec(match.text);
    if (countMatch?.[1] === undefined) return [];
    const count = nonNegativeInteger(countMatch[1]);
    if (count === null) return [];
    return [{ path: match.text.slice(0, countMatch.index).trim(), count, start: match.end }];
  });
  if (groups.reduce((total, group) => total + group.count, 0) !== section.count) {
    return malformed(`provider-${section.category}-group-count-mismatch`);
  }

  const findings: ReviewBodyFinding[] = [];
  for (const [groupIndex, group] of groups.entries()) {
    const groupEnd = groups[groupIndex + 1]?.start ?? body.length;
    const groupBody = body.slice(group.start, groupEnd);
    const markers = [...groupBody.matchAll(/<!--\s*cr-comment:v1:([a-f0-9]+)\s*-->/giu)];
    if (markers.length !== group.count) {
      return malformed(`provider-${section.category}-finding-count-mismatch`);
    }

    let itemStart = 0;
    for (const marker of markers) {
      const fingerprint = marker[1] as string;
      const item = groupBody.slice(itemStart, marker.index);
      const loci = [...item.matchAll(/^`([^`\r\n]+)`:\s*_/gmu)];
      const locusMatch = loci.at(-1);
      const parsedSeverity = severity(item);
      if (locusMatch?.[1] === undefined || parsedSeverity === null || group.path.length === 0) {
        return malformed("malformed-provider-body-finding");
      }
      const findingBody = item.slice(locusMatch.index).trim();
      if (findingBody.length === 0) return malformed("malformed-provider-body-finding");
      findings.push({
        findingId: `${review.id}:${fingerprint}`,
        origin: "review-body",
        reviewId: review.id,
        fingerprint,
        settlement: "not-applicable",
        severity: parsedSeverity,
        locus: `${group.path}:${locusMatch[1]}`,
        url: review.url,
        body: findingBody,
      });
      itemStart = marker.index + marker[0].length;
    }
  }
  return { kind: "parsed", findings };
}

/** Parse CodeRabbit's optional review-thread count claim and non-thread findings. */
export function parseCodeRabbitReviewBody(
  review: HostedGitHubReview,
): CodeRabbitReviewBodyParseResult {
  const actionableMatches = [...review.body.matchAll(
    /^\*\*Actionable comments posted:\s*([^*\r\n]*?)\s*\*\*\s*$/gimu,
  )];
  const actionableText = actionableMatches[0]?.[1];
  if (actionableMatches.length > 1) {
    return malformed("malformed-provider-actionable-count");
  }
  const actionableCount = actionableText === undefined
    ? null
    : nonNegativeInteger(actionableText);
  if (actionableText !== undefined && actionableCount === null) {
    return malformed("malformed-provider-actionable-count");
  }

  const promptStart = review.body.search(/<summary>[^<\r\n]*Prompt for all review comments/iu);
  const detailBody = review.body.slice(0, promptStart === -1 ? review.body.length : promptStart);
  const sections = summaryMatches(detailBody)
    .map(supplementalSection)
    .filter((section): section is SupplementalSection => section !== null);
  const findings: ReviewBodyFinding[] = [];
  for (const [sectionIndex, section] of sections.entries()) {
    const sectionEnd = sections[sectionIndex + 1]?.headerStart ?? detailBody.length;
    const parsed = parseSupplementalSection(
      review,
      detailBody.slice(section.start, sectionEnd),
      section,
    );
    if (parsed.kind === "malformed") return parsed;
    if (parsed.findings.length !== section.count) {
      return malformed(`provider-${section.category}-finding-count-mismatch`);
    }
    findings.push(...parsed.findings);
  }

  const advertisedSupplementalCount = sections.reduce((total, section) => total + section.count, 0);
  const markerCount = [...detailBody.matchAll(/<!--\s*cr-comment:v1:[a-f0-9]+\s*-->/giu)].length;
  if (findings.length !== advertisedSupplementalCount || markerCount !== findings.length) {
    return malformed("provider-supplemental-finding-count-mismatch");
  }
  if (new Set(findings.map((item) => item.fingerprint)).size !== findings.length) {
    return malformed("duplicate-provider-body-finding");
  }
  return { kind: "parsed", actionableCount, findings };
}

function newestTerminalReview(reviews: HostedGitHubReview[]): HostedGitHubReview | undefined {
  return [...reviews].sort((left, right) => right.submittedAt.localeCompare(left.submittedAt))[0];
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
      handle.artifact.createdAt,
      handle.effectiveCoverage,
      options,
    );
  }

  observeHandle(target: HostedTarget): Promise<HostedObservation> {
    return this.observeSince(target, "1970-01-01T00:00:00.000Z", null);
  }

  private async observeSince(
    target: HostedTarget,
    requestedAt: string,
    coverage: HostedReviewCoverage | null,
    options?: { signal?: AbortSignal },
  ): Promise<HostedObservation> {
    try {
      const [checks, statuses, reviews, threads, comments] = await Promise.all([
        this.github.readCheckRuns(target, options),
        this.github.readCommitStatuses(target, options),
        this.github.readReviews(target, options),
        this.github.readThreads(target, options),
        this.github.readIssueComments(target, options),
      ]);
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

      const providerReviews = reviews.filter((review) =>
        review.actorIdentity === BOT_USER_ID
        && review.headSha === target.headSha
        && review.submittedAt >= requestedAt);
      const review = newestTerminalReview(providerReviews);
      if (review === undefined) {
        const providerComments = comments.filter((comment) =>
          comment.actorIdentity === BOT_USER_ID && comment.appId === APP_ID);
        const completedStatus = statuses.find((status) =>
          status.context === "CodeRabbit"
          && status.state === "success"
          && status.createdAt >= requestedAt
          && /\breview completed\b/iu.test(status.description));
        const completedReply = providerComments.find((comment) =>
          commandReplyCompleted(comment, requestedAt, coverage));
        const completedSummary = providerComments.find((comment) =>
          summaryCompletesHead(comment, target, requestedAt));
        return completedStatus !== undefined && completedReply !== undefined && completedSummary !== undefined
          ? { kind: "clean", reviewUrl: completedSummary.url }
          : { kind: "pending" };
      }
      const parsedBody = parseCodeRabbitReviewBody(review);
      if (parsedBody.kind === "malformed") {
        return { kind: "terminal-failure", reason: parsedBody.reason };
      }
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
      if (parsedBody.actionableCount !== null && findings.length !== parsedBody.actionableCount) {
        return { kind: "terminal-failure", reason: "provider-actionable-finding-count-mismatch" };
      }
      const allFindings = [...findings, ...parsedBody.findings];
      if (allFindings.length > 0) {
        return { kind: "findings", reviewUrl: review.url, findings: allFindings };
      }
      if (review.state === "approved") {
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
