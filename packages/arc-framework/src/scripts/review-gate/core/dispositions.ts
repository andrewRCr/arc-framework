/** Identity-safe construction and approval of complete finding disposition sets. */

import { canonicalDigest, canonicalize, sortByCanonicalBytes } from "../../../lib/kernel/index.js";
import {
  DispositionApprovalSchema,
  DispositionSetPreimageSchema,
  DispositionSetSchema,
  type DispositionApproval,
  type DispositionReportItem,
  type DispositionSet,
} from "./disposition-records.js";

function normalizedFindings(findings: readonly DispositionReportItem[]): DispositionReportItem[] {
  const unique = new Map(findings.map((finding) => [finding.findingId, finding]));
  if (unique.size !== findings.length) throw new Error("duplicate disposition finding identity");
  return sortByCanonicalBytes([...unique.values()]);
}

function preimage(input: Omit<DispositionSet, "dispositionSetId">) {
  return DispositionSetPreimageSchema.parse({
    domain: "arc.review-gate.disposition-set/v2",
    ...input,
  });
}

/** Create one canonical proposal over the complete normalized finding set. */
export function createDispositionSet(input: Omit<DispositionSet, "dispositionSetId" | "findings"> & {
  findings: readonly DispositionReportItem[];
}): DispositionSet {
  const fields = {
    ...input,
    findings: normalizedFindings(input.findings),
  };
  return DispositionSetSchema.parse({
    ...fields,
    dispositionSetId: canonicalDigest(preimage(fields)),
  });
}

/** Recompute the proposal identity so target, policy, or finding drift fails closed. */
export function validateDispositionSet(input: unknown): DispositionSet {
  const set = DispositionSetSchema.parse(input);
  const { dispositionSetId, ...fields } = set;
  if (canonicalize(fields.findings) !== canonicalize(normalizedFindings(fields.findings))) {
    throw new Error("disposition findings are not canonically ordered");
  }
  if (canonicalDigest(preimage(fields)) !== dispositionSetId) {
    throw new Error("disposition set ID does not match its preimage");
  }
  return set;
}

/** Add approval only over the exact canonical proposal and target. */
export function approveDispositionSet(input: {
  dispositionSet: DispositionSet;
  approvedBy: string;
  approvedAt: string;
}): DispositionApproval {
  const set = validateDispositionSet(input.dispositionSet);
  return DispositionApprovalSchema.parse({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    targetId: set.targetId,
    dispositionSetId: set.dispositionSetId,
    approvedBy: input.approvedBy,
    approvedAt: input.approvedAt,
  });
}

/** Validate that approval still names the exact proposal and target. */
export function validateDispositionApproval(
  dispositionSetInput: unknown,
  approvalInput: unknown,
): DispositionApproval {
  const set = validateDispositionSet(dispositionSetInput);
  const approval = DispositionApprovalSchema.parse(approvalInput);
  if (approval.targetId !== set.targetId || approval.dispositionSetId !== set.dispositionSetId) {
    throw new Error("disposition approval does not match its exact set and target");
  }
  return approval;
}
