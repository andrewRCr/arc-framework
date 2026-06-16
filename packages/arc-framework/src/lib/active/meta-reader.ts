/**
 * Reader for `arc active status` — scans `.arc/active/` for meta files,
 * detects Full vs Lite layout, and parses per-WU fields into structured
 * candidates.
 *
 * Also home to the canonical meta field set (`META_FIELDS`) and the projection
 * between a meta's structured field record and its markdown form: a hoisted
 * core-block table (`State | Owner | Branch | Class | Priority`) plus ordered
 * bullet groups, under a value-format convention (enum / identifier / sentinel
 * / narrative). `renderMetaFile` emits the markdown from the field set,
 * `parseMetaRecord` recovers the record. Sharing one field definition keeps the
 * rendered and parsed views from disagreeing on structure.
 *
 * The directory scan does filesystem work only. Mode-specific shaping (full
 * enumeration vs session-init single-path resolution) lives in the probe
 * runners that call this helper.
 *
 * @module
 */

import { join, relative, sep } from "node:path";
import { readdir, readFile, stat } from "node:fs/promises";

import type { ActiveLayout, MetaFileCandidate } from "../../commands/active/types.js";

const DEFAULT_ROOT_SEGMENTS = [".arc", "active"] as const;
const LITE_FILENAME = "status.md";
const META_PREFIX = "meta-";
const FULL_SUFFIX = ".md";

export interface ReadActiveCandidatesOptions {
  /**
   * Active dir relative to `cwd` as path segments. Defaults to `[".arc", "active"]`.
   * Contributor flow uses `[".arc", "user", identity, "active"]`.
   */
  rootSegments?: readonly string[];
}

export interface ReaderResult {
  layout: ActiveLayout;
  candidates: MetaFileCandidate[];
  warnings: string[];
}

/**
 * Scan the active directory and return parsed meta-file candidates.
 *
 * Layout resolution:
 *
 * - If `<root>/status.md` exists, layout is `lite` (at most one candidate).
 * - Otherwise, layout is `full` — enumerate `meta-*.md` files directly at
 *   the active root.
 *
 * A missing root directory is not an error — returns an empty candidate set
 * with a warning naming the supplied root.
 */
export async function readActiveMetaCandidates(
  cwd: string,
  options?: ReadActiveCandidatesOptions,
): Promise<ReaderResult> {
  const rootSegments = options?.rootSegments ?? DEFAULT_ROOT_SEGMENTS;
  const activeDir = join(cwd, ...rootSegments);
  const rootDisplay = `${rootSegments.join("/")}/`;
  const warnings: string[] = [];

  let exists = false;
  try {
    const s = await stat(activeDir);
    exists = s.isDirectory();
  } catch {
    // Swallow — handled below as a warning.
  }

  if (!exists) {
    warnings.push(`${rootDisplay} not found — no active work units to enumerate.`);
    return { layout: "full", candidates: [], warnings };
  }

  const litePath = join(activeDir, LITE_FILENAME);
  let liteExists = false;
  try {
    const s = await stat(litePath);
    liteExists = s.isFile();
  } catch {
    // Missing file — treat as absent; full-layout scan runs below.
  }

  if (liteExists) {
    const candidate = await parseCandidate(cwd, litePath, warnings);
    return { layout: "lite", candidates: candidate ? [candidate] : [], warnings };
  }

  const paths = await findMetaFiles(activeDir);
  paths.sort();

  const candidates: MetaFileCandidate[] = [];
  for (const path of paths) {
    const c = await parseCandidate(cwd, path, warnings);
    if (c) candidates.push(c);
  }

  return { layout: "full", candidates, warnings };
}

function isMetaFilename(name: string): boolean {
  return name.startsWith(META_PREFIX) && name.endsWith(FULL_SUFFIX);
}

async function findMetaFiles(activeDir: string): Promise<string[]> {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = await readdir(activeDir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (!isMetaFilename(entry)) continue;
    const full = join(activeDir, entry);
    let s;
    try {
      s = await stat(full);
    } catch {
      continue;
    }
    if (!s.isFile()) continue;
    out.push(full);
  }
  return out;
}

