/**
 * Derive the session's current work-unit name for per-WU user-notes sync.
 *
 * Resolution order mirrors session-init's: the active meta file's WU name wins
 * when one resolves; otherwise the current branch's slug (`feat/foo` → `foo`)
 * is the fallback for pre-meta states (a freshly spawned worktree before its
 * meta is scaffolded). When neither resolves — `main`, a detached head, an
 * errand session on a non-WU branch — the result is `undefined`, which the
 * load path treats as "no current WU" (per-WU restore no-ops; cross-WU still
 * loads).
 *
 * @module
 */

import { resolveActiveWu } from "../release/wu-resolution.js";
import { branchToWorkUnitSlug } from "../work-unit/completed-index.js";

/** Minimal git runner — returns the command's stdout. Satisfied by `UserIOContext.exec`. */
export type ExecForBranch = (
  cmd: string,
  args: string[],
) => Promise<{ stdout: string }>;

/**
 * Resolve the current WU name from active-meta resolution, falling back to the
 * branch slug.
 *
 * @param cwd - Repository root.
 * @param exec - Git runner for the branch-name fallback probe.
 * @returns The bare WU name, or `undefined` when no WU resolves.
 */
export async function resolveCurrentWuName(
  cwd: string,
  exec: ExecForBranch,
): Promise<string | undefined> {
  const wu = await resolveActiveWu({ cwd });
  if (wu.status === "resolved" && wu.name !== "") return wu.name;

  try {
    const { stdout } = await exec("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
    return branchToWorkUnitSlug(stdout.trim()) ?? undefined;
  } catch {
    return undefined;
  }
}
