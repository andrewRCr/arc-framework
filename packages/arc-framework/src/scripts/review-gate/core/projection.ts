/** Neutral, bounded gate projection rendering. */

import type {
  GateEvidenceProjection,
  GateProjection,
  PolicyDecisionProjection,
} from "./execution.js";
import type { GateVerdict } from "./verdict.js";
import type {
  ReviewReceiptV2,
  ReviewRequestV2,
  ReviewRequirementV2,
  ReviewTarget,
} from "./gate-contract-v2-schema.js";
import {
  evaluateForwardRequirement,
  type ForwardRequirementEvaluationInput,
} from "./requirements.js";

/** Inputs retained in a projection without host formatting. */
export interface GateProjectionInput {
  verdict: GateVerdict;
  policy: PolicyDecisionProjection;
  ciState: "pending" | "failure" | "success";
  ledgerVersion: number | null;
  receiptRefs: string[];
  evidence: GateEvidenceProjection[];
}

/** Dormant forward-only projection; operational v1 reduction remains a separate compatibility surface. */
export interface ForwardGateProjection {
  schemaVersion: 2;
  semanticsVersion: "review-gate/v2";
  conclusion: "pending" | "failure" | "success";
  summary: string;
  blockers: Array<{ code: string; detail: string }>;
  target: ReviewTarget;
  requirement: ReviewRequirementV2 | null;
  request: ReviewRequestV2 | null;
  receipt: ReviewReceiptV2 | null;
  coverage?: {
    treatment: "none" | "direct" | "carry" | "incremental" | "final-full";
    applicabilityId: string | null;
  };
}

function plain(value: string): string {
  return value.replace(/[<>&]/gu, " ").replace(/\s+/gu, " ").trim();
}

/** Render a deterministic projection with fixed vocabulary and sanitized detail. */
export function renderGateProjection(input: GateProjectionInput): GateProjection {
  const requirementSummary = input.verdict.requirements.map((requirement) => {
    const source = requirement.sourceIdentity === null ? "" : ` via ${plain(requirement.sourceIdentity)}`;
    return `${plain(requirement.requirementId)}: ${requirement.state}${source}`;
  });
  const blockerSummary = input.verdict.blockers.map((blocker) => plain(blocker.code));
  const successSummary = requirementSummary.length === 0 && input.policy.disposition === "exempt"
    ? ["review: inapplicable"]
    : requirementSummary;
  const summaryParts = input.verdict.conclusion === "success" ? successSummary : blockerSummary;
  return {
    schemaVersion: 1,
    conclusion: input.verdict.conclusion,
    summary: summaryParts.length === 0 ? input.verdict.conclusion : summaryParts.join("; "),
    blockers: input.verdict.blockers.map((blocker) => ({
      code: plain(blocker.code),
      detail: plain(blocker.detail),
    })),
    requirementExecutions: input.verdict.requirements.map((requirement) => ({
      requirementId: plain(requirement.requirementId),
      state: requirement.state,
      sourceIdentity: requirement.sourceIdentity,
      detail: plain(requirement.detail),
    })),
    receiptRefs: input.receiptRefs.map(plain),
    policyDecision: input.policy,
    ciState: input.ciState,
    ledgerVersion: input.ledgerVersion,
    evidence: input.evidence.map((evidence) => ({
      ...evidence,
      requirementId: plain(evidence.requirementId),
      sourceIdentity: plain(evidence.sourceIdentity),
      evidenceRef: plain(evidence.evidenceRef),
    })),
  };
}

/** Validate and project one exact v2 requirement chain without activating it as merge authority. */
export function renderForwardGateProjection(
  input: ForwardRequirementEvaluationInput,
): ForwardGateProjection {
  const evaluation = evaluateForwardRequirement(input);
  const conclusion = evaluation.state === "inapplicable" || evaluation.state === "clean"
    ? "success"
    : evaluation.state === "unrequested" || evaluation.state === "pending"
      ? "pending"
      : "failure";
  const blockers = conclusion === "failure"
    ? [{ code: `standard-review:${evaluation.state}`, detail: `standard review is ${evaluation.state}` }]
    : [];
  const summary = evaluation.requirement === null
    ? "standard review: exempt"
    : `standard review: ${evaluation.state}; requirement ${evaluation.requirement.requirementId}`;
  return {
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    conclusion,
    summary,
    blockers,
    target: evaluation.target,
    requirement: evaluation.requirement,
    request: evaluation.request,
    receipt: evaluation.receipt,
  };
}
