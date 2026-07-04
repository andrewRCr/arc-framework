/**
 * Worktree location resolution — expands the `worktree.location_template`
 * config value into a concrete filesystem path at worktree-creation time.
 *
 * `{repo}` expands to the repository name, `{name}` to the work-unit name, and
 * `{branch}` to the branch name with path separators slugged to `-` (so
 * `plan/foo` -> `plan-foo`).
 *
 * The result is a creation-time artifact: ARC resolves it once when it creates
 * a worktree and thereafter reads the live location from `git worktree list`.
 * A later branch rename (e.g. an Active->Planning demotion) does not move the
 * worktree, so callers persist the resolved path rather than recompute it from
 * the current branch. Resolution itself is pure — the path depends only on the
 * arguments, never on ambient git state.
 *
 * @module
 */

export interface WorktreeLocationParams {
  /** Location template — e.g. the resolved `worktree.location_template` value. */
  template: string;
  /** Repository name; replaces `{repo}`. */
  repo: string;
  /** Work-unit name; replaces `{name}`. */
  name: string;
  /** Branch name at creation time; replaces `{branch}` with separators slugged to `-`. */
  branch: string;
}

/** Slug a branch name for filesystem use: path separators (`/`) become `-`. */
function slugBranch(branch: string): string {
  return branch.replaceAll("/", "-");
}

/**
 * Resolve a worktree's filesystem path by expanding `template` against the
 * repository name and creation-time branch.
 *
 * @param params - Template plus the `{repo}` / `{name}` / `{branch}` expansion values.
 * @returns The resolved path with `{repo}`, `{name}`, and the slugged `{branch}` substituted.
 */
export function resolveWorktreeLocation(params: WorktreeLocationParams): string {
  const { template, repo, name, branch } = params;
  return template
    .replaceAll("{repo}", repo)
    .replaceAll("{name}", name)
    .replaceAll("{branch}", slugBranch(branch));
}
