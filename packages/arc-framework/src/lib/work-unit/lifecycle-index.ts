/**
 * The lifecycle-complete work-unit index — one scan, two projections.
 *
 * A single pass over the four lifecycle directories (`backlog/provisional/`,
 * `backlog/planned/`, `active/`, `completed/`) collects every work unit into an
 * in-memory map keyed by slug:
 *
 * ```text
 * slug → { phase, location, cohort, dependsOn, path }
 * ```
 *
 * Phase + location come from {@link resolveLifecyclePosition} (location from the
 * containing tier, phase from the meta `**State:**` field — no git inference);
 * cohort comes from {@link metaCohortField}; the `**Depends On:**` edges from
 * {@link parseIdentifierList}; the slug is the `meta-<slug>.md` filename. The
 * meta schema is parsed once per file through the shared {@link parseMetaRecord}
 * reader and never re-parsed here.
 *
 * The index is built fresh per invocation — in-memory, process-scoped, no
 * persisted cache. The CLI process is short-lived and the meta set is small
 * (tens of files), so a scan per call is cheap, and both downstream projections
 * (the slug→state resolver and the cohort-membership resolver) read the one
 * built index rather than each re-walking the tree. Resilience is by
 * construction: a missing lifecycle directory contributes nothing, and an
 * unreadable or malformed meta is skipped, never fatal.
 *
 * Injectable filesystem dependencies follow the idiom of
 * {@link "./completed-index.ts"} and the session-init cohort-doc resolver;
 * production binds `node:fs/promises`.
 *
 * @module
 */

import { basename, join, relative, sep } from "node:path";

import { validateState } from "../../commands/active/types.js";
import { metaCohortField } from "../active/cohort-consistency.js";
import { parseIdentifierList, parseMetaRecord } from "../active/meta-reader.js";
import {
  resolveLifecyclePosition,
  type Location,
  type Phase,
  type LifecyclePosition,
} from "./lifecycle-state.js";

/** `meta-<slug>.md` filename shape; capture group 1 is the slug. */
const META_FILENAME_RE = /^meta-(.+)\.md$/u;

/**
 * One directory entry from {@link LifecycleIndexFs.readdir} — the minimal shape
 * the walk needs. `node:fs` `Dirent` (from `readdir(dir, { withFileTypes: true })`)
 * satisfies it structurally.
 */
export interface DirEntry {
  name: string;
  isDirectory(): boolean;
}

/**
 * Filesystem seam — injected for unit testability. Unlike the flat
 * `readdir → string[]` of the completed-index, the recursive walk over the
 * nested `backlog/` trees needs directory detection, so `readdir` returns
 * file-type-bearing entries. Production binds
 * `readdir(p, { withFileTypes: true })` and `readFile(p, "utf8")`.
 */
export interface LifecycleIndexFs {
  /** Directory entries with file-type info; rejects when the directory is absent. */
  readdir(path: string): Promise<DirEntry[]>;
  /** Read a file as UTF-8; rejects when the path is absent or unreadable. */
  readFile(path: string): Promise<string>;
}

/** Inputs for {@link buildLifecycleIndex}. */
export interface BuildLifecycleIndexOptions {
  /** Repository root containing `.arc/`. */
  cwd: string;
  fs: LifecycleIndexFs;
}

/** A resolved lifecycle record for callers that already parsed the work-unit fields. */
export interface LifecycleRecordInput {
  /** WU-name slug, from the logical work-unit identity. */
  slug: string;
  /** Raw or validated `State` field value; unrecognized values are skipped. */
  state: string | null;
  /** Logical lifecycle tier for the record. */
  location: Location;
  /** Cohort path, `[none]` / empty / null when standalone. */
  cohort?: string | null;
  /** Dependency slugs from `Depends On`; omitted means no dependencies. */
  dependsOn?: readonly string[];
  /** Optional cwd-relative source path for diagnostics. */
  path?: string;
}

/** One resolved work unit in the index. */
export interface LifecycleIndexEntry {
  /** WU-name slug, from the `meta-<slug>.md` filename. */
  slug: string;
  phase: Phase;
  location: Location;
  /** Cohort path the WU's `**Cohort:**` field names, or `null` when standalone. */
  cohort: string | null;
  /** Dependency slugs from the WU's `**Depends On:**` edges; empty when none. */
  dependsOn: string[];
  /** Meta path relative to `cwd`, forward-slash normalized. */
  path: string;
}

/** The lifecycle-complete index — slug → resolved entry. */
export type LifecycleIndex = Map<string, LifecycleIndexEntry>;

/** A lifecycle directory to scan and whether its tree nests work units. */
interface Tier {
  root: string;
  /** `active/` is a flat `meta-*.md` enumeration; the backlog and archive trees nest. */
  recursive: boolean;
}

/**
 * Recursively (or, when `recursive` is false, shallowly) yield every
 * `meta-*.md` path under `dir`. A missing or unreadable directory yields
 * nothing — the missing-tier resilience guarantee. Cohort docs (`cohort-*.md`)
 * and archive closeout dirs naturally fall away: only `meta-*.md` files match.
 */
async function* walkMetaFiles(
  dir: string,
  fs: LifecycleIndexFs,
  recursive: boolean,
): AsyncGenerator<string> {
  let entries: DirEntry[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (recursive) yield* walkMetaFiles(full, fs, true);
    } else if (META_FILENAME_RE.test(entry.name)) {
      yield full;
    }
  }
}

