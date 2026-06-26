/**
 * Retired-subdir detection — the read-only session-init surface for lingering
 * retired-WU user subdirs.
 *
 * A per-WU subdir under `user/{identity}/` is a retired candidate when its WU has
 * shipped (read from the `origin/<base>` `completed/` tree — the canonical,
 * branch-independent oracle) and it carries no unpushed local drift — the same
 * {@link planRetiredSubdirReconcile} decision the load / pull path acts on, read
 * against the same oracle so detection and remediation cannot disagree. This slot
 * only *surfaces* candidates; removal (with the `.internal/` backup) happens at
 * `arc user load` / `pull`.
 *
 * Follows the stale-worktree sweep's cheap-base / gated-expensive shape: the
 * local-subdir read is cheap; the shipped-ref read, the recent-notes read, and
 * the per-subdir drift computation fire only when a shipped subdir is actually
 * present, so the common no-lingering-subdir session pays nothing for them.
 *
 * @module
 */

import { join } from "node:path";

import type { GitExec } from "../git/exec.js";
import { serialize, type ReadDirFn, type ReadFileFn, type SyncManifest } from "../git/user-sync.js";
import {
  planRetiredSubdirReconcile,
  readRecentUserNotes,
  subdirsFromPaths,
  type RecentNote,
} from "../user-sync/index.js";
import { readShippedWorkUnitsFromRef } from "../work-unit/completed-index.js";

/**
 * The per-subdir drift signal, injected so this `lib/` module needn't import the
 * drift primitive from `commands/`. The composition root binds
 * `computeDriftingSubdirs`.
 */
export type ComputeDriftingSubdirs = (input: {
  localSubdirs: readonly string[];
  diskManifest: SyncManifest;
  recentNotes: readonly RecentNote[];
}) => Set<string>;

export interface RunRetiredSubdirDetectionOptions {
  /** Repository root containing `.arc/`. */
  cwd: string;
  /** Notes-owning identity whose `user/{identity}/` subdirs are scanned. */
  identity: string;
  /** Configured base branch — `shipped` is read from `origin/<baseBranch>`. */
  baseBranch: string;
  /** Git runner for the shipped-ref and recent-notes reads. */
  exec: GitExec;
  /** Recursive user-dir reader (relative file paths) — `UserIOContext.readDir`. */
  readDir: ReadDirFn;
  /** User-file content reader — `UserIOContext.readFile`; builds the drift basis. */
  readFile: ReadFileFn;
  /** Per-subdir drift signal (bound to `computeDriftingSubdirs` at the root). */
  computeDrift: ComputeDriftingSubdirs;
}

export interface RetiredSubdirDetectionResult {
  /**
   * Retired-WU user subdirs lingering locally — shipped and carrying no unpushed
   * local drift. Read-only: surfaced for the operator, not removed.
   */
  candidates: string[];
}

/**
 * Detect retired-WU user subdirs lingering under `user/{identity}/`.
 *
 * @param options - Repo root, identity, base branch, git/fs readers, and the
 *   injected drift signal.
 * @returns The lingering retired-subdir candidates (possibly empty).
 */
export async function runRetiredSubdirDetection(
  options: RunRetiredSubdirDetectionOptions,
): Promise<RetiredSubdirDetectionResult> {
  const { cwd, identity, baseBranch, exec, readDir, readFile, computeDrift } = options;
  const userDir = join(cwd, ".arc", "user", identity);

  const diskManifest = await serialize(userDir, readDir, readFile)
    .then((result) => result.manifest)
    .catch(() => ({ version: 2, files: {} }) satisfies SyncManifest);
  const localSubdirs = subdirsFromPaths(Object.keys(diskManifest.files));
  if (localSubdirs.length === 0) return { candidates: [] };

  const shipped = await readShippedWorkUnitsFromRef(exec, `origin/${baseBranch}`);
  const shippedPresent = localSubdirs.filter((subdir) => shipped.has(subdir));
  if (shippedPresent.length === 0) return { candidates: [] };

  const recentNotes = await readRecentUserNotes(exec, identity);
  const driftingSubdirs = computeDrift({ localSubdirs: shippedPresent, diskManifest, recentNotes });
  const { reconcile } = planRetiredSubdirReconcile({
    localSubdirs: shippedPresent,
    shipped,
    driftingSubdirs,
  });
  return { candidates: reconcile };
}