async function parseCandidate(
  cwd: string,
  absPath: string,
  warnings: string[],
): Promise<MetaFileCandidate | null> {
  let content: string;
  try {
    content = await readFile(absPath, "utf8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warnings.push(`Unable to read ${relative(cwd, absPath)}: ${message}`);
    return null;
  }

  let parsed: ParsedMetaFields;
  try {
    parsed = parseMetaFile(content);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warnings.push(`Malformed meta in ${relative(cwd, absPath)}: ${message}`);
    return null;
  }
  const rel = relative(cwd, absPath).split(sep).join("/");
  const filename = rel.split("/").pop() ?? rel;
  return {
    path: rel,
    filename,
    branch: parsed.branch,
    state: parsed.state,
    nextTask: parsed.nextTask,
    taskList: parsed.taskList,
    nextAction: parsed.nextAction,
  };
}

export interface ParsedMetaFields {
  branch: string | null;
  state: string | null;
  nextTask: string | null;
  taskList: string | null;
  nextAction: string | null;
}

/**
 * Parse the five session-init-relevant fields from a meta-file body.
 *
 * Thin projection over {@link parseMetaRecord} — the single reader every meta
 * consumer routes through — selecting the subset the probe runners need. Core
 * fields (`State`, `Branch`) come from the core-block table when present and the
 * legacy flat-bullet scan otherwise; the rest come from their bullets. Token
 * fields (`State`, `Branch`, `Task List`) come back bare (backticks stripped);
 * narrative fields (`Next Task`, `Next Action`) are preserved verbatim, code
 * spans and all. Bracket sentinels are preserved; a field whose marker is
 * absent comes back `null`.
 *
 * Throws when the meta carries a structurally malformed core-block table — see
 * {@link parseMetaRecord}. Callers scanning untrusted files (e.g.
 * {@link parseCandidate}) catch and downgrade to a warning.
 */
export function parseMetaFile(content: string): ParsedMetaFields {
  const record = parseMetaRecord(content);
  return {
    branch: record.Branch,
    state: record.State,
    nextTask: record["Next Task"],
    taskList: record["Task List"],
    nextAction: record["Next Action"],
  };
}

/** How a field is laid out in the markdown projection. */
export type MetaRenderMode = "core-table" | "bullet";

/**
 * The value-formatting class for a field's *real* (non-sentinel) values. This
 * is the proto-schema axis a later code-owned schema maps directly: `enum` →
 * a closed Capitalized token set, `identifier` → a single slug / filename /
 * branch, `identifier-list` → one or more comma-separated identifiers rendered
 * with each element individually backticked (`` `a`, `b` ``), `narrative` →
 * free prose. Bracket sentinels (`[none]` / `[internal]` / `[TBD]`) are a
 * cross-cutting form detected at render/parse time and are orthogonal to this
 * class — a field permits a sentinel when its `default` is one.
 */
export type MetaValueClass = "enum" | "identifier" | "identifier-list" | "narrative";

/**
 * A managed-meta field descriptor: the bold-marker label, the value rendered
 * when no override is supplied, the blank-line group the field belongs to, and
 * the two projection axes — where it renders (`render`) and how its value is
 * formatted (`valueClass`). The ordered set in {@link META_FIELDS} is the
 * single definition the markdown projection ({@link renderMetaFile}) and the
 * structured parse ({@link parseMetaRecord}) both derive from.
 */
export interface MetaFieldDescriptor {
  /** Bold-marker label, e.g. `"Next Action"` (rendered as `- **Next Action:** …`). */
  readonly name: string;
  /** Value rendered when the caller supplies no override for this field. */
  readonly default: string;
  /** Grouping key — bullet fields sharing a group render contiguously, blank-line separated. */
  readonly group: string;
  /** Layout: a cell in the hoisted core-block table, or a grouped bullet. */
  readonly render: MetaRenderMode;
  /** Value-formatting class for the field's real values (sentinels bypass it). */
  readonly valueClass: MetaValueClass;
}

/**
 * The canonical meta field set — ordered, grouped, with per-field defaults and
 * the two projection axes. The core block (`render: "core-table"`) hoists into
 * a single-row table (`State | Owner | Branch | Class | Priority`); the rest
 * render as ordered bullet groups. Declared `as const` so the labels form the
 * {@link MetaFieldName} literal union.
 */
export const META_FIELDS = [
  { name: "State", default: "—", group: "core", render: "core-table", valueClass: "enum" },
  { name: "Owner", default: "—", group: "core", render: "core-table", valueClass: "identifier" },
  { name: "Branch", default: "—", group: "core", render: "core-table", valueClass: "identifier" },
  { name: "Class", default: "[TBD]", group: "core", render: "core-table", valueClass: "enum" },
  { name: "Priority", default: "P3", group: "core", render: "core-table", valueClass: "enum" },
  { name: "Cohort", default: "[none]", group: "cohort", render: "bullet", valueClass: "identifier" },
  { name: "Depends On", default: "[none]", group: "cohort", render: "bullet", valueClass: "identifier-list" },
  { name: "Origin", default: "[internal]", group: "reference", render: "bullet", valueClass: "identifier" },
  { name: "Design", default: "[none]", group: "reference", render: "bullet", valueClass: "identifier-list" },
  { name: "Task List", default: "[none]", group: "reference", render: "bullet", valueClass: "identifier" },
  { name: "Last Completed", default: "[none]", group: "progress", render: "bullet", valueClass: "narrative" },
  { name: "Next Task", default: "[none]", group: "progress", render: "bullet", valueClass: "narrative" },
  { name: "Blockers", default: "[none]", group: "progress", render: "bullet", valueClass: "narrative" },
  { name: "Next Action", default: "—", group: "directive", render: "bullet", valueClass: "narrative" },
] as const satisfies readonly MetaFieldDescriptor[];

const CORE_FIELD_NAMES = META_FIELDS
  .filter((field) => field.render === "core-table")
  .map((field) => field.name);

/**
 * Parse a comma-separated identifier-list field value into its elements: split
 * on commas, trim each, and drop empties, with `[none]` / absent (`null`) /
 * empty resolving to no elements. The shared split for the `identifier-list`
 * fields (`Depends On` and the layered `Design` pattern) — driving both the
 * per-element render in {@link formatValue} and every consumer's parse, so the
 * two never disagree on element boundaries. Operates on the bare value: callers
 * reading rendered markdown strip backticks first (the record-side strip is
 * global, so `` `a`, `b` `` recovers as `a, b` before this split).
 */
export function parseIdentifierList(raw: string | null): string[] {
  if (raw === null || raw === "[none]") return [];
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");
}

/** Union of the legal meta field labels, derived from {@link META_FIELDS}. */
export type MetaFieldName = (typeof META_FIELDS)[number]["name"];

/**
 * Field→value overrides for {@link renderMetaFile}. A general partial map over
 * the field set, not a fixed signature: a spawn caller supplies State / Owner /
 * Branch / Next Action; a cold-start caller additionally supplies Origin /
 * Design from parsed spec input. Fields absent from the map render at their
 * declared default.
 */
export type MetaFieldOverrides = Partial<Record<MetaFieldName, string>>;

/** The structured field record recovered from a meta projection by {@link parseMetaRecord}. */
export type MetaRecord = Record<MetaFieldName, string | null>;

/** The em-dash placeholder for a required-but-unset field (distinct from a `[…]` sentinel). */
const PLACEHOLDER = "—";

/** A bracket sentinel token — `[none]`, `[internal]`, `[TBD]`. */
const SENTINEL_RE = /^\[[^\]]+\]$/;

