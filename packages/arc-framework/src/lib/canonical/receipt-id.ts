/**
 * Deterministic retirement receipt / preparation IDs and inventory digests.
 *
 * Every ID and inventory digest is a pure function of its canonical tuple, so an
 * exact retry re-derives the same key and a change in any hashed field cannot
 * alias an existing record. The adapter derives at most a few candidate record
 * keys from a request rather than scanning accumulated receipts.
 */

import { type ArtifactSetEntry } from "./content-digest.js";
import { type CanonicalDigest, canonicalDigest } from "./canonical-json.js";
import type { WorktreeSubject } from "../git/worktree-marker.js";

/** The non-shipped retirement transitions a receipt can record. */
export type RetirementTransition = "abandon" | "decompose" | "park-planning";

/** The exact tuple a `receiptId` is derived from. */
export interface ReceiptIdInput {
  schemaVersion: number;
  subject: WorktreeSubject;
  transition: RetirementTransition;
  sourceBranch: string;
  sourceHead: string;
}

/** The exact tuple a `preparationId` is derived from. */
export interface PreparationIdInput {
  receiptId: CanonicalDigest;
  baseHead: string;
  sourceInventoryDigest: CanonicalDigest;
  incomingEdgeInventoryDigest: CanonicalDigest;
  outgoingEdgeInventoryDigest: CanonicalDigest;
  cutMapDigest: CanonicalDigest;
}

/** The terminal discard result: a retirement that conserves nothing. */
export const DISCARD_RESULT = { kind: "discard", artifactDigest: "absent" } as const;

/**
 * Derive a receipt's deterministic ID from its canonical tuple.
 *
 * @param input - Schema version, typed subject, transition, source branch, and source `HEAD`
 * @returns The receipt's canonical digest
 */
export function receiptId(input: ReceiptIdInput): CanonicalDigest {
  return canonicalDigest({
    schemaVersion: input.schemaVersion,
    subject: input.subject,
    transition: input.transition,
    sourceBranch: input.sourceBranch,
    sourceHead: input.sourceHead,
  });
}

/**
 * Derive a decompose preparation's deterministic ID from its canonical tuple.
 *
 * @param input - Receipt ID, base `HEAD`, source/incoming/outgoing inventory digests, and cut-map digest
 * @returns The preparation's canonical digest
 */
export function preparationId(input: PreparationIdInput): CanonicalDigest {
  return canonicalDigest({
    receiptId: input.receiptId,
    baseHead: input.baseHead,
    sourceInventoryDigest: input.sourceInventoryDigest,
    incomingEdgeInventoryDigest: input.incomingEdgeInventoryDigest,
    outgoingEdgeInventoryDigest: input.outgoingEdgeInventoryDigest,
    cutMapDigest: input.cutMapDigest,
  });
}

/**
 * Digest an artifact group (or inventory) over its path-sorted artifact-set entries.
 *
 * @param entries - The artifact-set entries; each path is unique across the group
 * @returns The canonical digest of the path-sorted entries
 */
export function artifactGroupDigest(entries: readonly ArtifactSetEntry[]): CanonicalDigest {
  const pathSorted = [...entries].sort((left, right) =>
    Buffer.compare(Buffer.from(left.path, "utf8"), Buffer.from(right.path, "utf8")),
  );
  return canonicalDigest(pathSorted);
}
