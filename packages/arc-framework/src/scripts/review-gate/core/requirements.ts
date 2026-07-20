/** Typed requirement reduction without source substitution. */

import type { ReviewRequirement, SourceKind } from "./contracts.js";
import {
  validateReviewReceipt,
  validateReviewRequest,
  validateReviewRequirement,
  validateReviewTarget,
} from "./gate-contract-v2.js";
import type {
  ReviewReceiptV2,
  ReviewRequestV2,
  ReviewRequirementV2,
  ReviewTarget,
} from "./gate-contract-v2-schema.js";
import {
  qualifyForwardReviewSource,
  type ReviewChannel,
} from "./forward-source-qualification.js";

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

/** Exact v2 records accepted by the forward requirement boundary. */
export interface ForwardRequirementEvaluationInput {
  channel: ReviewChannel;
  target: unknown;
  requirement: unknown;
  request: unknown;
  receipt: unknown;
}

/** One validated forward requirement chain and its terminal state. */
export interface ForwardRequirementEvaluation {
  target: ReviewTarget;
  requirement: ReviewRequirementV2 | null;
  request: ReviewRequestV2 | null;
  receipt: ReviewReceiptV2 | null;
  state: "inapplicable" | "unrequested" | "pending" | "unqualified" | "clean" | "findings" | "failed" | "unavailable";
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

/** Validate one complete or partial v2 requirement chain without consulting legacy evidence. */
export function evaluateForwardRequirement(
  input: ForwardRequirementEvaluationInput,
): ForwardRequirementEvaluation {
  const target = validateReviewTarget(input.target);
  if (input.requirement === null) {
    if (input.request !== null || input.receipt !== null) {
      throw new Error("forward review request or receipt cannot exist without a requirement");
    }
    return { target, requirement: null, request: null, receipt: null, state: "inapplicable" };
  }

  const requirement = validateReviewRequirement(target, input.requirement);
  if (input.request === null) {
    if (input.receipt !== null) throw new Error("forward review receipt cannot exist without a request");
    return { target, requirement, request: null, receipt: null, state: "unrequested" };
  }

  const request = validateReviewRequest(target, input.request);
  if (request.requirementId !== requirement.requirementId) {
    throw new Error("forward review request does not match its requirement");
  }
  if (input.receipt === null) {
    return { target, requirement, request, receipt: null, state: "pending" };
  }

  const receipt = validateReviewReceipt(target, requirement, request, input.receipt);
  if (!qualifyForwardReviewSource({ channel: input.channel, requirement, request, receipt }).qualified) {
    return { target, requirement, request, receipt, state: "unqualified" };
  }
  return { target, requirement, request, receipt, state: receipt.result };
}
