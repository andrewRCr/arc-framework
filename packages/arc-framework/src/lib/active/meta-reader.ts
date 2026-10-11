/**
 * Reader for `arc active status` — resolves checkout-held meta identities,
 * detects Full vs Lite layout, and parses exact record bytes into structured
 * candidates. Lite and contributor roots retain their filesystem scans.
 *
 * Pure field descriptors and renderers are exported from the meta kind's
 * projection module. Parsing and the filesystem candidate reader live here.
 *
 * The directory scan does filesystem work only. Mode-specific shaping (full
 * enumeration vs session-init single-path resolution) lives in the probe
 * runners that call this helper.
 *
 * @module
 */

import { resolveArcPath } from "../layout/index.js";
import { join, relative, sep } from "node:path";
import { readdir, readFile, stat } from "node:fs/promises";

import type { ActiveLayout, MetaFileCandidate } from "../../commands/active/types.js";
import {
  MetaCandidateIdSchema,
  MetaWorkClassSchema,
  MetaProjectionRecordSchema,
  MetaRecordSchema,
  ParsedMetaRecordSchema,
  type MetaProjectionRecord,
  type ParsedMetaRecord,
} from "./meta-schema.js";
import { SlugSchema, type Slug } from "../kernel/schema/slug.js";
import { WorkUnitStateSchema } from "../kernel/index.js";
import { writePreformattedMetaBullet } from "../store/kinds/meta/preformatted-writer.js";
import {
  writeMetaState, writeMetaBranch, writeMetaClass, writeMetaTitle,
} from "../store/kinds/meta/writers.js";
import {
  META_FIELDS, formatValue, renderCoreTable, parseIdentifierList, PLACEHOLDER, isSentinel,
  type MetaFieldName, type MetaProjectionOverrides, type MetaRecord,
} from "../store/kinds/meta/projection.js";
export * from "../store/kinds/meta/projection.js";
export { emptyParsedMetaRecord } from "../store/kinds/meta/empty-record.js";
import {
  locateMetaCoreTable,
  locateMetaFieldBlock,
  readMetaSectionBodies, bulletMarkerRe, extractField, parseCoreTable, stripInlineCode,
} from "../store/kinds/meta/line-reading.js";
export { locateMetaCoreTable, stripInlineCode, type MetaCoreTableLocation } from "../store/kinds/meta/line-reading.js";

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

  if (activeDir === join(cwd, ...DEFAULT_ROOT_SEGMENTS)) return readHeldCandidates(cwd);

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

  return candidateFromContent(cwd, absPath, content, warnings);
}

function candidateFromContent(cwd: string, absPath: string, content: string, warnings: string[]): MetaFileCandidate | null {
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
  let candidateId = parsed.candidateId;
  if (candidateId !== null && !MetaCandidateIdSchema.safeParse(candidateId).success) {
    warnings.push(`Malformed Candidate in ${rel}: expected sha256 followed by 64 lowercase hexadecimal characters.`);
    candidateId = null;
  }
  return {
    path: rel,
    filename,
    branch: parsed.branch,
    candidateId,
    integrationBoundary: null,
    state: parsed.state,
    nextTask: parsed.nextTask,
    taskList: parsed.taskList,
    nextAction: parsed.nextAction,
    currentWorkflow: parsed.currentWorkflow,
  };
}

async function readHeldCandidates(cwd: string): Promise<ReaderResult> {
  const [{ resolveCurrentWorkUnit }, { createStore }, { createDefaultStorePorts }] = await Promise.all([
    import("../store/current-work-unit.js"), import("../store/create.js"), import("../store/default-ports.js"),
  ]);
  const store = createStore(createDefaultStorePorts({ checkoutRoot: cwd }));
  const resolved = await resolveCurrentWorkUnit({ cwd, store });
  const warnings = [...resolved.warnings];
  const candidates: MetaFileCandidate[] = [];
  for (const current of resolved.candidates) {
    const path = resolveArcPath({ kind: "work-unit-artifact", artifact: "meta", slug: current.reference.owner.name,
      placement: { kind: "active", scope: { kind: "project" } } });
    try {
      const read = await store.read({ reference: current.reference });
      if (read.status === "refused") { warnings.push(`Unable to read ${path}: ${read.refusal.condition}`); continue; }
      const candidate = candidateFromContent(cwd, join(cwd, path), read.result.content, warnings);
      if (candidate !== null) candidates.push(candidate);
    } catch (error) { warnings.push(`Unable to read ${path}: ${error instanceof Error ? error.message : String(error)}`); }
  }
  return { layout: "full", candidates, warnings };
}

