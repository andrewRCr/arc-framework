/**
 * Retired-subdir detection — the read-only session-init surface for lingering
 * retired-WU user subdirs.
 *
 * A per-WU subdir under `user/{identity}/` is a retired candidate exactly when
 * its WU has shipped (read from the `origin/<base>` `completed/` tree — the
 * canonical, branch-independent oracle) — the same
 * {@link planRetiredSubdirReconcile} decision the load / pull path acts on, read
 * against the same oracle so detection and remediation cannot disagree. This slot
 * only *surfaces* candidates; removal (with the `.internal/` backup) happens at
 * `arc user load` / `pull`.
 *
 * Follows the stale-worktree sweep's cheap-base / gated-expensive shape: the
 * local-subdir read is cheap; the shipped-ref read fires only when a local subdir
 * is present, so the common no-lingering-subdir session pays nothing for it.
 *
 * @module
 */

import { join } from "node:path";

import type { GitExec } from "../git/exec.js";
import { serialize, type ReadDirFn, type ReadFileFn, type SyncManifest } from "../git/user-sync.js";
import { planRetiredSubdirReconcile, subdirsFromPaths } from "../user-sync/index.js";
import { readShippedWorkUnitsFromRef } from "../work-unit/completed-index.js";

export interface RunRetiredSubdirDetectionOptions {
  /** Repository root containing `.arc/`. */
  cwd: string;
  /** Notes-owning identity whose `user/{identity}/` subdirs are scanned. */
  identity: string;
  /** Configured base branch — `shipped` is read from `origin/<baseBranch>`. */
  baseBranch: string;
  /** Git runner for the shipped-ref read. */
  exec: GitExec;
  /** Recursive user-dir reader (relative file paths) — `UserIOContext.readDir`. */
  readDir: ReadDirFn;
  /** User-file content reader — `UserIOContext.readFile`. */
  readFile: ReadFileFn;
}

export interface RetiredSubdirDetectionResult {
  /**
   * Retired-WU user subdirs lingering locally — every shipped subdir present.
   * Read-only: surfaced for the operator, not removed.
   */
  candidates: string[];
}

/**
 * Detect retired-WU user subdirs lingering under `user/{identity}/`.
 *
 * @param options - Repo root, identity, base branch, and git/fs readers.
 * @returns The lingering retired-subdir candidates (possibly empty).
 */
export async function runRetiredSubdirDetection(
  options: RunRetiredSubdirDetectionOptions,
): Promise<RetiredSubdirDetectionResult> {
  const { cwd, identity, baseBranch, exec, readDir, readFile } = options;
  const userDir = join(cwd, ".arc", "user", identity);

  const diskManifest = await serialize(userDir, readDir, readFile)
    .then((result) => result.manifest)
    .catch(() => ({ version: 2, files: {} }) satisfies SyncManifest);
  const localSubdirs = subdirsFromPaths(Object.keys(diskManifest.files));
  if (localSubdirs.length === 0) return { candidates: [] };

  const shipped = await readShippedWorkUnitsFromRef(exec, `origin/${baseBranch}`);
  const { reconcile } = planRetiredSubdirReconcile({ localSubdirs, shipped });
  return { candidates: reconcile };
}
