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

import { z } from "zod";

import type {
  DecodedWorktreeHuskStamp,
  WorktreeMarkerReadResult,
} from "../git/worktree-marker.js";
import { decodeWorktreeHuskStamp } from "../git/worktree-marker.js";
import { CanonicalDigestSchema } from "../kernel/index.js";

const RetirementEvidenceRefSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("shipped"),
    expectedLifecycle: z.literal("completed"),
    resultDigest: CanonicalDigestSchema,
    baseProofOid: z.string(),
  }),
  z.strictObject({
    kind: z.literal("git-transition"),
    transition: z.enum(["abandon", "park-planning"]),
    resultDigest: CanonicalDigestSchema,
  }),
]);

const DecodedWorktreeHuskStampSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("legacy"), authorization: z.literal("merged-preserved") }),
  z.strictObject({
    kind: z.literal("current"),
    authorization: z.enum(["merged-preserved", "discard-confirmed", "planning-relocated"]),
    remoteRef: z.strictObject({
      remote: z.string(),
      oid: z.string(),
      disposition: z.enum(["delete", "retain"]),
    }).nullable(),
    evidence: RetirementEvidenceRefSchema,
  }),
  z.strictObject({
    kind: z.literal("manual-only"),
    reason: z.enum(["mixed-presence", "unknown-authorization", "unknown-evidence", "evidence-mismatch"]),
  }),
]);

/** Terminal orientation for a WU husk at the current worktree. */
export const CurrentHuskAdvisorySchema = z.strictObject({
  worktreePath: z.string(),
  subject: z.strictObject({ kind: z.literal("work-unit"), name: z.string() }),
  branch: z.string(),
  stamp: DecodedWorktreeHuskStampSchema,
});

export type CurrentHuskAdvisory = z.infer<typeof CurrentHuskAdvisorySchema>;

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
