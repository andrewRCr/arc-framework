/**
 * Targeted `USER-INBOX` entry inspection and removal for capture adoption and
 * completion.
 *
 * Manual removal is title-keyed. Completion removal is additionally qualified
 * by the source digest captured at adoption, so a same-title replacement is
 * never deleted. Both are idempotent on absence and targeted — a single entry
 * block is excised and the rest of the file stays byte-stable. The writer
 * mirrors the parser's view of an entry:
 * an H3 managed-entry within `## Errand` / `## Work Unit`, where the section runs
 * to the next `## ` heading or `---` rule. An H3 beyond that boundary is out of
 * the reader's view, so the writer leaves it untouched too.
 *
 * @module
 */

import { matchInboxEntryTitle } from "./parser.js";
import type { CanonicalDigest } from "../kernel/index.js";
import { contentDigest } from "../canonical/content-digest.js";

/** Sections whose H3 children are routable inbox entries. */
const ENTRY_SECTIONS = ["Errand", "Work Unit"];

/** Outcome of a targeted removal. */
export interface RemoveInboxEntryResult {
  /** The file content, with the matched entry excised — unchanged when none matched. */
  content: string;
  /** Whether a matching entry was found and removed. */
  removed: boolean;
}

/** Exact unique entry projection used when adopting a capture into an Errand. */
export interface InspectedInboxEntry {
  title: string;
  sourceDigest: CanonicalDigest;
  executeBound: boolean;
}

interface LocatedInboxEntry {
  start: number;
  end: number;
  title: string;
}

const EXECUTE_BOUND_DISPOSITION = "- _Disposition:_ `execute-bound`";

/** Whether a line ends an entry section or an entry block — the next `## ` heading or `---` rule. */
function isSectionBoundary(line: string): boolean {
  const trimmed = line.trimEnd();
  return trimmed.startsWith("## ") || trimmed === "---";
}

/** Whether a line opens an H3 managed-entry block. */
function isEntryHeading(line: string): boolean {
  return /^###\s/.test(line);
}

/**
 * Yield in-section managed-entry heading lines (and their indices).
 *
 * Shared section-tracking for list and remove so `## ` / `---` / `###` rules stay
 * in one place.
 */
function* entryHeadingLines(
  lines: readonly string[],
): Generator<{ index: number; line: string }> {
  let inEntrySection = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const heading = line.trimEnd().match(/^## (.+)$/);
    if (heading) {
      inEntrySection = ENTRY_SECTIONS.includes((heading[1] ?? "").trim());
      continue;
    }
    if (line.trimEnd() === "---") {
      inEntrySection = false;
      continue;
    }
    if (!inEntrySection || !isEntryHeading(line)) continue;
    yield { index: i, line };
  }
}

function locateInboxEntries(lines: readonly string[]): LocatedInboxEntry[] {
  const headings = [...entryHeadingLines(lines)];
  return headings.map((heading, offset) => {
    const title = matchInboxEntryTitle(heading.line);
    if (title === null) {
      throw new Error(`Malformed USER-INBOX entry heading: ${heading.line.trim()}`);
    }
    let end = heading.index + 1;
    const next = headings[offset + 1];
    while (end < lines.length && end !== next?.index && !isSectionBoundary(lines[end] ?? "")) end++;
    return { start: heading.index, end, title };
  });
}

function executeBoundLineCount(
  lines: readonly string[],
  entry: LocatedInboxEntry,
): number {
  const body = lines.slice(entry.start + 1, entry.end);
  const dispositionIndices = body.flatMap((line, index) => line.startsWith("- _Disposition:_") ? [index] : []);
  const dispatchIndices = body.flatMap((line, index) => line.startsWith("- _Dispatch:_") ? [index] : []);
  if (dispositionIndices.length === 0 && dispatchIndices.length === 0) return 0;
  if (
    dispositionIndices.length !== 1
    || dispatchIndices.length !== 0
    || dispositionIndices[0] !== 1
    || body[0] !== ""
    || body[1] !== EXECUTE_BOUND_DISPOSITION
  ) {
    throw new Error(`Malformed USER-INBOX disposition fields for '${entry.title}'.`);
  }
  return 2;
}

function unboundEntryLines(lines: readonly string[], entry: LocatedInboxEntry): string[] {
  const markLineCount = executeBoundLineCount(lines, entry);
  if (markLineCount === 0) return [...lines.slice(entry.start, entry.end)];
  return [
    ...lines.slice(entry.start, entry.start + 1),
    ...lines.slice(entry.start + 1 + markLineCount, entry.end),
  ];
}

function sourceDigest(lines: readonly string[], entry: LocatedInboxEntry): CanonicalDigest {
  const normalized = unboundEntryLines(lines, entry)
    .join("\n")
    .replaceAll("\r\n", "\n")
    .replace(/\n*$/u, "") + "\n";
  return contentDigest(Buffer.from(normalized, "utf8"));
}