/**
 * Build one index entry from a meta's cwd-relative path and content, or `null`
 * to skip it. The pure parse core shared by the disk walk ({@link readEntry}) and
 * the files-in builder ({@link buildLifecycleIndexFromMetas}): a
 * non-`meta-<slug>.md` name, a malformed core-block table, or an unresolvable
 * `(phase, location)` all drop the entry rather than throwing, so one bad meta
 * never aborts the caller.
 *
 * @param path - Meta path, cwd-relative and forward-slash normalized — supplies
 *   the slug (its basename) and the location axis (its containing tier).
 * @param content - The meta file's raw text.
 * @returns The resolved entry, or `null` when it cannot be placed.
 */
export function entryFromMeta(path: string, content: string): LifecycleIndexEntry | null {
  const slug = META_FILENAME_RE.exec(basename(path))?.[1];
  if (slug === undefined) return null;

  let position: LifecyclePosition | null;
  let cohortRaw: string;
  let dependsOn: string[];
  try {
    const record = parseMetaRecord(content);
    position = resolveLifecyclePosition({ path, state: record.State });
    cohortRaw = metaCohortField(content);
    dependsOn = parseIdentifierList(record["Depends On"]);
  } catch {
    return null;
  }
  if (position === null) return null;

  return {
    slug,
    phase: position.phase,
    location: position.location,
    cohort: cohortRaw === "" ? null : cohortRaw,
    dependsOn,
    path,
  };
}

/**
 * Read one meta file into an index entry, or skip it. An unreadable file drops
 * the entry (the missing-file resilience guarantee); every other resolution
 * failure is handled by {@link entryFromMeta}.
 */
async function readEntry(
  filePath: string,
  cwd: string,
  fs: LifecycleIndexFs,
): Promise<LifecycleIndexEntry | null> {
  let content: string;
  try {
    content = await fs.readFile(filePath);
  } catch {
    return null;
  }
  const relPath = relative(cwd, filePath).split(sep).join("/");
  return entryFromMeta(relPath, content);
}

/**
 * Build the lifecycle-complete index in a single scan across the four
 * lifecycle directories. Returns a fresh map every call — no persisted cache.
 *
 * @param options - Repository root and the injected filesystem seam.
 * @returns The slug→entry index for every resolvable work unit on disk.
 */
export async function buildLifecycleIndex(
  options: BuildLifecycleIndexOptions,
): Promise<LifecycleIndex> {
  const { cwd, fs } = options;
  const arc = join(cwd, ".arc");
  const tiers: Tier[] = [
    { root: join(arc, "active"), recursive: false },
    { root: join(arc, "backlog", "planned"), recursive: true },
    { root: join(arc, "backlog", "provisional"), recursive: true },
    { root: join(arc, "completed"), recursive: true },
  ];

  const index: LifecycleIndex = new Map();
  for (const tier of tiers) {
    for await (const filePath of walkMetaFiles(tier.root, fs, tier.recursive)) {
      const entry = await readEntry(filePath, cwd, fs);
      if (entry !== null) index.set(entry.slug, entry);
    }
  }
  return index;
}

/**
 * Build the lifecycle-complete index from an in-memory set of already-read meta
 * files — the synchronous, filesystem-free counterpart to
 * {@link buildLifecycleIndex}. Each `path` is cwd-relative (forward-slash) and
 * supplies the location axis; malformed or unresolvable metas are skipped, never
 * fatal. This lets a synchronous caller (e.g. the cohort-consistency validator,
 * which gathers its own staged-tree files) source membership from the same index
 * projection without duplicating the membership semantics or going async.
 *
 * @param metas - Already-read metas as `{ path, content }`, paths cwd-relative.
 * @returns The slug→entry index for every resolvable meta in the set.
 */
export function buildLifecycleIndexFromMetas(
  metas: ReadonlyArray<{ path: string; content: string }>,
): LifecycleIndex {
  const index: LifecycleIndex = new Map();
  for (const { path, content } of metas) {
    const entry = entryFromMeta(path, content);
    if (entry !== null) index.set(entry.slug, entry);
  }
  return index;
}

function fallbackRecordPath(record: LifecycleRecordInput): string {
  switch (record.location) {
    case "active":
      return `.arc/active/meta-${record.slug}.md`;
    case "planned":
      return `.arc/backlog/planned/meta-${record.slug}.md`;
    case "provisional":
      return `.arc/backlog/provisional/meta-${record.slug}.md`;
    case "completed":
      return `.arc/completed/meta-${record.slug}.md`;
  }
}

function normalizeRecordCohort(cohort: string | null | undefined): string | null {
  if (cohort === undefined || cohort === null || cohort === "" || cohort === "[none]") {
    return null;
  }
  return cohort;
}

/**
 * Build the lifecycle-complete index from already-resolved records.
 *
 * This is the record-backed counterpart to {@link buildLifecycleIndexFromMetas}:
 * callers supply slug, state, location, cohort, and dependency fields directly
 * instead of raw meta text. Invalid state values are skipped so degraded records
 * cannot poison the whole projection.
 *
 * @param records - Resolved lifecycle records.
 * @returns The slug→entry index for every resolvable record in the set.
 */
export function buildLifecycleIndexFromRecords(
  records: readonly LifecycleRecordInput[],
): LifecycleIndex {
  const index: LifecycleIndex = new Map();
  for (const record of records) {
    const phase = validateState(record.state);
    if (phase === "unknown") continue;
    index.set(record.slug, {
      slug: record.slug,
      phase,
      location: record.location,
      cohort: normalizeRecordCohort(record.cohort),
      dependsOn: [...(record.dependsOn ?? [])],
      path: record.path ?? fallbackRecordPath(record),
    });
  }
  return index;
}
