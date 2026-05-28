/**
 * `arc active roster` — the cross-worktree in-flight work-unit roster.
 *
 * Enumerates every branched worktree via the shared worktree roster,
 * identity-filters it in team mode, and narrows to actual work units (those
 * with a resolved meta file). This is the activation-time concurrency
 * advisory's data input: the set of in-flight work units a spawning or
 * cold-starting session weighs for scope overlap before scaffolding a new
 * one. Pure logic over injected git/fs adapters — the handler resolves
 * identity, team mode, and the fs bindings.
 *
 * @module
 */

import {
  filterRosterByIdentity,
  runWorktreeRoster,
  type WorktreeRosterEntry,
  type WorktreeRosterFs,
} from "../../lib/git/worktree-roster.js";
import type { GitExec } from "../../lib/git/index.js";

export interface ActiveRosterOptions {
  exec: GitExec;
  fs: WorktreeRosterFs;
  /** Current identity, or `null` when unconfigured — the filter passes through. */
  identity: string | null;
  /** Team mode — gates the identity filter (no-op in solo mode). */
  teamMode: boolean;
}

export interface ActiveRosterResult {
  /** In-flight work units (worktrees with a resolved meta file), identity-filtered. */
  entries: WorktreeRosterEntry[];
  /** Non-fatal roster diagnostics (meta read / branch-match failures). */
  warnings: string[];
}

/**
 * Resolve the identity-filtered in-flight work-unit roster.
 *
 * @param options - Injected git/fs adapters plus resolved identity and team mode.
 * @returns The in-flight work units (meta-bearing worktrees) and any roster warnings.
 */
export async function runActiveRoster(
  options: ActiveRosterOptions,
): Promise<ActiveRosterResult> {
  const { exec, fs, identity, teamMode } = options;
  const roster = await runWorktreeRoster({ exec, fs });
  const filtered = filterRosterByIdentity(roster, { identity, teamMode });
  // Narrow to actual work units: admin / main / meta-less checkouts carry no
  // meta file and are not in-flight work to weigh for scope overlap.
  const entries = filtered.entries.filter((e) => e.metaFilePath !== undefined);
  return { entries, warnings: filtered.warnings };
}
