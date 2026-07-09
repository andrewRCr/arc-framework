/**
 * Project readiness view composer — renders `.arc/backlog/ROADMAP.md` from the
 * local meta-file graph.
 *
 * This is the file-writing counterpart to the shared status render primitive:
 * scan `active/`, `backlog/planned/`, and `backlog/provisional/`; resolve
 * dependency satisfaction by pending-set presence; group rows into In Flight,
 * Ready, Blocked depth bands, and Parked; then render canonical markdown tables.
 *
 * @module
 */

import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";

import { validatePriority, validateState, type Priority, type WorkUnitState } from "../../commands/active/types.js";
import { parseIdentifierList, parseMetaRecord } from "../active/meta-reader.js";

import { renderStatusTable, type StatusColumn, type StatusViewRow } from "./render.js";

/** Minimal directory-entry shape needed by the recursive meta scan. */
export interface ProjectViewDirEntry {
  name: string;
  isDirectory(): boolean;
}

/** Filesystem seams for composing the project readiness view. */
export interface ProjectViewFs {
  readdir: (path: string) => Promise<ProjectViewDirEntry[]>;
  readFile: (path: string) => Promise<string>;
}

/** Lifecycle tier represented by a project-readiness record. */
export type ProjectReadinessLocation = "active" | "planned" | "provisional" | "completed";

/** Source family that contributed a project-readiness record. */
export type ProjectReadinessSourceKind = "active-meta" | "backlog-stub" | "completed-index";

/** Provenance for one source candidate that contributed to a merged record. */
export interface ProjectReadinessRecordSource {
  kind: ProjectReadinessSourceKind;
  location: ProjectReadinessLocation;
  path?: string;
}

/** A candidate record before slug-keyed source precedence is applied. */
export interface ProjectReadinessRecordCandidate {
  slug: string;
  location: ProjectReadinessLocation;
  state: WorkUnitState;
  owner?: string;
  priority: Priority;
  dependsOn: string[];
  cohort?: string;
  source?: ProjectReadinessRecordSource;
}

/** One resolved project-readiness record after source precedence is applied. */
export interface ProjectReadinessRecord extends ProjectReadinessRecordCandidate {
  source: ProjectReadinessRecordSource;
  sources: readonly ProjectReadinessRecordSource[];
  scheduling?: "parked";
}

/** Resolver output consumed by {@link composeProjectReadinessView}. */
export interface ProjectReadinessViewInput {
  title: string;
  records: ProjectReadinessRecord[];
}

/** Options for the tree-backed resolver. */
export interface ResolveProjectReadinessViewInputOptions {
  /** Repository root containing `.arc/`. */
  cwd: string;
  /** Optional H1 text without the leading `#`; existing ROADMAP title is preserved when omitted. */
  title?: string;
  /** Injectable filesystem for tests and handler-owned I/O contexts. */
  fs?: ProjectViewFs;
}

/** Options for {@link composeProjectReadinessView}. */
export interface ComposeProjectReadinessViewOptions {
  /** Freshness marker to print in the header. */
  renderedRef: string;
  /** H1 text without the leading `#`. */
  title: string;
  /** Already-resolved project-readiness records. */
  records: readonly ProjectReadinessRecord[];
}

/** A blocked planned row plus the unresolved edges it displays. */
interface BlockedRow {
  row: StatusViewRow;
  unsatisfied: string[];
}

const META_FILE_RE = /^meta-(.+)\.md$/u;
const DEFAULT_TITLE = "Roadmap: Project Readiness";

export const PROJECT_IN_FLIGHT_COLUMNS = [
  "state",
  "workUnit",
  "priority",
  "owner",
  "dependsOn",
  "cohort",
] as const satisfies readonly StatusColumn[];

export const PROJECT_READINESS_COLUMNS = [
  "workUnit",
  "priority",
  "owner",
  "dependsOn",
  "cohort",
] as const satisfies readonly StatusColumn[];

const DEFAULT_FS: ProjectViewFs = {
  readdir: (path) => readdir(path, { withFileTypes: true }),
  readFile: (path) => readFile(path, "utf8"),
};

