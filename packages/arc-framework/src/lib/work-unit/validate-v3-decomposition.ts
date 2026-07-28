/** One pure policy boundary for finalized version-3 decomposition authority. */

import { canonicalize } from "../canonical/canonical-json.js";
import {
  parseV3DecomposePreparation,
  type V3DecomposePreparation,
} from "./decompose-v3-preparation.js";
import {
  parseV3DecomposeReceipt,
  type V3DecomposeReceipt,
  type V3ManagedPathResult,
} from "./decompose-v3-receipt.js";

export type V3DecompositionMismatchKind =
  | "preparation"
  | "receipt"
  | "source"
  | "base"
  | "ownership"
  | "path"
  | "patch"
  | "topology"
  | "publication";

export interface V3DecompositionMismatch {
  kind: V3DecompositionMismatchKind;
  locus?: string;
}

export interface FinalizedV3DecompositionFacts {
  preparation: unknown;
  receipt: unknown;
  sourceArtifactDigest: string;
  resultBaseHead: string;
  candidateOwnership: unknown;
  managedPathResults: readonly V3ManagedPathResult[];
  topologyDigest: string;
  publication: unknown;
}

export interface ValidatedFinalizedV3Decomposition {
  preparation: V3DecomposePreparation;
  receipt: V3DecomposeReceipt;
}

export type FinalizedV3DecompositionValidation =
  | { status: "validated"; authority: ValidatedFinalizedV3Decomposition }
  | { status: "mismatch"; mismatch: V3DecompositionMismatch };

/**
 * Validate exact normalized adapter facts against one canonical finalized receipt.
 *
 * @param facts - Git/claim adapter facts with no host paths or policy decisions
 * @returns Canonical authority or the deterministic first mismatch
 */
export function validateFinalizedV3Decomposition(
  facts: FinalizedV3DecompositionFacts,
): FinalizedV3DecompositionValidation {
  const preparation = parseV3DecomposePreparation(facts.preparation);
  if (preparation === null) return { status: "mismatch", mismatch: { kind: "preparation" } };
  const receipt = parseV3DecomposeReceipt(facts.receipt, preparation);
  if (receipt === null) return { status: "mismatch", mismatch: { kind: "receipt" } };
  if (facts.sourceArtifactDigest !== preparation.facts.sourceArtifactDigest) {
    return { status: "mismatch", mismatch: { kind: "source" } };
  }
  if (facts.resultBaseHead !== preparation.facts.completedMap.machine.resultBase.head) {
    return { status: "mismatch", mismatch: { kind: "base" } };
  }
  if (canonicalize(facts.candidateOwnership) !== canonicalize(preparation.facts.candidateOwnership)) {
    return { status: "mismatch", mismatch: { kind: "ownership" } };
  }
  if (canonicalize(facts.managedPathResults) !== canonicalize(receipt.finalized.managedPathResults)) {
    const expected = receipt.finalized.managedPathResults;
    const actual = facts.managedPathResults;
    const locus = expected.find((_candidate, index) =>
      canonicalize(expected[index]) !== canonicalize(actual[index]))?.path
      ?? actual.find(({ path }) => !expected.some((candidate) => candidate.path === path))?.path;
    return { status: "mismatch", mismatch: { kind: "path", ...(locus === undefined ? {} : { locus }) } };
  }
  if (facts.topologyDigest !== preparation.facts.topology.digest) {
    return { status: "mismatch", mismatch: { kind: "topology" } };
  }
  if (canonicalize(facts.publication) !== canonicalize(receipt.finalized.publication)) {
    return { status: "mismatch", mismatch: { kind: "publication" } };
  }
  return { status: "validated", authority: { preparation, receipt } };
}
