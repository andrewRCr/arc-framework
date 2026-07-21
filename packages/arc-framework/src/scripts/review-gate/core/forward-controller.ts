/** Applicability-driven reduction for the dormant forward review controller. */

import {
  validateIncrementalApplicabilityReceipt,
  validateReviewApplicabilityProof,
  type ReviewApplicabilityProof,
} from "./applicability.js";
import { reduceForwardCoverage, type ForwardCoverageLink } from "./forward-coverage.js";
import { qualifyForwardReviewSource, type ReviewChannel } from "./forward-source-qualification.js";
import { validateReviewRequest, validateReviewRequirement, validateReviewTarget } from "./gate-contract-v2.js";
import { ReviewRequestV2Schema, type ReviewRequestV2 } from "./gate-contract-v2-schema.js";
import {
  isApplicableForwardLifecycleTail,
  type ForwardLifecycleTailProof,
} from "./lifecycle-tail.js";
import { renderForwardGateProjection, type ForwardGateProjection } from "./projection.js";

/** Inputs for applicability-driven forward reduction. */
export interface ForwardControllerInput {
  channel: ReviewChannel;
  target: unknown;
  requirement: unknown;
  activeRequest: unknown;
  links: ForwardCoverageLink[];
  applicability: unknown;
  lifecycleTail: ForwardLifecycleTailProof | null;
  coveragePaths: string[];
}

/** Controller result retaining flight invalidation and proof treatment. */
export interface ForwardControllerResult {
  projection: ForwardGateProjection;
  activeFlight: "none" | "current" | "invalidated";
  treatment: "none" | "direct" | "carry" | "incremental" | "final-full";
  applicabilityId: string | null;
}

function currentRequest(input: ForwardControllerInput, targetId: string, requirementId: string): {
  request: ReviewRequestV2 | null;
  state: ForwardControllerResult["activeFlight"];
} {
  if (input.activeRequest === null) return { request: null, state: "none" };
  const parsed = ReviewRequestV2Schema.parse(input.activeRequest);
  if (parsed.targetId !== targetId || parsed.requirementId !== requirementId) {
    return { request: null, state: "invalidated" };
  }
  return { request: parsed, state: "current" };
}

function successfulProjection(
  base: ForwardGateProjection,
  detail: string,
): ForwardGateProjection {
  return { ...base, conclusion: "success", summary: detail, blockers: [] };
}

function withCoverage(
  projection: ForwardGateProjection,
  treatment: ForwardControllerResult["treatment"],
  applicabilityId: string | null,
): ForwardGateProjection {
  return { ...projection, coverage: { treatment, applicabilityId } };
}

/** Reduce typed proofs and exact receipt chains into the current forward verdict. */
export function reduceForwardController(input: ForwardControllerInput): ForwardControllerResult {
  const target = validateReviewTarget(input.target);
  const requirement = validateReviewRequirement(target, input.requirement);
  const flight = currentRequest(input, target.targetId, requirement.requirementId);
  if (flight.request !== null) validateReviewRequest(target, flight.request);

  let proof: ReviewApplicabilityProof | null = null;
  if (input.applicability !== null) proof = validateReviewApplicabilityProof(input.applicability);
  const prior = input.links.at(-1);
  const priorCoverage = prior === undefined ? null : reduceForwardCoverage({
    target: prior.target,
    requirement: prior.requirement,
    links: input.links,
  });
  const samePolicy = prior !== undefined
    && prior.requirement.policyVersion === requirement.policyVersion
    && prior.requirement.rubricVersion === requirement.rubricVersion
    && prior.requirement.rubricDigest === requirement.rubricDigest;

  const carryByApplicability = proof?.treatment === "carry"
    && prior !== undefined
    && proof.priorTargetId === prior.target.targetId
    && proof.currentTargetId === target.targetId;
  const carryByLifecycle = input.lifecycleTail !== null
    && prior !== undefined
    && isApplicableForwardLifecycleTail({
      proof: input.lifecycleTail,
      priorTarget: prior.target,
      currentTarget: target,
      policyVersion: requirement.policyVersion,
      rubricVersion: requirement.rubricVersion,
      rubricDigest: requirement.rubricDigest,
      sourceIdentity: prior.request.evaluatorIdentity,
    });
  if ((carryByApplicability || carryByLifecycle) && priorCoverage?.satisfied === true && samePolicy) {
    const priorTerminal = priorCoverage.chain.at(-1);
    const priorQualified = priorTerminal !== undefined && qualifyForwardReviewSource({
      channel: input.channel,
      requirement: priorTerminal.requirement,
      request: priorTerminal.request,
      receipt: priorTerminal.receipt,
    }).qualified;
    if (!priorQualified) return pendingResult(input, target, requirement, flight, proof);
    // Only an applicability-based carry may attribute itself to that proof's identifier; a
    // lifecycle-derived carry does not rest on it and must not borrow its attribution.
    const carriedApplicabilityId = carryByApplicability ? proof?.applicabilityId ?? null : null;
    const base = renderForwardGateProjection({
      channel: input.channel,
      target,
      requirement,
      request: null,
      receipt: null,
    });
    return {
      projection: withCoverage(
        successfulProjection(base, `independent analysis: carried to ${target.targetId}`),
        "carry",
        carriedApplicabilityId,
      ),
      activeFlight: flight.state,
      treatment: "carry",
      applicabilityId: carriedApplicabilityId,
    };
  }

  const currentCoverage = reduceForwardCoverage({ target, requirement, links: input.links });
  const terminal = currentCoverage.chain.at(-1);
  const sourceQualified = terminal !== undefined && qualifyForwardReviewSource({
    channel: input.channel,
    requirement: terminal.requirement,
    request: terminal.request,
    receipt: terminal.receipt,
  }).qualified;
  const applicabilitySatisfied = proof === null || (terminal !== undefined
    && proof.currentTargetId === target.targetId
    && validateIncrementalApplicabilityReceipt(proof, terminal.receipt, input.coveragePaths));
  if (currentCoverage.satisfied && terminal !== undefined && applicabilitySatisfied && sourceQualified) {
    const projection = renderForwardGateProjection({
      channel: input.channel,
      target,
      requirement,
      request: terminal.request,
      receipt: terminal.receipt,
    });
    return {
      projection: withCoverage(
        projection,
        requirement.retrigger === "full-final"
          ? "final-full"
          : proof?.treatment === "incremental" ? "incremental" : "direct",
        proof?.applicabilityId ?? null,
      ),
      activeFlight: flight.state,
      treatment: requirement.retrigger === "full-final"
        ? "final-full"
        : proof?.treatment === "incremental" ? "incremental" : "direct",
      applicabilityId: proof?.applicabilityId ?? null,
    };
  }

  return pendingResult(input, target, requirement, flight, proof);
}

function pendingResult(
  input: ForwardControllerInput,
  target: ReturnType<typeof validateReviewTarget>,
  requirement: ReturnType<typeof validateReviewRequirement>,
  flight: ReturnType<typeof currentRequest>,
  proof: ReviewApplicabilityProof | null,
): ForwardControllerResult {
  const projection = renderForwardGateProjection({
    channel: input.channel,
    target,
    requirement,
    request: flight.request,
    receipt: null,
  });
  return {
    projection: withCoverage(projection, "none", proof?.applicabilityId ?? null),
    activeFlight: flight.state,
    treatment: "none",
    applicabilityId: proof?.applicabilityId ?? null,
  };
}
