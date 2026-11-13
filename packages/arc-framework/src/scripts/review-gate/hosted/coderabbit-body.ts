/** Parse CodeRabbit review bodies and inline thread findings. */

import { canonicalDigest } from "../../../lib/kernel/index.js";
import {
  captureReviewFindingSourceLabel,
  hasExplicitPurePolishMarker,
} from "../core/finding-records.js";
import type { HostedFinding } from "./await.js";
import type { HostedGitHubReview, HostedGitHubThreadComment } from "./github.js";

/**
 * CodeRabbit's icon image, which a badge may carry in place of its leading emoji. It ends at its own `</picture>`, so
 * a run of icon badges has one reading and a line that does not match fails fast.
 */
const ICON = "<picture>(?:(?!</picture>)[^*\\r\\n])*</picture>";
/** One provider badge: an italic or bold span that opens with an emoji or icon, such as `**🔵 Trivial**`. */
const BADGE = `(?:_(?:\\p{Extended_Pictographic}|${ICON})[^_\\r\\n]*_`
  + `|\\*\\*(?:\\p{Extended_Pictographic}|${ICON})[^*\\r\\n]*\\*\\*)`;
/**
 * Any italic or bold span, as a badge joined by `·` may be: that layout drops the category and effort emoji. An italic
 * span reads a leading icon whole, since its URL may hold `_`; a bold span's text already covers one.
 */
const SPAN = `(?:_(?:${ICON}|[^_<\\r\\n])[^_\\r\\n]*_|\\*\\*[^*\\r\\n]+\\*\\*)`;
/**
 * A run of badges in either layout: emoji-led badges joined by `|`, such as `**🎯 Correctness** | **🟡 Minor**`, or
 * two or more spans joined by `·`, such as `**🟡 Minor** · **Correctness**`. Only emoji-led badges join by `|`, so a
 * bold title sharing that line stays prose.
 */
const BADGE_RUN = `(?:${BADGE}(?:[\\t ]*\\|[\\t ]*${BADGE})*|${SPAN}(?:[\\t ]*·[\\t ]*${SPAN})+)`;
const BADGE_LINE = new RegExp(`^[\\t ]*${BADGE_RUN}[\\t ]*\\r?$`, "u");
/** A grouped finding's metadata line: its line or line range, then only badges. */
const GROUPED_METADATA_LINE = new RegExp(
  `^[\\t ]*(?:>[\\t ]*)*\`(\\d+(?:-\\d+)?)\`:[\\t ]*${BADGE_RUN}[\\t ]*\\r?$`,
  "gmu",
);

