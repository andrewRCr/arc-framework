/** Exact in-place transitions for an approved response. */
import { canonicalize } from "../../../../kernel/index.js";
import type { ReviewEvidence } from "./schema.js";

/** Admit an exact replay or one allowed monotonic advance with all unrelated evidence unchanged. */
export function isReviewEvidenceAdvance(prior: ReviewEvidence, next: ReviewEvidence): boolean {
  return canonicalize(prior) === canonicalize(next)
    || prior.performance === undefined && next.performance !== undefined
      && canonicalize({ ...prior, performance: null }) === canonicalize({ ...next, performance: null })
    || isPolicyProjectionAdvance(prior, next) || isCandidateResponseBindingAdvance(prior, next)
    || prior.successorDispositionSetId === null && next.successorDispositionSetId !== null
      && prior.performance === undefined && next.performance === undefined
      && canonicalize(prior) === canonicalize({ ...next, successorDispositionSetId: null })
    || isSettlementAdvance(prior, next);
}

function isCandidateResponseBindingAdvance(prior: ReviewEvidence, next: ReviewEvidence): boolean {
  const before = prior.performance;
  const after = next.performance;
  if (before === undefined || after === undefined || before.candidateResponseId !== undefined
    || after.candidateResponseId === undefined) return false;
  return canonicalize({ ...before, candidateResponseId: null }) === canonicalize({ ...after, candidateResponseId: null })
    && canonicalize({ ...prior, performance: null }) === canonicalize({ ...next, performance: null });
}

function isSettlementAdvance(prior: ReviewEvidence, next: ReviewEvidence): boolean {
  const before = prior.settlement;
  const after = next.settlement;
  if (before === undefined || after === undefined || prior.successorDispositionSetId !== null
    || after.evidence.length <= before.evidence.length) return false;
  return canonicalize({ ...prior, settlement: null }) === canonicalize({ ...next, settlement: null })
    && canonicalize(before.findingActions) === canonicalize(after.findingActions)
    && canonicalize(before.evidence) === canonicalize(after.evidence.slice(0, before.evidence.length))
    && after.evidence.slice(before.evidence.length).every((entry) => entry.channelAction === "reply-and-resolve"
      && entry.carriedFromDispositionSetId === null);
}

function isPolicyProjectionAdvance(prior: ReviewEvidence, next: ReviewEvidence): boolean {
  const projection = (value: ReviewEvidence) => ({ ...value, policyProjectionPending: null, responsePolicyRequest: null });
  return prior.policyProjectionPending === true && next.policyProjectionPending === undefined
    && prior.performance === undefined && next.performance === undefined
    && canonicalize(projection(prior)) === canonicalize(projection(next));
}
