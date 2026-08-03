/** One pure policy boundary for finalized version-3 decomposition authority. */

import { canonicalize } from "../canonical/canonical-json.js";
import {
  parseV3DecomposePreparation,
  type V3DecomposePreparation,
} from "./decompose-v3-preparation.js";
import {
  parseV3DecomposeReceipt,
  type V3DestinationOutputs,
  type V3DecomposeReceipt,
  type V3ManagedPathResult,
} from "./decompose-v3-receipt.js";
import {
  v3SourceArtifactDigest,
  type V3SourceArtifactEntry,
} from "./decompose-v3-schema.js";
import {
  createValidatedTransitionOverlay,
  type ValidatedTransitionOverlay,
} from "./transition-overlay.js";

export type V3DecompositionMismatchKind =
  | "preparation"
  | "receipt"
  | "source"
  | "allocation"
  | "base"
  | "ownership"
  | "target"
  | "dependency"
  | "path"
  | "mode"
  | "patch"
  | "topology"
  | "publication";

/** Evidence class for mismatches caused by unavailable repository reads. */
export const V3_DECOMPOSITION_READ_FAILURE = "read-failure" as const;

export interface V3DecompositionMismatch {
  kind: V3DecompositionMismatchKind;
  locus?: string;
  evidence?: typeof V3_DECOMPOSITION_READ_FAILURE;
}

export interface FinalizedV3DecompositionFacts {
  preparation: unknown;
  receipt: unknown;
  sourceArtifactDigest: string;
  sourceArtifactInventory: readonly V3SourceArtifactEntry[];
  sourceUnits: V3DecomposePreparation["facts"]["completedMap"]["machine"]["sourceUnits"];
  sourceAllocations: V3DecomposePreparation["facts"]["completedMap"]["authoring"]["sourceAllocations"];
  resultBaseHead: string;
  candidateOwnership: unknown;
  destinationOutputs: readonly V3DestinationOutputs[];
  incomingEdges: V3DecomposePreparation["facts"]["completedMap"]["machine"]["incomingEdges"];
  outgoingEdges: V3DecomposePreparation["facts"]["completedMap"]["machine"]["outgoingEdges"];
  managedPathResults: readonly V3ManagedPathResult[];
  transitionPatch: V3DecomposeReceipt["finalized"]["transitionPatch"];
  topology: unknown;
  publication: unknown;
}

export interface ValidatedFinalizedV3Decomposition {
  preparation: V3DecomposePreparation;
  receipt: V3DecomposeReceipt;
  transitionOverlay: ValidatedTransitionOverlay;
}

export type FinalizedV3DecompositionValidation =
  | { status: "validated"; authority: ValidatedFinalizedV3Decomposition }
  | { status: "mismatch"; mismatch: V3DecompositionMismatch };

function canonical(value: unknown): string | null {
  try {
    return canonicalize(value);
  } catch {
    return null;
  }
}

function sameCanonical(left: unknown, right: unknown): boolean {
  const leftCanonical = canonical(left);
  return leftCanonical !== null && leftCanonical === canonical(right);
}

function valueAt(value: unknown, key: string): string | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "string" && candidate !== "" ? candidate : undefined;
}

function firstArrayMismatchLocus(
  expected: readonly unknown[],
  actual: readonly unknown[],
  key: string,
): string | undefined {
  for (let index = 0; index < Math.max(expected.length, actual.length); index += 1) {
    if (!sameCanonical(expected[index], actual[index])) {
      return valueAt(expected[index], key) ?? valueAt(actual[index], key);
    }
  }
  return undefined;
}

function modeOf(state: unknown): string | undefined {
  if (typeof state !== "object" || state === null || Array.isArray(state)) return undefined;
  return (state as Record<string, unknown>).kind === "file"
    && typeof (state as Record<string, unknown>).mode === "string"
    ? (state as Record<string, unknown>).mode as string
    : undefined;
}