export interface ParsedMetaFields {
  branch: string | null;
  candidateId: string | null;
  state: string | null;
  nextTask: string | null;
  taskList: string | null;
  nextAction: string | null;
  currentWorkflow: string | null;
}

/**
 * Parse the six session-init-relevant fields from a meta-file body.
 *
 * Thin projection over {@link parseMetaRecord} — the single reader every meta
 * consumer routes through — selecting the subset the probe runners need. Core
 * fields (`State`, `Branch`) come from the core-block table when present and the
 * legacy flat-bullet scan otherwise; the rest come from their bullets. Token
 * fields (`State`, `Branch`, `Task List`, `Current Workflow`) come back bare
 * (backticks stripped);
 * narrative fields (`Next Task`, `Next Action`) are preserved verbatim, code
 * spans and all. Bracket sentinels are preserved; a field whose marker is
 * absent comes back `null`.
 *
 * Throws when the meta carries a structurally malformed core-block table — see
 * {@link parseMetaRecord}. Callers scanning untrusted files (e.g.
 * {@link parseCandidate}) catch and downgrade to a warning.
 */
export function parseMetaFile(content: string): ParsedMetaFields {
  const record = parseMetaProjectionRecord(content);
  return {
    branch: record.Branch,
    candidateId: nullableProjectionValue(record.Candidate),
    state: record.State,
    nextTask: record["Next Task"],
    taskList: record["Task List"],
    nextAction: record["Next Action"],
    currentWorkflow: record["Current Workflow"],
  };
}

/** Resolve the optional WU review-rubric overlay to one safe method identity. */
export function parseReviewRubric(value: string | null): Slug | null {
  if (value === null || value === "[none]") return null;
  const parsed = SlugSchema.safeParse(value);
  if (!parsed.success) throw new Error("Review Rubric must be one safe rubric or method identity");
  return parsed.data;
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
  return writeMetaState(content, WorkUnitStateSchema.parse(stripInlineCode(state)));
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
  const value = stripInlineCode(branch);
  return writeMetaBranch(content, value === "[none]" || value === "—" ? null : value);
}

/**
 * Rewrite the managed metadata H1 while leaving the field projection byte-stable.
 *
 * @param content - The meta file's raw markdown
 * @param name - Target work-unit slug
 * @returns Markdown with only the metadata title changed
 * @throws When the managed metadata H1 is absent
 */
export function setMetaTitle(content: string, name: string): string {
  const heading = /^# Metadata: .+\r?$/mu.exec(content);
  if (heading === null) throw new Error("Cannot set metadata title: managed H1 not found.");
  return content.slice(0, heading.index) + writeMetaTitle(content.slice(heading.index), SlugSchema.parse(name));
}

/**
 * Rewrite the core-block `Class` cell in place — the weight-axis sibling of
 * {@link setMetaState} / {@link setMetaBranch}. The planning ceremonies persist
 * the resolved `Class` (`Light` / `Heavy` / `Novel`) at their finalize
 * fire-points through this writer; the core-table re-render keeps the three
 * rows pipe-aligned by construction (`max(header, cell)` widths), so the table
 * stays MD060-passing. Every other core field and the prose below stay
 * byte-stable (modulo alignment padding). The caller validates `value` against
 * the `WorkClass` set first — this is a projection-level rewrite, not a
 * classifier.
 *
 * @param content - The meta file's raw markdown.
 * @param value - The resolved Class token to write into the Class cell (e.g. `Heavy`).
 * @returns The rewritten markdown.
 * @throws When the meta carries no resolvable core-block table (nothing to move).
 */
export function setMetaClass(content: string, value: string): string {
  const token = stripInlineCode(value);
  return writeMetaClass(content, MetaWorkClassSchema.parse(token === "[TBD]" ? "TBD" : token));
}

