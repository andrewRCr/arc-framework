/** Read-only settlement projections consumed by stored outcome derivations. */
import { type CanonicalDigest } from "../../../../kernel/index.js";
import { type DispositionSet, type DispositionApproval } from "../../../../../scripts/review-gate/core/disposition-records.js";
import type { HostedSettlementEvidence, LaneResponsePerformance } from
  "../../../../../scripts/review-gate/core/operation-state-schema.js";
import type { ReviewOutcome } from "./schema.js";
import { validateDispositionApproval } from "../../../../../scripts/review-gate/core/dispositions.js";
import { reviewOutcomeDispositionContext, reviewOutcomeMatchesDispositionSet } from "./result.js";
import { reviewOutcomeKey } from "./key.js";

/** The evidence fields needed to derive settlement; the evidence kind owns the stored envelope. */
export interface ReviewOutcomeEvidence {
  result: { outcomeKey: string; resultDigest: CanonicalDigest };
  dispositionSet: DispositionSet;
  approval: DispositionApproval;
  successorDispositionSetId: CanonicalDigest | null;
  performance?: LaneResponsePerformance;
  settlement?: { evidence: readonly HostedSettlementEvidence[] };
}

/** Read settlement from a current approved response for this exact immutable result. */
export function reviewOutcomeIsSettled(outcome: ReviewOutcome, evidence: readonly ReviewOutcomeEvidence[]): boolean {
  if (outcome.outcome !== "findings") return false;
  const context = reviewOutcomeDispositionContext(outcome);
  if (context === null) return false;
  return evidence.some((record) => {
    if (record.successorDispositionSetId !== null || record.result.outcomeKey !== reviewOutcomeKey(outcome)
      || record.result.resultDigest !== context.resultDigest || !reviewOutcomeMatchesDispositionSet(outcome, record.dispositionSet)) return false;
    try { validateDispositionApproval(record.dispositionSet, record.approval); }
    catch { return false; }
    const performance = record.performance;
    if (record.dispositionSet.findings.some(({ disposition }) => disposition === "fix")
      && (performance?.producerId !== outcome.attemptId
        || performance.dispositionSetId !== record.dispositionSet.dispositionSetId
        || performance.originatingHeadSha !== outcome.target.headSha)) return false;
    const sealed = outcome.hosted?.sealedResult;
    if (outcome.hosted !== undefined && (sealed === undefined
      || !sealed.findings.every(({ findingId }) => record.settlement?.evidence.some((entry) =>
        entry.findingId === findingId && entry.dispositionSetId === record.dispositionSet.dispositionSetId)))) return false;
    return true;
  });
}
