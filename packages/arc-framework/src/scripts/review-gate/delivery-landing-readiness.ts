/** Delivery landing admission over existing exact-target review authority. */

import type { ChangeRequestTargetRef } from "./change-request.js";
import type { ReviewStatusPort } from "./status.js";

export type DeliveryLandingReviewReadiness =
  | { readonly status: "ready" }
  | {
    readonly status: "refused";
    readonly reason: "checks-not-green" | "review-unsettled" | "stale-target" | "status-unavailable";
  };

/**
 * Admit one exact delivery-member head only after its routed review obligation and checks settle.
 *
 * Protected-base movement is deliberately absent from this projection. Delivery landing owns that
 * observation and does not require refresh for unrelated base movement alone.
 *
 * @param target - Exact delivery-member change-request target selected for landing.
 * @param port - Existing production review-status observation boundary.
 * @returns Ready only for the same observed head with settled review authority and passing checks.
 */
export async function assessDeliveryLandingReviewReadiness(
  target: ChangeRequestTargetRef,
  port: ReviewStatusPort,
): Promise<DeliveryLandingReviewReadiness> {
  let observation: Awaited<ReturnType<ReviewStatusPort["observe"]>>;
  try {
    observation = await port.observe(target);
  } catch {
    return { status: "refused", reason: "status-unavailable" };
  }
  if (observation.actualHeadSha !== target.headSha) {
    return { status: "refused", reason: "stale-target" };
  }
  if (observation.routedObligation.state !== "settled") {
    return { status: "refused", reason: "review-unsettled" };
  }
  if (observation.requiredChecks !== "green" && observation.requiredChecks !== "not-required") {
    return { status: "refused", reason: "checks-not-green" };
  }
  return { status: "ready" };
}
