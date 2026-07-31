/**
 * Pure `USER-INBOX` entry mutation — exact execute-bound marking, unmarking,
 * and completion removal over title/source-digest-qualified preimages.
 *
 * Mutations are **title-keyed**, idempotent on exact replay, and targeted: only
 * selected entry blocks change and every unrelated byte stays stable. The
 * writer mirrors the parser's view of an entry:
 * an H3 managed-entry within `## Errand` / `## Work Unit`, where the section runs
 * to the next `## ` heading or `---` rule. An H3 beyond that boundary is out of
 * the reader's view, so the writer leaves it untouched too.
 *
 * @module
 */

import { matchInboxEntryTitle } from "./parser.js";
import { contentDigest } from "../canonical/content-digest.js";
import type { CanonicalDigest } from "../kernel/canonical/canonical-json.js";

/** Sections whose H3 children are routable inbox entries. */
const ENTRY_SECTIONS = ["Errand", "Work Unit"];

/** Outcome of a targeted removal. */
export interface RemoveInboxEntryResult {
  /** The file content, with the matched entry excised — unchanged when none matched. */
  content: string;
  /** Whether a matching entry was found and removed. */
  removed: boolean;
}

/** One exact entry mutation in a lock-serialized inbox batch. */
export type InboxEntryMutation =
  | { kind: "mark"; title: string; sourceDigest: CanonicalDigest }
  | { kind: "unmark"; title: string; sourceDigest: CanonicalDigest }
  | { kind: "remove"; title: string; sourceDigest: CanonicalDigest };

/** Per-entry disposition from an inbox mutation batch. */
export interface InboxEntryMutationOutcome {
  title: string;
  state: "applied" | "already-applied";
}

/** Exact post-image from an inbox mutation batch. */
export interface MutateInboxEntriesResult {
  content: string;
  digest: CanonicalDigest;
  changed: boolean;
  outcomes: InboxEntryMutationOutcome[];
}

/** Exact unique entry projection used when adopting a capture into an Errand. */
export interface InspectedInboxEntry {
  title: string;
  sourceDigest: CanonicalDigest;
  executeBound: boolean;
}

/** One well-formed capture in the global execute-bound queue. */
export interface ExecuteBoundInboxEntry {
  title: string;
  sourceDigest: CanonicalDigest;
}

interface LocatedInboxEntry {
  start: number;
  end: number;
  title: string;
}

const DISPOSITION_LINE = "- _Disposition:_ `execute-bound`";

/**
 * Locate entries without letting one malformed heading discard the rest.
 *
 * Boundaries come from the complete heading list, so skipping a malformed heading never widens the
 * preceding entry's body.
 */
function locateInboxEntriesResilient(
  lines: readonly string[],
): { entries: LocatedInboxEntry[]; diagnostics: string[] } {
  const headings = [...entryHeadingLines(lines)];
  const entries: LocatedInboxEntry[] = [];
  const diagnostics: string[] = [];
  for (const [offset, heading] of headings.entries()) {
    const title = matchInboxEntryTitle(heading.line);
    let end = heading.index + 1;
    const next = headings[offset + 1];
    while (end < lines.length && end !== next?.index && !isSectionBoundary(lines[end] ?? "")) end++;
    if (title === null) {
      diagnostics.push(`Malformed USER-INBOX entry heading: ${heading.line.trim()}`);
      continue;
    }
    entries.push({ start: heading.index, end, title });
  }
  return { entries, diagnostics };
}

/** Locate entries for mutation, where any malformed heading must abort the whole batch. */
function locateInboxEntries(lines: readonly string[]): LocatedInboxEntry[] {
  const located = locateInboxEntriesResilient(lines);
  const first = located.diagnostics[0];
  if (first !== undefined) throw new Error(first);
  return located.entries;
}

function executeBoundMark(
  lines: readonly string[],
  entry: LocatedInboxEntry,
): { insertedLineCount: number } | null {
  const body = lines.slice(entry.start + 1, entry.end);
  const dispositionIndices = body.flatMap((line, index) => line.startsWith("- _Disposition:_") ? [index] : []);
  const dispatchIndices = body.flatMap((line, index) => line.startsWith("- _Dispatch:_") ? [index] : []);
  if (dispositionIndices.length === 0 && dispatchIndices.length === 0) return null;
  const dispositionIndex = dispositionIndices[0];
  if (
    dispositionIndices.length !== 1
    || dispatchIndices.length !== 0
    || dispositionIndex !== 1
    || body[0] !== ""
    || body[1] !== DISPOSITION_LINE
  ) {
    throw new Error(`Malformed USER-INBOX disposition fields for '${entry.title}'.`);
  }
  return { insertedLineCount: 2 };
}

function unboundEntryLines(lines: readonly string[], entry: LocatedInboxEntry): string[] {
  const mark = executeBoundMark(lines, entry);
  if (mark === null) return [...lines.slice(entry.start, entry.end)];
  return [
    ...lines.slice(entry.start, entry.start + 1),
    ...lines.slice(entry.start + 1 + mark.insertedLineCount, entry.end),
  ];
}

function unboundDigest(lines: readonly string[], entry: LocatedInboxEntry): CanonicalDigest {
  const unbound = unboundEntryLines(lines, entry);
  const normalized = unbound
    .map((line) => line.replace(/\r$/u, ""))
    .join("\n")
    .replace(/\n*$/u, "") + "\n";
  return contentDigest(Buffer.from(normalized, "utf8"));
}

