/**
 * Filesystem source for the ready-mine slice — scans local planned metas and
 * resolves dependency satisfaction through the lifecycle index, producing the
 * render rows the user view's ready section consumes.
 *
 * Two reads, both local:
 *
 * - **Planned set** — every `meta-*.md` under `backlog/planned/**` (recursive, so
 *   both standalone and cohort-wrapped subdirs are covered), parsed into the
 *   render-relevant fields.
 * - **Lifecycle index** — the local lifecycle-complete index, including
 *   `completed/`, so dependency satisfaction can distinguish shipped targets
 *   from dangling edges.
 *
 * The pure {@link buildReadyMineSlice} applies the identity and unblocked filters.
 * Because every read is local, this source is always available — it never depends
 * on remote reachability, unlike the git-derived in-flight slice.
 *
 * @module
 */

import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";

import { parseIdentifierList, parseMetaRecord } from "../active/meta-reader.js";
import { buildLifecycleIndex } from "../work-unit/lifecycle-index.js";

import { buildReadyMineSlice, type PlannedWorkUnit } from "./ready-mine.js";
import type { StatusViewRow } from "./render.js";

/** `meta-<name>.md` filename shape; capture group 1 is the canonical WU-name. */
const META_FILE_RE = /^meta-(.+)\.md$/;

/** Planned-work root, relative to the repo. */
const PLANNED_SEGMENTS = [".arc", "backlog", "planned"] as const;

/** Options for {@link loadReadyMineSlice}. */
export interface LoadReadyMineSliceOptions {
  /** Repository root (the directory containing `.arc/`). */
  cwd: string;
  /** Owner to filter to; `null` keeps every planned WU. */
  identity: string | null;
}

/** Recursively collect `meta-*.md` paths under `dir`; a missing dir yields none. */
async function collectMetaFiles(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return []; // Missing directory — no metas to scan.
  }
  const out: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await collectMetaFiles(full)));
    } else if (META_FILE_RE.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** The canonical WU-name from a `meta-<name>.md` path. */
function wuNameOf(metaPath: string): string {
  const match = META_FILE_RE.exec(basename(metaPath));
  return match?.[1] ?? basename(metaPath);
}

/** Parse one planned meta into its render-relevant fields. */
async function parsePlanned(metaPath: string): Promise<PlannedWorkUnit> {
  const content = await readFile(metaPath, "utf8");
  // The view is advisory — one malformed meta must not crash the scan.
  let record;
  try {
    record = parseMetaRecord(content);
  } catch {
    record = parseMetaRecord("");
  }
  const { Owner: owner, Cohort: cohort, Class: workClass, Priority: priority } = record;
  return {
    name: wuNameOf(metaPath),
    ...(owner !== null ? { owner } : {}),
    dependsOn: parseIdentifierList(record["Depends On"]),
    ...(cohort !== null && cohort !== "[none]" ? { cohort } : {}),
    ...(workClass !== null ? { class: workClass } : {}),
    ...(priority !== null && priority !== "[none]" ? { priority } : {}),
  };
}

/**
 * Load the identity's ready-mine slice from local planned metas.
 *
 * @param options - Repository root and the identity filter.
 * @returns The ready render rows (owned, unblocked planned work).
 */
export async function loadReadyMineSlice(
  options: LoadReadyMineSliceOptions,
): Promise<StatusViewRow[]> {
  const { cwd, identity } = options;

  const plannedFiles = await collectMetaFiles(join(cwd, ...PLANNED_SEGMENTS));
  const planned = await Promise.all(plannedFiles.map(parsePlanned));
  const lifecycleIndex = await buildLifecycleIndex({
    cwd,
    fs: {
      readdir: (p) => readdir(p, { withFileTypes: true }),
      readFile: (p) => readFile(p, "utf8"),
    },
  });

  return buildReadyMineSlice(planned, lifecycleIndex, identity);
}
