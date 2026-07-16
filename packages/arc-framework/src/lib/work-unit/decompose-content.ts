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

function isTopLevelSetextText(line: string): boolean {
  if (line.trim() === "" || /^ {4}/u.test(line)) return false;
  if (/^ {0,3}(?:>|[-+*](?:[ \t]+|$)|\d+[.)](?:[ \t]+|$))/u.test(line)) return false;
  return openingFence(line) === null && atxH2Source(line) === null && !isSetextH2Underline(line);
}

function openingFence(line: string): { marker: "`" | "~"; length: number } | null {
  const match = /^ {0,3}(`{3,}|~{3,})/u.exec(line);
  if (match?.[1] === undefined) return null;
  const marker = match[1][0];
  if (marker !== "`" && marker !== "~") return null;
  return { marker, length: match[1].length };
}

function closesFence(line: string, fence: { marker: "`" | "~"; length: number }): boolean {
  const escaped = fence.marker === "`" ? "`" : "~";
  return new RegExp(`^ {0,3}${escaped}{${fence.length},}[ \\t]*$`, "u").test(line);
}

function markdownBoundaries(content: string): HeadingBoundary[] {
  const lines = sourceLines(content);
  const headings: HeadingBoundary[] = [];
  const setextTextLines = new Set<number>();
  let fence: { marker: "`" | "~"; length: number } | null = null;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (line === undefined) continue;
    if (fence !== null) {
      if (closesFence(line.body, fence)) fence = null;
      continue;
    }
    const opened = openingFence(line.body);
    if (opened !== null) {
      fence = opened;
      continue;
    }
    const atx = atxH2Source(line.body);
    if (atx !== null) {
      headings.push({ start: line.start, headingSource: atx });
      continue;
    }
    if (isSetextH2Underline(line.body)) {
      if (index === 0 || !setextTextLines.has(index - 1)) continue;
      const previous = lines[index - 1];
      if (previous === undefined) continue;
      headings.push({ start: previous.start, headingSource: normalizeDecomposeHeadingSource(previous.body) });
      continue;
    }
    if (isTopLevelSetextText(line.body)) setextTextLines.add(index);
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
