/** Canonical meta field descriptors, value formatting and Markdown rendering. */
import { MetaRecordSchema, type MetaRecord as SemanticMetaRecord, type MetaSemanticKey } from "../../../active/meta-schema.js";
import { displayWidth, padToDisplayWidth } from "../../../markdown/display-width.js";

/** How a field is laid out in the markdown projection. */
export type MetaRenderMode = "core-table" | "bullet";

/**
 * The value-formatting class for a field's *real* (non-sentinel) values. This
 * is the proto-schema axis a later code-owned schema maps directly: `enum` →
 * a closed Capitalized token set, `identifier` → a single slug / filename /
 * branch, `identifier-list` → one or more comma-separated identifiers rendered
 * with each element individually backticked (`` `a`, `b` ``), `url` → a
 * navigable locator rendered as a clickable `<…>` autolink when it is an
 * `http(s)` URL, falling back to a backticked identifier for a non-URL reference
 * (an issue ref in `Origin`), `narrative` → free prose. Bracket sentinels
 * (`[none]` / `[internal]` / `[TBD]`) are a cross-cutting form detected at
 * render/parse time and are orthogonal to this class — a field permits a
 * sentinel when its `default` is one.
 */
export type MetaValueClass = "enum" | "identifier" | "identifier-list" | "url" | "narrative";

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
  /** Storage-agnostic code-facing key for this projection label. */
  readonly key: MetaSemanticKey;
  /** Value rendered when the caller supplies no override for this field. */
  readonly default: string;
  /** Omit the field entirely when its semantic value is absent. */
  readonly omitWhenAbsent?: boolean;
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
  { name: "State", key: "state", default: "—", group: "core", render: "core-table", valueClass: "enum" },
  { name: "Owner", key: "owner", default: "—", group: "core", render: "core-table", valueClass: "identifier" },
  { name: "Branch", key: "branch", default: "—", group: "core", render: "core-table", valueClass: "identifier" },
  { name: "Class", key: "workClass", default: "[TBD]", group: "core", render: "core-table", valueClass: "enum" },
  { name: "Priority", key: "priority", default: "P3", group: "core", render: "core-table", valueClass: "enum" },
  { name: "Cohort", key: "cohort", default: "[none]", group: "cohort", render: "bullet", valueClass: "identifier" },
  { name: "Depends On", key: "dependsOn", default: "[none]", group: "cohort", render: "bullet", valueClass: "identifier-list" },
  { name: "Origin", key: "origin", default: "[internal]", group: "reference", render: "bullet", valueClass: "url" },
  { name: "Design", key: "design", default: "[none]", group: "reference", render: "bullet", valueClass: "identifier-list" },
  { name: "Task List", key: "taskList", default: "[none]", group: "reference", render: "bullet", valueClass: "identifier" },
  { name: "Review Rubric", key: "reviewRubric", default: "[none]", group: "reference", render: "bullet", valueClass: "identifier" },
  {
    name: "Promotion Receipt",
    key: "promotionReceipt",
    default: "[none]",
    group: "reference",
    render: "bullet",
    valueClass: "identifier",
    omitWhenAbsent: true,
  },
  {
    name: "Candidate",
    key: "candidateId",
    default: "[none]",
    group: "reference",
    render: "bullet",
    valueClass: "identifier",
    omitWhenAbsent: true,
  },
  { name: "Current Workflow", key: "currentWorkflow", default: "[none]", group: "progress", render: "bullet", valueClass: "identifier" },
  { name: "Last Completed", key: "lastCompleted", default: "[none]", group: "progress", render: "bullet", valueClass: "narrative" },
  { name: "Next Task", key: "nextTask", default: "[none]", group: "progress", render: "bullet", valueClass: "narrative" },
  { name: "Blockers", key: "blockers", default: "[none]", group: "progress", render: "bullet", valueClass: "narrative" },
  { name: "Next Action", key: "nextAction", default: "—", group: "directive", render: "bullet", valueClass: "narrative" },
  { name: "State at Handoff", key: "stateAtHandoff", default: "[none]", group: "handoff",
    render: "bullet", valueClass: "identifier", omitWhenAbsent: true },
  { name: "Commit at Handoff", key: "commitAtHandoff", default: "[none]", group: "handoff",
    render: "bullet", valueClass: "identifier", omitWhenAbsent: true },
  { name: "Session Type", key: "sessionType", default: "[none]", group: "handoff",
    render: "bullet", valueClass: "enum", omitWhenAbsent: true },
  { name: "PR URL", key: "prUrl", default: "[none]", group: "finalize", render: "bullet", valueClass: "url" },
  { name: "Completed", key: "completed", default: "[none]", group: "finalize", render: "bullet", valueClass: "narrative" },
] as const satisfies readonly MetaFieldDescriptor[];

