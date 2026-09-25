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
import { managedFieldValue } from "../session-init/managed-field.js";

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

/** Stable conflict kinds raised when an exact inbox generation cannot be mutated safely. */
export type InboxMutationConflictCode = "duplicate-entry-title" | "source-digest-changed";

/** A recoverable conflict between the requested mutation and the live inbox generation. */
export class InboxMutationConflictError extends Error {
  readonly name = "InboxMutationConflictError";

  constructor(
    readonly code: InboxMutationConflictCode,
    message: string,
  ) {
    super(message);
  }
}

interface LocatedInboxEntry {
  start: number;
  end: number;
  title: string;
  section: string;
}

const DISPOSITION_LINE = "- _Disposition:_ `execute-bound`";

function withoutTrailingCarriageReturn(line: string): string {
  return line.replace(/\r$/u, "");
}

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
    entries.push({ start: heading.index, end, title, section: heading.section });
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

/** The `_Key:_` an entry-body descriptor line declares, or null when the line declares none. */
function descriptorKey(line: string | undefined): string | null {
  return /^- (_[^_]+:_)/u.exec(line ?? "")?.[1] ?? null;
}

function managedDescriptorValue(line: string, field: string): string | undefined {
  const value = withoutTrailingCarriageReturn(line);
  return descriptorKey(value) === `_${field}:_` ? managedFieldValue(value, field) : undefined;
}

/** Render one body line for a diagnostic, bounding an arbitrarily long descriptor. */
function describeLine(line: string | undefined): string {
  if (line === undefined) return "nothing";
  const trimmed = line.trim();
  if (trimmed === "") return "a blank line";
  return `'${trimmed.length > 60 ? `${trimmed.slice(0, 57)}...` : trimmed}'`;
}

/**
 * Name the single grammar rule an entry's disposition block violates.
 *
 * The caller has already established that the block is non-empty and malformed; this only decides
 * which rule to report. Each branch names the offending descriptor and the correction, because the
 * bare state is not actionable from the refusal alone.
 *
 * @param body - Entry body lines, excluding the heading.
 * @param dispositionIndices - Body indices of every `- _Disposition:_` line.
 * @param dispatchIndices - Body indices of every `- _Dispatch:_` line.
 * @returns One sentence naming the violated rule and its correction.
 */
function dispositionDefect(
  body: readonly string[],
  dispositionIndices: readonly number[],
  dispatchIndices: readonly number[],
): string {
  if (dispositionIndices.length > 1) {
    return `'_Disposition:_' appears ${dispositionIndices.length} times at body lines `
      + `${dispositionIndices.join(", ")}; keep exactly one`;
  }
  if (dispatchIndices.length !== 0) {
    return dispositionIndices.length === 0
      ? `'_Dispatch:_' at body line ${dispatchIndices[0]} is a retired field with no '_Disposition:_'; `
        + `replace it with ${DISPOSITION_LINE}`
      : `'_Dispatch:_' at body line ${dispatchIndices[0]} cannot accompany '_Disposition:_'; remove it`;
  }
  if (body[0] !== "") {
    return `the heading must be followed by one blank line, but body line 0 is ${describeLine(body[0])}`;
  }
  const dispositionIndex = dispositionIndices[0] as number;
  if (dispositionIndex !== 1) {
    const displacing = descriptorKey(body[1]);
    return displacing === null
      ? `'_Disposition:_' must be the first descriptor, at body line 1, but sits at line ${dispositionIndex} `
        + `behind ${describeLine(body[1])}`
      : `descriptor '${displacing}' precedes '_Disposition:_' at body line 1; `
        + `move '${displacing}' after the disposition`;
  }
  return `'_Disposition:_' must read exactly ${DISPOSITION_LINE}, but body line 1 is ${describeLine(body[1])}`;
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
    throw new Error(
      `Malformed USER-INBOX disposition fields for '${entry.title}': `
      + `${dispositionDefect(body, dispositionIndices, dispatchIndices)}.`,
    );
  }
  return { insertedLineCount: 2 };
}

/** Remove the retain envelope that an execute-bound disposition supersedes. */
function normalizeRetainedEntryForExecution(block: readonly string[]): string[] {
  if (!block.some((line) => managedDescriptorValue(line, "Hold") === "true")) return [...block];
  const preserveCreated = block.some((line) => managedDescriptorValue(line, "Remind") === "true");
  const normalized = block.filter((line) =>
    managedDescriptorValue(line, "Hold") !== "true"
    && (preserveCreated || managedDescriptorValue(line, "Created") === undefined));
  if (
    !preserveCreated
    && withoutTrailingCarriageReturn(normalized[1] ?? "") === ""
    && withoutTrailingCarriageReturn(normalized[2] ?? "") === ""
  ) {
    normalized.splice(2, 1);
  }
  return normalized;
}

