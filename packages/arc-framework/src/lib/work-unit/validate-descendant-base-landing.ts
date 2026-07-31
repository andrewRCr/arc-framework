/** Host-neutral validation for landing a canonical decomposition candidate over a moved base. */

import { canonicalize, digestBytes } from "../canonical/canonical-json.js";
import type { V3DecomposeTreeSnapshot } from "./decompose-v3-preflight.js";
import { v3DecomposeReceiptPath } from "./decompose-v3-preparation.js";
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

export interface BoundDescendantBaseLandingInput {
  receipt: unknown;
  currentBaseRef: string;
  candidateHeadRef: string;
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

function comparePath(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

async function transitionMatches(
  input: DescendantBaseLandingInput,
  receipt: NonNullable<ReturnType<typeof parseV3DecomposeReceipt>>,
  deps: DescendantBaseLandingDependencies,
): Promise<V3DecompositionMismatch | null> {
  const recordedBaseOid = receipt.prepared.completedMap.machine.resultBase.head;
  const receiptPath = v3DecomposeReceiptPath(receipt.receiptId);
  const actualPaths = await deps.objects.changedPaths(recordedBaseOid, input.candidateHeadOid);
  const expectedPaths = [
    ...receipt.finalized.transitionPatch.map(({ path }) => path),
    receiptPath,
  ].sort(comparePath);
  if (actualPaths === null || canonicalize(actualPaths) !== canonicalize(expectedPaths)) {
    const firstDifference = actualPaths?.find((path, index) => path !== expectedPaths[index])
      ?? expectedPaths.find((path, index) => path !== actualPaths?.[index]);
    return { kind: "patch", locus: firstDifference ?? receiptPath };
  }
  const [beforeReceipt, afterReceipt] = await Promise.all([
    deps.objects.readTreeEntry(recordedBaseOid, receiptPath),
    deps.objects.readTreeEntry(input.candidateHeadOid, receiptPath),
  ]);
  if (beforeReceipt !== null
    || afterReceipt === null
    || afterReceipt === false
    || afterReceipt.type !== "blob"
    || afterReceipt.mode !== "100644") return { kind: "patch", locus: receiptPath };
  try {
    const actualDigest = digestBytes(await deps.objects.readBlob(afterReceipt.oid));
    const expectedDigest = digestBytes(new TextEncoder().encode(canonicalize(receipt)));
    if (actualDigest !== expectedDigest) return { kind: "patch", locus: receiptPath };
  } catch {
    return { kind: "patch", locus: receiptPath };
  }

  const projectionPath = receipt.prepared.prospectiveProjection.roadmap.path;
  for (const entry of receipt.finalized.transitionPatch) {
    if (entry.path !== projectionPath
      && !await deps.objects.stateMatches(input.currentBaseOid, entry.path, entry.before)) {
      return { kind: "path", locus: entry.path };
    }
    if (!await deps.objects.stateMatches(input.candidateHeadOid, entry.path, entry.after)) {
      return { kind: "patch", locus: entry.path };
    }
  }
  return null;
}

async function dependencyMismatch(
  input: DescendantBaseLandingInput,
  receipt: NonNullable<ReturnType<typeof parseV3DecomposeReceipt>>,
  deps: DescendantBaseLandingDependencies,
): Promise<V3DecompositionMismatch | null> {
  const machine = receipt.prepared.completedMap.machine;
  let recordedSnapshot: V3DecomposeTreeSnapshot;
  let currentSnapshot: V3DecomposeTreeSnapshot;
  try {
    [recordedSnapshot, currentSnapshot] = await Promise.all([
      deps.dependencies.readSnapshot(machine.resultBase.ref, machine.resultBase.head, machine.source.origin),
      deps.dependencies.readSnapshot(machine.resultBase.ref, input.currentBaseOid, machine.source.origin),
    ]);
  } catch {
    return { kind: "dependency", locus: "snapshot-read" };
  }
  const recordedDependents = new Set(recordedSnapshot.incomingEdges.map(({ dependent }) => dependent));
  const acquired = currentSnapshot.incomingEdges.find(({ dependent }) => !recordedDependents.has(dependent));
  return acquired === undefined ? null : { kind: "dependency", locus: acquired.dependent };
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
  const transitionMismatch = await transitionMatches(input, receipt, deps);
  if (transitionMismatch !== null) return { status: "refused", mismatch: transitionMismatch };
  const dependenciesMismatch = await dependencyMismatch(input, receipt, deps);
  if (dependenciesMismatch !== null) return { status: "refused", mismatch: dependenciesMismatch };
  return {
    status: "admitted",
    binding: {
      currentBaseOid: input.currentBaseOid,
      candidateHeadOid: input.candidateHeadOid,
    },
  };
}

/** Pin two live refs around validation and refuse any unavailable or raced binding. */
export async function validateBoundDescendantBaseLanding(
  input: BoundDescendantBaseLandingInput,
  deps: DescendantBaseLandingDependencies,
): Promise<DescendantBaseLandingResult> {
  const [currentBaseOid, candidateHeadOid] = await Promise.all([
    deps.objects.resolveCommit(input.currentBaseRef),
    deps.objects.resolveCommit(input.candidateHeadRef),
  ]);
  if (currentBaseOid === null || candidateHeadOid === null) {
    return { status: "refused", mismatch: { kind: "base", locus: "binding-unavailable" } };
  }
  const verdict = await validateDescendantBaseLanding({
    receipt: input.receipt,
    currentBaseOid,
    candidateHeadOid,
  }, deps);
  const [currentBaseReread, candidateHeadReread] = await Promise.all([
    deps.objects.resolveCommit(input.currentBaseRef),
    deps.objects.resolveCommit(input.candidateHeadRef),
  ]);
  if (currentBaseReread !== currentBaseOid || candidateHeadReread !== candidateHeadOid) {
    return { status: "refused", mismatch: { kind: "base", locus: "binding-unavailable" } };
  }
  return verdict;
}
