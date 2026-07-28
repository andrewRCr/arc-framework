/**
 * Pure exact-base integration authority for one finalized v3 decomposition.
 *
 * This module intentionally performs no ref or history lookup. Its caller owns
 * pinning and rereading Git facts; this producer only admits an exact
 * fast-forward or two-parent merge relation over those facts.
 */

import type { CanonicalDigest } from "../canonical/canonical-json.js";
import type { V3DecomposePreparationFacts } from "./decompose-v3-preparation.js";
import {
  parseV3DecomposeReceipt,
  type V3DecomposeReceipt,
} from "./decompose-v3-receipt.js";

export type DecompositionLandingTopology =
  | { kind: "not-landed" }
  | { kind: "ambiguous" }
  | {
    kind: "fast-forward";
    beforeHead: string;
    resultHead: string;
    resultTree: string;
  }
  | {
    kind: "merge";
    resultHead: string;
    resultTree: string;
    /** Exact Git parent order: configured base first, candidate second. */
    parents: readonly string[];
  };

export interface DecompositionIntegrationFacts {
  /** Canonical receipt candidates selected from one pinned authority snapshot. */
  receipts: readonly unknown[];
  /** Prepared configured-base head pinned independently of receipt decoding. */
  preparedBaseHead: string;
  /** Candidate ref head and its peeled commit tree from the same pinned snapshot. */
  candidateCommit: { head: string; tree: string };
  /** Tree produced by applying the receipt-bound transition to its prepared base. */
  receiptTransitionTree: string;
  /** Current configured-base head after the caller's race-closing reread. */
  currentBaseHead: string;
  /** Explicit landing relation; generic ancestry and history searches are excluded. */
  landing: DecompositionLandingTopology;
}

export type DecompositionClaimRetirement =
  | {
    kind: "required";
    protection: "full";
    claimId: string;
    generation: number;
    candidateBranch: string;
    candidateWorktree: CanonicalDigest;
  }
  | { kind: "not-applicable"; protection: "partial" };

export interface DecompositionIntegrationAnchor {
  kind: "decomposition-integration-anchor";
  schemaVersion: 1;
  receiptId: CanonicalDigest;
  preparationId: CanonicalDigest;
  receipt: V3DecomposeReceipt;
  origin: string;
  sourceHead: string;
  preparedBaseHead: string;
  candidateCommitHead: string;
  candidateCommitTree: string;
  currentBaseHead: string;
  landedCommitHead: string;
  landedTree: string;
  landing: { kind: "fast-forward" } | { kind: "merge" };
  claimRetirement: DecompositionClaimRetirement;
}

export type DecompositionIntegrationAnchorResult =
  | { status: "resolved"; anchor: DecompositionIntegrationAnchor }
  | { status: "absent" }
  | { status: "not-landed" }
  | { status: "ambiguous" }
  | {
    status: "stale";
    reason: "prepared-base" | "candidate-commit" | "current-base";
  }
  | {
    status: "refused";
    reason: "invalid-authority" | "invalid-object-id" | "transition-tree" | "landing-topology";
  };

const GIT_OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;

function isObjectId(value: string): boolean {
  return GIT_OBJECT_ID.test(value);
}

function objectIdsAreUniform(values: readonly string[]): boolean {
  const width = values[0]?.length;
  return width !== undefined
    && values.every((value) => isObjectId(value) && value.length === width);
}

function claimRetirement(
  ownership: V3DecomposePreparationFacts["candidateOwnership"],
): DecompositionClaimRetirement {
  return ownership.kind === "claimed"
    ? {
      kind: "required",
      protection: "full",
      claimId: ownership.claimId,
      generation: ownership.generation,
      candidateBranch: ownership.candidateBranch,
      candidateWorktree: ownership.candidateWorktree,
    }
    : { kind: "not-applicable", protection: "partial" };
}

function authenticateReceipt(input: unknown): V3DecomposeReceipt | null {
  return parseV3DecomposeReceipt(input);
}

/**
 * Produce exact, reusable authority for one landed v3 decomposition.
 *
 * The producer grants no descendant mobility: `currentBaseHead` must equal the
 * landing result itself, and the landing topology must name the pinned
 * candidate commit directly.
 */
export function produceDecompositionIntegrationAnchor(
  facts: DecompositionIntegrationFacts,
): DecompositionIntegrationAnchorResult {
  if (facts.receipts.length === 0) return { status: "absent" };
  if (facts.receipts.length !== 1) return { status: "ambiguous" };
  if (facts.landing.kind === "ambiguous") return { status: "ambiguous" };
  if (facts.landing.kind === "not-landed") return { status: "not-landed" };

  const receipt = authenticateReceipt(facts.receipts[0]);
  if (receipt === null) return { status: "refused", reason: "invalid-authority" };

  const objectIds = [
    facts.preparedBaseHead,
    facts.candidateCommit.head,
    facts.candidateCommit.tree,
    facts.receiptTransitionTree,
    facts.currentBaseHead,
    facts.landing.resultHead,
    facts.landing.resultTree,
    ...(facts.landing.kind === "fast-forward"
      ? [facts.landing.beforeHead]
      : facts.landing.parents),
  ];
  if (!objectIdsAreUniform(objectIds)) {
    return { status: "refused", reason: "invalid-object-id" };
  }

  const machine = receipt.prepared.completedMap.machine;
  if (facts.preparedBaseHead !== machine.resultBase.head) {
    return { status: "stale", reason: "prepared-base" };
  }
  if (facts.candidateCommit.tree !== facts.receiptTransitionTree) {
    return { status: "refused", reason: "transition-tree" };
  }

  if (facts.landing.kind === "fast-forward") {
    if (facts.landing.beforeHead !== facts.preparedBaseHead
      || facts.landing.resultHead !== facts.candidateCommit.head) {
      return { status: "stale", reason: "candidate-commit" };
    }
  } else if (facts.landing.parents.length !== 2
    || facts.landing.parents[0] !== facts.preparedBaseHead
    || facts.landing.parents[1] !== facts.candidateCommit.head) {
    return { status: "stale", reason: "candidate-commit" };
  }

  if (facts.landing.resultTree !== facts.candidateCommit.tree) {
    return { status: "refused", reason: "landing-topology" };
  }
  if (facts.currentBaseHead !== facts.landing.resultHead) {
    return { status: "stale", reason: "current-base" };
  }

  return {
    status: "resolved",
    anchor: {
      kind: "decomposition-integration-anchor",
      schemaVersion: 1,
      receiptId: receipt.receiptId,
      preparationId: receipt.preparationId,
      receipt,
      origin: machine.source.origin,
      sourceHead: machine.source.head,
      preparedBaseHead: facts.preparedBaseHead,
      candidateCommitHead: facts.candidateCommit.head,
      candidateCommitTree: facts.candidateCommit.tree,
      currentBaseHead: facts.currentBaseHead,
      landedCommitHead: facts.landing.resultHead,
      landedTree: facts.landing.resultTree,
      landing: { kind: facts.landing.kind },
      claimRetirement: claimRetirement(receipt.prepared.candidateOwnership),
    },
  };
}