function isSentinel(value: string): boolean {
  return SENTINEL_RE.test(value.trim());
}

function capitalizeFirst(value: string): string {
  return value.length === 0 ? value : `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

/**
 * Format a field value for the markdown projection per its value class. Bracket
 * sentinels and the em-dash placeholder render bare (the bracket is itself the
 * machine signal); enum tokens render Capitalized + backticked, identifiers
 * backticked as-is, identifier-list values render each comma-separated element
 * individually backticked (`` `a`, `b` `` — two discrete tokens, not one
 * compound span), narrative fields as plain prose.
 */
function formatValue(value: string, valueClass: MetaValueClass): string {
  if (value === PLACEHOLDER || isSentinel(value)) return value;
  switch (valueClass) {
    case "enum":
      return `\`${capitalizeFirst(value)}\``;
    case "identifier":
      return `\`${value}\``;
    case "identifier-list":
      return parseIdentifierList(value)
        .map((item) => `\`${item}\``)
        .join(", ");
    case "narrative":
      return value;
  }
}

/**
 * Render the core block as a single-row, pre-aligned markdown table —
 * `State | Owner | Branch | Class | Priority` — its columns padded so the pipes
 * line up in raw markdown. (`MD013 tables:false` exempts the table from the
 * line-length gate.)
 */
