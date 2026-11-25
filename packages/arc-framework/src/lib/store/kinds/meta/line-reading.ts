/** Exact core-table cells and bullet extents shared by meta parsing and writers. */
import { CORE_FIELD_NAMES } from "./projection.js";

/** A core-block separator row, e.g. `| ---- | --- | ------ |`. */
const TABLE_SEPARATOR_RE = /^\|(?:\s*:?-+:?\s*\|)+$/;

/** One source line with its exact content span and line ending. */
export interface MetaSourceLine {
  readonly text: string;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly lineEnding: string;
}

/** Exact source span and decoded values for the managed three-row meta table. */
export interface MetaCoreTableLocation {
  readonly startOffset: number;
  readonly endOffset: number;
  readonly lineEndings: readonly [string, string, string];
  readonly values: ReadonlyMap<string, string>;
  readonly renderedValues: ReadonlyMap<string, string>;
}

function sourceLines(content: string): MetaSourceLine[] {
  const lines: MetaSourceLine[] = [];
  const endings = /\r\n|\n|\r/gu;
  let startOffset = 0;
  for (const match of content.matchAll(endings)) {
    const endOffset = match.index;
    const lineEnding = match[0];
    lines.push({
      text: content.slice(startOffset, endOffset),
      startOffset,
      endOffset: endOffset + lineEnding.length,
      lineEnding,
    });
    startOffset = endOffset + lineEnding.length;
  }
  if (startOffset < content.length) {
    lines.push({ text: content.slice(startOffset), startOffset, endOffset: content.length, lineEnding: "" });
  }
  return lines;
}

/** Exact line anchors for a metadata field block. */
export interface MetaFieldBlockLocation {
  readonly lines: readonly MetaSourceLine[];
  readonly h1Index: number;
  readonly closingIndex: number;
  readonly fieldEndIndex: number;
}

/** Require the H1 and closing rule that delimit metadata edits.
 * @param content - Complete metadata Markdown.
 * @returns Source lines and the two field-block anchors.
 * @throws When the H1 or its closing rule is missing.
 */