/** Read one unique entry's exact source generation and execute-bound state. */
export function inspectInboxEntry(content: string, title: string): InspectedInboxEntry {
  const normalizedTitle = title.trim();
  const lines = content.split("\n");
  const matches = locateInboxEntries(lines).filter((entry) => entry.title === normalizedTitle);
  if (matches.length !== 1) {
    throw new Error(matches.length === 0
      ? `Missing USER-INBOX entry '${normalizedTitle}'.`
      : `Duplicate USER-INBOX entry title '${normalizedTitle}'.`);
  }
  const entry = matches[0] as LocatedInboxEntry;
  return {
    title: entry.title,
    sourceDigest: sourceDigest(lines, entry),
    executeBound: executeBoundLineCount(lines, entry) > 0,
  };
}

/**
 * List bold titles of managed entries under `## Errand` and `## Work Unit`.
 *
 * @param content - The `USER-INBOX` file's full text.
 * @returns Entry titles in document order (duplicates preserved if present).
 */
export function listInboxEntryTitles(content: string): string[] {
  const titles: string[] = [];
  for (const { line } of entryHeadingLines(content.split("\n"))) {
    const title = matchInboxEntryTitle(line);
    if (title !== null) titles.push(title);
  }
  return titles;
}

/**
 * Resolve `title` against live managed entries, preferring an exact match then
 * a trim match. Throws when no live capture matches.
 *
 * @param content - The `USER-INBOX` file's full text.
 * @param title - Operand title (may still carry outer whitespace).
 * @returns The live title string to use as the origin back-pointer.
 */
export function requireLiveInboxTitle(content: string, title: string): string {
  const liveTitles = listInboxEntryTitles(content);
  const match = liveTitles.find((entry) => entry === title || entry === title.trim());
  if (match === undefined) {
    throw new Error(
      `No live USER-INBOX capture titled '${title.trim()}'. `
      + "Pass the inner bold title (not the full H3 heading line).",
    );
  }
  return match;
}

/**
 * Remove the title-matched H3 entry from a `USER-INBOX` file.
 *
 * Scans the `## Errand` and `## Work Unit` sections for the first entry whose bold
 * title equals `title` (whitespace-trimmed on both sides), then excises that
 * block — its heading through the blank lines before the next entry or the
 * section boundary. Siblings and every other line stay byte-identical. When no
 * entry matches, the content is returned unchanged.
 *
 * @param content - The `USER-INBOX` file's full text.
 * @param title - The entry's bold title (the interim slug key).
 * @returns The (possibly unchanged) content and whether a removal occurred.
 */
export function removeInboxEntry(content: string, title: string): RemoveInboxEntryResult {
  return removeInboxEntryGeneration(content, title);
}

/**
 * Remove only the exact inbox generation captured during adoption.
 *
 * @param content - The `USER-INBOX` file's full text.
 * @param entry - Adopted title and source digest.
 * @returns The targeted removal result; absence is an idempotent no-op.
 */
export function removeInspectedInboxEntry(
  content: string,
  entry: Pick<InspectedInboxEntry, "title" | "sourceDigest">,
): RemoveInboxEntryResult {
  return removeInboxEntryGeneration(content, entry.title, entry.sourceDigest);
}

function removeInboxEntryGeneration(
  content: string,
  title: string,
  expectedSourceDigest?: CanonicalDigest,
): RemoveInboxEntryResult {
  const target = title.trim();
  const lines = content.split("\n");

  if (expectedSourceDigest !== undefined) {
    const matches = locateInboxEntries(lines).filter((entry) => entry.title === target);
    if (matches.length === 0) return { content, removed: false };
    if (matches.length !== 1) throw new Error(`Duplicate USER-INBOX entry title '${target}'.`);
    const entry = matches[0] as LocatedInboxEntry;
    if (sourceDigest(lines, entry) !== expectedSourceDigest) {
      throw new Error(`USER-INBOX source digest changed for '${target}'.`);
    }
    const kept = [...lines.slice(0, entry.start), ...lines.slice(entry.end)];
    return { content: kept.join("\n"), removed: true };
  }

  for (const { index: i, line } of entryHeadingLines(lines)) {
    if (matchInboxEntryTitle(line) !== target) continue;

    // Excise [heading .. next entry / section boundary), absorbing the block's
    // trailing blank lines so no doubled blank is left behind.
    let end = i + 1;
    while (end < lines.length && !isEntryHeading(lines[end] ?? "") && !isSectionBoundary(lines[end] ?? "")) {
      end++;
    }
    const kept = [...lines.slice(0, i), ...lines.slice(end)];
    return { content: kept.join("\n"), removed: true };
  }

  return { content, removed: false };
}
