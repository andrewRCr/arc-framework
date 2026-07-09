/**
 * The `completed/` archive layout — the one place that knows what a shipped-WU
 * path looks like, on both the read and write sides.
 *
 * A shipped WU lives at `.arc/completed/<quarter>/NN_<slug>/` (the archival
 * layout from the work-organization model). Cohort closeout entries use
 * `NNa_cohort-<slug>/` and are deliberately excluded from the WU index.
 *
 * - **Read side** — {@link readShippedWorkUnits} scans the working-tree archive,
 *   while {@link readShippedWorkUnitsFromRef} scans a base ref's archive. Both
 *   produce WU-name slugs; {@link branchToWorkUnitSlug} normalizes a branch
 *   (`feat/foo` / `plan/foo` → `foo`) to that key; {@link isShippedWorkUnit} joins
 *   the two. Shared by every shipped-WU consumer (the main-worktree stale-worktree
 *   sweep, retired-subdir reconciliation, user-sync reconciliation) so the
 *   normalization is defined once.
 * - **Write side** — {@link computeArchiveDestination} computes the dated/numbered
 *   destination an `archive` sweep relocates into: the quarter from an injected
 *   clock and the next completion-order `NN` from a scan of that quarter.
 *
 * The working-tree scan is local filesystem only; ref-tree consumers inject the
 * git runner for branch-independent shipped-state reads.
 *
 * @module
 */

import { join } from "node:path";

import type { GitExec } from "../git/exec.js";

/** Filesystem adapter — injected for unit testability; production binds `node:fs/promises`. */
export interface CompletedIndexFs {
  readdir(path: string): Promise<string[]>;
}

export interface ReadShippedWorkUnitsOptions {
  /** Repository root containing `.arc/` (the main worktree's checkout root). */
  cwd: string;
  fs: CompletedIndexFs;
}

/** Archive facts for one shipped work unit read from a `completed/` tree. */
export interface ShippedWorkUnitRecord {
  /** WU-name slug from the `NN_<slug>` archive directory. */
  slug: string;
  /** Completion date from `meta-<slug>.md`, or null when absent/unparseable. */
  completedAt: string | null;
}

/** `NN_<slug>` archive-directory shape; capture group 1 is the WU-name slug. */
const ARCHIVE_DIR_RE = /^\d+_(.+)$/u;
const COHORT_ARCHIVE_PREFIX = "cohort-";

/**
 * Completion-order prefix shape; capture group 1 is the numeric `NN`. Matches
 * both a WU entry (`NN_<slug>`) and a cohort closeout sidecar (`NNa_cohort-<slug>`,
 * which shares its final member's number) — the optional letter is consumed so a
 * cohort sidecar still contributes its number to the quarter's max.
 */
const SEQUENCE_PREFIX_RE = /^(\d+)[a-z]?_/u;

/** `.arc/completed/` path prefix the ref-tree reader strips to reach `<quarter>/<entry>/...`. */
const COMPLETED_PATH_PREFIX = ".arc/completed/";
const COMPLETED_META_READ_CONCURRENCY = 16;

/**
 * The shipped WU-name slug an archive-directory name carries, or `null` when the
 * entry is a cohort closeout (`NNa_cohort-<slug>`) or not an `NN_<slug>` archive
 * dir at all. The one place the archive-dir → slug rule lives, shared by the
 * filesystem scan and the ref-tree read.
 *
 * @param entry - An archive-directory name (`NN_<slug>`)
 * @returns The WU-name slug, or `null` for a non-WU entry
 */
function slugFromArchiveDir(entry: string): string | null {
  const slug = ARCHIVE_DIR_RE.exec(entry)?.[1];
  if (slug === undefined || slug.startsWith(COHORT_ARCHIVE_PREFIX)) return null;
  return slug;
}

/**
 * Scan `{cwd}/.arc/completed/<quarter>/NN_<slug>` directories into the set of
 * shipped WU-name slugs, skipping `NNa_cohort-<slug>` closeout entries. Every
 * quarter is scanned (a lingering worktree's WU may have shipped in any
 * quarter); the per-quarter readdir is cheap local I/O.
 *
 * Resilient by design: an absent `completed/` directory yields an empty set,
 * and a quarter entry that is not a readable directory (a loose file at the
 * `completed/` root) is skipped rather than thrown.
 *
 * @param options - Repository root and filesystem adapter
 * @returns The set of shipped WU-name slugs
 */