/** Collect `meta-*.md` files recursively under `dir`; a missing directory yields none. */
async function collectMetaFiles(dir: string, fs: ProjectViewFs): Promise<string[]> {
  let entries: ProjectViewDirEntry[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }

  const out: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await collectMetaFiles(full, fs)));
    } else if (META_FILE_RE.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Resolve the canonical slug from a meta filename. */
function slugOf(path: string): string {
  return META_FILE_RE.exec(basename(path))?.[1] ?? basename(path);
}

function sourceKindFor(location: ProjectReadinessLocation): ProjectReadinessSourceKind {
  switch (location) {
    case "active":
      return "active-meta";
    case "planned":
    case "provisional":
      return "backlog-stub";
    case "completed":
      return "completed-index";
  }
}

function sourceFor(location: ProjectReadinessLocation, path: string | undefined): ProjectReadinessRecordSource {
  return {
    kind: sourceKindFor(location),
    location,
    ...(path !== undefined ? { path } : {}),
  };
}

/** Parse one meta into the renderer's compact project-view row shape. */
async function readProjectMeta(
  fs: ProjectViewFs,
  location: ProjectReadinessLocation,
  path: string,
): Promise<ProjectReadinessRecordCandidate | null> {
  let record;
  try {
    record = parseMetaRecord(await fs.readFile(path));
  } catch {
    return null;
  }

  const state = validateState(record.State);
  if (state === "unknown") return null;

  return {
    slug: slugOf(path),
    location,
    state,
    ...(record.Owner !== null && record.Owner !== "[none]" ? { owner: record.Owner } : {}),
    priority: validatePriority(record.Priority),
    dependsOn: parseIdentifierList(record["Depends On"]),
    ...(record.Cohort !== null && record.Cohort !== "[none]" ? { cohort: record.Cohort } : {}),
    source: sourceFor(location, path),
  };
}

/** Load lifecycle-tier metas from disk into unmerged record candidates. */
async function loadProjectRecords(cwd: string, fs: ProjectViewFs): Promise<ProjectReadinessRecordCandidate[]> {
  const roots = [
    { location: "active" as const, dir: join(cwd, ".arc", "active") },
    { location: "planned" as const, dir: join(cwd, ".arc", "backlog", "planned") },
    { location: "provisional" as const, dir: join(cwd, ".arc", "backlog", "provisional") },
    { location: "completed" as const, dir: join(cwd, ".arc", "completed") },
  ];

  const metas: ProjectReadinessRecordCandidate[] = [];
  for (const root of roots) {
    for (const path of await collectMetaFiles(root.dir, fs)) {
      const meta = await readProjectMeta(fs, root.location, path);
      if (meta !== null) metas.push(meta);
    }
  }
  return metas;
}

const SOURCE_PRECEDENCE: Record<ProjectReadinessLocation, number> = {
  active: 3,
  planned: 2,
  provisional: 1,
  completed: 0,
};

function compareCandidates(
  left: ProjectReadinessRecordCandidate,
  right: ProjectReadinessRecordCandidate,
): number {
  const precedence = SOURCE_PRECEDENCE[right.location] - SOURCE_PRECEDENCE[left.location];
  if (precedence !== 0) return precedence;
  return sourcePathOf(left).localeCompare(sourcePathOf(right));
}

function sourcePathOf(candidate: ProjectReadinessRecordCandidate): string {
  return candidate.source?.path ?? `${candidate.location}/${candidate.slug}`;
}

function isParkedPointer(candidate: ProjectReadinessRecordCandidate): boolean {
  return candidate.location === "planned" && candidate.state === "Active";
}

/**
 * Merge source candidates into one slug-keyed project-readiness record set.
 *
 * At-ref active metas win the row-field precedence over backlog stubs and completed
 * records. Parking is an axis overlay: a planned Active pointer owns scheduling
 * tier membership even when an active meta supplies the row fields.
 */
export function mergeProjectReadinessRecords(
  candidates: readonly ProjectReadinessRecordCandidate[],
): ProjectReadinessRecord[] {
  const groups = new Map<string, ProjectReadinessRecordCandidate[]>();
  for (const candidate of candidates) {
    groups.set(candidate.slug, [...(groups.get(candidate.slug) ?? []), candidate]);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, group]) => {
      const ordered = [...group].sort(compareCandidates);
      const winner = ordered[0];
      if (winner === undefined) throw new Error("project-readiness merge requires a non-empty group");
      const parked = group.some(isParkedPointer);
      const source = winner.source ?? sourceFor(winner.location, undefined);
      return {
        ...winner,
        source,
        sources: ordered.map((candidate) => candidate.source ?? sourceFor(candidate.location, undefined)),
        ...(parked ? { location: "planned" as const, scheduling: "parked" as const } : {}),
      };
    });
}

/** Preserve a project-specific ROADMAP H1 when one already exists. */
async function resolveTitle(cwd: string, fs: ProjectViewFs, title: string | undefined): Promise<string> {
  if (title !== undefined) return title;
  try {
    const firstLine = (await fs.readFile(join(cwd, ".arc", "backlog", "ROADMAP.md"))).split(/\r?\n/, 1)[0];
    if (firstLine?.startsWith("# ")) return firstLine.slice(2).trim();
  } catch {
    // No existing ROADMAP: fall through to the generated default.
  }
  return DEFAULT_TITLE;
}

/** Resolve tree-backed records and the title read into a compose-ready input. */
export async function resolveProjectReadinessViewInput(
  options: ResolveProjectReadinessViewInputOptions,
): Promise<ProjectReadinessViewInput> {
  const fs = options.fs ?? DEFAULT_FS;
  return {
    title: await resolveTitle(options.cwd, fs, options.title),
    records: mergeProjectReadinessRecords(await loadProjectRecords(options.cwd, fs)),
  };
}

