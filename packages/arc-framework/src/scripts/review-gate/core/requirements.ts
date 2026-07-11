/** Typed requirement reduction without source substitution. */

import type { ReviewRequirement, SourceKind } from "./contracts.js";

/** Candidate evidence chain already proven current by the evidence reducer. */
export interface RequirementCandidate {
  requirementId: string;
  sourceKind: SourceKind;
  qualifier?: string;
  sourceIdentity: string;
  humanActorIdentity?: string;
}

/** Native review state that blocks independently of policy requirements. */
export interface NativeReviewState {
  requestedChanges: boolean;
  unresolvedRequiredConversations: number;
}

/** Detailed evaluation of one typed requirement. */
export interface RequirementEvaluation {
  requirement: ReviewRequirement;
  satisfied: boolean;
  satisfiedBy: string[];
  blockers: string[];
}

/** Result of reducing requirements and independent native blockers. */
export interface RequirementReduction {
  evaluations: RequirementEvaluation[];
  blockers: string[];
}

/** Inputs to typed requirement reduction. */
export interface EvaluateRequirementsInput {
  requirements: ReviewRequirement[];
  candidates: RequirementCandidate[];
  nativeReview: NativeReviewState;
}

/** Explanatory disposition with detailed evaluations retained. */
export interface AggregateRequirementDisposition {
  disposition: "required" | "recommended" | "exempt";
  evaluations: RequirementEvaluation[];
  blockers: string[];
}

function sourceAccepted(requirement: ReviewRequirement, candidate: RequirementCandidate): boolean {
  return requirement.acceptableSources.some((accepted) =>
    accepted.sourceKind === candidate.sourceKind
    && (accepted.qualifier === undefined || accepted.qualifier === candidate.qualifier));
}

/** Reduce qualified candidates against typed, counted requirements. */
export function evaluateRequirements(input: EvaluateRequirementsInput): RequirementReduction {
  const evaluations = input.requirements.map((requirement): RequirementEvaluation => {
    const candidates = input.candidates.filter((candidate) =>
      candidate.requirementId === requirement.id && sourceAccepted(requirement, candidate));
    const uniqueSources = new Map<string, RequirementCandidate>();
    const humanActors = new Set<string>();
    for (const candidate of candidates) {
      if (uniqueSources.has(candidate.sourceIdentity)) continue;
      if (candidate.sourceKind === "human") {
        if (candidate.humanActorIdentity === undefined || humanActors.has(candidate.humanActorIdentity)) continue;
        humanActors.add(candidate.humanActorIdentity);
      }
      uniqueSources.set(candidate.sourceIdentity, candidate);
    }
    const satisfiedBy = [...uniqueSources.keys()];
    const satisfied = satisfiedBy.length >= requirement.count;
    return {
      requirement,
      satisfied,
      satisfiedBy,
      blockers: satisfied || requirement.obligation !== "required"
        ? []
        : [`requirement:${requirement.id}:unsatisfied`],
    };
  });
  const blockers = evaluations.flatMap((evaluation) => evaluation.blockers);
  if (input.nativeReview.requestedChanges) blockers.push("native-requested-changes");
  if (input.nativeReview.unresolvedRequiredConversations > 0) {
    blockers.push("unresolved-required-conversations");
  }
  return { evaluations, blockers };
}

/** Aggregate obligations while retaining per-requirement state and blockers. */
export function aggregateRequirementDisposition(
  evaluations: RequirementEvaluation[],
): AggregateRequirementDisposition {
  const disposition = evaluations.some((evaluation) => evaluation.requirement.obligation === "required")
    ? "required"
    : evaluations.some((evaluation) => evaluation.requirement.obligation === "recommended")
      ? "recommended"
      : "exempt";
  return {
    disposition,
    evaluations,
    blockers: evaluations.flatMap((evaluation) => evaluation.blockers),
  };
}