/** Resolve the canonical source digest for one unique, well-formed inbox entry. */
export function inboxEntrySourceDigest(content: string, title: string): CanonicalDigest {
  const lines = content.split("\n");
  const matches = locateInboxEntries(lines).filter((entry) => entry.title === title.trim());
  if (matches.length !== 1) {
    throw new Error(matches.length === 0
      ? `Missing USER-INBOX entry '${title.trim()}'.`
      : `Duplicate USER-INBOX entry title '${title.trim()}'.`);
  }
  return unboundDigest(lines, matches[0] as LocatedInboxEntry);
}

/** Read one unique entry's normalized source digest and execute-bound disposition. */
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
    sourceDigest: unboundDigest(lines, entry),
    executeBound: executeBoundMark(lines, entry) !== null,
  };
}

/** List every well-formed execute-bound capture in file order. */
export interface ExecuteBoundInboxListing {
  /** Well-formed execute-bound entries, in file order. */
  readonly entries: readonly ExecuteBoundInboxEntry[];
  /** One message per entry that could not be read. */
  readonly diagnostics: readonly string[];
}

/**
 * List the visible execute-bound queue, retaining every entry that reads cleanly.
 *
 * A malformed heading or disposition block is reported against that entry alone. Failing the whole
 * read would let one unrelated capture hide every queued sibling from init and recovery guidance.
 *
 * @param content - Complete `USER-INBOX` content.
 * @returns File-ordered entries plus per-entry diagnostics.
 */
export function listExecuteBoundInboxEntries(content: string): ExecuteBoundInboxListing {
  const lines = content.split("\n");
  const located = locateInboxEntriesResilient(lines);
  const entries: ExecuteBoundInboxEntry[] = [];
  const diagnostics = [...located.diagnostics];
  for (const entry of located.entries) {
    try {
      if (executeBoundMark(lines, entry) !== null) {
        entries.push({ title: entry.title, sourceDigest: unboundDigest(lines, entry) });
      }
    } catch (error) {
      diagnostics.push(error instanceof Error ? error.message : String(error));
    }
  }
  return { entries, diagnostics };
}

/** Apply one all-or-nothing title/digest-qualified inbox mutation batch. */
export function mutateInboxEntries(
  content: string,
  mutations: readonly InboxEntryMutation[],
): MutateInboxEntriesResult {
  const titles = mutations.map((mutation) => mutation.title.trim());
  if (new Set(titles).size !== titles.length) throw new Error("Duplicate USER-INBOX mutation title.");
  const lines = content.split("\n");
  const entries = locateInboxEntries(lines);
  const actions: Array<{
    entry: LocatedInboxEntry;
    mutation: InboxEntryMutation;
    mark: ReturnType<typeof executeBoundMark>;
  }> = [];
  const outcomes: InboxEntryMutationOutcome[] = [];

  for (const mutation of mutations) {
    const title = mutation.title.trim();
    const matches = entries.filter((entry) => entry.title === title);
    if (matches.length === 0) {
      if (mutation.kind === "remove") {
        outcomes.push({ title, state: "already-applied" });
        continue;
      }
      throw new Error(`Missing USER-INBOX entry '${title}'.`);
    }
    if (matches.length !== 1) throw new Error(`Duplicate USER-INBOX entry title '${title}'.`);
    const entry = matches[0] as LocatedInboxEntry;
    const mark = executeBoundMark(lines, entry);
    if (unboundDigest(lines, entry) !== mutation.sourceDigest) {
      throw new Error(`USER-INBOX source digest changed for '${title}'.`);
    }
    if (mutation.kind === "mark") {
      if (mark !== null) {
        outcomes.push({ title, state: "already-applied" });
        continue;
      }
    } else if (mutation.kind === "unmark") {
      if (mark === null) {
        outcomes.push({ title, state: "already-applied" });
        continue;
      }
    }
    actions.push({ entry, mutation, mark });
    outcomes.push({ title, state: "applied" });
  }

  for (const { entry, mutation, mark } of actions.sort((left, right) => right.entry.start - left.entry.start)) {
    if (mutation.kind === "mark") {
      lines.splice(entry.start + 1, 0, "", DISPOSITION_LINE);
    } else if (mutation.kind === "unmark") {
      lines.splice(entry.start + 1, mark?.insertedLineCount ?? 0);
    } else {
      lines.splice(entry.start, entry.end - entry.start);
    }
  }

  const postImage = lines.join("\n");
  return {
    content: postImage,
    digest: contentDigest(Buffer.from(postImage, "utf8")),
    changed: actions.length > 0,
    outcomes,
  };
}

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
    if (unboundDigest(lines, entry) !== expectedSourceDigest) {
      throw new Error(`USER-INBOX source digest changed for '${target}'.`);
    }
    const kept = [...lines.slice(0, entry.start), ...lines.slice(entry.end)];
    return { content: kept.join("\n"), removed: true };
  }

  const entry = locateInboxEntries(lines).find((candidate) => candidate.title === target);
  if (entry === undefined) return { content, removed: false };
  const kept = [...lines.slice(0, entry.start), ...lines.slice(entry.end)];
  return { content: kept.join("\n"), removed: true };
}
