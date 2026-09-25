/** Parse CodeRabbit review bodies and inline thread findings. */

import {
  captureReviewFindingSourceLabel,
  hasExplicitPurePolishMarker,
} from "../core/finding-records.js";
import type { HostedFinding } from "./await.js";
import type { HostedGitHubReview, HostedGitHubThreadComment } from "./github.js";

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

export function finding(
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
export type UnorderedFinding = UnorderedThreadFinding | ReviewBodyFinding;
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
  start: number;
  end: number;
  blockId: number | null;
}

interface SummaryMatch {
  text: string;
  start: number;
  end: number;
}

interface DetailsBlock {
  id: number;
  parentId: number | null;
  openStart: number;
  openEnd: number;
  closeStart: number;
  closeEnd: number;
}

interface DetailsTag {
  text: string;
  index: number;
}

interface TextRange {
  start: number;
  end: number;
}

interface MarkdownFence {
  marker: "`" | "~";
  length: number;
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

function supplementalHeader(text: string): Pick<SupplementalSection, "category" | "count"> | null {
  const countMatch = /\((\d+)\)\s*$/u.exec(text);
  if (countMatch?.[1] === undefined) return null;
  const count = nonNegativeInteger(countMatch[1]);
  if (count === null) return null;
  const label = text.slice(0, countMatch.index).toLowerCase();
  if (label.includes("nitpick") && label.includes("comment")) {
    return { category: "nitpick", count };
  }
  if (label.includes("outside") && label.includes("diff") && label.includes("comment")) {
    return { category: "outside-diff", count };
  }
  return null;
}

function supplementalSection(match: SummaryMatch, block: DetailsBlock): SupplementalSection | null {
  const header = supplementalHeader(match.text);
  return header === null
    ? null
    : { ...header, start: match.end, end: block.closeStart, blockId: block.id };
}

function calloutSections(body: string, blocks: readonly DetailsBlock[]): SupplementalSection[] {
  const sections: SupplementalSection[] = [];
  const fencedRanges = fencedMarkdownRanges(body);
  const callouts = body.matchAll(
    /^[\t ]*>[\t ]*\[!CAUTION\][^\r\n]*(?:(?:\r\n|\r|\n)[\t ]*>[^\r\n]*)*/gimu,
  );
  for (const callout of callouts) {
    if (fencedRanges.some((range) => range.start <= callout.index && callout.index < range.end)
      || blocks.some((block) => block.openStart < callout.index && callout.index < block.closeEnd)) continue;
    const headers = [...callout[0].matchAll(/^[\t ]*>[\t ]*\*\*([^*\r\n]+)\*\*[\t ]*$/gmu)]
      .flatMap((match) => {
        const start = callout.index + match.index;
        const header = supplementalHeader(match[1] ?? "");
        return header === null
          || fencedRanges.some((range) => range.start <= start && start < range.end)
          || blocks.some((block) => block.openStart < start && start < block.closeEnd)
          ? [] : [{ ...header, start, end: start + match[0].length }];
      });
    for (const [index, header] of headers.entries()) {
      sections.push({
        category: header.category,
        count: header.count,
        start: header.end,
        end: headers[index + 1]?.start ?? callout.index + callout[0].length,
        blockId: null,
      });
    }
  }
  return sections;
}

function inlineCodeRanges(line: string): TextRange[] {
  const runs = [...line.matchAll(/`+/gu)];
  const ranges: TextRange[] = [];
  for (let index = 0; index < runs.length; index += 1) {
    const opening = runs[index];
    if (opening === undefined) continue;
    const closingIndex = runs.findIndex((candidate, candidateIndex) =>
      candidateIndex > index && candidate[0].length === opening[0].length);
    if (closingIndex < 0) continue;
    const closing = runs[closingIndex];
    if (closing === undefined) continue;
    ranges.push({ start: opening.index, end: closing.index + closing[0].length });
    index = closingIndex;
  }
  return ranges;
}

function fenceRun(line: string): { fence: MarkdownFence; rest: string } | null {
  const content = line.replace(/^[\t ]*(?:>[\t ]*)*/u, "");
  const match = /^(`{3,}|~{3,})(.*)$/u.exec(content);
  if (match?.[1] === undefined || match[2] === undefined) return null;
  return {
    fence: { marker: match[1][0] as "`" | "~", length: match[1].length },
    rest: match[2],
  };
}

function fencedMarkdownRanges(body: string): TextRange[] {
  const ranges: TextRange[] = [];
  let fence: MarkdownFence | null = null;
  let start = 0;
  for (const lineMatch of body.matchAll(/[^\r\n]*(?:\r\n|\r|\n|$)/gu)) {
    if (lineMatch[0].length === 0) continue;
    const line = lineMatch[0].replace(/(?:\r\n|\r|\n)$/u, "");
    const run = fenceRun(line);
    if (fence === null) {
      if (run !== null) {
        fence = run.fence;
        start = lineMatch.index;
      }
    } else if (run !== null
      && run.fence.marker === fence.marker
      && run.fence.length >= fence.length
      && run.rest.trim().length === 0) {
      ranges.push({ start, end: lineMatch.index + lineMatch[0].length });
      fence = null;
    }
  }
  if (fence !== null) ranges.push({ start, end: body.length });
  return ranges;
}

function isMarkdownEscaped(line: string, index: number): boolean {
  let backslashes = 0;
  for (let cursor = index - 1; cursor >= 0 && line[cursor] === "\\"; cursor -= 1) {
    backslashes += 1;
  }
  return backslashes % 2 === 1;
}

function detailsTags(body: string): DetailsTag[] {
  const tags: DetailsTag[] = [];
  let fence: MarkdownFence | null = null;
  for (const lineMatch of body.matchAll(/[^\r\n]*(?:\r\n|\r|\n|$)/gu)) {
    if (lineMatch[0].length === 0) continue;
    const line = lineMatch[0].replace(/(?:\r\n|\r|\n)$/u, "");
    const run = fenceRun(line);
    if (fence !== null) {
      if (run !== null
        && run.fence.marker === fence.marker
        && run.fence.length >= fence.length
        && run.rest.trim().length === 0) {
        fence = null;
      }
      continue;
    }
    if (run !== null) {
      fence = run.fence;
      continue;
    }
    const codeRanges = inlineCodeRanges(line);
    for (const tag of line.matchAll(/<\/?details(?:\s[^>]*)?>/giu)) {
      if (isMarkdownEscaped(line, tag.index)
        || codeRanges.some((range) => tag.index >= range.start && tag.index < range.end)) continue;
      tags.push({ text: tag[0], index: lineMatch.index + tag.index });
    }
  }
  return tags;
}

function detailsBlocks(body: string): DetailsBlock[] | null {
  const blocks: Array<DetailsBlock | null> = [];
  const stack: number[] = [];
  for (const tag of detailsTags(body)) {
    if (!tag.text.startsWith("</")) {
      const id = blocks.length;
      blocks.push({
        id,
        parentId: stack.at(-1) ?? null,
        openStart: tag.index,
        openEnd: tag.index + tag.text.length,
        closeStart: -1,
        closeEnd: -1,
      });
      stack.push(id);
      continue;
    }
    const id = stack.pop();
    if (id === undefined) return null;
    const block = blocks[id];
    if (block === null || block === undefined) return null;
    blocks[id] = { ...block, closeStart: tag.index, closeEnd: tag.index + tag.text.length };
  }
  if (stack.length > 0
    || blocks.some((block) => block === null || block.closeStart < 0 || block.closeEnd < 0)) return null;
  return blocks as DetailsBlock[];
}

function maskDetailsRanges(
  body: string,
  start: number,
  end: number,
  blocks: readonly DetailsBlock[],
): string {
  let cursor = start;
  let masked = "";
  for (const block of [...blocks].sort((left, right) => left.openStart - right.openStart)) {
    if (block.openStart < cursor || block.closeEnd > end) continue;
    masked += body.slice(cursor, block.openStart);
    masked += body.slice(block.openStart, block.closeEnd)
      .replace(/[^\r\n]/gu, (character) => " ".repeat(character.length));
    cursor = block.closeEnd;
  }
  return masked + body.slice(cursor, end);
}

function directSummary(
  body: string,
  block: DetailsBlock,
  blocks: readonly DetailsBlock[],
): SummaryMatch | null {
  let contentEnd = block.closeStart;
  for (const candidate of blocks) {
    if (candidate.parentId === block.id) contentEnd = Math.min(contentEnd, candidate.openEnd);
  }
  const match = summaryMatches(body.slice(block.openEnd, contentEnd))[0];
  return match === undefined
    ? null
    : {
        ...match,
        start: block.openEnd + match.start,
        end: block.openEnd + match.end,
      };
}

function malformed(reason: string): CodeRabbitReviewBodyParseResult {
  return { kind: "malformed", reason };
}

export function diagnostic(
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

function calloutSourceLabel(summaryText: string, body: string): ReturnType<typeof captureReviewFindingSourceLabel> {
  const summary = /<summary>([^\r\n]*?)<\/summary>/iu.exec(summaryText);
  const summaryParts = summary?.[1]?.split(" · ");
  const title = summaryParts !== undefined && summaryParts.length >= 3
    ? summaryParts.slice(1, -1).join(" · ").trim()
    : undefined;
  return captureReviewFindingSourceLabel({ title, body });
}

function parseCalloutSection(
  review: HostedGitHubReview,
  body: string,
  section: SupplementalSection,
  blocks: readonly DetailsBlock[],
): SupplementalParseResult {
  const items = blocks.filter((block) => block.parentId === null
    && block.openStart >= section.start && block.closeEnd <= section.end);
  const findings: ReviewBodyFinding[] = [];
  for (const item of items) {
    const semanticItem = maskDetailsRanges(body, item.openEnd, item.closeStart,
      blocks.filter((block) => block.parentId === item.id));
    const markers = [...semanticItem.matchAll(/<!--\s*cr-comment:v1:([a-f0-9]+)\s*-->/giu)];
    const marker = markers[0];
    if (markers.length !== 1 || marker === undefined) {
      return malformedWithContext("provider-supplemental-finding-count-mismatch", {
        category: section.category,
        group: "callout",
        advertised: 1,
        markers: markers.length,
      });
    }
    const fingerprint = marker[1] as string;
    const content = semanticItem.slice(0, marker.index);
    const loci = [...content.matchAll(/^[\t ]*(?:>[\t ]*)*`([^`\r\n]+:\d+(?:-\d+)?)`[\t ]*$/gmu)];
    const locus = loci[0];
    const context = { category: section.category, fingerprint };
    if (locus?.[1] === undefined) {
      return malformedWithContext("provider-body-finding-locus-unrecognized", context);
    }
    const locusLineEnd = content.indexOf("\n", locus.index);
    const severityLineEnd = locusLineEnd === -1 ? -1 : content.indexOf("\n", locusLineEnd + 1);
    const severityLine = locusLineEnd === -1 ? "" : content.slice(locusLineEnd + 1,
      severityLineEnd === -1 ? undefined : severityLineEnd);
    const parsedSeverity = severity(severityLine);
    if (parsedSeverity === null) {
      return malformedWithContext("provider-body-finding-severity-unrecognized", context);
    }
    const substantiveBody = severityLineEnd === -1 ? "" : content.slice(severityLineEnd + 1)
      .replace(/^[\t ]*(?:>[\t ]*)*/gmu, "").trim();
    if (substantiveBody.length === 0) {
      return malformedWithContext("provider-body-finding-empty", context);
    }
    findings.push({
      findingId: `${review.id}:${fingerprint}`,
      origin: "review-body",
      reviewId: review.id,
      fingerprint,
      settlement: "not-applicable",
      severity: parsedSeverity,
      locus: locus[1],
      url: review.url,
      body: body.slice(item.openEnd + locus.index, item.openEnd + marker.index).trim(),
      ...calloutSourceLabel(content.slice(0, locus.index), substantiveBody),
    });
  }
  return { kind: "parsed", findings };
}

function supplementalGroups(
  body: string,
  section: SupplementalSection,
  blocks: readonly DetailsBlock[],
) {
  return blocks.filter((block) => block.parentId === section.blockId).flatMap((block) => {
    const match = directSummary(body, block, blocks);
    if (match === null) return [];
    const countMatch = /\((\d+)\)\s*$/u.exec(match.text);
    if (countMatch?.[1] === undefined) return [];
    const count = nonNegativeInteger(countMatch[1]);
    if (count === null) return [];
    return [{
      blockId: block.id,
      path: match.text.slice(0, countMatch.index).trim(),
      count,
      start: match.end,
      end: block.closeStart,
    }];
  });
}

function parseSupplementalSection(
  review: HostedGitHubReview,
  body: string,
  section: SupplementalSection,
  blocks: readonly DetailsBlock[],
): SupplementalParseResult {
  if (section.blockId === null) return parseCalloutSection(review, body, section, blocks);
  const groups = supplementalGroups(body, section, blocks);
  const groupTotal = groups.reduce((total, group) => total + group.count, 0);
  if (groupTotal !== section.count) {
    return malformedWithContext("provider-supplemental-group-count-mismatch", {
      category: section.category,
      advertised: section.count,
      groupTotal,
    });
  }

  const findings: ReviewBodyFinding[] = [];
  for (const group of groups) {
    const originalGroupBody = body.slice(group.start, group.end);
    const semanticGroupBody = maskDetailsRanges(
      body,
      group.start,
      group.end,
      blocks.filter((block) => block.parentId === group.blockId),
    );
    const markers = [...semanticGroupBody.matchAll(/<!--\s*cr-comment:v1:([a-f0-9]+)\s*-->/giu)];
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
      const semanticItem = semanticGroupBody.slice(itemStart, marker.index);
      const originalItem = originalGroupBody.slice(itemStart, marker.index);
      const loci = [...semanticItem.matchAll(/^[\t ]*(?:>[\t ]*)*`([^`\r\n]+)`:\s*_/gmu)];
      const locusMatch = loci.at(-1);
      const parsedSeverity = severity(semanticItem);
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
      const findingBody = originalItem.slice(locusMatch.index).trim();
      const metadataLineEnd = semanticItem.indexOf("\n", locusMatch.index);
      const substantiveBody = metadataLineEnd === -1
        ? ""
        : semanticItem.slice(metadataLineEnd + 1)
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

  const detailBody = review.body;
  const blocks = detailsBlocks(detailBody);
  if (blocks === null) return malformed("provider-details-structure-unbalanced");
  const sections = blocks
    .filter((block) => block.parentId === null)
    .flatMap((block) => {
      const summary = directSummary(detailBody, block, blocks);
      return summary === null ? [] : [supplementalSection(summary, block)];
    })
    .filter((section): section is SupplementalSection => section !== null)
    .concat(calloutSections(detailBody, blocks))
    .sort((left, right) => left.start - right.start);
  const findings: ReviewBodyFinding[] = [];
  for (const section of sections) {
    const parsed = parseSupplementalSection(
      review,
      detailBody,
      section,
      blocks,
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
  const markerCount = sections.reduce((total, section) => {
    const groupIds = new Set(blocks.filter((block) => section.blockId === null
      ? block.parentId === null && block.openStart >= section.start && block.closeEnd <= section.end
      : block.parentId === section.blockId).map((block) => block.id));
    const semanticSectionBody = maskDetailsRanges(
      detailBody,
      section.start,
      section.end,
      blocks.filter((block) => block.parentId !== null && groupIds.has(block.parentId)),
    );
    return total + [...semanticSectionBody.matchAll(/<!--\s*cr-comment:v1:[a-f0-9]+\s*-->/giu)].length;
  }, 0);
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
