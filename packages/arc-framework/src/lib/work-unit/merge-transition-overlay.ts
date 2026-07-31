/**
 * Pure selection of one finalized decomposition overlay from a pinned merge snapshot.
 *
 * Git and filesystem adapters must materialize every operand before calling this
 * module. The selector performs no I/O and returns no authority from partial facts.
 */

import { canonicalize } from "../canonical/canonical-json.js";
import {
  validateFinalizedV3Decomposition,
  type FinalizedV3DecompositionFacts,
} from "./validate-v3-decomposition.js";
import { v3DecomposeReceiptPath } from "./decompose-v3-preparation.js";
import type { ValidatedTransitionOverlay } from "./transition-overlay.js";

/** Git operation state captured with the candidate index tree. */
export type PinnedMergeOperation =
  | { kind: "ordinary" }
  | { kind: "rebase" }
  | { kind: "cherry-pick" }
  | { kind: "revert" }
  | { kind: "ambiguous" }
  | {
    kind: "merge";
    headOid: string;
    mergeHeadOids: readonly string[];
    configuredBase: { ref: string; oid: string };
    candidateTreeOid: string;
  };

/** One live ref pinned before object reads and closed by the adapter's final reread. */
export interface PinnedMergeRef {
  ref: string;
  oid: string;
}

/** Where exact receipt bytes were observed in the pinned merge snapshot. */
export type PinnedMergeReceiptProvenance =
  | { kind: "candidate-tree" }
  | { kind: "head"; commitOid: string }
  | { kind: "merge-head"; index: number; commitOid: string }
  | {
      kind: "restated";
      parent: "head" | "merge-head";
      index?: number;
      commitOid: string;
    };

/** One receipt candidate plus the normalized facts read only from pinned objects. */
export interface PinnedMergeReceiptCandidate {
  receiptBytes: string;
  receiptPath: string;
  derivedCandidateTreeOid: string;
  provenance: readonly PinnedMergeReceiptProvenance[];
  validationFacts: FinalizedV3DecompositionFacts;
}

/** Closed DTO consumed by the synchronous overlay selector. */
export interface PinnedMergeValidationFacts {
  operation: PinnedMergeOperation;
  refs: readonly PinnedMergeRef[];
  candidateChangedPaths: readonly string[];
  candidates: readonly PinnedMergeReceiptCandidate[];
}

/** Closed overlay-selection result. */
export type MergeTransitionOverlaySelection =
  | {
    status: "selected";
    overlay: ValidatedTransitionOverlay;
    receiptId: string;
    provenance: readonly PinnedMergeReceiptProvenance[];
  }
  | { status: "absent" }
  | { status: "ambiguous" }
  | { status: "refused"; reason: "invalid-snapshot" | "invalid-authority" };

const GIT_OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;

/**
 * Select one validator-proven transition overlay from a pinned merge snapshot.
 *
 * @param facts - Closed operation, ref, provenance, and canonical-validation facts
 * @returns One selected overlay or a closed no-authority result
 */