/** Header labels that identify the managed core table. */
export const CORE_FIELD_NAMES = META_FIELDS
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
 * @param raw - Bare comma-separated identifiers or absence.
 * @returns Trimmed identifiers with empty elements omitted.
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
export type MetaProjectionOverrides = Partial<Record<MetaFieldName, string>>;

/** Creation fields accepted by fresh metadata rendering; section bodies have separate writers. */
export type MetaRenderOverrides = Partial<Omit<MetaRecord, "sessionContext" | "completionNotes" | "releaseNotesEntry">>;

/** The structured field record recovered from a meta projection by {@link parseMetaRecord}. */
/** Strict durable semantic record type. */
export type MetaRecord = SemanticMetaRecord;

/** The em-dash placeholder for a required-but-unset field (distinct from a `[…]` sentinel). */
export const PLACEHOLDER = "—";

/** A bracket sentinel token — `[none]`, `[internal]`, `[TBD]`. */
const SENTINEL_RE = /^\[[^\]]+\]$/;

/** Recognize a bracketed sentinel value.
 * @param value - Bare projected value.
 * @returns Whether it uses the bracketed sentinel form.
 */
export function isSentinel(value: string): boolean {
  return SENTINEL_RE.test(value.trim());
}

function capitalizeFirst(value: string): string {
  return value.length === 0 ? value : `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

/** Whether a value is an `http(s)` URL — the `url` value class's autolink test. */
const HTTP_URL_RE = /^https?:\/\//i;

/** Managed bullet lines target the project markdown wrap column. */
export const META_BULLET_WRAP_COLUMN = 120;

/**
 * Format a field value for the markdown projection per its value class. Bracket
 * sentinels and the em-dash placeholder render bare (the bracket is itself the
 * machine signal); enum tokens render Capitalized + backticked, identifiers
 * backticked as-is, identifier-list values render each comma-separated element
 * individually backticked (`` `a`, `b` `` — two discrete tokens, not one
 * compound span), narrative fields as plain prose.
 * @param value - Bare field value.
 * @param valueClass - Its canonical formatting class.
 * @returns The Markdown value with sentinels preserved.
 */
export function formatValue(value: string, valueClass: MetaValueClass): string {
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
    case "url":
      // A navigable locator: clickable `<…>` autolink for a real URL (lint-safe,
      // no bare-URL MD034), backticked identifier for a non-URL ref (an issue ref).
      return HTTP_URL_RE.test(value) ? `<${value}>` : `\`${value}\``;
    case "narrative":
      return value;
  }
}

/**
 * Render the core block as a single-row, pre-aligned markdown table —
 * `State | Owner | Branch | Class | Priority` — its columns padded so the pipes
 * line up in raw markdown. (`MD013 tables:false` exempts the table from the
 * line-length gate.)
 * @param valueOf - Value for each core field.
 * @param valuesAreRendered - Whether cells already hold Markdown formatting.
 * @returns The aligned header, separator, and value rows.
 */
export function renderCoreTable(
  valueOf: (field: MetaFieldDescriptor) => string,
  valuesAreRendered = false,
): string[] {
  const columns = META_FIELDS.filter((f) => f.render === "core-table").map((f) => {
    // Bold the header so the table's keys read as labels in raw markdown,
    // matching the `**Field:**` bullet labels (parse strips the bold on read).
    const header = `**${f.name}**`;
    const value = valueOf(f);
    const cell = valuesAreRendered ? value : formatValue(value, f.valueClass);
    return { header, cell, width: Math.max(displayWidth(header), displayWidth(cell)) };
  });
  const headerRow = `| ${columns.map((c) => padToDisplayWidth(c.header, c.width)).join(" | ")} |`;
  const separatorRow = `| ${columns.map((c) => "-".repeat(c.width)).join(" | ")} |`;
  const valueRow = `| ${columns.map((c) => padToDisplayWidth(c.cell, c.width)).join(" | ")} |`;
  return [headerRow, separatorRow, valueRow];
}

/**
 * Render the non-core fields as ordered bullet groups, blank-line separated.
 * Multi-line values render their first line after the label and indent each
 * continuation two spaces to align under the bullet — list-continuation-valid
 * markdown that {@link parseMetaRecord} recovers unchanged. Identifier lists
 * additionally wrap on item boundaries at the project markdown column.
 * @param valueOf - Value for each bullet descriptor.
 * @returns Ordered groups with wrapped continuation values.
 */
export function renderBullets(valueOf: (field: MetaFieldDescriptor) => string): string[] {
  const lines: string[] = [];
  let prevGroup: string | null = null;
  for (const field of META_FIELDS) {
    if (field.render !== "bullet") continue;
    const value = valueOf(field);
    if ("omitWhenAbsent" in field && value === field.default) continue;
    if (prevGroup !== null && field.group !== prevGroup) lines.push("");
    lines.push(...renderMetaBullet(field, value));
    prevGroup = field.group;
  }
  return lines;
}