/** A callout item's opening: a whole-line locus such as `` `src/a.ts:12` ``, then the line that carries its badges. */
const CALLOUT_LOCUS_LINE = /^[\t ]*(?:>[\t ]*)*`[^`\r\n]+:\d+(?:-\d+)?`[\t ]*\r?\n([^\r\n]*)$/gmu;

/** CodeRabbit's hidden per-finding marker, which some of its review layouts write after each item and others omit. */
const FINDING_MARKER = /<!--\s*cr-comment:v1:([a-f0-9]+)\s*-->/giu;

/** A severity badge: its color emoji or icon, then the grade, in one italic or bold span. */
const SEVERITY = new RegExp(`(_|\\*\\*)(?:[🔴🟠🟡🔵]|${ICON})\\s*(Critical|Major|Minor|Trivial)\\1`, "iu");

/**
 * Read the first severity badge, in either the italic (`_🟠 Major_`) or bold (`**🟠 Major**`) form.
 *
 * The grade comes from the badge's label. Its leading mark, a color emoji or icon image, is required, so emphasized
 * prose such as `**Major**` is never read as a grade.
 */
function severity(body: string): "critical" | "major" | "minor" | null {
  switch (SEVERITY.exec(body)?.[2]?.toLowerCase()) {
    case "critical":
      return "critical";
    case "major":
      return "major";
    case "minor":
    case "trivial":
      return "minor";
    case undefined:
    default:
      return null;
  }
}

function severityOnMetadataLine(body: string, start: number): ReturnType<typeof severity> {
  return severity(body.slice(start).split(/\r?\n/u, 1)[0] ?? "");
}

/** A metadata line made only of badges, one of them the severity this parser reads. */
function isBadgeLine(line: string): boolean {
  return severity(line) !== null && BADGE_LINE.test(line);
}

/**
 * Select the prose that labels an inline thread comment.
 *
 * Collapsed `<details>` content is supporting material, and the provider's HTML comment marker lines and leading
 * badge line are metadata, so the label comes from the first top-level prose after them; a comment that opens with
 * anything else keeps its first top-level prose line.
 */
function threadLabelSource(body: string): string {
  const blocks = detailsBlocks(body);
  const topLevel = blocks === null ? body : maskDetailsRanges(body, 0, body.length, blocks);
  const lines = topLevel.split(/\r?\n/u);
  const isProse = (line: string): boolean => line.trim().length > 0 && !/^[\t ]*<!--.*-->[\t ]*$/u.test(line);
  const first = lines.findIndex(isProse);
  const firstLine = lines[first];
  if (firstLine === undefined) return "";
  const label = isBadgeLine(firstLine) ? lines.findIndex((line, index) => index > first && isProse(line)) : first;
  return label === -1 ? "" : lines.slice(label).join("\n");
}

type UnorderedThreadFinding = Omit<Extract<HostedFinding, { origin: "review-thread" }>, "sourceOrdinal">;

export function finding(
  threadId: string,
  comment: HostedGitHubThreadComment,
): UnorderedThreadFinding | null {
  const parsedSeverity = severity(comment.body);
  if (parsedSeverity === null || comment.line === null) return null;
  return {
    findingId: `${threadId}:${comment.id}`,
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
    ...captureReviewFindingSourceLabel({ body: threadLabelSource(comment.body) }),
  };
}

type ReviewBodyFinding = Omit<Extract<HostedFinding, { origin: "review-body" }>, "sourceOrdinal">;
export type UnorderedFinding = UnorderedThreadFinding | ReviewBodyFinding;
/** `other` is a counted section under a label this reader does not know, read as findings because it holds them. */
type SupplementalCategory = "nitpick" | "outside-diff" | "other";

export type CodeRabbitReviewBodyParseResult =
  | {
    kind: "parsed";
    actionableCount: number | null;
    supplementalCounts: Readonly<Record<SupplementalCategory, number>>;
    findings: ReviewBodyFinding[];
  }
  | { kind: "malformed"; reason: string };
type Malformed = Extract<CodeRabbitReviewBodyParseResult, { kind: "malformed" }>;
type SupplementalParseResult = { kind: "parsed"; findings: ReviewBodyFinding[] } | Malformed;
type GroupFinding = { kind: "finding"; finding: ReviewBodyFinding } | Malformed;

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

/** Match one-line `<summary>` headers; the text excludes a leading icon image, whose URL is not header text. */
function summaryMatches(body: string): SummaryMatch[] {
  const summary = new RegExp(`^[\\t ]*(?:>[\\t ]*)*<summary>(?:${ICON})?([^<\\r\\n]+)<\\/summary>`, "gimu");
  return [...body.matchAll(summary)].map((match) => ({
    text: (match[1] as string).trim(),
    start: match.index,
    end: match.index + match[0].length,
  }));
}

/** Read a header's trailing count, written `(1)` or `: 1`, and the label before it. */
function headerCount(text: string): { label: string; count: number } | null {
  const countMatch = /(?:\((\d+)\)|:[\t ]*(\d+))[\t ]*$/u.exec(text);
  const digits = countMatch?.[1] ?? countMatch?.[2];
  if (countMatch === null || digits === undefined) return null;
  const count = nonNegativeInteger(digits);
  return count === null ? null : { label: text.slice(0, countMatch.index), count };
}

function supplementalHeader(text: string): Pick<SupplementalSection, "category" | "count"> | null {
  const header = headerCount(text);
  if (header === null) return null;
  const { count } = header;
  const label = header.label.replace(new RegExp(ICON, "gu"), "").toLowerCase();
  if (label.includes("nitpick") && label.includes("comment")) {
    return { category: "nitpick", count };
  }
  if (label.includes("outside") && label.includes("diff") && label.includes("comment")) {
    return { category: "outside-diff", count };
  }
  return null;
}

/** A counted header read as findings whatever its label, for a section that holds a finding's shape. */
function otherHeader(text: string): Pick<SupplementalSection, "category" | "count"> | null {
  const header = headerCount(text);
  return header === null ? null : { category: "other", count: header.count };
}

/**
 * Start indexes, outside fenced code, of the lines every finding item opens with: a grouped item's metadata line, or
 * a callout item's locus line followed by a severity badge.
 */
function findingShapeLines(body: string): number[] {
  const fencedRanges = fencedMarkdownRanges(body);
  const calloutLoci = [...body.matchAll(CALLOUT_LOCUS_LINE)].filter((match) => severity(match[1] ?? "") !== null);
  return [...body.matchAll(GROUPED_METADATA_LINE), ...calloutLoci]
    .map((match) => match.index)
    .filter((index) => !fencedRanges.some((range) => range.start <= index && index < range.end));
}

/**
 * Read a counted top-level section as findings: by its label when the reader knows it, otherwise as `other` when it
 * holds a finding's shape, so a section CodeRabbit renames or adds still yields its findings.
 */
function supplementalSection(
  match: SummaryMatch,
  block: DetailsBlock,
  shapeLines: readonly number[],
): SupplementalSection | null {
  const holdsFindings = shapeLines.some((index) => match.end <= index && index < block.closeStart);
  const header = supplementalHeader(match.text) ?? (holdsFindings ? otherHeader(match.text) : null);
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
        const header = supplementalHeader(match[1] ?? "") ?? otherHeader(match[1] ?? "");
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

function malformed(reason: string): Malformed {
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
): Malformed {
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

/**
 * Read one callout item: a top-level details block holding a locus line, a severity line and the finding. Its hidden
 * marker, when CodeRabbit wrote one, ends the finding and is its fingerprint; otherwise the item's end does and its
 * fingerprint is a digest of its locus and body.
 */
function calloutFinding(
  review: HostedGitHubReview,
  body: string,
  category: SupplementalCategory,
  item: DetailsBlock,
  blocks: readonly DetailsBlock[],
): GroupFinding {
  const semanticItem = maskDetailsRanges(body, item.openEnd, item.closeStart,
    blocks.filter((block) => block.parentId === item.id));
  const markers = [...semanticItem.matchAll(FINDING_MARKER)];
  const marker = markers[0];
  if (markers.length > 1) {
    return malformedWithContext("provider-supplemental-finding-count-mismatch", {
      category, group: "callout", advertised: 1, markers: markers.length,
    });
  }
  const contentEnd = marker?.index ?? trimClosingTags(semanticItem).length;
  const content = semanticItem.slice(0, contentEnd);
  const loci = [...content.matchAll(/^[\t ]*(?:>[\t ]*)*`([^`\r\n]+:\d+(?:-\d+)?)`[\t ]*$/gmu)];
  const locus = loci[0];
  const context = { category, ...(marker === undefined ? {} : { fingerprint: marker[1] as string }) };
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
  const findingBody = body.slice(item.openEnd + locus.index, item.openEnd + contentEnd).trim();
  const fingerprint = marker?.[1] ?? canonicalDigest({ locus: locus[1], body: findingBody });
  return { kind: "finding", finding: {
    findingId: `${review.id}:${fingerprint}`,
    origin: "review-body",
    reviewId: review.id,
    fingerprint,
    settlement: "not-applicable",
    severity: parsedSeverity,
    ...(parsedSeverity === "minor"
      && (category === "nitpick" || hasExplicitPurePolishMarker(substantiveBody))
      ? { nit: true as const }
      : {}),
    locus: locus[1],
    url: review.url,
    body: findingBody,
    ...calloutSourceLabel(content.slice(0, locus.index), substantiveBody),
  } };
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
    const parsed = calloutFinding(review, body, section.category, item, blocks);
    if (parsed.kind === "malformed") return parsed;
    findings.push(parsed.finding);
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
    const header = match === null ? null : headerCount(match.text);
    if (match === null || header === null) return [];
    return [{
      blockId: block.id,
      path: header.label.trim(),
      count: header.count,
      start: match.end,
      end: block.closeStart,
    }];
  });
}

