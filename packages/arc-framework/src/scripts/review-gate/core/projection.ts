/** Neutral, bounded gate projection rendering. */

import type {
  GateEvidenceProjection,
  GateProjection,
  PolicyDecisionProjection,
} from "./execution.js";
import type { GateVerdict } from "./verdict.js";

/** Inputs retained in a projection without host formatting. */
export interface GateProjectionInput {
  verdict: GateVerdict;
  policy: PolicyDecisionProjection;
  ciState: "pending" | "failure" | "success";
  ledgerVersion: number | null;
  receiptRefs: string[];
  evidence: GateEvidenceProjection[];
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
      detail: requirement.blocking ? "blocking" : "non-blocking",
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
