/**
 * Gone-upstream local-branch enumeration.
 *
 * One local `git for-each-ref` over a ref prefix, returning the short names of
 * local branches whose configured upstream has been deleted on the remote —
 * `%(upstream:track)` reports `gone`. The cross-machine orphan-branch reaper
 * reads this: integration on a sibling machine deletes the remote head, leaving
 * every other machine's local branch tracking a now-deleted upstream.
 *
 * Only the `gone` tracking state qualifies — branches with a live upstream
 * (ahead / behind / up-to-date) or no upstream at all are excluded, and so is
 * any branch checked out in a worktree (`%(worktreepath)` non-empty): its
 * residue is the stale-worktree sweep's domain, and `git branch -d` would
 * refuse it anyway. The fields are NUL-joined so a branch name can never
 * collide with the field separator. A failed read yields `[]`: the enumeration
 * is an advisory hygiene signal, never fatal.
 *
 * The git seam is injected (three-layer architecture).
 *
 * @module
 */

import type { GitExec } from "./exec.js";

/** Field separator in the `for-each-ref` format — NUL, so branch names are unambiguous. */
const FIELD_SEP = "\u0000";

/** The `gone` token `%(upstream:track,nobracket)` emits when the upstream was deleted. */
const GONE_TOKEN = "gone";

/**
 * List the local branches under `refPrefix` whose upstream is gone.
 *
 * Branches checked out in any worktree are excluded — they cannot be
 * `git branch -d`-deleted, and worktree-ful residue has its own sweep.
 *
 * @param exec - Injected git executor.
 * @param refPrefix - The ref namespace to scan (e.g. `refs/heads/`).
 * @returns Short branch names with a gone upstream; `[]` on any read failure.
 */
export async function listGoneUpstreamBranches(
  exec: GitExec,
  refPrefix: string,
): Promise<string[]> {
  let stdout: string;
  try {
    ({ stdout } = await exec("git", [
      "for-each-ref",
      "--format=%(refname:short)%00%(upstream:track,nobracket)%00%(worktreepath)",
      refPrefix,
    ]));
  } catch {
    return [];
  }

  const gone: string[] = [];
  for (const rawLine of stdout.split("\n")) {
    if (rawLine.trim() === "") continue;
    const [name, track, worktreePath] = rawLine.split(FIELD_SEP);
    if (name === undefined || track === undefined) continue;
    if (track.trim() !== GONE_TOKEN) continue;
    if (worktreePath !== undefined && worktreePath.trim() !== "") continue;
    gone.push(name);
  }
  return gone;
}
