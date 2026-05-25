/**
 * Worktree-identity detection — answers "which physical worktree is this
 * session running in?" from local git plumbing alone.
 *
 * Distinct concern from {@link ./worktree-sync.js | worktree-sync} (local HEAD
 * vs. `origin`) and {@link ./pushability.js | pushability} ("can a push fire
 * now?"): this resolves filesystem topology, not remote relationship. Cheap and
 * always-on — no fetch, no network — so it can ride every session-init pass.
 *
 * The primary-vs-linked test is a string comparison of two `git rev-parse`
 * outputs: a worktree's `--git-dir` equals its `--git-common-dir` only in the
 * main worktree. In a linked worktree the git-dir is `<common>/worktrees/<id>`,
 * so the two always differ. The working-tree path is resolved lazily — only
 * the linked arm needs it.
 *
 * @module
 */

import type { GitExec } from "./exec.js";

/**
 * Which physical worktree the session is in.
 *
 * - `primary` — the main worktree; orientation surfaces nothing.
 * - `linked` — an added worktree; `path` is its absolute working-tree root,
 *   the datum orientation renders (e.g. `worktree: ../arc-wu-b`).
 */
export type WorktreeIdentity =
  | { kind: "primary" }
  | { kind: "linked"; path: string };

/**
 * Resolve whether the current session is in the primary or a linked worktree.
 *
 * Returns `{ kind: "primary" }` on any failure to resolve — the safe default
 * is "surface nothing" rather than a misleading worktree line.
 *
 * @param exec - Injectable command executor
 * @returns The worktree identity; `linked` carries the working-tree path
 */
export async function resolveWorktreeIdentity(exec: GitExec): Promise<WorktreeIdentity> {
  const commonDir = await revParse(exec, "--git-common-dir");
  const gitDir = await revParse(exec, "--git-dir");

  // Equal (including both-null on failure) ⇒ primary; never surface.
  if (commonDir === null || gitDir === null || commonDir === gitDir) {
    return { kind: "primary" };
  }

  const toplevel = await revParse(exec, "--show-toplevel");
  if (toplevel === null) return { kind: "primary" };
  return { kind: "linked", path: toplevel };
}

/** Run `git rev-parse <flag>` and return the trimmed value, or `null` on failure/empty. */
async function revParse(exec: GitExec, flag: string): Promise<string | null> {
  try {
    const { stdout } = await exec("git", ["rev-parse", flag]);
    const value = stdout.trim();
    return value === "" ? null : value;
  } catch {
    return null;
  }
}