/**
 * Rewrite the `Current Workflow` bullet field in place — the workflow pointer's
 * single-field write. The bullet-field sibling of {@link setMetaBranch} (which
 * rewrites the core-table Branch cell): lifecycle ceremonies project the
 * planning sub-stage, the live publication workflow, or `[none]` when the phase
 * carries no workflow pointer. Every other field and the prose below stay
 * byte-stable.
 *
 * A thin wrapper over {@link setMetaBulletFields} fixing the field to
 * `Current Workflow` — the named primitive every workflow-pointer write routes
 * through. The `stage` is rendered per the `identifier` value class (backticked,
 * `[none]` left bare) so the written form matches {@link renderMetaFile}. Inherits
 * the field writer's anchor check, inserting an absent bullet in field order.
 *
 * @param content - The meta file's raw markdown.
 * @param stage - The planning-stage basename to write (e.g. `create-spec`), or `[none]` to clear.
 * @returns The rewritten markdown.
 * @throws When metadata field-block anchors are missing.
 */
export function setMetaCurrentWorkflow(content: string, stage: string): string {
  return setMetaBulletFields(content, { "Current Workflow": formatValue(stage, "identifier") });
}

/**
 * Rewrite the `Design` bullet field in place — the event-driven design-pointer
 * write. The identifier-list sibling of {@link setMetaCurrentWorkflow}: the
 * lifecycle executor projects the meta `Design` from the planning moment a
 * repoint fires (`draft-<name>.md` at draft creation, `spec-<name>.md` at
 * create-spec finalization), or `[none]` before any artifact exists. Every other
 * field and the prose below stay byte-stable.
 *
 * A thin wrapper over {@link setMetaBulletFields} fixing the field to `Design` —
 * the named primitive the executor's design repoints route through. The caller
 * composes the bare field value (a single filename, or a comma-joined layered
 * list); this primitive renders it per the `identifier-list` value class (each
 * element backticked, `[none]` left bare) so the written form matches
 * {@link renderMetaFile}, and does not otherwise parse or merge. Inherits
 * the field writer's anchor check, inserting an absent bullet in field order.
 *
 * @param content - The meta file's raw markdown.
 * @param value - The composed `Design` value (e.g. `spec-demo.md`, `spec-a.md, spec-b.md`), or `[none]`.
 * @returns The rewritten markdown.
 * @throws When metadata field-block anchors are missing.
 */
export function setMetaDesign(content: string, value: string): string {
  return setMetaBulletFields(content, { Design: formatValue(value, "identifier-list") });
}

/**
 * Project a Candidate attestation identity into the managed work-unit record.
 *
 * @param content - The meta file's raw markdown.
 * @param candidateId - Canonical Candidate identity, or `[none]` to clear it.
 * @returns The rewritten markdown.
 */
export function setMetaCandidate(content: string, candidateId: string): string {
  return writePreformattedMetaBullet(content, "Candidate", candidateId);
}

/**
 * Write only the archive finalize facts through their field writers. Missing
 * PR URL and Completed bullets insert in field order, preserving existing
 * fields and every section; an omitted fact resolves to the null sentinel.
 *
 * @param content - Anchored metadata Markdown.
 * @param facts - The finalize facts; an omitted fact resolves to `[none]`.
 * @returns Markdown with only the finalize facts edited.
 * @throws When metadata field-block anchors are missing.
 */
export function setMetaFinalizeFields(
  content: string,
  facts: { prUrl?: string; completed?: string },
): string {
  return setMetaBulletFields(content, {
    "PR URL": facts.prUrl ?? "[none]",
    Completed: facts.completed ?? "[none]",
  });
}

/** The result of a {@link reconcileMetaFields} forward-reconcile pass. */
export interface ReconcileMetaResult {
  /** The reconciled markdown — byte-identical to the input on a no-op. */
  content: string;
  /** The bullet fields backfilled (absent marker → inserted), in render order; empty on a no-op. */
  backfilled: MetaFieldName[];
}

/**
 * Validate the managed meta field-block anchor shape required by forward
 * reconciliation and targeted field writes. Older metas without the closing
 * `---` rule remain readable, but transition code must refuse them before any
 * mutation because the healer cannot place backfilled fields safely.
 *
 * @param content - The meta file's raw markdown.
 * @param path - User-facing path to include in diagnostics.
 * @returns Diagnostics; empty means the field block is anchorable.
 */
