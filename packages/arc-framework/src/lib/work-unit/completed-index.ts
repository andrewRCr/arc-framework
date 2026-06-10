/**
 * Shipped-work-unit predicate — the "has this WU shipped?" check, read from the
 * `completed/` archive.
 *
 * A shipped WU lives at `.arc/completed/<quarter>/NN_<slug>/` (the archival
 * layout from the work-organization model). Cohort closeout entries use
 * `NNa_cohort-<slug>/` and are deliberately excluded from this WU index.
 * {@link readShippedWorkUnits} scans every quarter once into a set of WU-name
 * slugs; {@link branchToWorkUnitSlug} normalizes a branch (`feat/foo` /
 * `plan/foo` → `foo`) to that key; and {@link isShippedWorkUnit} joins the two.
 * The check is local filesystem only — no git, no network.
 *
 * Shared by every shipped-WU consumer (the main-worktree stale-worktree sweep,
 * the retired-subdir reconciliation) so the normalization and the archive shape
 * are defined once.
 *
 * @module
 */

import { join } from "node:path";

/** Filesystem adapter — injected for unit testability; production binds `node:fs/promises`. */
export interface CompletedIndexFs {
  readdir(path: string): Promise<string[]>;
}

export interface ReadShippedWorkUnitsOptions {
  /** Repository root containing `.arc/` (the main worktree's checkout root). */
  cwd: string;
  fs: CompletedIndexFs;
}

/** `NN_<slug>` archive-directory shape; capture group 1 is the WU-name slug. */
const ARCHIVE_DIR_RE = /^\d+_(.+)$/u;
const COHORT_ARCHIVE_PREFIX = "cohort-";

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
      const match = ARCHIVE_DIR_RE.exec(entry);
      const slug = match?.[1];
      if (slug !== undefined && !slug.startsWith(COHORT_ARCHIVE_PREFIX)) {
        slugs.add(slug);
      }
    }
  }
  return slugs;
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