/** Render one managed bullet with its canonical wrapping and value formatting.
 * @param field - Bullet descriptor.
 * @param value - Bare semantic projection value or its unset sentinel.
 * @param prefix - Existing marker and spacing, or the canonical bullet marker.
 * @returns The field's line and any indented continuation lines.
 */
export function renderMetaBullet(field: MetaFieldDescriptor, value: string, prefix = `- **${field.name}:** `): string[] {
  const [first = "", ...rest] = renderBulletValueLines(field, value, prefix.length);
  return [`${prefix}${first}`, ...rest.map((line) => `  ${line}`)];
}

function renderBulletValueLines(
  field: MetaFieldDescriptor,
  value: string,
  firstPrefixLength: number,
): string[] {
  if (field.valueClass !== "identifier-list" || value === PLACEHOLDER || isSentinel(value)) {
    return formatValue(value, field.valueClass).split("\n");
  }

  const items = parseIdentifierList(value).map((item) => `\`${item}\``);
  if (items.length === 0) return [formatValue(value, field.valueClass)];
  return wrapCommaList(items, firstPrefixLength);
}

/** Wrap identifiers on item boundaries at the canonical bullet width.
 * @param items - Individually formatted identifier values.
 * @param firstPrefixLength - First line's managed-field prefix width.
 * @returns The first value line followed by continuation values.
 */
export function wrapCommaList(items: readonly string[], firstPrefixLength: number): string[] {
  const lines: string[] = [];
  let current = "";
  let prefixLength = firstPrefixLength;

  items.forEach((item, index) => {
    const segment = index === items.length - 1 ? item : `${item},`;
    const candidate = current === "" ? segment : `${current} ${segment}`;
    if (current !== "" && prefixLength + candidate.length > META_BULLET_WRAP_COLUMN) {
      lines.push(current);
      current = segment;
      prefixLength = 2;
      return;
    }
    current = candidate;
  });

  if (current !== "") lines.push(current);
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
export function renderMetaProjectionFile(
  wuName: string,
  overrides: MetaProjectionOverrides = {},
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
 * Render a complete canonical meta projection from semantic-key overrides.
 * Required semantic values have no display-placeholder default and fail schema
 * validation when omitted; all other fields use their durable semantic defaults.
 *
 * @param wuName - Work-unit name for the H1
 * @param overrides - Partial storage-independent semantic record
 * @returns Canonical full-layout Markdown
 */
export function renderMetaFile(
  wuName: string,
  overrides: MetaRenderOverrides = {},
): string {
  const record = MetaRecordSchema.parse({
    state: undefined,
    owner: undefined,
    branch: null,
    workClass: "TBD",
    priority: "P3",
    cohort: null,
    dependsOn: [],
    origin: "internal",
    design: [],
    taskList: null,
    reviewRubric: null,
    promotionReceipt: null,
    candidateId: null,
    currentWorkflow: null,
    lastCompleted: null,
    nextTask: null,
    blockers: null,
    nextAction: null,
    prUrl: null,
    completed: null,
    ...overrides,
  });

  return renderMetaProjectionFile(wuName, {
    State: record.state,
    Owner: record.owner,
    Branch: renderNullable(record.branch),
    Class: record.workClass === "TBD" ? "[TBD]" : record.workClass,
    Priority: record.priority === "TBD" ? "[TBD]" : record.priority,
    Cohort: renderNullable(record.cohort),
    "Depends On": renderIdentifierList(record.dependsOn),
    Origin: record.origin === "internal" ? "[internal]" : record.origin,
    Design: renderIdentifierList(record.design),
    "Task List": renderNullable(record.taskList),
    "Review Rubric": renderNullable(record.reviewRubric),
    "Promotion Receipt": renderNullable(record.promotionReceipt),
    Candidate: renderNullable(record.candidateId),
    "Current Workflow": renderNullable(record.currentWorkflow),
    "Last Completed": renderNullable(record.lastCompleted),
    "Next Task": renderNullable(record.nextTask),
    Blockers: renderNullable(record.blockers),
    "Next Action": record.nextAction ?? "—",
    "State at Handoff": renderNullable(record.stateAtHandoff),
    "Commit at Handoff": renderNullable(record.commitAtHandoff),
    "Session Type": renderNullable(record.sessionType),
    "PR URL": renderNullable(record.prUrl),
    Completed: renderNullable(record.completed),
  });
}

/** Render a nullable token with the unset sentinel.
 * @param value - Semantic token or absence.
 * @returns The token or the unset sentinel.
 */
export function renderNullable(value: string | null): string {
  return value ?? "[none]";
}

/** Render identifiers as a comma-separated bare value.
 * @param values - Semantic identifier list.
 * @returns A list ready for value formatting, or the unset sentinel.
 */
export function renderIdentifierList(values: readonly string[]): string {
  return values.length === 0 ? "[none]" : values.join(", ");
}

