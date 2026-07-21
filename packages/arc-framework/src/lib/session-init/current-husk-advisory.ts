/**
 * Current-locus husk orientation derived from detached checkout evidence.
 *
 * This advisory does not widen worktree sync state. It recognizes an exact
 * stamped work-unit husk or preserves diagnostic-only transient ownership
 * evidence. Authorization-bearing stamps expose only validated evidence.
 *
 * @module
 */

import type {
  DecodedWorktreeHuskStamp,
  TransientWorktreeProvenance,
  TransientWorktreeSubject,
  WorktreeMarkerReadResult,
  WorktreeSubject,
} from "../git/worktree-marker.js";
import { classifyTransientWorktreeProvenance, decodeWorktreeHuskStamp } from "../git/worktree-marker.js";

/** Terminal orientation for a WU husk at the current worktree. */
export interface CurrentWorkUnitHuskAdvisory {
  worktreePath: string;
  subject: Extract<WorktreeSubject, { kind: "work-unit" }>;
  branch: string;
  stamp: DecodedWorktreeHuskStamp;
}

/** Recoverable but never-removable transient ownership evidence at the current checkout. */
export interface CurrentTransientProvenanceAdvisory {
  worktreePath: string;
  provenance: TransientWorktreeProvenance;
}

export type CurrentHuskAdvisory = CurrentWorkUnitHuskAdvisory | CurrentTransientProvenanceAdvisory;

export interface DeriveCurrentHuskAdvisoryOptions {
  worktreePath: string;
  branch: string | null;
  head: string;
  marker: WorktreeMarkerReadResult;
  expectedTransient?: TransientWorktreeSubject;
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
  if (branch !== null) return null;
  const transient = classifyTransientWorktreeProvenance(marker, options.expectedTransient);
  if (transient !== null) return { worktreePath, provenance: transient };
  if (marker.kind !== "present") return null;
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
  if (advisory === null || !("stamp" in advisory) || advisory.stamp.kind !== "current") return advisory;
  const stamp = options.marker.kind === "present" ? options.marker.marker.husk : undefined;
  if (stamp === undefined) return null;
  return await revalidateEvidence(stamp, advisory.stamp) ? advisory : null;
}