export function locateMetaFieldBlock(content: string): MetaFieldBlockLocation {
  const lines = sourceLines(content);
  const h1Index = lines.findIndex(({ text }) => /^# /u.test(text));
  if (h1Index === -1) throw new Error("Cannot edit metadata: missing H1 field-block anchor.");
  const closingIndex = lines.findIndex(({ text }, index) => index > h1Index && text.trim() === "---");
  if (closingIndex === -1) throw new Error("Cannot edit metadata: missing closing `---` field-block anchor.");
  const sectionIndex = lines.findIndex(({ text }, index) => index > h1Index && index < closingIndex && /^## /u.test(text));
  return { lines, h1Index, closingIndex, fieldEndIndex: sectionIndex === -1 ? closingIndex : sectionIndex };
}

function isTableRow(line: MetaSourceLine | undefined): line is MetaSourceLine {
  if (line === undefined) return false;
  const trimmed = line.text.trim();
  return trimmed.startsWith("|") && trimmed.endsWith("|");
}

/** Locate and validate the one managed five-column core table before meta bullets.
 * @param content - Metadata content containing its core table.
 * @returns Exact row extents, line endings, and decoded values.
 */
export function locateMetaCoreTable(content: string): MetaCoreTableLocation {
  const lines = sourceLines(content);
  const firstFieldIndex = lines.findIndex(({ text }) => FIELD_MARKER_RE.test(text));
  const scanLimit = firstFieldIndex === -1 ? lines.length : firstFieldIndex;
  const separatorIndexes = lines
    .slice(0, scanLimit)
    .flatMap(({ text }, index) => TABLE_SEPARATOR_RE.test(text.trim()) ? [index] : []);

  if (separatorIndexes.length === 0) {
    const tableLike = lines.slice(0, scanLimit).some((line) => isTableRow(line));
    throw new Error(
      tableLike
        ? "Malformed meta core-block table: no valid separator row found."
        : "Cannot locate meta core-block table: no table found before managed fields.",
    );
  }
  if (separatorIndexes.length > 1) {
    throw new Error("Cannot locate meta core-block table: duplicate tables found before managed fields.");
  }

  const separatorIndex = separatorIndexes[0] ?? -1;
  const header = lines[separatorIndex - 1];
  const separator = lines[separatorIndex];
  const value = lines[separatorIndex + 1];
  if (!isTableRow(header) || !isTableRow(separator) || !isTableRow(value)) {
    throw new Error("Malformed meta core-block table: expected adjacent header, separator, and value rows.");
  }
  if (isTableRow(lines[separatorIndex - 2]) || isTableRow(lines[separatorIndex + 2])) {
    throw new Error("Malformed meta core-block table: expected exactly three rows.");
  }

  const headers = splitTableRow(header.text).map(stripHeaderLabel);
  if (!isCoreTableHeader(headers)) {
    throw new Error("Cannot locate meta core-block table: five-column header not recognized.");
  }
  const separators = splitTableRow(separator.text);
  const cells = splitTableRow(value.text);
  if (headers.length !== separators.length || headers.length !== cells.length) {
    throw new Error(
      `Malformed meta core-block table: column-count mismatch ` +
        `(header ${headers.length}, separator ${separators.length}, value ${cells.length}).`,
    );
  }

  const values = new Map<string, string>();
  const renderedValues = new Map<string, string>();
  headers.forEach((headerName, index) => {
    const rendered = cells[index] ?? "";
    const normalized = normalizeValue(rendered);
    if (normalized === null) {
      throw new Error(`Malformed meta core-block table: \`${headerName}\` has no value.`);
    }
    values.set(headerName, normalized);
    renderedValues.set(headerName, rendered);
  });
  return {
    startOffset: header.startOffset,
    endOffset: value.endOffset,
    lineEndings: [header.lineEnding, separator.lineEnding, value.lineEnding],
    values,
    renderedValues,
  };
}

/** Split a `| a | b | c |` row into trimmed cell strings. */
function splitTableRow(line: string): string[] {
  const inner = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return inner.split("|").map((cell) => cell.trim());
}

/** Strip surrounding bold markers from a header cell, tolerating plain headers
 *  (the render emits `**State**`; a legacy / hand-edited table may carry `State`). */
function stripHeaderLabel(cell: string): string {
  const m = /^\*\*(.*)\*\*$/.exec(cell.trim());
  return m ? (m[1] ?? "").trim() : cell.trim();
}

/** Strip a cell/bullet value to bare form: backticks removed, bracket sentinels
 *  preserved, empty → `null`. */
function normalizeValue(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  return stripInlineCode(trimmed);
}

/**
 * Recover the core-block fields from the single-row markdown table, keyed by
 * header label so column order is tolerated. Returns `null` when the section
 * carries no recognizable core table — the metadata parser refuses that
 * absence. A table that is *present but
 * malformed* inside the core block (a separator row without an adjacent
 * header/value row, or a column-count mismatch across the three rows) throws:
 * structural drift fails loud, never silent-null. Narrative tables below the
 * managed bullet fields are ignored.
 * @param section - H1-bounded metadata region.
 * @returns Decoded core cells, or absence when no core table is present.
 */
export function parseCoreTable(section: string): Record<string, string | null> | null {
  const lines = section.split("\n");
  const firstFieldIdx = lines.findIndex((line) => FIELD_MARKER_RE.test(line));
  const scanLimit = firstFieldIdx === -1 ? lines.length : firstFieldIdx;
  const sepIdx = lines.findIndex(
    (line, i) => i < scanLimit && TABLE_SEPARATOR_RE.test(line.trim()),
  );
  if (sepIdx === -1) return null;

  const headerLine = lines[sepIdx - 1];
  const separatorLine = lines[sepIdx];
  const valueLine = lines[sepIdx + 1];
  const isRow = (line: string | undefined): line is string =>
    line !== undefined && line.trim().startsWith("|");
  if (!isRow(headerLine) || !isRow(separatorLine) || !isRow(valueLine)) {
    throw new Error(
      "Malformed meta core-block table: separator row without an adjacent header and value row.",
    );
  }
  const headers = splitTableRow(headerLine).map(stripHeaderLabel);
  if (!isCoreTableHeader(headers)) return null;
  const separators = splitTableRow(separatorLine);
  const cells = splitTableRow(valueLine);
  if (headers.length !== separators.length || headers.length !== cells.length) {
    throw new Error(
      `Malformed meta core-block table: column-count mismatch ` +
        `(header ${headers.length}, separator ${separators.length}, value ${cells.length}).`,
    );
  }
  const out: Record<string, string | null> = {};
  headers.forEach((header, i) => {
    const cell = cells[i];
    out[header] = cell === undefined ? null : normalizeValue(cell);
  });
  return out;
}

function isCoreTableHeader(headers: readonly string[]): boolean {
  return (
    headers.length === CORE_FIELD_NAMES.length &&
    CORE_FIELD_NAMES.every((field) => headers.includes(field))
  );
}


/** Match one managed field marker.
 * @param name - Field label.
 * @returns The escaped marker expression.
 */
export function bulletMarkerRe(name: string): RegExp {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^[ \\t>*+-]*\\*\\*${escaped}:\\*\\*`);
}

/** Any managed `**Label:**` field marker (bullet, bare, or blockquoted) — the
 *  boundary that ends a preceding field's multi-line value gather. */
export const FIELD_MARKER_RE = /^[ \t>*+-]*\*\*[^*]+:\*\*/;

/**
 * Extract a field's full value from the metadata section, label line plus any
 * indented continuation lines that wrap the same bullet. Continuations are
 * gathered until a blank line, the next field marker, a heading, a `---` rule,
 * or end-of-section; each is stripped of its leading indent and joined with
 * `\n`, so a multi-line narrative value (e.g. a wrapped `Next Action`) recovers
 * in full. The value is returned **raw** — inline code spans are preserved here;
 * {@link parseMetaRecord} strips them per `valueClass` (token fields only), so
 * narrative prose keeps its backticks. A field whose marker is absent, or whose
 * value is empty, returns `null`.
 * @param content - Metadata region to inspect.
 * @param label - Exact managed field label.
 * @returns The authored value or absence.
 */
export function extractField(content: string, label: string): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const labelRe = new RegExp(`^[ \\t>*+-]*\\*\\*${escaped}:\\*\\*[ \\t]*(.*)$`);
  const lines = content.split(/\r?\n/u);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    const m = labelRe.exec(line);
    if (!m) continue;
    const parts: string[] = [];
    const first = (m[1] ?? "").trim();
    if (first !== "") parts.push(first);
    for (const continuation of lines.slice(i + 1)) {
      if (continuation.trim() === "") break; // blank → field / group boundary
      if (FIELD_MARKER_RE.test(continuation)) break; // next field bullet
      if (/^#{1,6} /.test(continuation)) break; // heading
      if (continuation.trim() === "---") break; // trailing rule
      if (!/^\s/.test(continuation)) break; // continuations are indented under the bullet
      parts.push(continuation.trim());
    }
    return parts.length === 0 ? null : parts.join("\n");
  }
  return null;
}

/**
 * Strip `backtick` code spans to their bare token, leaving surrounding prose
 * intact. Applied to token fields (`enum` / `identifier`) so consumers read a
 * bare value (`feat/x`, not `` `feat/x` ``); narrative fields bypass it to keep
 * their authored code spans. Exported for the one consumer that token-matches a
 * narrative field ({@link inferSessionType} on `Next Action`).
 * @param value - Authored Markdown token text.
 * @returns The text with code span backticks removed.
 */
export function stripInlineCode(value: string): string {
  return value.replace(/`([^`]+)`/g, "$1");
}

/**
 * Read each occurrence of a metadata section over the whole document.
 * A section inside the managed field block ends at its closing rule; elsewhere
 * a rule is prose. Level-two headings delimit bodies even inside code fences.
 * @param content - Complete metadata Markdown.
 * @param heading - Exact level-two heading text without its marker.
 * @returns Trimmed bodies in file order, including empty present bodies.
 */
export function readMetaSectionBodies(content: string, heading: string): string[] {
  const lines = content.split(/\r?\n/u);
  const h1 = lines.findIndex((line) => /^# /u.test(line));
  const closing = lines.findIndex((line, index) => index > h1 && line.trim() === "---");
  const bodies: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index] !== `## ${heading}`) continue;
    const insideFieldBlock = h1 >= 0 && index > h1 && index < closing;
    const end = lines.findIndex((line, cursor) => cursor > index
      && (/^## /u.test(line) || (insideFieldBlock && cursor === closing)));
    bodies.push(lines.slice(index + 1, end < 0 ? lines.length : end).join("\n").trim());
  }
  return bodies;
}

/** Observe structural Pause defects without discarding independently readable metadata.
 * @param content - Complete metadata Markdown.
 * @returns Every section grammar defect; scalar vocabulary is validated separately.
 */
export function inspectMetaPauseStructure(content: string): readonly string[] {
  const bodies = readMetaSectionBodies(content, "Pause");
  if (bodies.length === 0) return [];
  const problems: string[] = bodies.length > 1 ? ["Pause has duplicate sections"] : [];
  for (const body of bodies) problems.push(...pauseBodyProblems(body));
  return problems;
}

function pauseBodyProblems(body: string): string[] {
  const problems: string[] = [];
  const parts = body.split(/^### Resume Notes[ \t]*$/mu);
  if (parts.length > 2) problems.push("Pause has duplicate Resume Notes headings");
  const labels = new Map<string, string>();
  const known = new Set(["Paused By", "Since", "Reason", "Waits On", "Open to Takers"]);
  let current: string | undefined;
  for (const line of (parts[0] ?? "").split("\n")) {
    const match = /^- \*\*([^:]+):\*\*[ \t]*(.*)$/u.exec(line);
    if (match) {
      const label = match[1] ?? "";
      if (!known.has(label)) problems.push(`Pause has unknown label ${label}`);
      if (labels.has(label)) problems.push(`Pause has duplicate label ${label}`);
      labels.set(label, match[2] ?? "");
      current = label;
    } else if (/^ {2}/u.test(line) && (current === "Reason" || current === "Waits On")) {
      continue;
    } else if (line.trim() !== "") {
      problems.push("Pause has unexpected prose outside Resume Notes");
      current = undefined;
    }
  }
  return [...problems, ...pauseLabelProblems(labels)];
}

function pauseLabelProblems(labels: ReadonlyMap<string, string>): string[] {
  const problems: string[] = [];
  for (const required of ["Paused By", "Since", "Reason"]) {
    if (!labels.has(required)) problems.push(`Pause is missing ${required}`);
  }
  for (const coded of ["Paused By", "Since"]) {
    const value = labels.get(coded);
    if (value !== undefined && !/^`[^`]*`$/u.test(value)) problems.push(`Pause ${coded} must be backticked`);
  }
  const open = labels.get("Open to Takers");
  if (open !== undefined && open !== "`true`") problems.push("Pause Open to Takers must be `true` or omitted");
  return problems;
}