export function selectMergeTransitionOverlay(
  facts: PinnedMergeValidationFacts,
): MergeTransitionOverlaySelection {
  if (facts.operation.kind === "ambiguous") {
    return { status: "refused", reason: "invalid-snapshot" };
  }
  if (facts.operation.kind !== "merge") return { status: "absent" };
  if (!validMergeOperation(facts.operation)) {
    return { status: "refused", reason: "invalid-snapshot" };
  }
  if (!validChangedPaths(facts.candidateChangedPaths)) {
    return { status: "refused", reason: "invalid-snapshot" };
  }

  const pinnedRefs = new Map<string, string>();
  for (const { ref, oid } of facts.refs) {
    if (ref === "" || !GIT_OBJECT_ID.test(oid)) {
      return { status: "refused", reason: "invalid-snapshot" };
    }
    const previous = pinnedRefs.get(ref);
    if (previous !== undefined && previous !== oid) {
      return { status: "refused", reason: "invalid-snapshot" };
    }
    pinnedRefs.set(ref, oid);
  }
  if (pinnedRefs.get(facts.operation.configuredBase.ref) !== facts.operation.configuredBase.oid) {
    return { status: "refused", reason: "invalid-snapshot" };
  }

  const changedReceiptPaths = new Set(facts.candidates.flatMap((candidate) =>
    candidate.provenance.some(({ kind }) => kind === "candidate-tree")
      && facts.candidateChangedPaths.includes(candidate.receiptPath)
      ? [candidate.receiptPath]
      : []));
  const substantiveChangedPaths = facts.candidateChangedPaths.filter(
    (path) => !changedReceiptPaths.has(path),
  );
  const selections = new Map<
    string,
    Extract<MergeTransitionOverlaySelection, { status: "selected" }>
  >();
  let invalidAuthority = false;
  for (const candidate of facts.candidates) {
    if (!candidate.provenance.some(({ kind }) => kind === "candidate-tree")) continue;
    if (candidate.derivedCandidateTreeOid !== facts.operation.candidateTreeOid
      || !validProvenance(candidate.provenance, facts.operation)) {
      return { status: "refused", reason: "invalid-snapshot" };
    }
    if (!facts.candidateChangedPaths.includes(candidate.receiptPath)) continue;
    const validation = validateFinalizedV3Decomposition(candidate.validationFacts);
    if (validation.status !== "validated"
      || canonicalize(validation.authority.receipt) !== candidate.receiptBytes) {
      invalidAuthority = true;
      continue;
    }
    const expectedReceiptPath = v3DecomposeReceiptPath(validation.authority.receipt.receiptId);
    if (candidate.receiptPath !== expectedReceiptPath) {
      invalidAuthority = true;
      continue;
    }
    const resultBase = validation.authority.preparation.facts.completedMap.machine.resultBase;
    const advancing = candidate.provenance.some((entry) =>
      entry.kind === "restated" && entry.parent === "head");
    const resultBaseHead = advancing && facts.operation.mergeHeadOids.length === 1
      ? facts.operation.mergeHeadOids[0]
      : facts.operation.configuredBase.oid;
    if (resultBase.ref !== facts.operation.configuredBase.ref
      || resultBase.head !== resultBaseHead) {
      invalidAuthority = true;
      continue;
    }
    const expectedChangedPaths = validation.authority.receipt.finalized.transitionPatch
      .map(({ path }) => path)
      .sort(compareUtf8);
    if (canonicalize(substantiveChangedPaths) !== canonicalize(expectedChangedPaths)) {
      invalidAuthority = true;
      continue;
    }
    const key = `${candidate.receiptBytes}\0${candidate.derivedCandidateTreeOid}`;
    const previous = selections.get(key);
    selections.set(key, {
      status: "selected",
      overlay: validation.authority.transitionOverlay,
      receiptId: validation.authority.receipt.receiptId,
      provenance: mergeProvenance(previous?.provenance ?? [], candidate.provenance),
    });
  }

  if (invalidAuthority) return { status: "refused", reason: "invalid-authority" };
  if (selections.size === 0) return { status: "absent" };
  if (selections.size > 1) return { status: "ambiguous" };
  for (const selection of selections.values()) return selection;
  return { status: "absent" };
}

function validChangedPaths(paths: readonly string[]): boolean {
  return paths.every((path) => path !== "" && !path.includes("\0"))
    && new Set(paths).size === paths.length
    && canonicalize(paths) === canonicalize([...paths].sort(compareUtf8));
}

function validMergeOperation(
  operation: Extract<PinnedMergeOperation, { kind: "merge" }>,
): boolean {
  return GIT_OBJECT_ID.test(operation.headOid)
    && operation.mergeHeadOids.length > 0
    && operation.mergeHeadOids.every((oid) => GIT_OBJECT_ID.test(oid))
    && new Set(operation.mergeHeadOids).size === operation.mergeHeadOids.length
    && operation.configuredBase.ref !== ""
    && GIT_OBJECT_ID.test(operation.configuredBase.oid)
    && GIT_OBJECT_ID.test(operation.candidateTreeOid);
}

function validProvenance(
  provenance: readonly PinnedMergeReceiptProvenance[],
  operation: Extract<PinnedMergeOperation, { kind: "merge" }>,
): boolean {
  if (provenance.filter(({ kind }) => kind === "candidate-tree").length !== 1
    || !provenance.some(({ kind }) => kind === "head" || kind === "merge-head" || kind === "restated")) {
    return false;
  }
  return provenance.every((entry) => {
    if (entry.kind === "candidate-tree") return true;
    if (entry.kind === "head") return entry.commitOid === operation.headOid;
    if (entry.kind === "restated") {
      if (entry.parent === "head") return entry.index === undefined && entry.commitOid === operation.headOid;
      return entry.index !== undefined
        && entry.index >= 0
        && entry.index < operation.mergeHeadOids.length
        && operation.mergeHeadOids[entry.index] === entry.commitOid;
    }
    return entry.index >= 0
      && entry.index < operation.mergeHeadOids.length
      && operation.mergeHeadOids[entry.index] === entry.commitOid;
  });
}

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function mergeProvenance(
  left: readonly PinnedMergeReceiptProvenance[],
  right: readonly PinnedMergeReceiptProvenance[],
): PinnedMergeReceiptProvenance[] {
  const merged: PinnedMergeReceiptProvenance[] = [];
  const seen = new Set<string>();
  for (const entry of [...left, ...right]) {
    const key = canonicalize(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(entry);
  }
  return merged;
}
