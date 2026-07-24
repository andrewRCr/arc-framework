/** Dormant runtime composition for the strict forward review contract. */

import {
  renderForwardGateProjection,
  type ForwardGateProjection,
} from "../core/projection.js";
import type { ForwardRequirementEvaluationInput } from "../core/requirements.js";
import {
  reduceForwardController,
  type ForwardControllerInput,
  type ForwardControllerResult,
} from "../core/forward-controller.js";
import {
  renderForwardCheckOutput,
  type CheckRunOutput,
} from "../hosts/github/check-runs.js";

/** Neutral and host-facing views of one admitted forward contract chain. */
export interface ForwardReviewContractProjection {
  projection: ForwardGateProjection;
  checkOutput: CheckRunOutput;
}

/** Admit exact v2 records and render their neutral plus GitHub-facing projections. */
export function projectForwardReviewContract(
  input: ForwardRequirementEvaluationInput,
): ForwardReviewContractProjection {
  const projection = renderForwardGateProjection(input);
  return {
    projection,
    checkOutput: renderForwardCheckOutput(projection),
  };
}

/** Reduce applicability and coverage before rendering the dormant host contract. */
export function projectReducedForwardReviewContract(
  input: ForwardControllerInput,
): ForwardReviewContractProjection & Omit<ForwardControllerResult, "projection"> {
  const reduction = reduceForwardController(input);
  return {
    ...reduction,
    projection: reduction.projection,
    checkOutput: renderForwardCheckOutput(reduction.projection),
  };
}
