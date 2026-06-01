/**
 * Errand-resume detection — a session-init signal recognizing when the
 * session's current branch is an in-progress errand to resume rather than a
 * work unit.
 *
 * An errand is execution-only: a `chore/<slug>` branch with no backing meta
 * file (errands carry no meta — their state is derived from branch + PR). When
 * the current branch matches that shape, session-init's resolution arm loads
 * the run-errand workflow instead of the task loop. A `chore/` branch that
 * *does* have a backing meta is a promoted errand → work unit, not a resume.
 *
 * Pure core: the caller injects the current branch and whether a meta backs it
 * (resolved from the active-meta / roster probes), so this module carries no
 * git or filesystem coupling.
 *
 * @module
 */

/** Branch prefix marking an execution-only errand. */
const ERRAND_BRANCH_PREFIX = "chore/";

export interface ErrandResumeResult {
  /** True when the current branch is a `chore/` errand with no backing meta. */
  resumable: boolean;
  /** The `<slug>` after `chore/` when resumable; `null` otherwise. */
  slug: string | null;
}

export interface DetectErrandResumeOptions {
  /** The session's current branch, or `null` for a detached HEAD. */
  currentBranch: string | null;
  /** Whether an active meta file backs the current branch (a promoted errand → WU). */
  hasBackingMeta: boolean;
}

/**
 * Detect whether the current branch is a resumable errand.
 *
 * @param options - The current branch and whether a meta backs it.
 * @returns Whether the branch is a backing-meta-less `chore/` errand, with its slug.
 */
export function detectErrandResume(options: DetectErrandResumeOptions): ErrandResumeResult {
  const { currentBranch, hasBackingMeta } = options;
  const notResumable: ErrandResumeResult = { resumable: false, slug: null };

  if (currentBranch === null || hasBackingMeta) return notResumable;
  if (!currentBranch.startsWith(ERRAND_BRANCH_PREFIX)) return notResumable;

  const slug = currentBranch.slice(ERRAND_BRANCH_PREFIX.length);
  if (slug === "") return notResumable;

  return { resumable: true, slug };
}