interface GroupItem {
  /** CodeRabbit's per-finding marker, or null for an item it wrote without one. */
  marker: string | null;
  semantic: string;
  original: string;
}

type GroupSplit = { kind: "items"; items: GroupItem[] } | Malformed;

/** A line holding only quote markers and closing list or quote tags, which ends an unmarked item's markup. */
const CLOSING_MARKUP_LINE = /^[\t ]*(?:>[\t ]*)*(?:<\/(?:dd|dl|blockquote)>[\t ]*)*\r?\n?$/u;

/** Drop the trailing lines of closing markup from the end of an unmarked item. */
function trimClosingTags(text: string): string {
  const lines = text.split(/(?<=\n)/u);
  while (lines.length > 0 && CLOSING_MARKUP_LINE.test(lines.at(-1) as string)) lines.pop();
  return lines.join("");
}

/**
 * Split a file group into its finding items. Where CodeRabbit writes a hidden marker after each item, the markers
 * delimit them; where it writes none, each item runs from its metadata line to the next. Either way the items must
 * match the group's advertised count.
 */
function groupItems(
  semanticGroupBody: string,
  originalGroupBody: string,
  context: { category: SupplementalCategory; group: string; advertised: number },
): GroupSplit {
  const markers = [...semanticGroupBody.matchAll(FINDING_MARKER)];
  if (markers.length > 0) {
    if (markers.length !== context.advertised) {
      return malformedWithContext("provider-supplemental-finding-count-mismatch", {
        ...context, markers: markers.length,
      });
    }
    let start = 0;
    return { kind: "items", items: markers.map((marker) => {
      const item = {
        marker: marker[1] as string,
        semantic: semanticGroupBody.slice(start, marker.index),
        original: originalGroupBody.slice(start, marker.index),
      };
      start = marker.index + marker[0].length;
      return item;
    }) };
  }
  const lines = [...semanticGroupBody.matchAll(GROUPED_METADATA_LINE)];
  if (lines.length !== context.advertised) {
    return malformedWithContext("provider-supplemental-finding-count-mismatch", {
      ...context, metadataLines: lines.length,
    });
  }
  return { kind: "items", items: lines.map((line, index) => {
    const end = lines[index + 1]?.index ?? semanticGroupBody.length;
    return {
      marker: null,
      semantic: trimClosingTags(semanticGroupBody.slice(line.index, end)),
      original: trimClosingTags(originalGroupBody.slice(line.index, end)),
    };
  }) };
}