export function validateMetaFieldBlockShape(content: string, path: string): string[] {
  const lines = content.split(/\r?\n/);
  const h1Idx = lines.findIndex((line) => /^# /.test(line));
  if (h1Idx === -1) {
    return [`${path}: missing metadata H1 heading (\`# Metadata: <name>\`)`];
  }

  const ruleIdx = lines.findIndex((line, i) => i > h1Idx && line.trim() === "---");
  if (ruleIdx === -1) {
    return [
      `${path}: missing closing \`---\` metadata delimiter after managed fields; `
        + "add a standalone `---` before any body sections.",
    ];
  }

  return [];
}

/** Build the bullet-marker regex for a field label — the `- **<name>:**` line test. */


/**
 * Insert absent managed bullet fields in canonical order, using an override
 * or each field's declared default. Present fields remain byte-identical,
 * even when an override names them, and all body sections survive. Optional
 * fields remain omitted unless an override supplies a renderable value.
 *
 * @param content - Anchored metadata Markdown.
 * @param overrides - Transition-appropriate backfill values for absent fields.
 * @returns Updated content and the names of bullets actually inserted.
 * @throws When metadata field-block anchors are missing.
 */
export function reconcileMetaFields(
  content: string,
  overrides: MetaProjectionOverrides = {},
): ReconcileMetaResult {
  const block = locateMetaFieldBlock(content);
  const fieldLines = block.lines.slice(block.h1Index + 1, block.fieldEndIndex);
  const backfilled: MetaFieldName[] = [];
  for (const field of META_FIELDS) {
    if (field.render !== "bullet") continue;
    if ("omitWhenAbsent" in field && !Object.prototype.hasOwnProperty.call(overrides, field.name)) continue;
    if (fieldLines.some(({ text }) => bulletMarkerRe(field.name).test(text))) continue;
    const written = writePreformattedMetaBullet(content, field.name, overrides[field.name] ?? field.default);
    if (written !== content) backfilled.push(field.name);
    content = written;
  }
  return { content, backfilled };
}

/** Normalize the managed three-row core table without changing any field value or surrounding byte.
 * @param content - Anchored metadata Markdown.
 * @returns Markdown with only table alignment changed.
 * @throws When metadata anchors or the core table are missing or malformed.
 */
export function normalizeMetaCoreTable(content: string): string {
  locateMetaFieldBlock(content);
  const located = locateMetaCoreTable(content);
  const rendered = renderCoreTable(
    (field) => located.renderedValues.get(field.name) ?? formatValue(field.default, field.valueClass),
    true,
  );
  const replacement = rendered
    .map((line, index) => `${line}${located.lineEndings[index] ?? ""}`)
    .join("");
  return `${content.slice(0, located.startOffset)}${replacement}${content.slice(located.endOffset)}`;
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
 * end-of-section. An absent bullet inserts in field order. Preformatted tokens
 * recover their semantic values before writing; identifier lists wrap at the
 * bullet width, and a cleared Next Action renders an em dash.
 *
 * @param content - The meta file's raw markdown.
 * @param updates - Field→new-value map; only the named fields are rewritten.
 * @returns The rewritten markdown.
 * @throws When anchors are missing, a core field is targeted, or Promotion Receipt is targeted.
 */
export function setMetaBulletFields(
  content: string,
  updates: Partial<Record<MetaFieldName, string>>,
): string {
  if (Object.prototype.hasOwnProperty.call(updates, "Promotion Receipt")) {
    throw new Error("Cannot set meta field: `Promotion Receipt` is immutable after initial rendering.");
  }
  locateMetaFieldBlock(content);
  for (const [name, value] of Object.entries(updates)) {
    content = writePreformattedMetaBullet(content, name as MetaFieldName, value);
  }
  return content;
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
export function parseMetaProjectionRecord(content: string): MetaProjectionRecord {
  const section = extractMetadataSection(content) ?? "";
  const table = parseCoreTable(section);
  const record = {} as MetaProjectionRecord;
  for (const field of META_FIELDS) {
    const fromTable = table && field.name in table ? table[field.name] : undefined;
    const raw = fromTable === undefined ? extractField(section, field.name) : fromTable;
    // Token fields strip to a bare value; `url` additionally unwraps the `<…>`
    // autolink (a real URL) before the backtick strip (a non-URL ref); narrative
    // keeps its code spans. (Core table values arrive pre-stripped and are all
    // non-narrative, so the strip is a no-op there.)
    if (raw === null || field.valueClass === "narrative") {
      record[field.name] = raw;
      continue;
    }

    const stripped = stripInlineCode(field.valueClass === "url" ? stripAutolink(raw) : raw);
    record[field.name] =
      field.valueClass === "identifier-list" ? normalizeIdentifierListValue(stripped) : stripped;
  }
  return MetaProjectionRecordSchema.parse(record);
}

/**
 * Recover the tolerant storage-independent adapter record from a meta projection.
 * Display sentinels normalize at this boundary; invalid closed-domain tokens stay
 * visible so callers can degrade one field without discarding independent evidence.
 */
export function parseMetaRecord(content: string): ParsedMetaRecord {
  const projection = parseMetaProjectionRecord(content);
  return ParsedMetaRecordSchema.parse({
    state: nullableProjectionValue(projection.State),
    owner: nullableProjectionValue(projection.Owner),
    branch: nullableProjectionValue(projection.Branch),
    workClass: unresolvedProjectionValue(projection.Class),
    priority: unresolvedProjectionValue(projection.Priority),
    cohort: nullableProjectionValue(projection.Cohort),
    dependsOn: parseIdentifierList(projection["Depends On"]),
    origin: projection.Origin === "[internal]" ? "internal" : nullableProjectionValue(projection.Origin),
    design: parseIdentifierList(projection.Design),
    taskList: nullableProjectionValue(projection["Task List"]),
    reviewRubric: nullableProjectionValue(projection["Review Rubric"]),
    promotionReceipt: nullableProjectionValue(projection["Promotion Receipt"]),
    candidateId: nullableProjectionValue(projection.Candidate),
    currentWorkflow: nullableProjectionValue(projection["Current Workflow"]),
    lastCompleted: nullableProjectionValue(projection["Last Completed"]),
    nextTask: nullableProjectionValue(projection["Next Task"]),
    blockers: nullableProjectionValue(projection.Blockers),
    nextAction: nullableProjectionValue(projection["Next Action"]),
    stateAtHandoff: nullableProjectionValue(projection["State at Handoff"]),
    commitAtHandoff: nullableProjectionValue(projection["Commit at Handoff"]),
    sessionType: normalizeSessionType(nullableProjectionValue(projection["Session Type"])),
    sessionContext: readMetaSectionBodies(content, "Session Context")[0] ?? null,
    completionNotes: readMetaSectionBodies(content, "Completion Notes"),
    releaseNotesEntry: readMetaSectionBodies(content, "Release Notes Entry"),
    prUrl: nullableProjectionValue(projection["PR URL"]),
    completed: nullableProjectionValue(projection.Completed),
  });
}

/** Convert a tolerant parsed adapter record to the strict durable contract. */
export function toMetaRecord(record: ParsedMetaRecord): MetaRecord | null {
  const parsed = MetaRecordSchema.safeParse(record);
  return parsed.success ? parsed.data : null;
}

function normalizeSessionType(value: string | null): string | null {
  const lowered = value?.toLowerCase();
  return lowered === "planning" || lowered === "execution" ? lowered : value;
}

function nullableProjectionValue(value: string | null): string | null {
  if (value === "—" || value === "[none]") return null;
  return value === "[TBD]" ? "TBD" : value;
}

function unresolvedProjectionValue(value: string | null): string | null {
  return nullableProjectionValue(value);
}

function normalizeIdentifierListValue(value: string): string {
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === PLACEHOLDER || isSentinel(trimmed)) return trimmed;
  const items = parseIdentifierList(trimmed);
  return items.length === 0 ? trimmed : items.join(", ");
}

/** Strip a surrounding `<…>` autolink to its bare target, leaving other forms intact. */
function stripAutolink(value: string): string {
  const m = /^<(.+)>$/.exec(value.trim());
  return m ? (m[1] ?? value) : value;
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
