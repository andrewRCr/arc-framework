/**
 * Per-shape entry parsers for cross-WU flat files.
 *
 * The cross-WU files carry entries in different shapes. `WORKING-MEMORY.md`
 * entries are a bold-field header (`**…:**`) followed by a `_Remove when:_`
 * trigger and a body, all under `## Memories`. `USER-INBOX.md` entries are
 * top-level markdown list items (`- **lead-in** — text`, possibly multi-line)
 * within `## Atomic` / `## Backlog` sections. `ERRANDS.md` entries are H3
 * headings (`### \`[ ]\` **slug**`, an optional checkbox before the bold slug)
 * followed by descriptor bullets, under `## Queue`. Each parser splits a file
 * into entry blocks and returns one discriminated outcome per block: a block
 * that doesn't match its shape becomes `{ ok: false, reason }` instead of being
 * dropped.
 *
 * @module
 */

import type { CrossWuShape, EntryParse } from "./types.js";

/** Bold-field header line: starts with `**`, ends with `:**`. */
const WM_HEADER = /^\*\*.+:\*\*\s*$/;
/** The required removal-trigger line within a WORKING-MEMORY entry (italic via `_` or `*`). */
const WM_REMOVE_WHEN = /^[_*]Remove when:/;
/** A top-level USER-INBOX list item with a bold lead-in. */
const UI_LEAD_IN = /^-\s+\*\*(.+?)\*\*/;
/** An ERRANDS Queue entry boundary — any `###` heading. */
const ERRAND_BOUNDARY = /^###\s/;
/** The bold `<slug>` of an ERRANDS H3 heading, after an optional (backtick-wrapped) checkbox. */
const ERRAND_SLUG = /^###\s+(?:`?\[[ xX]\]`?\s+)?\*\*(.+?)\*\*/;
/** HTML comment block — guidance and shape examples that are not entries. */
const HTML_COMMENT = /<!--[\s\S]*?-->/g;

/** Resolve a filename to its registered parser shape, or `null` when unknown. */
export function shapeForFile(filename: string): CrossWuShape | null {
  const base = filename.split("/").pop() ?? filename;
  if (base === "WORKING-MEMORY.md") return "working-memory";
  if (base === "USER-INBOX.md") return "user-inbox";
  if (base === "ERRANDS.md") return "errands";
  return null;
}

/**
 * Parse a cross-WU file's content into per-entry outcomes.
 *
 * @param content - The file's full text.
 * @param shape - Which entry shape to parse for.
 * @returns One outcome per detected entry block, in document order.
 */
export function parseCrossWuEntries(content: string, shape: CrossWuShape): EntryParse[] {
  // Drop HTML comments first: templates carry commented-out shape examples
  // (an entry header without a real trigger) that would otherwise parse as
  // malformed entries.
  const body = content.replace(HTML_COMMENT, "");
  if (shape === "working-memory") return parseWorkingMemory(body);
  if (shape === "user-inbox") return parseUserInbox(body);
  return parseErrands(body);
}

/**
 * Lines of the `## {heading}` section — between the heading and the next
 * top-level boundary (a following `## ` heading or a `---` rule), exclusive.
 * Empty when the heading is absent.
 */
function sectionLines(content: string, heading: string): string[] {
  const lines = content.split("\n");
  const start = lines.findIndex((line) => line.trimEnd() === `## ${heading}`);
  if (start === -1) return [];

  const body: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const trimmed = line.trimEnd();
    if (trimmed.startsWith("## ") || trimmed === "---") break;
    body.push(line);
  }
  return body;
}

/** Trim leading and trailing blank lines from a block, preserving interior shape. */
function trimBlock(lines: readonly string[]): string {
  return lines.join("\n").replace(/^\n+/, "").replace(/\n+$/, "");
}

function parseWorkingMemory(content: string): EntryParse[] {
  const lines = sectionLines(content, "Memories");
  const out: EntryParse[] = [];

  let block: string[] = [];
  let header: string | null = null;

  const flush = (): void => {
    if (header === null) return;
    const raw = trimBlock(block);
    if (block.some((line) => WM_REMOVE_WHEN.test(line.trim()))) {
      out.push({ ok: true, entry: { section: "Memories", key: header, raw } });
    } else {
      out.push({ ok: false, reason: `WORKING-MEMORY entry missing '_Remove when:_' trigger: ${header}` });
    }
  };

  for (const line of lines) {
    if (WM_HEADER.test(line)) {
      flush();
      header = line.trim();
      block = [line];
    } else if (header !== null) {
      block.push(line);
    }
  }
  flush();
  return out;
}

function parseUserInbox(content: string): EntryParse[] {
  const out: EntryParse[] = [];
  for (const section of ["Atomic", "Backlog"]) {
    parseUserInboxSection(sectionLines(content, section), section, out);
  }
  return out;
}

function parseUserInboxSection(lines: readonly string[], section: string, out: EntryParse[]): void {
  let block: string[] = [];

  const flush = (): void => {
    if (block.length === 0) return;
    const raw = trimBlock(block);
    const leadIn = block[0]?.match(UI_LEAD_IN)?.[1];
    if (leadIn !== undefined) {
      out.push({ ok: true, entry: { section, key: leadIn.trim(), raw } });
    } else {
      out.push({ ok: false, reason: `USER-INBOX ${section} item missing bold lead-in: ${raw.split("\n")[0] ?? ""}` });
    }
    block = [];
  };

  for (const line of lines) {
    if (/^-\s/.test(line)) {
      flush();
      block = [line];
    } else if (block.length > 0) {
      block.push(line);
    }
  }
  flush();
}

/**
 * Parse `ERRANDS.md` Queue entries. Each entry is an `### \`[ ]\` **slug**`
 * heading (the checkbox is optional and may be backtick-wrapped) followed by
 * descriptor bullets, keyed on the bold slug within the single `## Queue`
 * section. An H3 heading with no bold slug surfaces as a failure.
 */
function parseErrands(content: string): EntryParse[] {
  const lines = sectionLines(content, "Queue");
  const out: EntryParse[] = [];

  let block: string[] = [];
  let started = false;

  const flush = (): void => {
    if (!started) return;
    const raw = trimBlock(block);
    const slug = block[0]?.match(ERRAND_SLUG)?.[1];
    if (slug !== undefined) {
      out.push({ ok: true, entry: { section: "Queue", key: slug.trim(), raw } });
    } else {
      out.push({ ok: false, reason: `ERRANDS Queue entry missing bold slug: ${(block[0] ?? "").trim()}` });
    }
    block = [];
  };

  for (const line of lines) {
    if (ERRAND_BOUNDARY.test(line)) {
      flush();
      started = true;
      block = [line];
    } else if (started) {
      block.push(line);
    }
  }
  flush();
  return out;
}