/** Prefer a standalone bold title outside fenced code, retaining the first-line fallback for titleless items. */
function groupedSourceLabel(body: string): ReturnType<typeof captureReviewFindingSourceLabel> {
  const fencedRanges = fencedMarkdownRanges(body);
  const title = [...body.matchAll(/^[\t ]*(\*\*[^\r\n]+\*\*)[\t ]*\r?$/gmu)]
    .find((match) => !fencedRanges.some((range) => range.start <= match.index && match.index < range.end))?.[1];
  return captureReviewFindingSourceLabel({ title, body });
}

/** Read one grouped item's locus, severity and body. An unmarked item's fingerprint is a digest of its locus and body. */
function groupFinding(
  review: HostedGitHubReview,
  category: SupplementalCategory,
  path: string,
  item: GroupItem,
): GroupFinding {
  const findingContext = { category, group: path, ...(item.marker === null ? {} : { fingerprint: item.marker }) };
  if (path.length === 0) {
    return malformedWithContext("provider-body-finding-group-path-empty", findingContext);
  }
  const locusMatch = [...item.semantic.matchAll(GROUPED_METADATA_LINE)].at(-1);
  if (locusMatch?.[1] === undefined) {
    return malformedWithContext("provider-body-finding-locus-unrecognized", findingContext);
  }
  const parsedSeverity = severityOnMetadataLine(item.semantic, locusMatch.index);
  if (parsedSeverity === null) {
    return malformedWithContext("provider-body-finding-severity-unrecognized", findingContext);
  }
  const findingBody = item.original.slice(locusMatch.index).trim();
  const metadataLineEnd = item.semantic.indexOf("\n", locusMatch.index);
  const substantiveBody = metadataLineEnd === -1
    ? ""
    : item.semantic.slice(metadataLineEnd + 1)
      .replace(/^[\t ]*(?:>[\t ]*)*/gmu, "")
      .trim();
  if (substantiveBody.length === 0) {
    return malformedWithContext("provider-body-finding-empty", findingContext);
  }
  const locus = `${path}:${locusMatch[1]}`;
  const fingerprint = item.marker ?? canonicalDigest({ locus, body: findingBody });
  return { kind: "finding", finding: {
    findingId: `${review.id}:${fingerprint}`,
    origin: "review-body",
    reviewId: review.id,
    fingerprint,
    settlement: "not-applicable",
    severity: parsedSeverity,
    ...(parsedSeverity === "minor"
      && (category === "nitpick" || hasExplicitPurePolishMarker(findingBody))
      ? { nit: true as const }
      : {}),
    locus,
    url: review.url,
    body: findingBody,
    ...groupedSourceLabel(substantiveBody),
  } };
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
    const semanticGroupBody = maskDetailsRanges(
      body,
      group.start,
      group.end,
      blocks.filter((block) => block.parentId === group.blockId),
    );
    const split = groupItems(semanticGroupBody, body.slice(group.start, group.end), {
      category: section.category,
      group: group.path,
      advertised: group.count,
    });
    if (split.kind === "malformed") return split;
    for (const item of split.items) {
      const parsed = groupFinding(review, section.category, group.path, item);
      if (parsed.kind === "malformed") return parsed;
      findings.push(parsed.finding);
    }
  }
  return { kind: "parsed", findings };
}