function renderCoreTable(valueOf: (field: MetaFieldDescriptor) => string): string[] {
  const columns = META_FIELDS.filter((f) => f.render === "core-table").map((f) => {
    // Bold the header so the table's keys read as labels in raw markdown,
    // matching the `**Field:**` bullet labels (parse strips the bold on read).
    const header = `**${f.name}**`;
    const cell = formatValue(valueOf(f), f.valueClass);
    return { header, cell, width: Math.max(header.length, cell.length) };
  });
  const headerRow = `| ${columns.map((c) => c.header.padEnd(c.width)).join(" | ")} |`;
  const separatorRow = `| ${columns.map((c) => "-".repeat(c.width)).join(" | ")} |`;
  const valueRow = `| ${columns.map((c) => c.cell.padEnd(c.width)).join(" | ")} |`;
  return [headerRow, separatorRow, valueRow];
}

/**
 * Render the non-core fields as ordered bullet groups, blank-line separated. A
 * multi-line narrative value (e.g. a wrapped `Next Action`) renders its first
 * line after the label and indents each continuation two spaces to align under
 * the bullet — list-continuation-valid markdown that {@link parseMetaRecord}
 * recovers unchanged.
 */
function renderBullets(valueOf: (field: MetaFieldDescriptor) => string): string[] {
  const lines: string[] = [];
  let prevGroup: string | null = null;
  for (const field of META_FIELDS) {
    if (field.render !== "bullet") continue;
    if (prevGroup !== null && field.group !== prevGroup) lines.push("");
    const [first, ...rest] = formatValue(valueOf(field), field.valueClass).split("\n");
    lines.push(`- **${field.name}:** ${first}`);
    for (const continuation of rest) lines.push(`  ${continuation}`);
    prevGroup = field.group;
  }
  return lines;
}

/**
 * Render a fresh meta-file markdown projection from {@link META_FIELDS}.
 *
 * Emits `# Metadata: {wuName}`, the hoisted core-block table, the field bullets
 * grouped with a single blank line between groups, and a trailing `---`. Each
 * field takes its override value when present, otherwise its declared default.
 * No instructional comments and no archive-phase sections are emitted — those
 * materialize later in the lifecycle, not at fresh-scaffold time.
 *
 * @param wuName - Work-unit name for the H1.
 * @param overrides - Field→value overrides; absent fields render at their default.
 * @returns The rendered meta markdown, terminated by a single newline.
 */
export function renderMetaFile(
  wuName: string,
  overrides: MetaFieldOverrides = {},
): string {
  const valueOf = (field: MetaFieldDescriptor): string =>
    overrides[field.name as MetaFieldName] ?? field.default;
  const lines: string[] = [`# Metadata: ${wuName}`, ""];
  lines.push(...renderCoreTable(valueOf), "");
  lines.push(...renderBullets(valueOf));
  lines.push("", "---");
  return `${lines.join("\n")}\n`;
}

/**
 * Rewrite the core-block `State` cell in place, re-rendering *only* the three
 * core-table rows so column alignment stays correct, and leaving every bullet,
 * narrative field, and section below byte-identical. The other core fields keep
 * their values (only their machine-alignment padding may shift). The caller
 * validates `state` against {@link WorkUnitState} first — this is a
 * projection-level rewrite, not a phase validator.
 *
 * @param content - The meta file's raw markdown.
 * @param state - The canonical target phase to write into the State cell.
 * @returns The rewritten markdown.
 * @throws When the meta carries no resolvable core-block table (nothing to move).
 */
export function setMetaState(content: string, state: string): string {
  return setMetaCoreFields(content, { State: state });
}

/**
 * Rewrite the core-block `Branch` cell in place — the branch-axis sibling of
 * {@link setMetaState}. Used by the lifecycle executor to project the meta
 * `Branch` field from the branch a transition establishes (`plan/<slug>` on
 * graduate, `<type>/<slug>` on activate, the preserved branch on resume,
 * `[none]` on a teardown). Every other core field and the prose below stay
 * byte-stable (modulo core-table alignment padding).
 *
 * @param content - The meta file's raw markdown.
 * @param branch - The branch value to write into the Branch cell (e.g. `plan/foo` or `[none]`).
 * @returns The rewritten markdown.
 * @throws When the meta carries no resolvable core-block table (nothing to move).
 */
export function setMetaBranch(content: string, branch: string): string {
  return setMetaCoreFields(content, { Branch: branch });
}

