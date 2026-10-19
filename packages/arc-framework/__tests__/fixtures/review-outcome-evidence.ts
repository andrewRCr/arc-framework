/** Producer-bound approved responses for portable outcome derivations. */
import { createDispositionSet, proposeDispositionSet, approveDispositionState } from
  "../../src/scripts/review-gate/core/dispositions.js";
import type { ReviewOutcome } from "../../src/lib/store/kinds/review/outcome/schema.js";
import { reviewOutcomeKey } from "../../src/lib/store/kinds/review/outcome/key.js";
import { reviewOutcomeDispositionContext } from "../../src/lib/store/kinds/review/outcome/result.js";
import type { ReviewOutcomeEvidence } from "../../src/lib/store/kinds/review/outcome/settlement.js";

export function outcomeEvidence(outcome: ReviewOutcome, disposition: "fix" | "defer" | "reject" = "defer"): ReviewOutcomeEvidence {
  const context = reviewOutcomeDispositionContext(outcome);
  if (context === null) throw new Error("expected producer result");
  const { kind: _kind, ...binding } = context;
  void _kind;
  const set = createDispositionSet({ schemaVersion: 2, semanticsVersion: "review-gate/v2", ...binding,
    targetId: outcome.target.targetId, proposedBy: "proposer", proposedVerification: "full",
    findings: outcome.findings.map((finding) => ({ findingId: finding.findingId, sourceIdentity: outcome.source.sourceId,
      locus: finding.locus, reportedSeverity: finding.severity, ...(finding.nit === true ? { reportedNit: true } : {}),
      sourceVerification: "verified", verifiedSeverity: finding.severity, disposition,
      verificationRefs: [finding.evidenceUrlOrId], rationale: "The source was checked.",
      recommendation: "Record the approved response.", openQuestions: [] })) });
  const approved = approveDispositionState({ proposed: proposeDispositionSet(set), approvedBy: "andrew",
    approvedAt: "2026-10-19T13:00:00Z" });
  return { result: { outcomeKey: reviewOutcomeKey(outcome), resultDigest: context.resultDigest },
    dispositionSet: approved.dispositionSet, approval: approved.approval, successorDispositionSetId: null };
}