/** Whether one parsed inbox entry carries the canonical execute-bound disposition. */
export function hasExecuteBoundDisposition(raw: string): boolean {
  const lines = raw.split("\n");
  const title = matchInboxEntryTitle(lines[0] ?? "");
  if (title === null) return false;
  try {
    return executeBoundMark(lines, { start: 0, end: lines.length, title, section: "Errand" }) !== null;
  } catch {
    return false;
  }
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
  const unbound = normalizeRetainedEntryForExecution(unboundEntryLines(lines, entry));
  const normalized = unbound
    .map(withoutTrailingCarriageReturn)
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

/**
 * Mark one complete execute-bound Errand queue and arrange it in the requested order.
 *
 * Selected entry blocks exchange only their existing physical slots, so unrelated entries and
 * section prose remain byte-stable. Every already-marked entry must be named: otherwise the
 * requested order would not describe the complete queue that readers actually observe.
 *
 * @param content - Complete `USER-INBOX` content.
 * @param orderedTitles - Exact Errand titles in their final execution order.
 * @returns The exact post-image and per-entry mark outcomes.
 */
export function markInboxEntriesExecuteBoundInOrder(
  content: string,
  orderedTitles: readonly string[],
): MutateInboxEntriesResult {
  const titles = orderedTitles.map((title) => title.trim());
  if (titles.length === 0 || titles.some((title) => title === "")) {
    throw new Error("Execute-bound order must contain at least one non-empty USER-INBOX title.");
  }
  if (new Set(titles).size !== titles.length) {
    throw new Error("Duplicate USER-INBOX title in execute-bound order.");
  }

  const lines = content.split("\n");
  const entries = locateInboxEntries(lines);
  const selected = titles.map((title) => {
    const matches = entries.filter((entry) => entry.title === title);
    if (matches.length !== 1) {
      throw new Error(matches.length === 0
        ? `Missing USER-INBOX entry '${title}'.`
        : `Duplicate USER-INBOX entry title '${title}'.`);
    }
    const entry = matches[0] as LocatedInboxEntry;
    if (entry.section !== "Errand") {
      throw new Error(`USER-INBOX entry '${title}' is not in the Errand section.`);
    }
    return entry;
  });

  const requested = new Set(titles);
  const existingQueue = listExecuteBoundInboxEntries(content);
  const unreadable = existingQueue.diagnostics[0];
  if (unreadable !== undefined) throw new Error(unreadable);
  const omitted = existingQueue.entries.find((entry) => !requested.has(entry.title));
  if (omitted !== undefined) {
    throw new Error(`Existing execute-bound USER-INBOX entry '${omitted.title}' is absent from the requested order.`);
  }

  const marked = mutateInboxEntries(content, selected.map((entry) => ({
    kind: "mark" as const,
    title: entry.title,
    sourceDigest: unboundDigest(lines, entry),
  })));
  const markedLines = marked.content.split("\n");
  const markedEntries = locateInboxEntries(markedLines);
  const slots = markedEntries
    .filter((entry) => requested.has(entry.title))
    .sort((left, right) => left.start - right.start);
  const blocks = titles.map((title) => {
    const entry = markedEntries.find((candidate) => candidate.title === title) as LocatedInboxEntry;
    return markedLines.slice(entry.start, entry.end);
  });
  const reordered = [...markedLines];
  for (let index = slots.length - 1; index >= 0; index--) {
    const slot = slots[index] as LocatedInboxEntry;
    reordered.splice(slot.start, slot.end - slot.start, ...(blocks[index] as string[]));
  }
  const postImage = reordered.join("\n");
  return {
    ...marked,
    content: postImage,
    digest: contentDigest(Buffer.from(postImage, "utf8")),
    changed: marked.changed || postImage !== marked.content,
  };
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
    if (matches.length !== 1) {
      throw new InboxMutationConflictError(
        "duplicate-entry-title",
        `Duplicate USER-INBOX entry title '${title}'.`,
      );
    }
    const entry = matches[0] as LocatedInboxEntry;
    const mark = executeBoundMark(lines, entry);
    if (unboundDigest(lines, entry) !== mutation.sourceDigest) {
      throw new InboxMutationConflictError(
        "source-digest-changed",
        `USER-INBOX source digest changed for '${title}'.`,
      );
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
      const normalized = normalizeRetainedEntryForExecution(lines.slice(entry.start, entry.end));
      normalized.splice(1, 0, "", DISPOSITION_LINE);
      lines.splice(entry.start, entry.end - entry.start, ...normalized);
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
): Generator<{ index: number; line: string; section: string }> {
  let entrySection: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const heading = line.trimEnd().match(/^## (.+)$/);
    if (heading) {
      const section = (heading[1] ?? "").trim();
      entrySection = ENTRY_SECTIONS.includes(section) ? section : null;
      continue;
    }
    if (line.trimEnd() === "---") {
      entrySection = null;
      continue;
    }
    if (entrySection === null || !isEntryHeading(line)) continue;
    yield { index: i, line, section: entrySection };
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
