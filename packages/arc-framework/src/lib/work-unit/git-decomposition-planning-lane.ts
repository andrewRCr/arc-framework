/** Git adapter for the exact-ref decomposition planning-lane policy. */

import {
  resolveChangeSet,
  type RawGitExec,
} from "../change-facts.js";
import type { GitExec } from "../git/exec.js";
import {
  assembleGitFinalizedV3DecompositionFacts,
  createGitDecompositionFactAssemblerDependencies,
} from "./git-decomposition-fact-assembler.js";
import {
  changedPaths,
  readAncestry,
  readTreeEntry,
  resolveCommit,
  stateMatches,
} from "./git-decomposition-object-readers.js";
import {
  classifyDecompositionPlanningLane,
  type DecompositionPlanningLaneResult,
} from "./decomposition-planning-lane.js";
import { parseV3DecomposeReceipt } from "./decompose-v3-receipt.js";
import { validateBoundDescendantBaseLanding } from "./validate-descendant-base-landing.js";
import { validateFinalizedV3Decomposition } from "./validate-v3-decomposition.js";

/** Repository/object boundaries for exact-ref lane classification. */
export interface GitDecompositionPlanningLaneDependencies {
  cwd: string;
  exec: GitExec;
  rawExec: RawGitExec;
  readBlob(oid: string): Promise<Uint8Array>;
}

/** Classify one exact Git pair through canonical receipt and landing validation. */
export async function classifyGitDecompositionPlanningLane(
  base: string,
  head: string,
  dependencies: GitDecompositionPlanningLaneDependencies,
): Promise<DecompositionPlanningLaneResult> {
  const exec: GitExec = async (command, args, options) => await dependencies.exec(command, args, {
    ...options,
    cwd: options?.cwd ?? dependencies.cwd,
  });
  const rawExec: RawGitExec = async (args, options) => await dependencies.rawExec(args, {
    ...options,
    cwd: options?.cwd ?? dependencies.cwd,
  });
  const assembler = createGitDecompositionFactAssemblerDependencies({
    cwd: dependencies.cwd,
    exec,
    readBlob: async (oid) => await dependencies.readBlob(oid),
  });
  const changeSet = await resolveChangeSet(
    rawExec,
    base,
    head,
  );
  return await classifyDecompositionPlanningLane(changeSet, base, head, {
    readReceipt: async (candidateHead, path) => {
      const entry = await readTreeEntry(exec, candidateHead, path);
      if (entry === null || entry === false) return { status: "unreadable" };
      if (entry.type !== "blob" || entry.mode !== "100644") return { status: "malformed" };
      let text: string;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(await dependencies.readBlob(entry.oid));
      } catch {
        return { status: "unreadable" };
      }
      const receipt = parseV3DecomposeReceipt(text);
      return receipt === null ? { status: "malformed" } : { status: "read", receipt };
    },
    assemble: async (receipt, candidateHead) =>
      await assembleGitFinalizedV3DecompositionFacts(receipt, candidateHead, assembler),
    validateCanonical: validateFinalizedV3Decomposition,
    validateLanding: async (receipt, currentBaseRef, candidateHeadRef) =>
      await validateBoundDescendantBaseLanding({
        receipt,
        currentBaseRef,
        candidateHeadRef,
      }, {
        objects: {
          resolveCommit: async (ref) => await resolveCommit(exec, ref),
          readAncestry: async (ancestor, descendant) => await readAncestry(exec, ancestor, descendant),
          readTreeEntry: async (ref, path) => await readTreeEntry(exec, ref, path),
          stateMatches: async (ref, path, expected) => await stateMatches({
            exec,
            readBlob: async (oid) => await dependencies.readBlob(oid),
          }, ref, path, expected),
          changedPaths: async (before, after) => await changedPaths(exec, before, after),
          readBlob: async (oid) => await dependencies.readBlob(oid),
        },
        dependencies: {
          readSnapshot: async (ref, recordedHead, origin) =>
            await assembler.readSnapshot(ref, recordedHead, origin),
        },
      }),
  });
}
