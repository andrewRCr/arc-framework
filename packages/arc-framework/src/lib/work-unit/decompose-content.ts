/** Deterministic source-unit scanning and locator resolution for decompose. */

import type { DecomposeContentLocator } from "./decompose-cut-map.js";
import { normalizeDecomposeHeadingSource } from "./decompose-heading.js";

export { normalizeDecomposeHeadingSource } from "./decompose-heading.js";

/** One exact allocatable unit from an authored companion. */
export interface DecomposeContentUnit {
  locator: DecomposeContentLocator;
  content: string;
  bytes: Uint8Array;
}

export type DecomposeContentScanResult =
  | { status: "scanned"; units: DecomposeContentUnit[] }
  | { status: "rejected"; reason: string };

export type DecomposeContentResolution =
  | { status: "resolved"; unit: DecomposeContentUnit }
  | { status: "rejected"; reason: string };

interface SourceLine {
  start: number;
  end: number;
  body: string;
}

interface HeadingBoundary {
  start: number;
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

function atxH2Source(line: string): string | null {
  const match = /^ {0,3}##(?:[ \t]+(.*)|[ \t]*)$/u.exec(line);
  if (match === null) return null;
  const withoutClosing = (match[1] ?? "").replace(/[ \t]+#+[ \t]*$/u, "");
  return normalizeDecomposeHeadingSource(withoutClosing);
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

function markdownBoundaries(content: string): HeadingBoundary[] {
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
    const atx = atxH2Source(line.body);
    if (atx !== null) {
      if (container?.kind === "list" && leadingSpaces(line.body) >= container.contentIndent) {
        paragraph = [];
        continue;
      }
      container = null;
      paragraph = [];
      headings.push({ start: line.start, headingSource: atx });
      continue;
    }
    if (isSetextH2Underline(line.body)) {
      const first = paragraph[0];
      if (first !== undefined) {
        headings.push({
          start: first.start,
          headingSource: normalizeDecomposeHeadingSource(paragraph.map((part) => part.body).join("\n")),
        });
      }
      paragraph = [];
      continue;
    }
    if (isSetextH1Underline(line.body) && paragraph.length > 0) {
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

function unit(
  content: string,
  start: number,
  end: number,
  locator: DecomposeContentLocator,
): DecomposeContentUnit {
  const source = content.slice(start, end);
  return { locator, content: source, bytes: new TextEncoder().encode(source) };
}

/**
 * Scan one companion into fixed Markdown preamble/section units or one
 * non-Markdown whole-file unit.
 */
export function scanDecomposeContent(artifact: string, bytes: Uint8Array): DecomposeContentScanResult {
  if (!isArtifactBasename(artifact)) {
    return { status: "rejected", reason: "decompose content artifact must be a slash-free NFC basename." };
  }
  const markdown = artifact.toLowerCase().endsWith(".md");
  let content: string;
  try {
    content = new TextDecoder("utf-8", { fatal: markdown }).decode(bytes);
  } catch {
    return { status: "rejected", reason: `Markdown artifact \`${artifact}\` is not valid UTF-8.` };
  }
  if (!markdown) {
    return {
      status: "scanned",
      units: [{ locator: { artifact, kind: "whole-file" }, content, bytes: new Uint8Array(bytes) }],
    };
  }

  const headings = markdownBoundaries(content);
  if (headings.length === 0) {
    return { status: "scanned", units: [unit(content, 0, content.length, { artifact, kind: "preamble" })] };
  }
  const firstHeading = headings[0];
  if (firstHeading === undefined) throw new Error("unreachable empty heading set");
  const units: DecomposeContentUnit[] = [unit(content, 0, firstHeading.start, { artifact, kind: "preamble" })];
  const occurrences = new Map<string, number>();
  for (let index = 0; index < headings.length; index++) {
    const heading = headings[index];
    if (heading === undefined) continue;
    const occurrence = occurrences.get(heading.headingSource) ?? 0;
    occurrences.set(heading.headingSource, occurrence + 1);
    units.push(
      unit(content, heading.start, headings[index + 1]?.start ?? content.length, {
        artifact,
        kind: "section",
        headingSource: heading.headingSource,
        occurrence,
      }),
    );
  }
  return { status: "scanned", units };
}

function locatorRefusal(locator: DecomposeContentLocator, declaredArtifact: string): string | null {
  if (!isArtifactBasename(declaredArtifact) || locator.artifact !== declaredArtifact) {
    return "content locator artifact does not match the declared target artifact.";
  }
  if (locator.kind === "section") {
    if (!Number.isInteger(locator.occurrence) || locator.occurrence < 0) {
      return "content locator occurrence must be a non-negative integer.";
    }
    if (normalizeDecomposeHeadingSource(locator.headingSource) !== locator.headingSource) {
      return "content locator headingSource is not normalized.";
    }
  }
  return null;
}

/** Resolve a locator against exactly one scanned companion unit. */
export function resolveDecomposeContentLocator(
  units: readonly DecomposeContentUnit[],
  locator: DecomposeContentLocator,
  declaredArtifact: string,
): DecomposeContentResolution {
  const refusal = locatorRefusal(locator, declaredArtifact);
  if (refusal !== null) return { status: "rejected", reason: refusal };
  const matches = units.filter((candidate) => {
    if (candidate.locator.artifact !== locator.artifact || candidate.locator.kind !== locator.kind) return false;
    if (candidate.locator.kind !== "section" || locator.kind !== "section") return true;
    return candidate.locator.headingSource === locator.headingSource
      && candidate.locator.occurrence === locator.occurrence;
  });
  if (matches.length !== 1) {
    return { status: "rejected", reason: `content locator must resolve exactly once; resolved ${matches.length} times.` };
  }
  const resolved = matches[0];
  if (resolved === undefined) return { status: "rejected", reason: "content locator did not resolve." };
  return { status: "resolved", unit: resolved };
}
