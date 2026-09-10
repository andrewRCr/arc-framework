/** Lean CodeRabbit hosted-review adapter. */

import {
  captureReviewFindingSourceLabel,
  hasExplicitPurePolishMarker,
} from "../core/finding-records.js";
import type {
  HostedFinding,
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

function severity(body: string): "critical" | "major" | "minor" | null {
  const match = /_([🔴🟠🟡🔵]?)\s*(Critical|Major|Minor|Trivial)_/iu.exec(body);
  switch (match?.[2]?.toLowerCase()) {
    case "critical":
      return "critical";
    case "major":
      return "major";
    case "minor":
    case "trivial":
      return "minor";
    default:
      return null;
  }
}

type UnorderedThreadFinding = Omit<Extract<HostedFinding, { origin: "review-thread" }>, "sourceOrdinal">;

function finding(
  threadId: string,
  comment: HostedGitHubThreadComment,
): UnorderedThreadFinding | null {
  const parsedSeverity = severity(comment.body);
  if (parsedSeverity === null || comment.line === null) return null;
  return {
    findingId: threadId,
    origin: "review-thread",
    commentId: comment.id,
    threadId,
    settlement: "reply-and-resolve",
    severity: parsedSeverity,
    ...(parsedSeverity === "minor" && hasExplicitPurePolishMarker(comment.body)
      ? { nit: true as const }
      : {}),
    locus: `${comment.path}:${comment.line}`,
    url: comment.url,
    ...captureReviewFindingSourceLabel({ body: comment.body }),
  };
}

type ReviewBodyFinding = Omit<Extract<HostedFinding, { origin: "review-body" }>, "sourceOrdinal">;
type UnorderedFinding = UnorderedThreadFinding | ReviewBodyFinding;
type SupplementalCategory = "nitpick" | "outside-diff";

export type CodeRabbitReviewBodyParseResult =
  | {
    kind: "parsed";
    actionableCount: number | null;
    supplementalCounts: Readonly<Record<SupplementalCategory, number>>;
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
  return [...body.matchAll(/^[\t ]*(?:>[\t ]*)*<summary>([^<\r\n]+)<\/summary>/gimu)].map((match) => ({
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

function diagnostic(
  reason: string,
  context: Readonly<Record<string, string | number>>,
): string {
  return `${reason}: ${JSON.stringify(context)}`;
}

function malformedWithContext(
  reason: string,
  context: Readonly<Record<string, string | number>>,
): CodeRabbitReviewBodyParseResult {
  return malformed(diagnostic(reason, context));
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
  const groupTotal = groups.reduce((total, group) => total + group.count, 0);
  if (groupTotal !== section.count) {
    return malformedWithContext("provider-supplemental-group-count-mismatch", {
      category: section.category,
      advertised: section.count,
      groupTotal,
    });
  }

  const findings: ReviewBodyFinding[] = [];
  for (const [groupIndex, group] of groups.entries()) {
    const groupEnd = groups[groupIndex + 1]?.start ?? body.length;
    const groupBody = body.slice(group.start, groupEnd);
    const markers = [...groupBody.matchAll(/<!--\s*cr-comment:v1:([a-f0-9]+)\s*-->/giu)];
    if (markers.length !== group.count) {
      return malformedWithContext("provider-supplemental-finding-count-mismatch", {
        category: section.category,
        group: group.path,
        advertised: group.count,
        markers: markers.length,
      });
    }

    let itemStart = 0;
    for (const marker of markers) {
      const fingerprint = marker[1] as string;
      const item = groupBody.slice(itemStart, marker.index);
      const loci = [...item.matchAll(/^[\t ]*(?:>[\t ]*)*`([^`\r\n]+)`:\s*_/gmu)];
      const locusMatch = loci.at(-1);
      const parsedSeverity = severity(item);
      const findingContext = {
        category: section.category,
        group: group.path,
        fingerprint,
      };
      if (group.path.length === 0) {
        return malformedWithContext("provider-body-finding-group-path-empty", findingContext);
      }
      if (locusMatch?.[1] === undefined) {
        return malformedWithContext("provider-body-finding-locus-unrecognized", findingContext);
      }
      if (parsedSeverity === null) {
        return malformedWithContext("provider-body-finding-severity-unrecognized", findingContext);
      }
      const findingBody = item.slice(locusMatch.index).trim();
      const metadataLineEnd = item.indexOf("\n", locusMatch.index);
      const substantiveBody = metadataLineEnd === -1
        ? ""
        : item.slice(metadataLineEnd + 1)
          .replace(/^[\t ]*(?:>[\t ]*)*/gmu, "")
          .trim();
      if (substantiveBody.length === 0) {
        return malformedWithContext("provider-body-finding-empty", findingContext);
      }
      findings.push({
        findingId: `${review.id}:${fingerprint}`,
        origin: "review-body",
        reviewId: review.id,
        fingerprint,
        settlement: "not-applicable",
        severity: parsedSeverity,
        ...(parsedSeverity === "minor"
          && (section.category === "nitpick" || hasExplicitPurePolishMarker(findingBody))
          ? { nit: true as const }
          : {}),
        locus: `${group.path}:${locusMatch[1]}`,
        url: review.url,
        body: findingBody,
        ...captureReviewFindingSourceLabel({ body: substantiveBody }),
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
    return malformedWithContext("provider-actionable-count-ambiguous", {
      matches: actionableMatches.length,
    });
  }
  const actionableCount = actionableText === undefined
    ? null
    : nonNegativeInteger(actionableText);
  if (actionableText !== undefined && actionableCount === null) {
    return malformedWithContext("provider-actionable-count-invalid", {
      value: actionableText.trim(),
    });
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
      return malformedWithContext("provider-supplemental-section-count-mismatch", {
        category: section.category,
        advertised: section.count,
        parsed: parsed.findings.length,
      });
    }
    findings.push(...parsed.findings);
  }

  const advertisedSupplementalCount = sections.reduce((total, section) => total + section.count, 0);
  const supplementalCounts = {
    nitpick: sections
      .filter((section) => section.category === "nitpick")
      .reduce((total, section) => total + section.count, 0),
    "outside-diff": sections
      .filter((section) => section.category === "outside-diff")
      .reduce((total, section) => total + section.count, 0),
  };
  const markerCount = [...detailBody.matchAll(/<!--\s*cr-comment:v1:[a-f0-9]+\s*-->/giu)].length;
  if (findings.length !== advertisedSupplementalCount || markerCount !== findings.length) {
    return malformedWithContext("provider-supplemental-total-count-mismatch", {
      advertised: advertisedSupplementalCount,
      parsed: findings.length,
      markers: markerCount,
    });
  }
  const seenFingerprints = new Set<string>();
  const duplicate = findings.find((item) => {
    if (seenFingerprints.has(item.fingerprint)) return true;
    seenFingerprints.add(item.fingerprint);
    return false;
  });
  if (duplicate !== undefined) {
    return malformedWithContext("provider-body-finding-fingerprint-duplicate", {
      fingerprint: duplicate.fingerprint,
    });
  }
  return { kind: "parsed", actionableCount, supplementalCounts, findings };
}

function orderedTerminalReviews(reviews: HostedGitHubReview[]): HostedGitHubReview[] {
  return [...reviews].sort((left, right) => {
    const submitted = left.submittedAt.localeCompare(right.submittedAt);
    return submitted === 0 ? left.id.localeCompare(right.id) : submitted;
  });
}

function nextRequestBoundary(
  comments: HostedGitHubIssueComment[],
  requestedAt: string,
): string | null {
  const next = comments
    .filter((comment) => {
      const body = comment.body.trim();
      return comment.createdAt > requestedAt
        && (body === COMMANDS.complete || body === COMMANDS.incremental);
    })
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0];
  return next?.createdAt ?? null;
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

      const requestBoundary = coverage === null ? null : nextRequestBoundary(comments, requestedAt);
      const providerReviews = reviews.filter((review) =>
        review.actorIdentity === BOT_USER_ID
        && review.headSha === target.headSha
        && review.submittedAt >= requestedAt
        && precedesBoundary(review.submittedAt, requestBoundary));
      const completeSequence = orderedTerminalReviews(providerReviews);
      const orderedReviews = coverage === null ? completeSequence.slice(-1) : completeSequence;
      const review = orderedReviews.at(-1);
      if (review === undefined) {
        const providerComments = comments.filter((comment) =>
          comment.actorIdentity === BOT_USER_ID
          && comment.appId === APP_ID
          && precedesBoundary(comment.createdAt, requestBoundary));
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
          && summaryCompletesHead(comment, target, requestedAt));
        if (completedStatus !== undefined && completedReply !== undefined && completedSummary !== undefined) {
          return { kind: "clean", reviewUrl: completedSummary.url };
        }
        return requestBoundary === null
          ? { kind: "pending" }
          : { kind: "terminal-failure", reason: "provider-request-generation-overlap" };
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
              && comment.reviewId === terminalReview.id)
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
