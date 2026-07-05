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

/** Options for {@link composeProjectReadinessView}. */
export interface ComposeProjectReadinessViewOptions {
  /** Repository root containing `.arc/`. */
  cwd: string;
  /** Freshness marker to print in the header. */
  renderedRef: string;
  /** Optional H1 text without the leading `#`; existing ROADMAP title is preserved when omitted. */
  title?: string;
  /** Injectable filesystem for tests and handler-owned I/O contexts. */
  fs?: ProjectViewFs;
}

/** A parsed meta row with enough lifecycle and render facts for the project view. */
interface ProjectMeta {
  slug: string;
  location: "active" | "planned" | "provisional";
  state: WorkUnitState;
  owner?: string;
  priority: Priority;
  dependsOn: string[];
  cohort?: string;
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

/** Parse one meta into the renderer's compact project-view row shape. */
async function readProjectMeta(
  fs: ProjectViewFs,
  location: ProjectMeta["location"],
  path: string,
): Promise<ProjectMeta | null> {
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
  };
}

/** Load active/planned/provisional metas from disk. */
async function loadProjectMetas(cwd: string, fs: ProjectViewFs): Promise<ProjectMeta[]> {
  const roots = [
    { location: "active" as const, dir: join(cwd, ".arc", "active") },
    { location: "planned" as const, dir: join(cwd, ".arc", "backlog", "planned") },
    { location: "provisional" as const, dir: join(cwd, ".arc", "backlog", "provisional") },
  ];

  const metas: ProjectMeta[] = [];
  for (const root of roots) {
    for (const path of await collectMetaFiles(root.dir, fs)) {
      const meta = await readProjectMeta(fs, root.location, path);
      if (meta !== null) metas.push(meta);
    }
  }
  return metas;
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

/** Build a render row from a parsed meta, filtering dependency display to pending edges. */
function rowOf(meta: ProjectMeta, pendingNames: ReadonlySet<string>, includeState: boolean): StatusViewRow {
  const pendingDeps = meta.dependsOn.filter((dep) => pendingNames.has(dep));
  return {
    workUnit: meta.slug,
    ...(includeState ? { state: `\`${meta.state}\`` } : {}),
    priority: meta.priority,
    ...(meta.owner !== undefined ? { owner: meta.owner } : {}),
    dependsOn: pendingDeps,
    ...(meta.cohort !== undefined ? { cohort: meta.cohort } : {}),
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
 * Compose the project readiness view from local meta files.
 *
 * @param options - Repository root, header freshness marker, and optional I/O seams.
 * @returns The complete markdown body, without requiring a trailing newline.
 */
export async function composeProjectReadinessView(
  options: ComposeProjectReadinessViewOptions,
): Promise<string> {
  const fs = options.fs ?? DEFAULT_FS;
  const title = await resolveTitle(options.cwd, fs, options.title);
  const metas = await loadProjectMetas(options.cwd, fs);
  const pendingNames = new Set(metas.map((meta) => meta.slug));

  const active = metas
    .filter((meta) => meta.location === "active")
    .map((meta) => rowOf(meta, pendingNames, true));

  const planned = metas.filter((meta) => meta.location === "planned");
  const ready = planned
    .filter((meta) => meta.state === "Planning")
    .filter((meta) => meta.dependsOn.every((dep) => !pendingNames.has(dep)))
    .map((meta) => rowOf(meta, pendingNames, false));

  const blocked = new Map<string, BlockedRow>();
  for (const meta of planned.filter((item) => item.state === "Planning")) {
    const unsatisfied = meta.dependsOn.filter((dep) => pendingNames.has(dep));
    if (unsatisfied.length > 0) {
      blocked.set(meta.slug, { row: rowOf(meta, pendingNames, false), unsatisfied });
    }
  }

  const parked = planned
    .filter((meta) => meta.state === "Active")
    .map((meta) => rowOf(meta, pendingNames, false));
  const blockedGroups = blockedDepths(blocked);

  const lines = [
    `# ${title}`,
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