/**
 * Refuse a finding marker outside fenced code that no recognized section holds.
 *
 * A section whose header the parser does not recognize is skipped while the rest of the body still parses, so its
 * findings would otherwise vanish from a result that reads as complete.
 */
function unattributedMarker(
  body: string,
  sections: readonly SupplementalSection[],
): CodeRabbitReviewBodyParseResult | null {
  const fencedRanges = fencedMarkdownRanges(body);
  const unattributed = [...body.matchAll(FINDING_MARKER)].filter((marker) =>
    !fencedRanges.some((range) => range.start <= marker.index && marker.index < range.end)
    && !sections.some((section) => section.start <= marker.index && marker.index < section.end));
  const first = unattributed[0];
  return first === undefined
    ? null
    : malformedWithContext("provider-supplemental-marker-unattributed", {
      markers: unattributed.length,
      fingerprint: first[1] as string,
    });
}

/**
 * Refuse a finding's shape outside fenced code that no recognized section holds. Findings in a section the reader
 * cannot recognize would otherwise drop out of a result that reads as complete, even where CodeRabbit wrote no
 * per-finding markers for the marker check to catch.
 */
function unattributedFindingLine(
  review: HostedGitHubReview,
  shapeLines: readonly number[],
  sections: readonly SupplementalSection[],
): CodeRabbitReviewBodyParseResult | null {
  const unattributed = shapeLines.filter((index) =>
    !sections.some((section) => section.start <= index && index < section.end));
  return unattributed.length === 0
    ? null
    : malformedWithContext("provider-body-finding-unattributed", {
      lines: unattributed.length,
      review: review.url,
    });
}

