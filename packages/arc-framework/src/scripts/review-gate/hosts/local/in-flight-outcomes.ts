/** Reconcile machine-local pending execution with authoritative ended outcomes. */
import type { ReviewOutcome } from "../../../../lib/store/kinds/review/outcome/schema.js";
import type { ReviewOperationState } from "../../core/operation-state-schema.js";
import { laneProgressOperationId } from "../../lane-progress.js";
import { LocalOperationStateStoreError } from "./operation-state-store.js";

/** Remove execution that already has an immutable outcome, retaining an empty lane envelope. */
export function pruneEndedReviewExecution(state: ReviewOperationState, outcomes: readonly ReviewOutcome[]): ReviewOperationState | null {
  if (state.kind === "lane-progress") {
    const ended = new Set(outcomes.map(value => value.hosted?.admission.admissionId ?? value.attemptId));
    return { ...state, completedPasses: 0,
      attempts: state.attempts.filter(value => !ended.has(value.hosted?.admission.admissionId ?? value.attemptId)) };
  }
  if (state.kind === "review-suspension") {
    return outcomes.some(value => value.local?.request.requestId === state.requestId) ? null : state;
  }
  return outcomes.some(value => value.attemptId === state.operationId) ? null : state;
}

/** Refuse new pending execution at a logical pass that an outcome has finished. */
export function assertReviewPassStillOpen(state: ReviewOperationState, outcomes: readonly ReviewOutcome[]): void {
  if (state.kind !== "lane-progress") return;
  const finished = outcomes.filter(value => (value.outcome === "clean" || value.outcome === "findings")
    && laneProgressOperationId({ lane: value.lane, repositoryId: value.target.repositoryId,
      headSha: value.target.headSha, lineage: value.lineage }) === state.operationId);
  if (state.attempts.some(attempt => finished.some(value => value.logicalPass === attempt.logicalPass))) {
    throw new LocalOperationStateStoreError("logical-pass-already-finished");
  }
}
