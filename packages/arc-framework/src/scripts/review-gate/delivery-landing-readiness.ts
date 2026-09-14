/** Delivery landing admission over existing exact-target review authority. */

import type { ChangeRequestTargetRef } from "./change-request.js";
import type { RoutedReviewObligation, ReviewStatusPort } from "./status.js";

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
 * @returns Ready only for the same observed head with discharged member review and passing checks.
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
  const obligation = observation.routedObligation;
  const matchingMembers = "conjunction" in obligation
    ? obligation.conjunction.members.filter((member) =>
      member.target.repository.toLowerCase() === target.repository.toLowerCase()
        && member.target.headSha === target.headSha)
    : null;
  const reviewDischarged = matchingMembers === null
    ? obligation.state === "settled"
    : matchingMembers.length === 1 && matchingMembers[0]?.state === "discharged";
  if (!reviewDischarged) {
    return { status: "refused", reason: "review-unsettled" };
  }
  if (observation.requiredChecks !== "green" && observation.requiredChecks !== "not-required") {
    return { status: "refused", reason: "checks-not-green" };
  }
  return { status: "ready" };
}

/**
 * Build exact member readiness over one shared routed delivery-review observation.
 *
 * @param anchor - Exact selected member used to reduce the delivery-wide review obligation once.
 * @param sharedStatus - Full status port that derives the routed delivery-review conjunction.
 * @param memberStatus - Factory binding the shared conjunction to one member's fresh host and check reads.
 * @returns A member-readiness reader that shares only the routed obligation across its selected set.
 */
export function createDeliveryLandingSetReviewReadiness(
  anchor: ChangeRequestTargetRef,
  sharedStatus: ReviewStatusPort,
  memberStatus: (
    target: ChangeRequestTargetRef,
    routedObligation: RoutedReviewObligation,
  ) => ReviewStatusPort,
): (target: ChangeRequestTargetRef) => Promise<DeliveryLandingReviewReadiness> {
  let sharedObservation: ReturnType<ReviewStatusPort["observe"]> | undefined;
  return async (target) => {
    try {
      sharedObservation ??= sharedStatus.observe(anchor);
      const observation = await sharedObservation;
      return await assessDeliveryLandingReviewReadiness(
        target,
        memberStatus(target, observation.routedObligation),
      );
    } catch {
      return { status: "refused", reason: "status-unavailable" };
    }
  };
}
