/** Deterministic source-unit scanning and locator resolution for decompose. */

import { z } from "zod";

import {
  canonicalize,
  digestBytes,
} from "../kernel/canonical/canonical-json.js";
import { CanonicalDigestSchema } from "../kernel/schema/vocabulary.js";
import { isManagedPath } from "../kernel/canonical/managed-path.js";
import { normalizeDecomposeHeadingSource } from "./decompose-heading.js";
import {
  V3DecomposeLocatorSchema,
  v3SourceId,
} from "./decompose-v3-schema.js";

export { normalizeDecomposeHeadingSource } from "./decompose-heading.js";

interface SourceLine {
  start: number;
  end: number;
  body: string;
}

interface HeadingBoundary {
  start: number;
  level: number;
  headingSource: string;
}

function isArtifactBasename(artifact: string): boolean {
  return artifact.length > 0
    && artifact !== "."
    && artifact !== ".."
    && artifact.normalize("NFC") === artifact
    && !artifact.includes("/")
    && !artifact.includes("\\")
    && !artifact.includes("\0");
}

function sourceLines(content: string): SourceLine[] {
  if (content.length === 0) return [];
  const lines: SourceLine[] = [];
  const pattern = /[^\r\n]*(?:\r\n|\r|\n|$)/gu;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    const text = match[0];
    if (text.length === 0) break;
    const start = match.index;
    const body = text.replace(/(?:\r\n|\r|\n)$/u, "");
    lines.push({ start, end: start + text.length, body });
  }
  return lines;
}

function atxHeadingSource(line: string): { level: number; headingSource: string } | null {
  const match = /^ {0,3}(#{1,6})(?:[ \t]+(.*)|[ \t]*)$/u.exec(line);
  if (match === null) return null;
  const withoutClosing = (match[2] ?? "").replace(/[ \t]+#+[ \t]*$/u, "");
  return {
    level: match[1]?.length ?? 1,
    headingSource: normalizeDecomposeHeadingSource(withoutClosing),
  };
}

function isSetextH2Underline(line: string): boolean {
  return /^ {0,3}-+[ \t]*$/u.test(line);
}

function isSetextH1Underline(line: string): boolean {
  return /^ {0,3}=+[ \t]*$/u.test(line);
}

function isAtxHeading(line: string): boolean {
  return /^ {0,3}#{1,6}(?:[ \t]+|$)/u.test(line);
}

function isThematicBreak(line: string): boolean {
  if (/^(?: {4}|\t)/u.test(line)) return false;
  const compact = line.replace(/^ {0,3}/u, "").replace(/[ \t]/gu, "");
  return /^(?:\*{3,}|-{3,}|_{3,})$/u.test(compact);
}

type ContainerState =
  | { kind: "quote" }
  | { kind: "list"; contentIndent: number; afterBlank: boolean };

function listContentIndent(leading: string, marker: string, spacing: string): number {
  const padding = spacing.length >= 1 && spacing.length <= 4 ? spacing.length : 1;
  return leading.length + marker.length + padding;
}

function containerStart(line: string, interruptsParagraph: boolean): ContainerState | null {
  if (/^ {0,3}>/u.test(line)) return { kind: "quote" };
  const unordered = /^( {0,3})([-+*])([ \t]+|$)/u.exec(line);
  if (unordered?.[1] !== undefined && unordered[2] !== undefined) {
    return {
      kind: "list",
      contentIndent: listContentIndent(unordered[1], unordered[2], unordered[3] ?? ""),
      afterBlank: false,
    };
  }
  const ordered = /^( {0,3})(\d{1,9})([.)])([ \t]+|$)/u.exec(line);
  if (ordered?.[1] === undefined || ordered[2] === undefined || ordered[3] === undefined
    || (interruptsParagraph && ordered[2] !== "1")) {
    return null;
  }
  return {
    kind: "list",
    contentIndent: listContentIndent(ordered[1], `${ordered[2]}${ordered[3]}`, ordered[4] ?? ""),
    afterBlank: false,
  };
}

function leadingSpaces(line: string): number {
  return /^ */u.exec(line)?.[0].length ?? 0;
}

function isReferenceDefinition(line: string): boolean {
  return /^ {0,3}\[[^\]\r\n]+\]:[ \t]*(?:<[^>\r\n]*>|\S+)/u.test(line);
}

function allowsReferenceTitleContinuation(line: string): boolean {
  return /^ {0,3}\[[^\]\r\n]+\]:[ \t]*(?:<[^>\r\n]*>|\S+)[ \t]*$/u.test(line);
}