function statesEqual(
  left: V3ManagedPathResult["before"],
  right: V3ManagedPathResult["after"],
): boolean {
  return sameCanonical(left, right);
}

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
  const machine = preparation.facts.completedMap.machine;
  const authoring = preparation.facts.completedMap.authoring;
  const sourceArtifactDigest = v3SourceArtifactDigest([...facts.sourceArtifactInventory]);
  if (sourceArtifactDigest === null) {
    return {
      status: "mismatch",
      mismatch: { kind: "source", locus: facts.sourceArtifactInventory[0]?.path },
    };
  }
  if (sourceArtifactDigest !== facts.sourceArtifactDigest) {
    return {
      status: "mismatch",
      mismatch: {
        kind: "source",
        locus: sourceArtifactDigest === preparation.facts.sourceArtifactDigest
          ? "sourceArtifactDigest"
          : facts.sourceArtifactInventory[0]?.path,
      },
    };
  }
  if (sourceArtifactDigest !== preparation.facts.sourceArtifactDigest) {
    return {
      status: "mismatch",
      mismatch: { kind: "source", locus: facts.sourceArtifactInventory[0]?.path },
    };
  }
  if (!sameCanonical(facts.sourceUnits, machine.sourceUnits)) {
    return {
      status: "mismatch",
      mismatch: {
        kind: "source",
        locus: firstArrayMismatchLocus(machine.sourceUnits, facts.sourceUnits, "sourceId"),
      },
    };
  }
  if (!sameCanonical(facts.sourceAllocations, authoring.sourceAllocations)) {
    return {
      status: "mismatch",
      mismatch: {
        kind: "allocation",
        locus: firstArrayMismatchLocus(authoring.sourceAllocations, facts.sourceAllocations, "sourceId"),
      },
    };
  }
  const expectedDestinationOutputs = receipt.finalized.destinationDigests
    .map(({ destinationId, outputs }) => ({ destinationId, outputs }));
  if (!sameCanonical(facts.destinationOutputs, expectedDestinationOutputs)) {
    return {
      status: "mismatch",
      mismatch: {
        kind: "target",
        locus: firstArrayMismatchLocus(expectedDestinationOutputs, facts.destinationOutputs, "destinationId"),
      },
    };
  }
  if (!sameCanonical(facts.incomingEdges, machine.incomingEdges)) {
    return {
      status: "mismatch",
      mismatch: {
        kind: "dependency",
        locus: firstArrayMismatchLocus(machine.incomingEdges, facts.incomingEdges, "edgeId"),
      },
    };
  }
  if (!sameCanonical(facts.outgoingEdges, machine.outgoingEdges)) {
    return {
      status: "mismatch",
      mismatch: {
        kind: "dependency",
        locus: firstArrayMismatchLocus(machine.outgoingEdges, facts.outgoingEdges, "edgeId"),
      },
    };
  }
  if (facts.resultBaseHead !== machine.resultBase.head) {
    return { status: "mismatch", mismatch: { kind: "base" } };
  }
  if (!sameCanonical(facts.candidateOwnership, preparation.facts.candidateOwnership)) {
    return { status: "mismatch", mismatch: { kind: "ownership" } };
  }
  const expectedResults = receipt.finalized.managedPathResults;
  for (let index = 0; index < Math.max(expectedResults.length, facts.managedPathResults.length); index += 1) {
    const expected = expectedResults[index];
    const actual = facts.managedPathResults[index];
    if (expected === undefined || actual === undefined || expected.path !== actual.path) {
      return {
        status: "mismatch",
        mismatch: { kind: "path", locus: expected?.path ?? actual?.path },
      };
    }
    if (!sameCanonical(actual.before, expected.before)) {
      const expectedMode = modeOf(expected.before);
      const actualMode = modeOf(actual.before);
      return {
        status: "mismatch",
        mismatch: {
          kind: expectedMode !== actualMode && (expectedMode !== undefined || actualMode !== undefined)
            ? "mode"
            : "path",
          locus: expected.path,
        },
      };
    }
    if (!sameCanonical(actual.after, expected.after)) {
      const expectedMode = modeOf(expected.after);
      const actualMode = modeOf(actual.after);
      return {
        status: "mismatch",
        mismatch: {
          kind: expectedMode !== actualMode && (expectedMode !== undefined || actualMode !== undefined)
            ? "mode"
            : "patch",
          locus: expected.path,
        },
      };
    }
  }
  const derivedPatch = facts.managedPathResults.filter(({ before, after }) => !statesEqual(before, after));
  if (!sameCanonical(facts.transitionPatch, derivedPatch)
    || !sameCanonical(facts.transitionPatch, receipt.finalized.transitionPatch)) {
    return {
      status: "mismatch",
      mismatch: {
        kind: "patch",
        locus: firstArrayMismatchLocus(receipt.finalized.transitionPatch, facts.transitionPatch, "path"),
      },
    };
  }
  if (!sameCanonical(facts.topology, preparation.facts.topology)) {
    return { status: "mismatch", mismatch: { kind: "topology" } };
  }
  if (!sameCanonical(facts.publication, receipt.finalized.publication)) {
    return { status: "mismatch", mismatch: { kind: "publication" } };
  }
  return {
    status: "validated",
    authority: {
      preparation,
      receipt,
      transitionOverlay: createValidatedTransitionOverlay({
        origin: preparation.facts.completedMap.machine.source.origin,
        sourceBranch: preparation.facts.completedMap.machine.source.logicalBranch,
      }),
    },
  };
}
