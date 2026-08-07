/** Exact-tree adapter for canonical finalized-decomposition validation facts. */

import { canonicalize, digestBytes } from "../canonical/canonical-json.js";
import type { GitExec } from "../git/exec.js";
import {
  deriveV3DecomposeSourceFacts,
  type V3DecomposeTreeSnapshot,
} from "./decompose-v3-preflight.js";
import { readGitV3DecomposeTreeSnapshot } from "./git-decompose-v3-preflight.js";
import {
  type V3DecomposePreparation,
} from "./decompose-v3-preparation.js";
import {
  type V3DecomposeReceipt,
  type V3ManagedPathResult,
} from "./decompose-v3-receipt.js";
import { deriveV3DestinationOutputs } from "./decompose-retirement-driver.js";
import { readTreeEntry } from "./git-decomposition-object-readers.js";
import type {
  FinalizedV3DecompositionFacts,
  V3DecompositionMismatch,
} from "./validate-v3-decomposition.js";

/** Transitional exact-tree assembly result consumed only by merge-conflict recovery. */
export type GitFinalizedDecompositionFactAssembly =
  | { status: "assembled"; facts: FinalizedV3DecompositionFacts }
  | { status: "mismatch"; mismatch: V3DecompositionMismatch }
  | { status: "unreadable"; locus?: string };

/** Exact committed-tree readers needed by the fact assembler. */
export interface GitDecompositionFactAssemblerDependencies {
  readSnapshot(ref: string, head: string, origin: string): Promise<V3DecomposeTreeSnapshot>;
  readPathState(
    ref: string,
    path: string,
  ): Promise<V3ManagedPathResult["before"] | false>;
}

/** Git/object boundaries used to construct exact-tree assembler readers. */
export interface GitDecompositionFactReaderDependencies {
  cwd: string;
  exec: GitExec;
  readBlob(oid: string): Promise<Uint8Array>;
}

/** Bind the fact assembler's exact-tree reads to one repository. */
export function createGitDecompositionFactAssemblerDependencies(
  dependencies: GitDecompositionFactReaderDependencies,
): GitDecompositionFactAssemblerDependencies {
  const exec: GitExec = async (command, args, options) => await dependencies.exec(command, args, {
    ...options,
    cwd: options?.cwd ?? dependencies.cwd,
  });
  return {
    readSnapshot: async (ref, head, origin) => await readGitV3DecomposeTreeSnapshot({
      cwd: dependencies.cwd,
      exec,
      readBlob: async (candidateRef, path) => {
        const entry = await readTreeEntry(exec, candidateRef, path);
        if (entry === null) return null;
        if (entry === false || entry.type !== "blob") {
          throw new Error(`Source artifact is not a readable blob: ${path}`);
        }
        return await dependencies.readBlob(entry.oid);
      },
    }, ref, head, origin),
    readPathState: async (ref, path) => {
      const entry = await readTreeEntry(exec, ref, path);
      if (entry === null) return { kind: "absent" };
      if (entry === false
        || entry.type !== "blob"
        || (entry.mode !== "100644" && entry.mode !== "100755")) return false;
      try {
        return {
          kind: "file",
          mode: entry.mode,
          contentDigest: digestBytes(await dependencies.readBlob(entry.oid)),
        };
      } catch {
        return false;
      }
    },
  };
}

function preparationFromReceipt(receipt: V3DecomposeReceipt): V3DecomposePreparation {
  return {
    kind: "prepared-decompose",
    schemaVersion: 3,
    receiptId: receipt.receiptId,
    preparationId: receipt.preparationId,
    facts: receipt.prepared,
  };
}

/** Re-derive every tree-addressable validator fact from the commit that owns it. */
export async function assembleGitFinalizedV3DecompositionFacts(
  receipt: V3DecomposeReceipt,
  candidateHead: string,
  dependencies: GitDecompositionFactAssemblerDependencies,
): Promise<GitFinalizedDecompositionFactAssembly> {
  const preparation = preparationFromReceipt(receipt);
  const machine = preparation.facts.completedMap.machine;
  let sourceSnapshot: V3DecomposeTreeSnapshot;
  try {
    sourceSnapshot = await dependencies.readSnapshot(
      machine.source.ref,
      machine.source.head,
      machine.source.origin,
    );
  } catch {
    return { status: "unreadable", locus: "snapshot-read" };
  }
  const sourceFacts = deriveV3DecomposeSourceFacts(sourceSnapshot, machine.source.origin);
  if (sourceFacts.status === "rejected") {
    return {
      status: "mismatch",
      mismatch: { kind: "source", locus: sourceFacts.locus ?? sourceFacts.reason },
    };
  }
  const managedPathResults: V3ManagedPathResult[] = [];
  for (const { path } of receipt.finalized.managedPathResults) {
    let before: V3ManagedPathResult["before"] | false;
    let after: V3ManagedPathResult["after"] | false;
    try {
      [before, after] = await Promise.all([
        dependencies.readPathState(machine.resultBase.head, path),
        dependencies.readPathState(candidateHead, path),
      ]);
    } catch {
      return { status: "unreadable", locus: path };
    }
    if (before === false || after === false) return { status: "unreadable", locus: path };
    managedPathResults.push({ path, before, after });
  }
  const destinationOutputs = deriveV3DestinationOutputs(preparation, managedPathResults);
  if (destinationOutputs === null) {
    return { status: "mismatch", mismatch: { kind: "target" } };
  }
  const transitionPatch = managedPathResults.filter(({ before, after }) =>
    canonicalize(before) !== canonicalize(after));
  return {
    status: "assembled",
    facts: {
      preparation,
      receipt,
      sourceArtifactDigest: sourceFacts.sourceArtifactDigest,
      sourceArtifactInventory: sourceFacts.sourceArtifactInventory,
      sourceUnits: sourceFacts.sourceUnits,
      sourceAllocations: preparation.facts.completedMap.authoring.sourceAllocations,
      resultBaseHead: machine.resultBase.head,
      candidateOwnership: preparation.facts.candidateOwnership,
      destinationOutputs,
      incomingEdges: sourceFacts.incomingEdges,
      outgoingEdges: sourceFacts.outgoingEdges,
      managedPathResults,
      transitionPatch,
      topology: preparation.facts.topology,
      publication: receipt.finalized.publication,
    },
  };
}
