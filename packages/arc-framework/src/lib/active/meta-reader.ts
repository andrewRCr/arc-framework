/**
 * Reader for `arc active status` — scans `.arc/active/` for meta files,
 * detects Full vs Lite layout, and parses per-WU fields into structured
 * candidates.
 *
 * Also home to the canonical meta field set (`META_FIELDS`) and the projection
 * between a meta's structured field record and its markdown form:
 * `renderMetaFile` emits the markdown from the field set, `parseMetaRecord`
 * recovers the record. Sharing one field definition keeps the rendered and
 * parsed views from disagreeing on structure.
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

  const parsed = parseMetaFile(content);
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
 * Field extraction is bounded to the H1-bounded preamble — from immediately
 * after the first `# ...` H1 through the first content `## ...` H2 (or
 * end-of-file). When no H1 anchor resolves, all fields return `null`.
 *
 * Within the region, accepts both list-item (`- **Field:** value`) and
 * bare (`**Field:** value`) forms; bullets and leading whitespace are
 * tolerated. Values are taken verbatim to end of line, trimmed. Inline
 * backticks are stripped so backticked path fields round-trip as plain
 * paths.
 *
 * Returns `null` for any field whose marker isn't present — downstream
 * rendering decides how to surface missing fields.
 */
export function parseMetaFile(content: string): ParsedMetaFields {
  const section = extractMetadataSection(content) ?? "";
  return {
    branch: extractField(section, "Branch"),
    state: extractField(section, "State"),
    nextTask: extractField(section, "Next Task"),
    taskList: extractField(section, "Task List"),
    nextAction: extractField(section, "Next Action"),
  };
}

/**
 * A managed-meta field descriptor: the bold-marker label, the value rendered
 * when no override is supplied, and the blank-line group the field belongs to.
 * The ordered set in {@link META_FIELDS} is the single definition both the
 * markdown projection ({@link renderMetaFile}) and the structured parse
 * ({@link parseMetaRecord}) derive from.
 */
export interface MetaFieldDescriptor {
  /** Bold-marker label, e.g. `"Next Action"` (rendered as `- **Next Action:** …`). */
  readonly name: string;
  /** Value rendered when the caller supplies no override for this field. */
  readonly default: string;
  /** Grouping key — fields sharing a group render contiguously; groups are blank-line separated. */
  readonly group: string;
}

/**
 * The canonical meta field set — ordered, grouped, with per-field defaults.
 * Declared `as const` so the labels form the {@link MetaFieldName} literal union.
 */
export const META_FIELDS = [
  { name: "State", default: "—", group: "identity" },
  { name: "Owner", default: "—", group: "identity" },
  { name: "Branch", default: "—", group: "identity" },
  { name: "Origin", default: "[internal]", group: "reference" },
  { name: "Design", default: "[none]", group: "reference" },
  { name: "Depends On", default: "[none]", group: "coordination" },
  { name: "Cohort", default: "[none]", group: "coordination" },
  { name: "Priority", default: "P3", group: "coordination" },
  { name: "Task List", default: "[none]", group: "pointers" },
  { name: "Last Completed", default: "[none]", group: "pointers" },
  { name: "Next Task", default: "[none]", group: "pointers" },
  { name: "Blockers", default: "[none]", group: "pointers" },
  { name: "Next Action", default: "—", group: "directive" },
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

/**
 * Render a fresh meta-file markdown projection from {@link META_FIELDS}.
 *
 * Emits `# Metadata: {wuName}`, the field bullets grouped with a single blank
 * line between groups, and a trailing `---`. Each field takes its override
 * value when present, otherwise its declared default. No instructional comments
 * and no archive-phase sections are emitted — those materialize later in the
 * lifecycle, not at fresh-scaffold time.
 *
 * @param wuName - Work-unit name for the H1.
 * @param overrides - Field→value overrides; absent fields render at their default.
 * @returns The rendered meta markdown, terminated by a single newline.
 */
export function renderMetaFile(
  wuName: string,
  overrides: MetaFieldOverrides = {},
): string {
  const lines: string[] = [`# Metadata: ${wuName}`, ""];
  let prevGroup: string | null = null;
  for (const field of META_FIELDS) {
    if (prevGroup !== null && field.group !== prevGroup) lines.push("");
    lines.push(`- **${field.name}:** ${overrides[field.name] ?? field.default}`);
    prevGroup = field.group;
  }
  lines.push("", "---");
  return `${lines.join("\n")}\n`;
}

/**
 * Recover the structured field record from a meta projection by reading every
 * {@link META_FIELDS} label out of the H1-bounded preamble. Sharing the field
 * set makes this the inverse of {@link renderMetaFile}: a render → parse
 * round-trip fails loudly if the emitted bullet shape ever stops matching the
 * field extractor. A field whose marker is absent (or empty) comes back `null`.
 */
export function parseMetaRecord(content: string): MetaRecord {
  const section = extractMetadataSection(content) ?? "";
  const record = {} as MetaRecord;
  for (const field of META_FIELDS) {
    record[field.name] = extractField(section, field.name);
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
