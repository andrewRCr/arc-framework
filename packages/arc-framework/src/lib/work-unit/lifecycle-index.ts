/**
 * The lifecycle-complete work-unit index — one scan, two projections.
 *
 * A single pass over the four lifecycle directories (`backlog/provisional/`,
 * `backlog/planned/`, `active/`, `completed/`) collects every work unit into an
 * in-memory map keyed by slug:
 *
 * ```text
 * slug → { phase, location, cohort, path }
 * ```
 *
 * Phase + location come from {@link resolveLifecyclePosition} (location from the
 * containing tier, phase from the meta `**State:**` field — no git inference);
 * cohort comes from {@link metaCohortField}; the slug is the `meta-<slug>.md`
 * filename. The meta schema is parsed once per file through the shared
 * {@link parseMetaRecord} reader and never re-parsed here.
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

import { metaCohortField } from "../active/cohort-consistency.js";
import { parseMetaRecord } from "../active/meta-reader.js";
import {
  resolveLifecyclePosition,
  type Location,
  type Phase,
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

/** One resolved work unit in the index. */
export interface LifecycleIndexEntry {
  /** WU-name slug, from the `meta-<slug>.md` filename. */
  slug: string;
  phase: Phase;
  location: Location;
  /** Cohort path the WU's `**Cohort:**` field names, or `null` when standalone. */
  cohort: string | null;
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
 * Read one meta file into an index entry, or skip it. Resolution failure at any
 * step — unreadable file, malformed core-block table, an unresolvable
 * `(phase, location)`, or a non-`meta-<slug>.md` name — drops the entry rather
 * than throwing, so a single bad meta never aborts the scan.
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

  const slugMatch = META_FILENAME_RE.exec(basename(filePath));
  const slug = slugMatch?.[1];
  if (slug === undefined) return null;

  const relPath = relative(cwd, filePath).split(sep).join("/");

  let position: ReturnType<typeof resolveLifecyclePosition>;
  let cohortRaw: string;
  try {
    const record = parseMetaRecord(content);
    position = resolveLifecyclePosition({ path: relPath, state: record.State });
    cohortRaw = metaCohortField(content);
  } catch {
    return null;
  }
  if (position === null) return null;

  return {
    slug,
    phase: position.phase,
    location: position.location,
    cohort: cohortRaw === "" ? null : cohortRaw,
    path: relPath,
  };
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