function isReferenceTitleContinuation(line: string): boolean {
  return /^ {0,3}(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\((?:[^)\\]|\\.)*\))[ \t]*$/u.test(line);
}

interface HtmlBlock {
  closing: RegExp | null;
  interruptsParagraph: boolean;
}

const HTML_BLOCK_TAG = /^(?:address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)(?:[ \t\n/>]|$)/iu;

function openingHtmlBlock(line: string, paragraphActive: boolean): HtmlBlock | null {
  const source = line.replace(/^ {0,3}/u, "");
  if (/^<(?:script|pre|style|textarea)(?:[ \t>]|$)/iu.test(source)) {
    const tag = /^<([A-Za-z]+)/u.exec(source)?.[1] ?? "";
    return { closing: new RegExp(`</${tag}[ \\t]*>`, "iu"), interruptsParagraph: true };
  }
  if (source.startsWith("<!--")) return { closing: /-->/u, interruptsParagraph: true };
  if (source.startsWith("<?")) return { closing: /\?>/u, interruptsParagraph: true };
  if (/^<![A-Z]/u.test(source)) return { closing: />/u, interruptsParagraph: true };
  if (source.startsWith("<![CDATA[")) return { closing: /\]\]>/u, interruptsParagraph: true };
  const tagSource = /^<\/?([^\s/>]+)/u.exec(source)?.[1] ?? "";
  if (HTML_BLOCK_TAG.test(tagSource)) return { closing: null, interruptsParagraph: true };
  if (!paragraphActive && /^<\/?[A-Za-z][^>]*>[ \t]*$/u.test(source)) {
    return { closing: null, interruptsParagraph: false };
  }
  return null;
}