/** Build a render row from a resolved record, filtering dependency display to pending edges. */
function rowOf(
  record: ProjectReadinessRecord,
  pendingNames: ReadonlySet<string>,
  includeState: boolean,
): StatusViewRow {
  const pendingDeps = record.dependsOn.filter((dep) => pendingNames.has(dep));
  return {
    workUnit: record.slug,
    ...(includeState ? { state: `\`${record.state}\`` } : {}),
    priority: record.priority,
    ...(record.owner !== undefined ? { owner: record.owner } : {}),
    dependsOn: pendingDeps,
    ...(record.cohort !== undefined ? { cohort: record.cohort } : {}),
  };
}

/** Depth-band blocked rows by longest unresolved blocked-dependency chain. */
function blockedDepths(blocked: ReadonlyMap<string, BlockedRow>): Map<number, StatusViewRow[]> {
  const memo = new Map<string, number>();

  function depthOf(slug: string, visiting: ReadonlySet<string>): number {
    const cached = memo.get(slug);
    if (cached !== undefined) return cached;
    const item = blocked.get(slug);
    if (item === undefined) return 0;
    if (visiting.has(slug)) return 1;

    const nextVisiting = new Set(visiting);
    nextVisiting.add(slug);
    const childDepth = Math.max(0, ...item.unsatisfied.map((dep) => depthOf(dep, nextVisiting)));
    const depth = childDepth + 1;
    memo.set(slug, depth);
    return depth;
  }

  const groups = new Map<number, StatusViewRow[]>();
  for (const [slug, item] of blocked) {
    const depth = depthOf(slug, new Set());
    groups.set(depth, [...(groups.get(depth) ?? []), item.row]);
  }
  return groups;
}

/** Render one tier, using a stable placeholder when the tier is empty. */
function renderTier(rows: readonly StatusViewRow[], columns: readonly StatusColumn[], empty: string): string {
  return rows.length === 0 ? empty : renderStatusTable(rows, columns);
}

/**
 * Compose the project readiness view from resolved records.
 *
 * @param options - Header freshness marker, title, and resolved records.
 * @returns The complete markdown body, without requiring a trailing newline.
 */
export function composeProjectReadinessView(
  options: ComposeProjectReadinessViewOptions,
): string {
  const records = [...options.records];
  const pendingNames = new Set(
    records
      .filter((record) => record.location !== "completed")
      .map((record) => record.slug),
  );

  const active = records
    .filter((record) => record.location === "active" && record.scheduling !== "parked")
    .map((record) => rowOf(record, pendingNames, true));

  const planned = records.filter((record) => record.location === "planned" && record.scheduling !== "parked");
  const ready = planned
    .filter((record) => record.state === "Planning")
    .filter((record) => record.dependsOn.every((dep) => !pendingNames.has(dep)))
    .map((record) => rowOf(record, pendingNames, false));

  const blocked = new Map<string, BlockedRow>();
  for (const record of planned.filter((item) => item.state === "Planning")) {
    const unsatisfied = record.dependsOn.filter((dep) => pendingNames.has(dep));
    if (unsatisfied.length > 0) {
      blocked.set(record.slug, { row: rowOf(record, pendingNames, false), unsatisfied });
    }
  }

  const parked = records
    .filter((record) => record.scheduling === "parked" || (record.location === "planned" && record.state === "Active"))
    .map((record) => rowOf(record, pendingNames, false));
  const blockedGroups = blockedDepths(blocked);

  const lines = [
    `# ${options.title}`,
    "",
    `> **Generated from meta files — re-render at ceremony boundaries.** Last rendered against \`${options.renderedRef}\`.`,
    "",
    "This view is a derived readiness and dependency map. Tier membership follows dependency satisfaction: a",
    "unit is Ready once the units it depends on have shipped, and Blocked units are banded by how many",
    "unsatisfied dependency hops separate them from a startable root. Within each tier, rows are ordered by",
    "Priority (P1 → P2 → P3), then cohort, then canonical name. Cohort renders as the leaf segment; the full",
    "path lives in each meta's Cohort field. Cohort membership is a logical grouping, not a scheduling constraint.",
    "",
    "---",
    "",
    "## In Flight",
    "",
    renderTier(active, PROJECT_IN_FLIGHT_COLUMNS, "_No work units in flight._"),
    "",
    "## Ready",
    "",
    renderTier(ready, PROJECT_READINESS_COLUMNS, "_No ready work units._"),
    "",
    "## Blocked",
    "",
  ];

  if (blockedGroups.size === 0) {
    lines.push("_No blocked work units._", "");
  } else {
    for (const depth of [...blockedGroups.keys()].sort((a, b) => a - b)) {
      lines.push(`### Depth ${depth}`, "", renderStatusTable(blockedGroups.get(depth) ?? [], PROJECT_READINESS_COLUMNS), "");
    }
  }

  if (parked.length > 0) {
    lines.push("## Parked", "", renderStatusTable(parked, PROJECT_READINESS_COLUMNS), "");
  }

  lines.push("---", "", "_Pre-commitment thinking that hasn't been sequenced yet lives in `backlog/provisional/`._");

  return lines.join("\n");
}