export async function readShippedWorkUnits(
  options: ReadShippedWorkUnitsOptions,
): Promise<Set<string>> {
  const { cwd, fs } = options;
  const completedDir = join(cwd, ".arc", "completed");

  let quarters: string[];
  try {
    quarters = await fs.readdir(completedDir);
  } catch {
    return new Set();
  }

  const slugs = new Set<string>();
  for (const quarter of quarters) {
    let entries: string[];
    try {
      entries = await fs.readdir(join(completedDir, quarter));
    } catch {
      continue;
    }
    for (const entry of entries) {
      const slug = slugFromArchiveDir(entry);
      if (slug !== null) slugs.add(slug);
    }
  }
  return slugs;
}

/**
 * Scan the shipped WU-name slugs from a git ref's `.arc/completed/` tree, rather
 * than the working tree. A non-integrating machine's feature-branch working tree
 * lacks a sibling's archival commit (it landed on `<base>`), so the working-tree
 * scan {@link readShippedWorkUnits} reads stale; reading the canonical
 * `origin/<base>` ref answers "has this WU shipped?" branch-independently.
 *
 * Reads `git ls-tree -r --name-only <ref> -- .arc/completed/` and parses the
 * `<quarter>/<NN_slug>/...` directory segment from each path. An unresolvable
 * ref (absent, fetch-only clone) yields an empty set rather than throwing — the
 * reconcile fails safe to preserve.
 *
 * @param exec - Git executor, pre-bound to the repository root
 * @param ref - The ref whose `completed/` tree to read (e.g. `origin/main`)
 * @returns The set of shipped WU-name slugs
 */
export async function readShippedWorkUnitsFromRef(
  exec: GitExec,
  ref: string,
): Promise<Set<string>> {
  return new Set((await readShippedWorkUnitRecordsFromRef(exec, ref)).keys());
}

/** Read shipped WU archive facts from a git ref's `.arc/completed/` tree. */
export async function readShippedWorkUnitRecordsFromRef(
  exec: GitExec,
  ref: string,
): Promise<Map<string, ShippedWorkUnitRecord>> {
  let stdout: string;
  try {
    ({ stdout } = await exec("git", ["ls-tree", "-r", "--name-only", ref, "--", COMPLETED_PATH_PREFIX]));
  } catch {
    return new Map();
  }

  const records = new Map<string, ShippedWorkUnitRecord>();
  const metaPaths = new Map<string, string>();
  for (const line of stdout.split("\n")) {
    const path = line.trim();
    if (!path.startsWith(COMPLETED_PATH_PREFIX)) continue;
    // `<quarter>/<NN_slug>/<file...>` — segment 1 is the archive directory.
    const segments = path.slice(COMPLETED_PATH_PREFIX.length).split("/");
    const entry = segments[1];
    if (entry === undefined) continue;
    const slug = slugFromArchiveDir(entry);
    if (slug === null) continue;
    records.set(slug, { slug, completedAt: null });
    if (segments.slice(2).join("/") === `meta-${slug}.md`) {
      metaPaths.set(slug, path);
    }
  }

  const metaEntries = [...metaPaths.entries()];
  for (let i = 0; i < metaEntries.length; i += COMPLETED_META_READ_CONCURRENCY) {
    const batch = metaEntries.slice(i, i + COMPLETED_META_READ_CONCURRENCY);
    await Promise.all(batch.map(async ([slug, path]) => {
      const completedAt = await readCompletedDateFromMeta(exec, ref, path);
      records.set(slug, { slug, completedAt });
    }));
  }

  return records;
}

async function readCompletedDateFromMeta(
  exec: GitExec,
  ref: string,
  path: string,
): Promise<string | null> {
  let stdout: string;
  try {
    ({ stdout } = await exec("git", ["show", `${ref}:${path}`]));
  } catch {
    return null;
  }
  const value = /^- \*\*Completed:\*\* (.+)$/mu.exec(stdout)?.[1]?.trim();
  if (value === undefined || value === "[none]") return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
}

