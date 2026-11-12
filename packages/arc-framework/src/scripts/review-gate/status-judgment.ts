/** Keep absent status judgments absent while carrying only explicitly selected fields. */

import type { HostedReviewCoverage } from "./hosted/request.js";
import type { ReviewPolicyCommandRequest } from "./policy/review-policy-driver.js";

export interface ReviewStatusPolicyJudgment {
  readonly ceilingOverride?: ReviewPolicyCommandRequest["ceilingOverride"];
  readonly additionalPassAuthorization?: ReviewPolicyCommandRequest["additionalPassAuthorization"];
  readonly coverage?: HostedReviewCoverage;
  readonly sourceId?: string;
}

/**
 * Compose optional review status selections without manufacturing an empty judgment.
 *
 * @param input - Caller-selected status judgments.
 * @returns The selected fields, or undefined when none was supplied.
 */
export function optionalReviewStatusJudgment(
  input: ReviewStatusPolicyJudgment,
): ReviewStatusPolicyJudgment | undefined {
  const { ceilingOverride, additionalPassAuthorization, coverage, sourceId } = input;
  if (ceilingOverride === undefined && additionalPassAuthorization === undefined
    && coverage === undefined && sourceId === undefined) return undefined;
  return {
    ...(ceilingOverride === undefined ? {} : { ceilingOverride }),
    ...(additionalPassAuthorization === undefined ? {} : { additionalPassAuthorization }),
    ...(coverage === undefined ? {} : { coverage }),
    ...(sourceId === undefined ? {} : { sourceId }),
  };
}
