/**
 * Errand-resume detection — a session-init signal recognizing when the
 * session's current branch is an in-progress errand to resume rather than a
 * work unit.
 *
 * An errand is execution-only: a nature-typed branch (`fix/` / `refactor/` /
 * `chore/<slug>`) with no backing meta file, identified by its errand record
 * rather than its branch prefix (errands carry no meta — their state is derived
 * from branch + PR). When the current branch matches a record, session-init's
 * resolution arm loads the run-errand workflow instead of the task loop. A
 * branch that *does* have a backing meta is a promoted errand → work unit, not a
 * resume.
 *
 * Pure core: the caller injects the current branch, whether a meta backs it
 * (resolved from the active-meta / roster probes), and the branch→slug index
 * derived from the errand records, so this module carries no git or filesystem
 * coupling. A record-less legacy `chore/<slug>` branch degrades to the
 * branch-derived slug.
 *
 * @module
 */

import { errandSlugOf } from "./errand-branch.js";

export interface ErrandResumeResult {
  /** True when the current branch is an errand (record-backed or legacy chore/) with no backing meta. */
  resumable: boolean;
  /** The errand `<slug>` when resumable; `null` otherwise. */
  slug: string | null;
}

export interface DetectErrandResumeOptions {
  /** The session's current branch, or `null` for a detached HEAD. */
  currentBranch: string | null;
  /** Whether an active meta file backs the current branch (a promoted errand → WU). */
  hasBackingMeta: boolean;
  /** Branch→slug index from the errand records — the identity oracle, branch-prefix-agnostic. */
  slugByBranch: ReadonlyMap<string, string>;
}

/**
 * Detect whether the current branch is a resumable errand.
 *
 * @param options - The current branch, whether a meta backs it, and the record-derived branch→slug index.
 * @returns Whether the branch is a backing-meta-less errand, with its slug.
 */
export function detectErrandResume(options: DetectErrandResumeOptions): ErrandResumeResult {
  const { currentBranch, hasBackingMeta, slugByBranch } = options;
  if (hasBackingMeta || currentBranch === null) return { resumable: false, slug: null };

  const recordSlug = slugByBranch.get(currentBranch);
  if (recordSlug !== undefined) return { resumable: true, slug: recordSlug };

  // Legacy degrade: a record-less `chore/<slug>` branch falls back to the branch parse.
  const slug = errandSlugOf(currentBranch);
  return slug === null ? { resumable: false, slug: null } : { resumable: true, slug };
}
