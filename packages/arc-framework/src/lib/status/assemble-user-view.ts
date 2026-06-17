/**
 * Seam-binding assembly for the `STATUS.USER` (in-flight-mine) view — the single
 * place that closes {@link runStatusUserView}'s injected reads over the real git
 * executor and filesystem.
 *
 * Two callers share this assembly so the rendered view never forks:
 *
 * - The `arc status --user` handler, which prints the result to the terminal.
 * - The lifecycle executor's `reconcile-status-user` side-effect, which renders
 *   in local-only mode and writes the result to `STATUS.USER.md` on a location
 *   move.
 *
 * The assembly binds three reads: the last-rendered cache (the degrade target
 * when the remote is unreachable), the local worktree-backed in-flight slice
 * (fresh local truth that overrides stale remote-tracking rows), and the local
 * ready-mine slice. The ready slice reads the filesystem directly through
 * {@link loadReadyMineSlice} (it is always-local by design); the cache and roster
 * reads stay injectable so the assembly carries no hard filesystem dependency of
 * its own.
 *
 * @module
 */

import { join } from "node:path";

import type { GitExec } from "../git/exec.js";
import {
  filterRosterByIdentity,
  runWorktreeRoster,
  type WorktreeRosterEntry,
} from "../git/index.js";
import type { InFlightEntry } from "../git/in-flight-derivation.js";

import { loadReadyMineSlice } from "./ready-mine-source.js";
import { runStatusUserView, type StatusUserViewResult } from "./user-view.js";

/** Ambient inputs the assembly closes the view's reads over. */
export interface AssembleStatusUserViewDeps {
  /** Repository root containing `.arc/` — the cache and ready-slice path base. */
  cwd: string;
  /** Injectable git executor. */
  exec: GitExec;
  /** Resolved identity; `null` short-circuits (the view is identity-scoped). */
  identity: string | null;
  /** Team mode — gates the in-flight oracle's identity filtering. */
  teamMode: boolean;
  /** `--local` / `--no-fetch`: skip the network read, render from local refs. */
  localOnly: boolean;
  /** Read a file as UTF-8 — used for the `STATUS.USER` cache and roster meta reads. */
  readFile: (path: string) => Promise<string>;
  /** Read directory entry names — used by the worktree roster scan. */
  readdir: (path: string) => Promise<string[]>;
}

const META_FILE_RE = /^meta-(.+)\.md$/;

/** The canonical WU-name from a `meta-<name>.md` path, falling back to the branch leaf. */
function workUnitNameFromMetaPath(metaFilePath: string, branch: string): string {
  const match = META_FILE_RE.exec(metaFilePath.replace(/^.*[/\\]/u, ""));
  if (match?.[1] !== undefined) return match[1];
  return branch.replace(/^(feat|fix|chore|plan)\//u, "");
}

/** Project a local worktree roster entry into the in-flight slice's shape (meta-bearing only). */
function localRosterEntryToInFlight(entry: WorktreeRosterEntry): InFlightEntry[] {
  if (entry.metaFilePath === undefined) return [];
  return [
    {
      kind: "work-unit",
      name: workUnitNameFromMetaPath(entry.metaFilePath, entry.branch),
      state: entry.state === "Planning" ? "Planning" : "Active",
      branch: entry.branch,
      worktreePath: entry.worktreePath,
      remoteOnly: false,
      ...(entry.identity !== undefined ? { owner: entry.identity } : {}),
      ...(entry.cohort !== undefined ? { cohort: entry.cohort } : {}),
      ...(entry.class !== undefined ? { class: entry.class } : {}),
      ...(entry.priority !== undefined ? { priority: entry.priority } : {}),
      dependsOn: entry.dependsOn ?? [],
    },
  ];
}

/**
 * Assemble and run the `STATUS.USER` view — bind the cache, local-in-flight, and
 * ready-mine reads, then delegate to {@link runStatusUserView}.
 *
 * @param deps - Repository root, git executor, identity, mode flags, and the I/O seams.
 * @returns The rendered view result (rendered table, degraded cache, or status message).
 */
export function assembleStatusUserView(
  deps: AssembleStatusUserViewDeps,
): Promise<StatusUserViewResult> {
  const { cwd, exec, identity, teamMode, localOnly, readFile, readdir } = deps;

  const statusUserPath =
    identity === null ? null : join(cwd, ".arc", "user", identity, "STATUS.USER.md");

  return runStatusUserView({
    exec,
    identity,
    teamMode,
    localOnly,
    readLastRendered: () =>
      statusUserPath === null
        ? Promise.resolve(null)
        : readFile(statusUserPath).then((content) => content, () => null),
    readLocalInFlight: async () => {
      const roster = filterRosterByIdentity(
        await runWorktreeRoster({ exec, fs: { readdir, readFile } }),
        { identity, teamMode },
      );
      return roster.entries.flatMap(localRosterEntryToInFlight);
    },
    readReadyMine: () => loadReadyMineSlice({ cwd, identity }),
  });
}