/**
 * Rewrite one or more core-block table cells in place, re-rendering *only* the
 * three core-table rows so column alignment stays correct and leaving every
 * bullet, narrative field, and section below byte-identical. The shared engine
 * behind {@link setMetaState} and {@link setMetaBranch}: an override map supplies
 * the new values for named core fields; unnamed cells keep their current value.
 *
 * @param content - The meta file's raw markdown.
 * @param overrides - Core field → new value; only named core fields are rewritten.
 * @returns The rewritten markdown.
 * @throws When the meta carries no resolvable core-block table.
 */
function setMetaCoreFields(content: string, overrides: MetaFieldOverrides): string {
  const lines = content.split("\n");
  const firstFieldIdx = lines.findIndex((line) => FIELD_MARKER_RE.test(line));
  const scanLimit = firstFieldIdx === -1 ? lines.length : firstFieldIdx;
  const sepIdx = lines.findIndex(
    (line, i) => i < scanLimit && TABLE_SEPARATOR_RE.test(line.trim()),
  );
  const headerLine = sepIdx > 0 ? lines[sepIdx - 1] : undefined;
  const valueLine = sepIdx === -1 ? undefined : lines[sepIdx + 1];
  if (headerLine === undefined || valueLine === undefined) {
    throw new Error("Cannot set meta core field: no core-block table found.");
  }
  const headers = splitTableRow(headerLine).map(stripHeaderLabel);
  if (!isCoreTableHeader(headers)) {
    throw new Error("Cannot set meta core field: core-block table header not recognized.");
  }

  const cells = splitTableRow(valueLine);
  const current = new Map<string, string | null>();
  headers.forEach((header, i) => current.set(header, normalizeValue(cells[i] ?? "")));

  const overrideMap = new Map<string, string>(Object.entries(overrides));
  const valueOf = (field: MetaFieldDescriptor): string =>
    overrideMap.get(field.name) ?? current.get(field.name) ?? field.default;
  lines.splice(sepIdx - 1, 3, ...renderCoreTable(valueOf));
  return lines.join("\n");
}

/**
 * Rewrite one or more **narrative bullet** fields (`Last Completed` /
 * `Next Task` / `Blockers` / `Next Action` and their peers) in place, replacing
 * each named field's value — and any indented continuation lines wrapping the
 * same bullet — while leaving every other line byte-stable.
 *
 * The complement of {@link setMetaState} (which rewrites the core-block table):
 * together they let a caller touch any managed field without the full-file
 * re-render of {@link renderMetaFile}, which would drop narrative, ordering, and
 * hand-edits. Each update value is written verbatim (narrative fields bypass the
 * `valueClass` backtick formatting); a multi-line value renders its first line
 * after the label and indents each continuation two spaces, matching
 * {@link renderBullets} so {@link parseMetaRecord} recovers it unchanged.
 *
 * The field-value boundary mirrors {@link extractField}: continuations run until
 * a blank line, the next field marker, a heading, a `---` rule, or
 * end-of-section. A targeted field whose marker is absent throws — a managed
 * meta always carries the bullet, so a miss is structural drift, not a silent
 * no-op (matching {@link setMetaState}'s fail-loud contract).
 *
 * @param content - The meta file's raw markdown.
 * @param updates - Field→new-value map; only the named fields are rewritten.
 * @returns The rewritten markdown.
 * @throws When a targeted field's bullet marker is not found.
 */
export function setMetaBulletFields(
  content: string,
  updates: Partial<Record<MetaFieldName, string>>,
): string {
  let lines = content.split("\n");
  for (const [name, value] of Object.entries(updates)) {
    lines = replaceBulletField(lines, name, value);
  }
  return lines.join("\n");
}

/**
 * Replace the `- **<name>:**` bullet's value (plus its continuation lines) with
 * `value`, returning the rewritten line array. Preserves the line's exact label
 * prefix (indent + `**name:**`) and re-wraps a multi-line value as indented
 * continuations.
 */
