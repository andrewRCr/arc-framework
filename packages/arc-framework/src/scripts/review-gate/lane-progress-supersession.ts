/** Read-only review-budget continuity across validated Candidate supersession roots. */

import {
  CandidateSupersessionResolutionError,
  type CandidateSupersessionAncestor,
} from "../../lib/work-unit/candidate-attestation.js";
import type { LaneProgressState } from "./core/operation-state-schema.js";
import type { ReviewOperationStateStore } from "./core/ports.js";
import { countCompleteLogicalPasses, readLaneProgressOwner } from "./lane-progress.js";

/** A predecessor authority that still needs an executable review continuation. */
export function livePredecessorReviewAttempt(owner: LaneProgressState): {
  attemptId: string;
  outcome: "pending" | "partial" | "findings" | "ambiguous-delivery";
  reviewHeadSha: string;
} | null {
  const live = owner.attempts.find((attempt) =>
    attempt.outcome === "pending" || attempt.outcome === "partial"
      || attempt.outcome === "findings" || attempt.outcome === "ambiguous-delivery");
  if (live === undefined || (live.outcome !== "pending" && live.outcome !== "partial"
    && live.outcome !== "findings" && live.outcome !== "ambiguous-delivery")) return null;
  return { attemptId: live.attemptId, outcome: live.outcome, reviewHeadSha: live.headSha };
}

function frontlinePerformedDispositionIds(owner: LaneProgressState | null): ReadonlySet<string> {
  return new Set(owner?.attempts.flatMap((attempt) => [
    ...(attempt.responsePerformanceHistory ?? []),
    ...(attempt.responsePerformance === undefined ? [] : [attempt.responsePerformance]),
  ].map((performance) => performance.dispositionSetId)) ?? []);
}

function inheritedCandidateOwner(owner: LaneProgressState | null, stateOffBranch: boolean): LaneProgressState | null {
  if (owner === null || !stateOffBranch) return owner;
  const attempts = owner.attempts.filter(attempt => attempt.outcome !== "partial"
    && attempt.outcome !== "findings" && attempt.outcome !== "ambiguous-delivery");
  return { ...owner, attempts,
    completedPasses: new Set(attempts.filter(attempt => attempt.terminalProducer).map(attempt => attempt.logicalPass)).size };
}

function predecessorReviewRecovery(ancestor: CandidateSupersessionAncestor, lane: LaneProgressState["lane"],
  live: NonNullable<ReturnType<typeof livePredecessorReviewAttempt>>, stateOffBranch: boolean): string {
  const detail = `Superseded Candidate ${ancestor.candidateId} has a live ${lane} review attempt ${live.attemptId} (${live.outcome}).`;
  return stateOffBranch
    ? `${detail} Finish or resume attempt ${live.attemptId} on this clone, then retry successor review.`
    : `${detail} The current Candidate cannot resume that attempt: restore a branch worktree at the predecessor Candidate record${ancestor.recordRevision === undefined ? "" : ` commit ${ancestor.recordRevision}`}, complete its review there, then retry successor review.`;
}

/** Count consumed passes on validated older Candidate owners without importing their attempts. */
export async function readCandidateInheritedLaneProgress(
  store: Pick<ReviewOperationStateStore, "readOperation" | "stateOffBranch">,
  input: {
    lane: LaneProgressState["lane"];
    repositoryId: string;
    headSha: string;
    ancestors: readonly CandidateSupersessionAncestor[];
  },
): Promise<{
  inheritedCompletedPasses: number;
  inheritedCompletePasses: number;
  ancestorOwners: readonly { candidateId: string; owner: LaneProgressState | null }[];
}> {
  const ancestorOwners = await Promise.all(input.ancestors.map(async (ancestor) => ({
    candidateId: ancestor.candidateId,
    owner: inheritedCandidateOwner(await readLaneProgressOwner(store, {
      lane: input.lane,
      repositoryId: input.repositoryId,
      headSha: input.headSha,
      lineage: { kind: "candidate", candidateId: ancestor.candidateId },
    }), store.stateOffBranch === true),
  })));
  for (const [index, { owner }] of ancestorOwners.entries()) {
    const ancestor = input.ancestors[index];
    if (ancestor === undefined) continue;
    if (owner !== null) {
      const live = livePredecessorReviewAttempt(owner);
      if (live !== null) {
        throw new CandidateSupersessionResolutionError(
          predecessorReviewRecovery(ancestor, input.lane, live, store.stateOffBranch === true),
        );
      }
      continue;
    }
    if (input.lane === "standard" && ancestor.reviewResponseCount > 0) {
      const frontlineOwner = await readLaneProgressOwner(store, {
        lane: "frontline", repositoryId: input.repositoryId, headSha: input.headSha,
        lineage: { kind: "candidate", candidateId: ancestor.candidateId },
      });
      const frontlineDispositionIds = frontlinePerformedDispositionIds(frontlineOwner);
      if (ancestor.reviewDispositionIds !== undefined
        && ancestor.reviewDispositionIds.every((id) => frontlineDispositionIds.has(id))) continue;
      throw new CandidateSupersessionResolutionError(
        `The superseded Candidate ${ancestor.candidateId} has review responses that are not accounted for by its frontline owner, but its standard lane owner is missing. Restore the shared review operation and retry pre-publication review.`,
      );
    }
  }
  return {
    inheritedCompletedPasses: ancestorOwners.reduce((sum, { owner }) => sum + (owner?.completedPasses ?? 0), 0),
    inheritedCompletePasses: ancestorOwners.reduce((sum, { owner }) =>
      sum + (owner === null ? 0 : countCompleteLogicalPasses(owner.attempts)), 0),
    ancestorOwners,
  };
}
