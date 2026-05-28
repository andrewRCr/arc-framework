/**
 * Retired-subdir detection — the read-only session-init surface for lingering
 * retired-WU user subdirs.
 *
 * A per-WU subdir under `user/{identity}/` is a retired candidate when it is
 * present locally, its WU has shipped, and no note in the recent window still
 * carries it — the same {@link planRetiredSubdirReconcile} decision the load /
 * pull path acts on. This slot only *surfaces* candidates; removal (with the
 * `.internal/` backup) happens at `arc user load` / `pull`.
 *
 * Follows the stale-worktree sweep's cheap-base / gated-expensive shape: the
 * local-subdir read and the `completed/` read are cheap local I/O; the
 * recent-notes read (git) fires only when a shipped subdir is actually present,
 * so the common no-lingering-subdir session pays nothing for it.
 *
 * @module
 */

import { join } from "node:path";

import type { GitExec } from "../git/exec.js";
import type { DirEntry } from "../git/user-sync.js";
import {
  collectNotesWuNames,
  planRetiredSubdirReconcile,
  readRecentUserNotes,
  subdirsFromPaths,
} from "../user-sync/index.js";
import { readShippedWorkUnits, type CompletedIndexFs } from "../work-unit/completed-index.js";

export interface RunRetiredSubdirDetectionOptions {
  /** Repository root containing `.arc/`. */
  cwd: string;
  /** Notes-owning identity whose `user/{identity}/` subdirs are scanned. */
  identity: string;
  /** Git runner for the gated recent-notes read. */
  exec: GitExec;
  /** Recursive user-dir reader (relative file paths) — `UserIOContext.readDir`. */
  readDir: (dirPath: string) => Promise<DirEntry[]>;
  /** `.arc/completed/` reader for the shipped set; injected for testability. */
  fs: CompletedIndexFs;
}

export interface RetiredSubdirDetectionResult {
  /**
   * Retired-WU user subdirs lingering locally — shipped and absent from the
   * recent-notes window. Read-only: surfaced for the operator, not removed.
   */
  candidates: string[];
}

/**
 * Detect retired-WU user subdirs lingering under `user/{identity}/`.
 *
 * @param options - Repo root, identity, and the git / filesystem readers.
 * @returns The lingering retired-subdir candidates (possibly empty).
 */
export async function runRetiredSubdirDetection(
  options: RunRetiredSubdirDetectionOptions,
): Promise<RetiredSubdirDetectionResult> {
  const { cwd, identity, exec, readDir, fs } = options;
  const userDir = join(cwd, ".arc", "user", identity);

  const entries = await readDir(userDir).catch(() => [] as DirEntry[]);
  const localSubdirs = subdirsFromPaths(entries.map((entry) => entry.name));
  if (localSubdirs.length === 0) return { candidates: [] };

  const shipped = await readShippedWorkUnits({ cwd, fs });
  const shippedPresent = localSubdirs.filter((subdir) => shipped.has(subdir));
  if (shippedPresent.length === 0) return { candidates: [] };

  const notesWuNames = collectNotesWuNames(await readRecentUserNotes(exec, identity));
  const { reconcile } = planRetiredSubdirReconcile({
    localSubdirs: shippedPresent,
    notesWuNames,
    shipped,
  });
  return { candidates: reconcile };
}
