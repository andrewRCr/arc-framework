/**
 * Current-locus husk orientation derived from detached checkout evidence.
 *
 * This advisory does not widen worktree sync state. It recognizes only an
 * exact stamped work-unit husk whose completion is visible in the local
 * archive; every incomplete or untrusted evidence set remains ordinary
 * detached HEAD.
 *
 * @module
 */

import type {
  WorktreeMarkerReadResult,
  WorktreeSubject,
} from "../git/worktree-marker.js";

/** Terminal orientation for a completed WU husk at the current worktree. */
export interface CurrentHuskAdvisory {
  worktreePath: string;
  subject: Extract<WorktreeSubject, { kind: "work-unit" }>;
}

export interface DeriveCurrentHuskAdvisoryOptions {
  worktreePath: string;
  branch: string | null;
  head: string;
  marker: WorktreeMarkerReadResult;
  completed: ReadonlySet<string>;
}

/**
 * Derive a completed-WU husk advisory from current-checkout evidence.
 *
 * @param options - Current worktree, marker, HEAD, and local archive facts
 * @returns A terminal advisory only for an exact stamped completed WU
 */
export function deriveCurrentHuskAdvisory(
  options: DeriveCurrentHuskAdvisoryOptions,
): CurrentHuskAdvisory | null {
  const { branch, head, marker, completed, worktreePath } = options;
  if (branch !== null || marker.kind !== "present") return null;
  const stamp = marker.marker.husk;
  if (
    stamp === undefined
    || stamp.sha !== head
    || stamp.subject.kind !== "work-unit"
    || !completed.has(stamp.subject.name)
  ) {
    return null;
  }
  return { worktreePath, subject: stamp.subject };
}
