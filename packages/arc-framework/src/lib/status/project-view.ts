/**
 * Project readiness view composer — renders `.arc/backlog/ROADMAP.md` from the
 * resolved project-readiness record graph.
 *
 * This is the file-writing counterpart to the shared status render primitive.
 * Resolved records feed a lifecycle index; dependency satisfaction then follows
 * canonical lifecycle predicates before rows group into In Flight, Ready,
 * Blocked depth bands, and Parked.
 *
 * @module
 */

import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";

import { validatePriority, validateState, type Priority, type WorkUnitState } from "../../commands/active/types.js";
import { parseIdentifierList, parseMetaRecord } from "../active/meta-reader.js";
import { buildLifecycleIndexFromRecords, type LifecycleIndex } from "../work-unit/lifecycle-index.js";
import { resolveSlugQuery } from "../work-unit/lifecycle-query.js";

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

/** Derivation warning facts the pure composer can elevate into the render. */
export interface ProjectReadinessDerivationWarning {
  code: "stale-location-dropped" | "stale-location-shadow";
  workUnit?: string;
  rendered: string;
}

/** Structured composer warning codes rendered with the project view. */
export type ProjectReadinessWarningCode = "dangling-dependency" | "stale-location-unshipped";

/** A project-readiness warning produced from dependency or provenance classification. */
export interface ProjectReadinessWarning {
  code: ProjectReadinessWarningCode;
  workUnit?: string;
  dependency?: string;
  rendered: string;
}

/** Dependency satisfaction fact computed from lifecycle classification. */
export type ProjectDependencySatisfaction = "satisfied" | "unsatisfied";

/** Readiness verdict supplied by the configured readiness provider. */
export type ProjectReadinessVerdict = "ready" | "blocked";

/** Batch readiness provider contract: records in, per-slug verdicts out. */
export interface ProjectReadinessProvider {
  resolve(records: readonly ProjectReadinessRecord[]): ReadonlyMap<string, ProjectReadinessVerdict>;
}

/** Per-record facts the render layer consumes to build readiness tiers. */
export interface ProjectReadinessFact {
  slug: string;
  dependencySatisfaction: ProjectDependencySatisfaction;
  readiness: ProjectReadinessVerdict;
  unsatisfiedDependencies: readonly string[];
}

/** Resolver output consumed by {@link composeProjectReadinessView}. */
export interface ProjectReadinessViewInput {
  title: string;
  records: ProjectReadinessRecord[];
  derivationWarnings: ProjectReadinessDerivationWarning[];
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
  /** Derivation warnings to classify against the same lifecycle index. */
  derivationWarnings?: readonly ProjectReadinessDerivationWarning[];
  /** Readiness provider; omitted uses dependency satisfaction as readiness. */
  readinessProvider?: ProjectReadinessProvider;
}

/** Render result plus the structured warnings displayed in the header. */
export interface ProjectReadinessViewResult {
  markdown: string;
  warnings: ProjectReadinessWarning[];
  facts: ProjectReadinessFact[];
}

/** A blocked planned row plus the unresolved edges it displays. */
interface BlockedRow {
  row: StatusViewRow;
  unsatisfied: string[];
}

interface DependencyClassification {
  unsatisfiedBySlug: ReadonlyMap<string, readonly string[]>;
  warnings: ProjectReadinessWarning[];
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
    derivationWarnings: [],
  };
}

function lifecycleIndexFromRecords(records: readonly ProjectReadinessRecord[]): LifecycleIndex {
  return buildLifecycleIndexFromRecords(
    records.map((record) => ({
      slug: record.slug,
      state: record.state,
      location: record.location,
      cohort: record.cohort ?? null,
      dependsOn: record.dependsOn,
      path: record.source.path,
    })),
  );
}

function classifyDependencies(
  records: readonly ProjectReadinessRecord[],
  index: LifecycleIndex,
): DependencyClassification {
  const warnings: ProjectReadinessWarning[] = [];
  const warned = new Set<string>();
  const unsatisfiedBySlug = new Map<string, string[]>();

  for (const record of records) {
    const unsatisfied: string[] = [];
    for (const dep of record.dependsOn) {
      const query = resolveSlugQuery(index, dep);
      if (query.state === "nonexistent") {
        unsatisfied.push(dep);
        const key = `${record.slug}\0${dep}`;
        if (!warned.has(key)) {
          warned.add(key);
          warnings.push({
            code: "dangling-dependency",
            workUnit: record.slug,
            dependency: dep,
            rendered: `\`${record.slug}\` depends on missing work unit \`${dep}\`; treating the edge as blocked.`,
          });
        }
      } else if (!query.shipped) {
        unsatisfied.push(dep);
      }
    }
    if (unsatisfied.length > 0) unsatisfiedBySlug.set(record.slug, unsatisfied);
  }

  return { unsatisfiedBySlug, warnings };
}

function elevatedDerivationWarnings(
  warnings: readonly ProjectReadinessDerivationWarning[],
  index: LifecycleIndex,
): ProjectReadinessWarning[] {
  return warnings.flatMap((warning): ProjectReadinessWarning[] => {
    if (warning.workUnit === undefined) return [];
    const query = resolveSlugQuery(index, warning.workUnit);
    if (query.shipped) return [];
    return [
      {
        code: "stale-location-unshipped",
        workUnit: warning.workUnit,
        rendered: `${warning.rendered} Work unit \`${warning.workUnit}\` has not shipped; treating the view as degraded.`,
      },
    ];
  });
}