function openingFence(line: string): { marker: "`" | "~"; length: number } | null {
  const match = /^ {0,3}(`{3,}|~{3,})/u.exec(line);
  if (match?.[1] === undefined) return null;
  const marker = match[1][0];
  if (marker !== "`" && marker !== "~") return null;
  if (marker === "`" && line.slice(match[0].length).includes("`")) return null;
  return { marker, length: match[1].length };
}

function closesFence(line: string, fence: { marker: "`" | "~"; length: number }): boolean {
  const escaped = fence.marker === "`" ? "`" : "~";
  return new RegExp(`^ {0,3}${escaped}{${fence.length},}[ \\t]*$`, "u").test(line);
}

function markdownBoundaries(content: string, allLevels = false): HeadingBoundary[] {
  const lines = sourceLines(content);
  const headings: HeadingBoundary[] = [];
  let fence: { marker: "`" | "~"; length: number } | null = null;
  let html: HtmlBlock | null = null;
  let paragraph: SourceLine[] = [];
  let container: ContainerState | null = null;
  let referenceTitlePending = false;

  for (const line of lines) {
    if (fence !== null) {
      if (closesFence(line.body, fence)) fence = null;
      continue;
    }
    if (html !== null) {
      if (html.closing === null) {
        if (line.body.trim() === "") html = null;
      } else if (html.closing.test(line.body)) {
        html = null;
      }
      continue;
    }
    if (referenceTitlePending) {
      referenceTitlePending = false;
      if (isReferenceTitleContinuation(line.body)) continue;
    }
    const opened = openingFence(line.body);
    if (opened !== null) {
      paragraph = [];
      fence = opened;
      continue;
    }
    const atx = atxHeadingSource(line.body);
    if (atx !== null) {
      if (container?.kind === "list" && leadingSpaces(line.body) >= container.contentIndent) {
        paragraph = [];
        continue;
      }
      container = null;
      paragraph = [];
      if (allLevels || atx.level === 2) {
        headings.push({ start: line.start, level: atx.level, headingSource: atx.headingSource });
      }
      continue;
    }
    if (isSetextH2Underline(line.body)) {
      const first = paragraph[0];
      if (first !== undefined) {
        headings.push({
          start: first.start,
          level: 2,
          headingSource: normalizeDecomposeHeadingSource(paragraph.map((part) => part.body).join("\n")),
        });
      }
      paragraph = [];
      continue;
    }
    if (isSetextH1Underline(line.body) && paragraph.length > 0) {
      if (allLevels) {
        const first = paragraph[0];
        if (first !== undefined) {
          headings.push({
            start: first.start,
            level: 1,
            headingSource: normalizeDecomposeHeadingSource(paragraph.map((part) => part.body).join("\n")),
          });
        }
      }
      paragraph = [];
      continue;
    }
    if (line.body.trim() === "") {
      paragraph = [];
      if (container?.kind === "list") container.afterBlank = true;
      else container = null;
      continue;
    }
    if (container?.kind === "quote") continue;
    if (container?.kind === "list") {
      if (leadingSpaces(line.body) >= container.contentIndent || !container.afterBlank) continue;
      container = null;
    }
    if (isAtxHeading(line.body) || isThematicBreak(line.body)) {
      paragraph = [];
      continue;
    }
    const openedContainer = containerStart(line.body, paragraph.length > 0);
    if (openedContainer !== null) {
      paragraph = [];
      container = openedContainer;
      continue;
    }
    const openedHtml = openingHtmlBlock(line.body, paragraph.length > 0);
    if (openedHtml !== null && (paragraph.length === 0 || openedHtml.interruptsParagraph)) {
      paragraph = [];
      if (openedHtml.closing === null || !openedHtml.closing.test(line.body)) html = openedHtml;
      continue;
    }
    if (paragraph.length === 0 && isReferenceDefinition(line.body)) {
      referenceTitlePending = allowsReferenceTitleContinuation(line.body);
      continue;
    }
    if (paragraph.length === 0 && /^(?: {4}|\t)/u.test(line.body)) {
      continue;
    }
    paragraph.push(line);
  }
  return headings;
}

export type V3DecomposeContentLocator = z.infer<typeof V3DecomposeLocatorSchema>;

/** One exact byte-preserving v3 allocation unit. */
export interface V3DecomposeContentUnit {
  locator: V3DecomposeContentLocator;
  content: string;
  bytes: Uint8Array;
  byteRange: { start: number; end: number };
}

export type V3DecomposeContentScanResult =
  | { status: "scanned"; units: V3DecomposeContentUnit[] }
  | { status: "rejected"; reason: string };

export type V3DecomposeContentResolution =
  | { status: "resolved"; unit: V3DecomposeContentUnit }
  | {
      status: "rejected";
      reason: string;
      code?: "source-reference" | "source-id" | "source-locator" | "source-content";
      locus?: string;
    };

const V3DecomposeSourceReferenceSchema = z.strictObject({
  sourceId: CanonicalDigestSchema,
  sourcePath: z.string().refine(isManagedPath, "must be a managed repository-relative path"),
  sourceLocator: V3DecomposeLocatorSchema,
  contentDigest: CanonicalDigestSchema,
});

export type V3DecomposeSourceReference = z.infer<typeof V3DecomposeSourceReferenceSchema>;

function byteOffset(content: string, offset: number): number {
  return new TextEncoder().encode(content.slice(0, offset)).length;
}

/**
 * Scan one source artifact into disjoint exhaustive v3 byte units.
 *
 * Task-list Markdown recognizes protected H2 phase boundaries; other Markdown
 * recognizes protected H2-H6 boundaries, and non-Markdown artifacts remain whole.
 */
export function scanV3DecomposeContent(artifact: string, bytes: Uint8Array): V3DecomposeContentScanResult {
  if (!isArtifactBasename(artifact)) {
    return { status: "rejected", reason: "decompose content artifact must be a slash-free NFC basename." };
  }
  const markdown = artifact.toLowerCase().endsWith(".md");
  let content: string;
  try {
    content = new TextDecoder("utf-8", { fatal: markdown, ignoreBOM: true }).decode(bytes);
  } catch {
    return { status: "rejected", reason: `Markdown artifact \`${artifact}\` is not valid UTF-8.` };
  }
  if (!markdown) {
    return {
      status: "scanned",
      units: [{
        locator: { artifact, kind: "whole-file" },
        content,
        bytes: new Uint8Array(bytes),
        byteRange: { start: 0, end: bytes.length },
      }],
    };
  }
  const classificationOffset = content.startsWith("\uFEFF") ? 1 : 0;
  const taskList = /^tasks-.+\.md$/u.test(artifact);
  const boundaries = markdownBoundaries(content.slice(classificationOffset), !taskList)
    .map((heading) => ({ ...heading, start: heading.start + classificationOffset }));
  const headings = boundaries.filter(({ level }) => level >= 2);
  const units: V3DecomposeContentUnit[] = [];
  const appendUnit = (start: number, end: number, locator: V3DecomposeContentLocator): void => {
    const startByte = byteOffset(content, start);
    const endByte = byteOffset(content, end);
    units.push({
      locator,
      content: content.slice(start, end),
      bytes: bytes.slice(startByte, endByte),
      byteRange: { start: startByte, end: endByte },
    });
  };
  if (headings.length === 0) {
    appendUnit(0, content.length, { artifact, kind: "preamble" });
    return { status: "scanned", units };
  }
  appendUnit(0, headings[0]?.start ?? 0, { artifact, kind: "preamble" });
  const stack: Array<{ level: number; headingSource: string; occurrence: number }> = [];
  const occurrences = new Map<string, number>();
  let headingIndex = 0;
  for (const heading of boundaries) {
    if (heading.level === 1) {
      stack.length = 0;
      continue;
    }
    while ((stack.at(-1)?.level ?? 0) >= heading.level) stack.pop();
    const ancestry = stack.map((entry) => ({ ...entry }));
    const key = JSON.stringify([ancestry, heading.level, heading.headingSource]);
    const occurrence = occurrences.get(key) ?? 0;
    occurrences.set(key, occurrence + 1);
    appendUnit(heading.start, headings[headingIndex + 1]?.start ?? content.length, {
      artifact,
      kind: "section",
      level: heading.level,
      headingSource: heading.headingSource,
      ancestry,
      occurrence,
    });
    stack.push({ level: heading.level, headingSource: heading.headingSource, occurrence });
    headingIndex += 1;
  }
  return { status: "scanned", units };
}

/** Resolve one complete hierarchy-qualified v3 locator exactly once. */
export function resolveV3DecomposeContentLocator(
  units: readonly V3DecomposeContentUnit[],
  locator: unknown,
  declaredArtifact: string,
): V3DecomposeContentResolution {
  const parsed = V3DecomposeLocatorSchema.safeParse(locator);
  if (!parsed.success) {
    return {
      status: "rejected",
      reason: "content locator is invalid.",
      code: "source-locator",
      locus: declaredArtifact,
    };
  }
  const sourceLocus = `${declaredArtifact}#${canonicalize(parsed.data)}`;
  if (!isArtifactBasename(declaredArtifact) || parsed.data.artifact !== declaredArtifact) {
    return {
      status: "rejected",
      reason: "content locator artifact does not match the declared target artifact.",
      code: "source-locator",
      locus: sourceLocus,
    };
  }
  const encoded = canonicalize(parsed.data);
  const matches = units.filter((candidate) => {
    const candidateLocator = V3DecomposeLocatorSchema.safeParse(candidate.locator);
    return candidateLocator.success && canonicalize(candidateLocator.data) === encoded;
  });
  return matches.length === 1 && matches[0] !== undefined
    ? { status: "resolved", unit: matches[0] }
    : {
        status: "rejected",
        reason: `content locator must resolve exactly once; resolved ${matches.length} times.`,
        code: "source-locator",
        locus: sourceLocus,
      };
}

/**
 * Authenticate one stored source reference against its exact artifact bytes.
 *
 * @param referenceInput - Closed path, locator, stable identity, and separate content binding
 * @param storedBytes - Exact stored blob bytes for the reference's source path
 * @returns The uniquely resolved byte unit, or one deterministic source locus
 */
export function resolveV3DecomposeSourceUnit(
  referenceInput: unknown,
  storedBytes: Uint8Array,
): V3DecomposeContentResolution {
  const parsed = V3DecomposeSourceReferenceSchema.safeParse(referenceInput);
  if (!parsed.success) {
    return {
      status: "rejected",
      reason: "source reference is invalid.",
      code: "source-reference",
    };
  }
  const reference = parsed.data;
  if (reference.sourceId !== v3SourceId({
    sourcePath: reference.sourcePath,
    sourceLocator: reference.sourceLocator,
  })) {
    return {
      status: "rejected",
      reason: "source identity does not match its path and locator.",
      code: "source-id",
      locus: reference.sourcePath,
    };
  }
  const artifact = reference.sourcePath.split("/").at(-1);
  if (artifact === undefined) {
    return {
      status: "rejected",
      reason: "source path has no artifact basename.",
      code: "source-reference",
      locus: reference.sourcePath,
    };
  }
  const scan = scanV3DecomposeContent(artifact, storedBytes);
  if (scan.status === "rejected") {
    return {
      status: "rejected",
      reason: scan.reason,
      code: "source-locator",
      locus: reference.sourcePath,
    };
  }
  const resolved = resolveV3DecomposeContentLocator(scan.units, reference.sourceLocator, artifact);
  if (resolved.status === "rejected") {
    return {
      ...resolved,
      locus: `${reference.sourcePath}#${canonicalize(reference.sourceLocator)}`,
    };
  }
  if (digestBytes(resolved.unit.bytes) !== reference.contentDigest) {
    return {
      status: "rejected",
      reason: "source content digest does not match the resolved stored bytes.",
      code: "source-content",
      locus: `${reference.sourcePath}#${canonicalize(reference.sourceLocator)}`,
    };
  }
  return resolved;
}