function replaceBulletField(lines: string[], name: string, value: string): string[] {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const labelRe = new RegExp(`^([ \\t>*+-]*\\*\\*${escaped}:\\*\\*)[ \\t]*(.*)$`);

  const start = lines.findIndex((line) => labelRe.test(line));
  if (start === -1) {
    throw new Error(`Cannot set meta field: \`${name}\` bullet not found.`);
  }
  const prefix = labelRe.exec(lines[start] ?? "")?.[1] ?? "";

  // Continuation span: indented, non-boundary lines wrapping the same bullet.
  let end = start + 1;
  for (; end < lines.length; end++) {
    const line = lines[end] ?? "";
    if (line.trim() === "") break; // blank → field / group boundary
    if (FIELD_MARKER_RE.test(line)) break; // next field bullet
    if (/^#{1,6} /.test(line)) break; // heading
    if (line.trim() === "---") break; // trailing rule
    if (!/^\s/.test(line)) break; // continuations are indented under the bullet
  }

  const [first = "", ...rest] = value.split("\n");
  const replacement = [first === "" ? prefix : `${prefix} ${first}`];
  for (const continuation of rest) replacement.push(`  ${continuation}`);

  return [...lines.slice(0, start), ...replacement, ...lines.slice(end)];
}

/** A core-block separator row, e.g. `| ---- | --- | ------ |`. */
const TABLE_SEPARATOR_RE = /^\|(?:\s*:?-+:?\s*\|)+$/;

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
 * carries no table at all — the caller falls back to the legacy flat-bullet
 * scan, so pre-migration metas stay readable. A table that is *present but
 * malformed* inside the core block (a separator row without an adjacent
 * header/value row, or a column-count mismatch across the three rows) throws:
 * structural drift fails loud, never silent-null. Narrative tables below the
 * managed bullet fields are ignored.
 */
function parseCoreTable(section: string): Record<string, string | null> | null {
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

/**
 * Recover the structured field record from a meta projection — the single
 * reader every meta consumer routes through. Core-block fields come from the
 * hoisted table when present (keyed by header label, column-order tolerant) and
 * the legacy flat-bullet scan otherwise; the rest come from their bullets.
 * Sharing {@link META_FIELDS} makes this the inverse of {@link renderMetaFile}.
 *
 * Backtick stripping is `valueClass`-aware: token fields (`enum` / `identifier`)
 * strip to bare form so consumers read a clean value; narrative fields are
 * preserved verbatim — their authored code spans and multi-line continuations
 * survive, making the record a faithful inverse for the durable human-read
 * document. Bracket sentinels stay verbatim (`[none]` / `[internal]` / `[TBD]`
 * stay distinct, and distinct from a marker-absent `null`). A structurally
 * malformed core-block table throws (see {@link parseCoreTable}).
 */
export function parseMetaRecord(content: string): MetaRecord {
  const section = extractMetadataSection(content) ?? "";
  const table = parseCoreTable(section);
  const record = {} as MetaRecord;
  for (const field of META_FIELDS) {
    const fromTable = table && field.name in table ? table[field.name] : undefined;
    const raw = fromTable === undefined ? extractField(section, field.name) : fromTable;
    // Token fields strip to a bare value; narrative keeps its code spans. (Core
    // table values arrive pre-stripped and are all non-narrative, so the strip
    // is a no-op there.)
    record[field.name] =
      raw !== null && field.valueClass !== "narrative" ? stripInlineCode(raw) : raw;
  }
  return record;
}

/**
 * Extract the H1-bounded preamble body — from immediately after the first
 * `# ...` H1 through the first content `## ...` H2 (or end-of-file). The
 * `extractField` regex underneath is shape-agnostic, so prose between H1
 * and the field bullets does not interfere. Returns `null` when no H1 is
 * present.
 */
function extractMetadataSection(content: string): string | null {
  const h1Re = /^# .*$/m;
  const h1Match = h1Re.exec(content);
  if (!h1Match) return null;
  const afterH1 = content.slice(h1Match.index + h1Match[0].length);
  const nextH2Match = /^## /m.exec(afterH1);
  return nextH2Match
    ? afterH1.slice(0, nextH2Match.index)
    : afterH1;
}

/** Any managed `**Label:**` field marker (bullet, bare, or blockquoted) — the
 *  boundary that ends a preceding field's multi-line value gather. */
const FIELD_MARKER_RE = /^[ \t>*+-]*\*\*[^*]+:\*\*/;

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
 */
function extractField(content: string, label: string): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const labelRe = new RegExp(`^[ \\t>*+-]*\\*\\*${escaped}:\\*\\*[ \\t]*(.*)$`);
  const lines = content.split("\n");
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
 */
export function stripInlineCode(value: string): string {
  return value.replace(/`([^`]+)`/g, "$1");
}
