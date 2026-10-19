/** Reciprocal, linear response succession over a complete proposed batch. */
import { canonicalize } from "../../../../kernel/index.js";
import type { BrokenRule } from "../../../write-check.js";
import { brokenRule } from "../../rule-support.js";
import type { ReviewEvidence } from "./schema.js";
import type { EvidenceHistory } from "./history.js";

/** Check both lineage edges, their stable response context, and creation in the same batch. */
export function checkEvidenceSuccession(value: ReviewEvidence, prior: ReviewEvidence | undefined,
  before: EvidenceHistory, after: EvidenceHistory): readonly BrokenRule[] {
  const parent = value.predecessorDispositionSetId === null ? undefined : after.get(value.predecessorDispositionSetId);
  const successor = value.successorDispositionSetId === null ? undefined : after.get(value.successorDispositionSetId);
  if (value.predecessorDispositionSetId !== null && (parent === undefined
    || parent.successorDispositionSetId !== value.dispositionSet.dispositionSetId || parent.performance !== undefined
    || !sameResponseContext(parent, value))) return refuse();
  if (value.successorDispositionSetId !== null && (successor === undefined
    || successor.predecessorDispositionSetId !== value.dispositionSet.dispositionSetId || value.performance !== undefined
    || !sameResponseContext(value, successor))) return refuse();
  if (value.successorDispositionSetId !== null && prior?.successorDispositionSetId !== value.successorDispositionSetId
    && (before.has(value.successorDispositionSetId) || prior !== undefined && successor?.performance !== undefined)) return refuse();
  return hasCycle(value, after) ? refuse() : [];
}

function sameResponseContext(left: ReviewEvidence, right: ReviewEvidence): boolean {
  return canonicalize(left.result) === canonicalize(right.result) && canonicalize(left.binding) === canonicalize(right.binding);
}

function hasCycle(value: ReviewEvidence, after: EvidenceHistory): boolean {
  const seen = new Set<string>();
  let current: ReviewEvidence | undefined = value;
  while (current !== undefined) {
    const id = current.dispositionSet.dispositionSetId;
    if (seen.has(id)) return true;
    seen.add(id);
    current = current.successorDispositionSetId === null ? undefined : after.get(current.successorDispositionSetId);
  }
  return false;
}

function refuse(): readonly BrokenRule[] {
  return [brokenRule("review.evidence.succession", "Response succession must retain one exact, reciprocal, unperformed predecessor and a new successor in its batch.",
    "Create and link the successor with its predecessor in one batch, preserving the result and response binding.")];
}