/** Default provider: a record is ready exactly when all dependency edges are satisfied. */
export const depsOnlyReadinessProvider: ProjectReadinessProvider = {
  resolve(records) {
    const classification = classifyDependencies(records, lifecycleIndexFromRecords(records));
    return new Map(
      records.map((record) => [
        record.slug,
        unsatisfiedFor(classification, record.slug).length === 0 ? "ready" : "blocked",
      ]),
    );
  },
};

/** Build a render row from a resolved record, filtering dependency display to unsatisfied edges. */
function rowOf(
  record: ProjectReadinessRecord,
  unsatisfiedDeps: readonly string[],
  includeState: boolean,
): StatusViewRow {
  return {
    workUnit: record.slug,
    ...(includeState ? { state: `\`${record.state}\`` } : {}),
    priority: record.priority,
    ...(record.owner !== undefined ? { owner: record.owner } : {}),
    dependsOn: [...unsatisfiedDeps],
    ...(record.cohort !== undefined ? { cohort: record.cohort } : {}),
  };
}

function unsatisfiedFor(classification: DependencyClassification, slug: string): readonly string[] {
  return classification.unsatisfiedBySlug.get(slug) ?? [];
}

function readinessFor(
  verdicts: ReadonlyMap<string, ProjectReadinessVerdict>,
  slug: string,
): ProjectReadinessVerdict {
  return verdicts.get(slug) ?? "blocked";
}

function factsFor(
  records: readonly ProjectReadinessRecord[],
  classification: DependencyClassification,
  readiness: ReadonlyMap<string, ProjectReadinessVerdict>,
): ProjectReadinessFact[] {
  return records.map((record) => {
    const unsatisfiedDependencies = unsatisfiedFor(classification, record.slug);
    return {
      slug: record.slug,
      dependencySatisfaction: unsatisfiedDependencies.length === 0 ? "satisfied" : "unsatisfied",
      readiness: readinessFor(readiness, record.slug),
      unsatisfiedDependencies: [...unsatisfiedDependencies],
    };
  });
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

function renderWarnings(warnings: readonly ProjectReadinessWarning[]): string[] {
  if (warnings.length === 0) return [];
  return ["", "## Warnings", "", ...warnings.map((warning) => `- ${warning.rendered}`)];
}

/**
 * Compose the project readiness view from resolved records.
 *
 * @param options - Header freshness marker, title, and resolved records.
 * @returns The markdown body plus structured warnings, without requiring a trailing newline.
 */
export function composeProjectReadinessViewResult(
  options: ComposeProjectReadinessViewOptions,
): ProjectReadinessViewResult {
  const records = [...options.records];
  const index = lifecycleIndexFromRecords(records);
  const classification = classifyDependencies(records, index);
  const warnings = [
    ...classification.warnings,
    ...elevatedDerivationWarnings(options.derivationWarnings ?? [], index),
  ];
  const readiness = (options.readinessProvider ?? depsOnlyReadinessProvider).resolve(records);
  const facts = factsFor(records, classification, readiness);
  const factsBySlug = new Map(facts.map((fact) => [fact.slug, fact]));

  const active = records
    .filter((record) => record.location === "active" && record.scheduling !== "parked")
    .map((record) => rowOf(record, unsatisfiedFor(classification, record.slug), true));

  const planned = records.filter((record) => record.location === "planned" && record.scheduling !== "parked");
  const ready = planned
    .filter((record) => record.state === "Planning")
    .filter((record) => {
      const fact = factsBySlug.get(record.slug);
      return fact?.dependencySatisfaction === "satisfied" && fact.readiness === "ready";
    })
    .map((record) => rowOf(record, [], false));

  const blocked = new Map<string, BlockedRow>();
  for (const record of planned.filter((item) => item.state === "Planning")) {
    const fact = factsBySlug.get(record.slug);
    if (fact?.dependencySatisfaction === "satisfied" && fact.readiness === "ready") continue;
    const unsatisfied = unsatisfiedFor(classification, record.slug);
    blocked.set(record.slug, { row: rowOf(record, unsatisfied, false), unsatisfied: [...unsatisfied] });
  }

  const parked = records
    .filter((record) => record.scheduling === "parked" || (record.location === "planned" && record.state === "Active"))
    .map((record) => rowOf(record, unsatisfiedFor(classification, record.slug), false));
  const blockedGroups = blockedDepths(blocked);

  const lines = [
    `# ${options.title}`,
    "",
    `> **Generated from meta files — re-render at ceremony boundaries.** Last rendered against \`${options.renderedRef}\`.`,
    ...renderWarnings(warnings),
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

  return { markdown: lines.join("\n"), warnings, facts };
}

/**
 * Compose only the project readiness markdown body.
 *
 * @param options - Header freshness marker, title, and resolved records.
 * @returns The complete markdown body, without requiring a trailing newline.
 */
export function composeProjectReadinessView(
  options: ComposeProjectReadinessViewOptions,
): string {
  return composeProjectReadinessViewResult(options).markdown;
}
