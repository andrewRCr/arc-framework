/** Identity-safe construction and approval of complete finding disposition sets. */

import { canonicalDigest, canonicalize, sortByCanonicalBytes } from "../../../lib/kernel/index.js";
import {
  ApprovedDispositionSetSchema,
  DispositionApprovalSchema,
  DispositionSetStateSchema,
  DispositionSetPreimageSchema,
  DispositionSetSchema,
  DispositionReportItemSchema,
  ProposedDispositionSetSchema,
  type ApprovedDispositionSet,
  type DispositionApproval,
  type DispositionReportItem,
  type DispositionSet,
  type DispositionSetState,
  type ProposedDispositionSet,
  verifiedDispositionSeverity,
} from "./disposition-records.js";
import {
  PACKAGE_DEFAULT_SEVERITY_GATING_POLICY,
  resolveFindingGating,
  type SeverityGatingPolicy,
} from "./severity-gating-policy.js";

type WithOptionalGating<T> = T extends unknown
  ? Omit<T, "gating"> & { gating?: DispositionReportItem["gating"] }
  : never;
type DispositionReportProposalItem = WithOptionalGating<DispositionReportItem>;

function normalizedFindings(
  findings: readonly DispositionReportProposalItem[],
  policy: SeverityGatingPolicy,
): DispositionReportItem[] {
  const normalized = findings.map((finding) => DispositionReportItemSchema.parse({
      ...finding,
      gating: finding.sourceVerification === "not-supported"
        ? "record-only"
        : resolveFindingGating({
            severity: finding.verifiedSeverity,
            ...(finding.verifiedNit === true ? { nit: true as const } : {}),
          }, policy),
    }));
  const unique = new Map(normalized.map((finding) => [finding.findingId, finding]));
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
  findings: readonly DispositionReportProposalItem[];
}, policy: SeverityGatingPolicy = PACKAGE_DEFAULT_SEVERITY_GATING_POLICY): DispositionSet {
  const fields = {
    ...input,
    findings: normalizedFindings(input.findings, policy),
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
  const retainedPolicy = {
    minorGating: fields.findings.find((finding) =>
      verifiedDispositionSeverity(finding) === "minor"
        && finding.sourceVerification === "verified"
        && finding.verifiedNit !== true)?.gating
      ?? PACKAGE_DEFAULT_SEVERITY_GATING_POLICY.minorGating,
  };
  if (canonicalize(fields.findings) !== canonicalize(normalizedFindings(fields.findings, retainedPolicy))) {
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
  if (input.approvedBy === set.proposedBy) {
    throw new Error("disposition approval actor must be distinct from the proposer");
  }
  return DispositionApprovalSchema.parse({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    targetId: set.targetId,
    dispositionSetId: set.dispositionSetId,
    approvedBy: input.approvedBy,
    approvedAt: input.approvedAt,
  });
}

/** Wrap one canonical set as the only state eligible for approval. */
export function proposeDispositionSet(dispositionSetInput: unknown): ProposedDispositionSet {
  const dispositionSet = validateDispositionSet(dispositionSetInput);
  return ProposedDispositionSetSchema.parse({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    state: "proposed",
    dispositionSet,
  });
}

/** Transition an exact proposed set to approval by a distinct actor. */
export function approveDispositionState(input: {
  proposed: ProposedDispositionSet;
  approvedBy: string;
  approvedAt: string;
}): ApprovedDispositionSet {
  const proposed = validateDispositionState(input.proposed);
  if (proposed.state !== "proposed") throw new Error("only a proposed disposition set can be approved");
  const approval = approveDispositionSet({
    dispositionSet: proposed.dispositionSet,
    approvedBy: input.approvedBy,
    approvedAt: input.approvedAt,
  });
  return ApprovedDispositionSetSchema.parse({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    state: "approved",
    dispositionSet: proposed.dispositionSet,
    approval,
  });
}

/** Validate one strict proposed/approved state and every canonical cross-record binding. */
export function validateDispositionState(input: unknown): DispositionSetState {
  const state = DispositionSetStateSchema.parse(input);
  const dispositionSet = validateDispositionSet(state.dispositionSet);
  if (state.state === "proposed") return { ...state, dispositionSet };
  const approval = validateDispositionApproval(dispositionSet, state.approval);
  return { ...state, dispositionSet, approval };
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
  if (approval.approvedBy === set.proposedBy) {
    throw new Error("disposition approval actor must be distinct from the proposer");
  }
  return approval;
}
