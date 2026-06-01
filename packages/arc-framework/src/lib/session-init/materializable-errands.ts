/**
 * Materializable-errand detection — recognizing `chore/` remote branches that
 * have no local worktree and no meta as cross-machine errands to materialize.
 *
 * An errand handed off mid-flight is a pushed `chore/<slug>` branch. On another
 * machine the branch exists only on the remote — no local checkout, no meta —
 * so session-init's Materialize arm fetches it (`git worktree add`) and resumes
 * via run-errand. A remote `chore/` branch already checked out locally is a
 * resume (handled by the resume probe), not a materialize; one with a backing
 * meta is a work unit.
 *
 * Pure core: the caller enumerates the remote branches and resolves each one's
 * local-worktree / meta facts (git), so this module carries no git coupling.
 *
 * @module
 */

import { errandSlugOf } from "./errand-branch.js";

/** Caller-resolved facts for one remote branch. */
export interface RemoteErrandFacts {
  /** The remote branch's short name (e.g. `chore/<slug>`). */
  branch: string;
  /** Whether the branch is already checked out in a local worktree. */
  hasLocalWorktree: boolean;
  /** Whether an active meta backs the branch — a work unit, not an errand. */
  hasMeta: boolean;
}

/** One remote errand branch that can be materialized. */
export interface MaterializableErrand {
  /** The `<slug>` after `chore/`. */
  slug: string;
  /** The remote `chore/<slug>` branch name. */
  branch: string;
}

export interface FindMaterializableErrandsOptions {
  /** Caller-enumerated remote branches with their resolved facts. */
  branches: readonly RemoteErrandFacts[];
}

export interface MaterializableErrandsResult {
  /** Remote `chore/` branches materializable as cross-machine errand resumes. */
  candidates: MaterializableErrand[];
}

/**
 * Select the materializable errand branches from the caller's remote-branch set.
 *
 * A branch qualifies when it is a `chore/` errand branch with no local worktree
 * (not already resumable here) and no backing meta (not a work unit).
 *
 * @param options - Candidate remote branches with facts.
 * @returns The materializable remote errand branches.
 */
export function findMaterializableErrands(
  options: FindMaterializableErrandsOptions,
): MaterializableErrandsResult {
  const candidates: MaterializableErrand[] = [];
  for (const { branch, hasLocalWorktree, hasMeta } of options.branches) {
    if (hasLocalWorktree || hasMeta) continue;
    const slug = errandSlugOf(branch);
    if (slug === null) continue;
    candidates.push({ slug, branch });
  }
  return { candidates };
}