/**
 * Strip a branch's type-prefix to its WU-name slug. A WU branch is
 * `<type>/<slug>` (`feat/foo`, `plan/foo`); the slug is everything after the
 * first `/`. A branch with no `/` (e.g. `main`) carries no WU and returns
 * `null`.
 *
 * @param branch - Branch short-name
 * @returns The WU-name slug, or `null` when the branch is not a WU branch
 */
export function branchToWorkUnitSlug(branch: string): string | null {
  const slash = branch.indexOf("/");
  if (slash === -1) return null;
  const slug = branch.slice(slash + 1);
  return slug === "" ? null : slug;
}

/**
 * Whether a branch's WU has shipped — its normalized slug is present in the
 * shipped set.
 *
 * @param branch - Branch short-name
 * @param shipped - Shipped WU-name slugs from {@link readShippedWorkUnits}
 * @returns Whether the branch's WU is shipped
 */
export function isShippedWorkUnit(branch: string, shipped: ReadonlySet<string>): boolean {
  const slug = branchToWorkUnitSlug(branch);
  return slug !== null && shipped.has(slug);
}

/**
 * Injected clock — production binds `() => new Date()`; tests pass a fixed
 * instant so the derived quarter is deterministic (the three-layer seam).
 */
export type Clock = () => Date;

/** Inputs for {@link computeArchiveDestination}. */
export interface ComputeArchiveDestinationOptions {
  /** Repository root containing `.arc/`. */
  cwd: string;
  fs: CompletedIndexFs;
  /** Reference clock — the quarter grouping comes from `clock()`. */
  clock: Clock;
  /** WU-name slug — the `{name}` in `{NN}_{name}`. */
  name: string;
}

/** The computed archive destination for an `archive` sweep. */
export interface ArchiveDestination {
  /**
   * cwd-relative destination directory for the `relocate` leg, e.g.
   * `.arc/completed/2026-q2/25_foo`.
   */
  toDir: string;
  /** The quarter grouping, `YYYY-qN`. */
  quarter: string;
  /** The assigned completion-order prefix (`NN`), zero-padded to two digits. */
  sequence: string;
}

/** The `YYYY-qN` quarter label for a date (month 0–2 → q1, 3–5 → q2, …). */
function quarterLabel(date: Date): string {
  const quarter = Math.floor(date.getMonth() / 3) + 1;
  return `${date.getFullYear()}-q${quarter}`;
}

/**
 * Compute the dated/numbered destination an `archive` sweep relocates a WU's
 * artifact set into: `completed/{YYYY-qN}/{NN}_{name}/`. The quarter comes from
 * the injected clock; `NN` is the next completion-order number after the highest
 * already present in that quarter (counting cohort closeout sidecars, which share
 * their final member's number), resetting per quarter. Pure deterministic
 * mechanics — no judgment, no git.
 *
 * An absent quarter directory (the first archive of a new quarter) yields `01`.
 *
 * @param options - Repository root, filesystem adapter, clock, and the WU slug.
 * @returns The destination directory, quarter, and assigned sequence number.
 */
export async function computeArchiveDestination(
  options: ComputeArchiveDestinationOptions,
): Promise<ArchiveDestination> {
  const { cwd, fs, clock, name } = options;
  const quarter = quarterLabel(clock());

  let entries: string[];
  try {
    entries = await fs.readdir(join(cwd, ".arc", "completed", quarter));
  } catch (err) {
    // Only an absent quarter directory defaults to empty; real errors (EACCES,
    // etc.) must fail fast rather than silently mis-assign sequence numbers.
    const code =
      typeof err === "object" && err !== null && "code" in err
        ? String((err as { code?: unknown }).code)
        : undefined;
    if (code !== "ENOENT") throw err;
    entries = [];
  }

  let maxSequence = 0;
  for (const entry of entries) {
    const numeric = SEQUENCE_PREFIX_RE.exec(entry)?.[1];
    if (numeric !== undefined) maxSequence = Math.max(maxSequence, Number.parseInt(numeric, 10));
  }

  const sequence = String(maxSequence + 1).padStart(2, "0");
  return { toDir: `.arc/completed/${quarter}/${sequence}_${name}`, quarter, sequence };
}
