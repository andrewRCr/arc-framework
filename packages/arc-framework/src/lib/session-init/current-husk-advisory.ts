/**
 * Current-locus husk orientation derived from detached checkout evidence.
 *
 * This advisory does not widen worktree sync state. It recognizes only an
 * exact stamped work-unit husk. Authorization-bearing stamps expose only the
 * decoder's validated evidence; malformed markers remain ordinary detached
 * HEAD.
 *
 * @module
 */

import type {
  DecodedWorktreeHuskStamp,
  WorktreeMarkerReadResult,
  WorktreeSubject,
} from "../git/worktree-marker.js";
import { decodeWorktreeHuskStamp } from "../git/worktree-marker.js";

/** Terminal orientation for a WU husk at the current worktree. */
export interface CurrentHuskAdvisory {
  worktreePath: string;
  subject: Extract<WorktreeSubject, { kind: "work-unit" }>;
  branch: string;
  stamp: DecodedWorktreeHuskStamp;
}

export interface DeriveCurrentHuskAdvisoryOptions {
  worktreePath: string;
  branch: string | null;
  head: string;
  marker: WorktreeMarkerReadResult;
}

/**
 * Derive a work-unit husk advisory from current-checkout evidence.
 *
 * @param options - Current worktree, marker, and HEAD facts
 * @returns A terminal advisory only for an exact stamped WU
 */
export function deriveCurrentHuskAdvisory(
  options: DeriveCurrentHuskAdvisoryOptions,
): CurrentHuskAdvisory | null {
  const { branch, head, marker, worktreePath } = options;
  if (branch !== null || marker.kind !== "present") return null;
  const stamp = marker.marker.husk;
  if (
    stamp === undefined
    || stamp.sha !== head
    || stamp.subject.kind !== "work-unit"
  ) {
    return null;
  }
  return {
    worktreePath,
    subject: stamp.subject,
    branch: stamp.branch,
    stamp: decodeWorktreeHuskStamp(stamp),
  };
}

/**
 * Resolve current-locus orientation while treating known retirement evidence as untrusted input.
 *
 * @param options - Current worktree, marker, and HEAD facts
 * @param revalidateEvidence - Authoritative committed-evidence resolver
 * @returns A trusted advisory, a forward-compatible manual advisory, or `null`
 */
export async function resolveCurrentHuskAdvisory(
  options: DeriveCurrentHuskAdvisoryOptions,
  revalidateEvidence: (
    stamp: NonNullable<Extract<WorktreeMarkerReadResult, { kind: "present" }>["marker"]["husk"]>,
    decoded: Extract<DecodedWorktreeHuskStamp, { kind: "current" }>,
  ) => Promise<boolean>,
): Promise<CurrentHuskAdvisory | null> {
  const advisory = deriveCurrentHuskAdvisory(options);
  if (advisory?.stamp.kind !== "current") return advisory;
  const stamp = options.marker.kind === "present" ? options.marker.marker.husk : undefined;
  if (stamp === undefined) return null;
  return await revalidateEvidence(stamp, advisory.stamp) ? advisory : null;
}
