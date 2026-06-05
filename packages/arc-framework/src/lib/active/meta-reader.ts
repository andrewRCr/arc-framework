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
 * legacy flat-bullet scan otherwise; the rest come from their bullets. Values
 * have inline backticks stripped (bracket sentinels are preserved); a field
 * whose marker is absent comes back `null`.
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
 * a closed Capitalized token set, `identifier` → a slug / filename / branch,
 * `narrative` → free prose. Bracket sentinels (`[none]` / `[internal]` /
 * `[TBD]`) are a cross-cutting form detected at render/parse time and are
 * orthogonal to this class — a field permits a sentinel when its `default` is
 * one.
 */
export type MetaValueClass = "enum" | "identifier" | "narrative";

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
  { name: "Depends On", default: "[none]", group: "cohort", render: "bullet", valueClass: "identifier" },
  { name: "Origin", default: "[internal]", group: "reference", render: "bullet", valueClass: "identifier" },
  { name: "Design", default: "[none]", group: "reference", render: "bullet", valueClass: "identifier" },
  { name: "Task List", default: "[none]", group: "reference", render: "bullet", valueClass: "identifier" },
  { name: "Last Completed", default: "[none]", group: "progress", render: "bullet", valueClass: "narrative" },
  { name: "Next Task", default: "[none]", group: "progress", render: "bullet", valueClass: "narrative" },
  { name: "Blockers", default: "[none]", group: "progress", render: "bullet", valueClass: "narrative" },
  { name: "Next Action", default: "—", group: "directive", render: "bullet", valueClass: "narrative" },
] as const satisfies readonly MetaFieldDescriptor[];

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
 * backticked as-is, narrative fields as plain prose.
 */
function formatValue(value: string, valueClass: MetaValueClass): string {
  if (value === PLACEHOLDER || isSentinel(value)) return value;
  switch (valueClass) {
    case "enum":
      return `\`${capitalizeFirst(value)}\``;
    case "identifier":
      return `\`${value}\``;
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

/** Render the non-core fields as ordered bullet groups, blank-line separated. */
function renderBullets(valueOf: (field: MetaFieldDescriptor) => string): string[] {
  const lines: string[] = [];
  let prevGroup: string | null = null;
  for (const field of META_FIELDS) {
    if (field.render !== "bullet") continue;
    if (prevGroup !== null && field.group !== prevGroup) lines.push("");
    lines.push(`- **${field.name}:** ${formatValue(valueOf(field), field.valueClass)}`);
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
 * malformed* (a separator row without an adjacent header/value row, or a
 * column-count mismatch across the three rows) throws: structural drift fails
 * loud, never silent-null.
 */
function parseCoreTable(section: string): Record<string, string | null> | null {
  const lines = section.split("\n");
  const sepIdx = lines.findIndex((line) => TABLE_SEPARATOR_RE.test(line.trim()));
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

/**
 * Recover the structured field record from a meta projection — the single
 * reader every meta consumer routes through. Core-block fields come from the
 * hoisted table when present (keyed by header label, column-order tolerant) and
 * the legacy flat-bullet scan otherwise; the rest come from their bullets.
 * Sharing {@link META_FIELDS} makes this the inverse of {@link renderMetaFile}.
 * Values strip backticks to bare form but preserve bracket sentinels verbatim
 * (`[none]` / `[internal]` / `[TBD]` stay distinct, and distinct from a
 * marker-absent `null`). A structurally malformed core-block table throws (see
 * {@link parseCoreTable}).
 */
export function parseMetaRecord(content: string): MetaRecord {
  const section = extractMetadataSection(content) ?? "";
  const table = parseCoreTable(section);
  const record = {} as MetaRecord;
  for (const field of META_FIELDS) {
    const fromTable = table && field.name in table ? table[field.name] : undefined;
    record[field.name] = fromTable === undefined ? extractField(section, field.name) : fromTable;
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

function extractField(content: string, label: string): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^[ \\t>*+-]*\\*\\*${escaped}:\\*\\*[ \\t]*(.*)$`, "m");
  const m = re.exec(content);
  if (!m || m[1] === undefined) return null;
  const raw = m[1].trim();
  if (raw === "") return null;
  return stripInlineCode(raw);
}

function stripInlineCode(value: string): string {
  // Strip `backticks` around whole tokens; preserve surrounding prose intact.
  return value.replace(/`([^`]+)`/g, "$1");
}
