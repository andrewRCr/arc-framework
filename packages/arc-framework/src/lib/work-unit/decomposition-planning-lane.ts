/** Planning-lane policy for retirement records and one canonical decomposition receipt claim. */

import { canonicalize } from "../canonical/canonical-json.js";
import {
  affectedPaths,
  classifyPlanningLane,
  type CanonicalChange,
  type ChangeSet,
} from "../change-facts.js";
import { v3DecomposeReceiptPath } from "./decompose-v3-preparation.js";
import type { V3DecomposeReceipt } from "./decompose-v3-receipt.js";
import { RETIREMENT_RECORD_NAMESPACE } from "./retirement-record-store.js";
import type {
  DescendantBaseLandingResult,
} from "./validate-descendant-base-landing.js";
import {
  V3_DECOMPOSITION_READ_FAILURE,
  type FinalizedV3DecompositionFacts,
  type FinalizedV3DecompositionValidation,
  type V3DecompositionMismatch,
} from "./validate-v3-decomposition.js";
/*
 * The evidence discriminator above is intentionally separate from `locus`:
 * every valid managed path must remain available as mismatch detail.
 */

/** Closed lane result consumed by stdout/stderr/exit-code adapters. */
export type DecompositionPlanningLaneResult =
  | { outcome: "planning" | "reviewed" }
  | { outcome: "invalid-retirement"; locus: string };

/**
 * Receipt-read boundary preserving malformed-content vs unavailable-object evidence.
 *
 * The retirement namespace holds more than decomposition receipts — a park writes a retained-receipt
 * record there too. `not-decomposition` keeps an authentic record of another kind distinct from
 * corruption, because only the latter is evidence of a broken retirement.
 */
export type PlanningLaneReceiptRead =
  | { status: "read"; receipt: V3DecomposeReceipt }
  | { status: "not-decomposition" }
  | { status: "malformed" }
  | { status: "unreadable" };

/** Exact-tree assembly result before the canonical validator runs. */
export type PlanningLaneFactAssembly =
  | { status: "assembled"; facts: FinalizedV3DecompositionFacts }
  | { status: "mismatch"; mismatch: V3DecompositionMismatch }
  | { status: "unreadable"; locus?: string };

/** Injectable boundaries around the pure lane decision. */
export interface DecompositionPlanningLaneDependencies {
  readReceipt(head: string, path: string): Promise<PlanningLaneReceiptRead>;
  assemble(receipt: V3DecomposeReceipt, head: string): Promise<PlanningLaneFactAssembly>;
  validateCanonical(facts: FinalizedV3DecompositionFacts): FinalizedV3DecompositionValidation;
  validateLanding(
    receipt: V3DecomposeReceipt,
    base: string,
    head: string,
  ): Promise<DescendantBaseLandingResult>;
}

function comparePath(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

function isRetirementRecordPath(path: string): boolean {
  return path.startsWith(`${RETIREMENT_RECORD_NAMESPACE}/`);
}

function touchesRetirementNamespace(change: CanonicalChange): boolean {
  return isRetirementRecordPath(change.path)
    || (change.previousPath !== undefined && isRetirementRecordPath(change.previousPath));
}

function readShaped(mismatch: V3DecompositionMismatch): boolean {
  return mismatch.evidence === V3_DECOMPOSITION_READ_FAILURE
    || (mismatch.kind === "base"
      && ["object-format", "unresolvable", "binding-unavailable"].includes(mismatch.locus ?? ""));
}

function mismatchLocus(mismatch: V3DecompositionMismatch, fallback: string): string {
  return mismatch.locus ?? fallback;
}

/** Decide one exact two-point change without weakening ordinary planning grammar. */
export async function classifyDecompositionPlanningLane(
  changeSet: ChangeSet,
  base: string,
  head: string,
  dependencies: DecompositionPlanningLaneDependencies,
): Promise<DecompositionPlanningLaneResult> {
  if (changeSet.changeSet === "unknown") return { outcome: "reviewed" };
  const receiptChanges = changeSet.changes.filter(touchesRetirementNamespace);
  if (receiptChanges.length === 0) {
    return { outcome: classifyPlanningLane(changeSet) };
  }
  const firstReceiptPath = receiptChanges[0]?.path ?? RETIREMENT_RECORD_NAMESPACE;
  const invalidShape = receiptChanges.find((change) =>
    change.status !== "added" || change.newMode !== "100644");
  if (invalidShape !== undefined) {
    return { outcome: "invalid-retirement", locus: invalidShape.path };
  }
  if (receiptChanges.length > 1) {
    for (const change of receiptChanges) {
      const read = await dependencies.readReceipt(head, change.path);
      if (read.status === "malformed" || read.status === "read") {
        return { outcome: "invalid-retirement", locus: change.path };
      }
    }
    return { outcome: "reviewed" };
  }
  const receiptChange = receiptChanges[0];
  if (receiptChange === undefined) return { outcome: "invalid-retirement", locus: firstReceiptPath };
  const planningChanges = changeSet.changes.filter((candidate) => candidate !== receiptChange);
  if (classifyPlanningLane({ changeSet: "known", changes: planningChanges }) !== "planning") {
    return { outcome: "reviewed" };
  }
  const read = await dependencies.readReceipt(head, receiptChange.path);
  if (read.status === "unreadable") return { outcome: "reviewed" };
  if (read.status === "not-decomposition") return { outcome: "reviewed" };
  if (read.status === "malformed") {
    return { outcome: "invalid-retirement", locus: receiptChange.path };
  }
  const canonicalPath = v3DecomposeReceiptPath(read.receipt.receiptId);
  if (receiptChange.path !== canonicalPath) {
    return { outcome: "invalid-retirement", locus: receiptChange.path };
  }
  const actualPaths = affectedPaths(changeSet.changes).sort(comparePath);
  const expectedPaths = [
    ...read.receipt.finalized.transitionPatch.map(({ path }) => path),
    canonicalPath,
  ].sort(comparePath);
  if (canonicalize(actualPaths) !== canonicalize(expectedPaths)) return { outcome: "reviewed" };

  const assembled = await dependencies.assemble(read.receipt, head);
  if (assembled.status === "unreadable") return { outcome: "reviewed" };
  if (assembled.status === "mismatch") {
    return {
      outcome: "invalid-retirement",
      locus: mismatchLocus(assembled.mismatch, canonicalPath),
    };
  }
  const canonical = dependencies.validateCanonical(assembled.facts);
  if (canonical.status === "mismatch") {
    return {
      outcome: "invalid-retirement",
      locus: mismatchLocus(canonical.mismatch, canonicalPath),
    };
  }
  const landing = await dependencies.validateLanding(read.receipt, base, head);
  if (landing.status === "refused") {
    return readShaped(landing.mismatch)
      ? { outcome: "reviewed" }
      : {
          outcome: "invalid-retirement",
          locus: mismatchLocus(landing.mismatch, canonicalPath),
        };
  }
  return { outcome: "planning" };
}
