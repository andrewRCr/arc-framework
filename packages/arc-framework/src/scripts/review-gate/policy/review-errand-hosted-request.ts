/** The submit-ready hosted request that admits an Errand's first standard review pass. */

import type { ReviewScopeMode } from "../core/review-primitives.js";
import {
  HostedProviderIdSchema,
  HostedRequestEnvelopeSchema,
  type HostedRequestEnvelope,
} from "../hosted/request.js";
import { isSafeUnavailable } from "./review-policy-attempt.js";
import type { ReviewPolicyRequest } from "./review-policy-driver.js";

/**
 * Compose an Errand's first standard pass as the exact hosted request that admits it. A later pass, a delivery
 * member, or a subject the repository did not prove to be an Errand leaves the request to its owner: status
 * composes a later pass from its recorded predecessor, which may narrow its coverage to the fix.
 *
 * @param request - The bound policy request whose selected source is a hosted provider.
 * @param scope - The resolved review scope.
 * @param sourceId - The source the policy selected for this pass.
 * @returns The hosted request, or `null` when this pass is not an Errand's first whole-target pass.
 */
export function errandFirstPassHostedRequest(
  request: ReviewPolicyRequest,
  scope: ReviewScopeMode,
  sourceId: string,
): HostedRequestEnvelope | null {
  const provider = HostedProviderIdSchema.safeParse(sourceId);
  const { pullRequest } = request.target;
  if (request.errandVehicle !== true || request.lane !== "standard" || scope !== "whole-target"
    || request.completedPasses !== 0 || pullRequest === null || !provider.success
    || !request.attempts.every((attempt) => isSafeUnavailable(attempt.outcome))) {
    return null;
  }
  return HostedRequestEnvelopeSchema.parse({
    schemaVersion: 1,
    target: { repository: request.target.repository, pullRequest, headSha: request.target.headSha },
    provider: provider.data,
    coverage: "complete",
    vehicle: { kind: "errand", standardReview: request.standardReview },
  });
}
