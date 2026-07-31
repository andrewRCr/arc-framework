/** Host-neutral validation for landing a canonical decomposition candidate over a moved base. */

import type { V3DecomposeTreeSnapshot } from "./decompose-v3-preflight.js";
import {
  parseV3DecomposeReceipt,
  type V3ManagedPathResult,
} from "./decompose-v3-receipt.js";
import type {
  GitAncestryResult,
  GitTreeEntry,
} from "./git-decomposition-object-readers.js";
import type { V3DecompositionMismatch } from "./validate-v3-decomposition.js";

export interface DescendantBaseLandingObjectReaders {
  resolveCommit(ref: string): Promise<string | null>;
  readAncestry(ancestor: string, descendant: string): Promise<GitAncestryResult>;
  readTreeEntry(ref: string, path: string): Promise<GitTreeEntry | null | false>;
  stateMatches(
    ref: string,
    path: string,
    expected: V3ManagedPathResult["before"],
  ): Promise<boolean>;
  changedPaths(before: string, after: string): Promise<string[] | null>;
  readBlob(oid: string): Promise<Uint8Array>;
}

export interface DescendantBaseLandingDependencyReader {
  readSnapshot(ref: string, head: string, origin: string): Promise<V3DecomposeTreeSnapshot>;
}

export interface DescendantBaseLandingInput {
  receipt: unknown;
  currentBaseOid: string;
  candidateHeadOid: string;
}

export interface DescendantBaseLandingDependencies {
  objects: DescendantBaseLandingObjectReaders;
  dependencies: DescendantBaseLandingDependencyReader;
}

export type DescendantBaseLandingResult =
  | {
      status: "admitted";
      binding: { currentBaseOid: string; candidateHeadOid: string };
    }
  | { status: "refused"; mismatch: V3DecompositionMismatch };

const OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;

function validObjectPair(...oids: string[]): boolean {
  return oids.every((oid) => OBJECT_ID.test(oid) && oid.length === oids[0]?.length);
}

/** Validate one exact base/candidate pair without granting recovery or mutation authority. */
export async function validateDescendantBaseLanding(
  input: DescendantBaseLandingInput,
  deps: DescendantBaseLandingDependencies,
): Promise<DescendantBaseLandingResult> {
  const receipt = parseV3DecomposeReceipt(input.receipt);
  if (receipt === null) return { status: "refused", mismatch: { kind: "receipt" } };
  const recordedBaseOid = receipt.prepared.completedMap.machine.resultBase.head;
  if (!validObjectPair(recordedBaseOid, input.currentBaseOid, input.candidateHeadOid)) {
    return { status: "refused", mismatch: { kind: "base", locus: "object-format" } };
  }
  const [currentBaseOid, candidateHeadOid] = await Promise.all([
    deps.objects.resolveCommit(input.currentBaseOid),
    deps.objects.resolveCommit(input.candidateHeadOid),
  ]);
  if (currentBaseOid !== input.currentBaseOid || candidateHeadOid !== input.candidateHeadOid) {
    return { status: "refused", mismatch: { kind: "base", locus: "unresolvable" } };
  }
  if (input.currentBaseOid !== recordedBaseOid) {
    const forward = await deps.objects.readAncestry(recordedBaseOid, input.currentBaseOid);
    if (forward === "unresolvable") {
      return { status: "refused", mismatch: { kind: "base", locus: "unresolvable" } };
    }
    if (forward !== "ancestor") {
      const reverse = await deps.objects.readAncestry(input.currentBaseOid, recordedBaseOid);
      if (reverse === "unresolvable") {
        return { status: "refused", mismatch: { kind: "base", locus: "unresolvable" } };
      }
      return {
        status: "refused",
        mismatch: { kind: "base", locus: reverse === "ancestor" ? "regressed" : "divergent" },
      };
    }
  }
  return {
    status: "admitted",
    binding: {
      currentBaseOid: input.currentBaseOid,
      candidateHeadOid: input.candidateHeadOid,
    },
  };
}
