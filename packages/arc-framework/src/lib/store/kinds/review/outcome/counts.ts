/** Pure completed-pass accounting over stored lane and supersession histories. */
import { laneSubjectOwnerMatches, type LaneSubjectLineage } from "../../../../../scripts/review-gate/core/lane-admission.js";
import type { ReviewOutcome } from "./schema.js";
import { reviewOutcomeIsSettled, type ReviewOutcomeEvidence } from "./settlement.js";

/** One validated lineage owner and the records its lane history carries. */
export interface ReviewOutcomeHistory {
  lineage: LaneSubjectLineage;
  outcomes: readonly ReviewOutcome[];
  evidence: readonly ReviewOutcomeEvidence[];
}

export interface ReviewOutcomePassCounts {
  completedPasses: number;
  completePasses: number;
  inheritedCompletedPasses: number;
  inheritedCompletePasses: number;
  nextLogicalPass: number;
}

/** Identify live results that cannot carry from a replaced Candidate. */
export function reviewOutcomeIsOutdated(
  outcome: ReviewOutcome, evidence: readonly ReviewOutcomeEvidence[], superseded: boolean,
): boolean {
  return superseded && (outcome.outcome === "partial" || outcome.outcome === "ambiguous-delivery"
    || (outcome.outcome === "findings" && !reviewOutcomeIsSettled(outcome, evidence)));
}

function countHistory(history: ReviewOutcomeHistory, lane: ReviewOutcome["lane"], superseded: boolean) {
  const finished = history.outcomes.filter((outcome) => outcome.lane === lane
    && laneSubjectOwnerMatches(outcome.lineage, history.lineage)
    && (outcome.outcome === "clean" || outcome.outcome === "findings")
    && !reviewOutcomeIsOutdated(outcome, history.evidence, superseded));
  return { completedPasses: new Set(finished.map(({ logicalPass }) => logicalPass)).size,
    completePasses: new Set(finished.filter(({ effectiveCoverage }) => effectiveCoverage === "complete")
      .map(({ logicalPass }) => logicalPass)).size,
    highestPass: finished.reduce((highest, { logicalPass }) => Math.max(highest, logicalPass), 0) };
}

/** Count one lane's ended producers without performing supersession admission checks. */
export function deriveReviewOutcomePassCounts(input: {
  lane: ReviewOutcome["lane"]; lineage: LaneSubjectLineage; outcomes: readonly ReviewOutcome[];
  evidence?: readonly ReviewOutcomeEvidence[]; ancestors?: readonly ReviewOutcomeHistory[];
}): ReviewOutcomePassCounts {
  const current = countHistory({ ...input, evidence: input.evidence ?? [] }, input.lane, false);
  const ancestors = input.lineage.kind === "candidate" ? input.ancestors ?? [] : [];
  const inherited = ancestors.map((history) => countHistory(history, input.lane, true));
  const inheritedCompletedPasses = inherited.reduce((count, history) => count + history.completedPasses, 0);
  const inheritedCompletePasses = inherited.reduce((count, history) => count + history.completePasses, 0);
  const highestPass = inherited.reduce((highest, history) => Math.max(highest, history.highestPass), current.highestPass);
  return { completedPasses: current.completedPasses + inheritedCompletedPasses,
    completePasses: current.completePasses + inheritedCompletePasses,
    inheritedCompletedPasses, inheritedCompletePasses, nextLogicalPass: highestPass + 1 };
}