/** Find every finding section: counted top-level details by label or shape, then the caution callouts. */
function findingSections(
  body: string,
  blocks: readonly DetailsBlock[],
  shapeLines: readonly number[],
): SupplementalSection[] {
  return blocks
    .filter((block) => block.parentId === null)
    .flatMap((block) => {
      const summary = directSummary(body, block, blocks);
      return summary === null ? [] : [supplementalSection(summary, block, shapeLines)];
    })
    .filter((section): section is SupplementalSection => section !== null)
    .concat(calloutSections(body, blocks))
    .sort((left, right) => left.start - right.start);
}

/**
 * Count a section's finding delimiters, leaving out anything inside its findings' own nested details: its markers when
 * CodeRabbit wrote any, otherwise a callout's items or a grouped section's finding metadata lines.
 */
function sectionDelimiters(body: string, section: SupplementalSection, blocks: readonly DetailsBlock[]): number {
  const groupIds = new Set(blocks.filter((block) => section.blockId === null
    ? block.parentId === null && block.openStart >= section.start && block.closeEnd <= section.end
    : block.parentId === section.blockId).map((block) => block.id));
  const semanticSectionBody = maskDetailsRanges(
    body,
    section.start,
    section.end,
    blocks.filter((block) => block.parentId !== null && groupIds.has(block.parentId)),
  );
  const markers = [...semanticSectionBody.matchAll(FINDING_MARKER)].length;
  if (markers > 0) return markers;
  return section.blockId === null
    ? groupIds.size
    : [...semanticSectionBody.matchAll(GROUPED_METADATA_LINE)].length;
}

function countsByCategory(sections: readonly SupplementalSection[]): Record<SupplementalCategory, number> {
  const counts: Record<SupplementalCategory, number> = { nitpick: 0, "outside-diff": 0, other: 0 };
  for (const section of sections) counts[section.category] += section.count;
  return counts;
}

function actionableCountClaim(body: string): { kind: "count"; count: number | null } | CodeRabbitReviewBodyParseResult {
  const actionableMatches = [...body.matchAll(
    /^\*\*Actionable comments posted:\s*([^*\r\n]*?)\s*\*\*\s*$/gimu,
  )];
  const actionableText = actionableMatches[0]?.[1];
  if (actionableMatches.length > 1) {
    return malformedWithContext("provider-actionable-count-ambiguous", {
      matches: actionableMatches.length,
    });
  }
  const count = actionableText === undefined ? null : nonNegativeInteger(actionableText);
  if (actionableText !== undefined && count === null) {
    return malformedWithContext("provider-actionable-count-invalid", {
      value: actionableText.trim(),
    });
  }
  return { kind: "count", count };
}

/** Parse CodeRabbit's optional review-thread count claim and non-thread findings. */
export function parseCodeRabbitReviewBody(
  review: HostedGitHubReview,
): CodeRabbitReviewBodyParseResult {
  const actionable = actionableCountClaim(review.body);
  if (actionable.kind !== "count") return actionable;

  const detailBody = review.body;
  const blocks = detailsBlocks(detailBody);
  if (blocks === null) return malformed("provider-details-structure-unbalanced");
  const shapeLines = findingShapeLines(detailBody);
  const sections = findingSections(detailBody, blocks, shapeLines);
  const unattributed = unattributedMarker(detailBody, sections)
    ?? unattributedFindingLine(review, shapeLines, sections);
  if (unattributed !== null) return unattributed;
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
  const delimiterCount = sections.reduce((total, section) =>
    total + sectionDelimiters(detailBody, section, blocks), 0);
  if (findings.length !== advertisedSupplementalCount || delimiterCount !== findings.length) {
    return malformedWithContext("provider-supplemental-total-count-mismatch", {
      advertised: advertisedSupplementalCount,
      parsed: findings.length,
      delimiters: delimiterCount,
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
  return {
    kind: "parsed",
    actionableCount: actionable.count,
    supplementalCounts: countsByCategory(sections),
    findings,
  };
}
