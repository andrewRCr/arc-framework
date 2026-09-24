/** Exact delivery-member target projection for private pre-publication review. */

import {
  closeDeliveryEligibility,
  prepareDeliveryEligibility,
  verifyDeliveryCandidateCheckout,
  type DeliveryEligibilityDependencies,
} from "../../../lib/delivery/eligibility.js";
import { deriveDeliveryMaterialization } from "../../../lib/delivery/materialization.js";
import { deriveDeliveryResidueLocators } from "../../../lib/delivery/residue-reaping.js";
import type { DeliveryPlanV1 } from "../../../lib/delivery/schema.js";
import {
  DeliveryReviewMemberVehicleSchema,
  type DeliveryReviewMemberVehicle,
} from "../../../lib/delivery/review-vehicle.js";
import type { ReviewTarget } from "../core/gate-contract-v2-schema.js";

type DeliveryPlanRead =
  | { readonly status: "absent" }
  | { readonly status: "planned"; readonly plan: DeliveryPlanV1 }
  | { readonly status: "bound"; readonly plan: DeliveryPlanV1 }
  | { readonly status: "unavailable" };

export interface PreBindingDeliveryReviewTargetDependencies {
  readonly eligibility: DeliveryEligibilityDependencies;
  resolveDelivery(workUnitId: string, protectedBaseRef: string): Promise<DeliveryPlanRead>;
  resolveGitCommonDir(): Promise<string>;
  resolveOriginatingTop(plan: DeliveryPlanV1): Promise<string | null>;
  resolveLifecyclePaths(input: {
    readonly plan: DeliveryPlanV1;
    readonly protectedBaseRef: string;
    readonly topRef: string;
  }): Promise<readonly string[] | null>;
  composeTarget(input: {
    readonly baseRef: string;
    readonly base: string;
    readonly head: string;
  }): Promise<ReviewTarget>;
}

export interface PreBindingDeliveryReviewTarget {
  readonly target: ReviewTarget;
  readonly vehicle: DeliveryReviewMemberVehicle;
}

export type PreBindingDeliveryReviewTargets =
  | { readonly status: "absent" }
  | {
      readonly status: "composed";
      readonly planId: string;
      readonly targets: readonly PreBindingDeliveryReviewTarget[];
    }
  | {
      readonly status: "refused";
      readonly reason: string;
      readonly deliverableId?: string;
      readonly detail?: string;
    };

/** Compose every exact private member target, or refuse without a whole-work-unit fallback. */
export async function composePreBindingDeliveryReviewTargets(
  input: { readonly workUnitId: string; readonly baseRef: string },
  dependencies: PreBindingDeliveryReviewTargetDependencies,
): Promise<PreBindingDeliveryReviewTargets> {
  const protectedBaseRef = `refs/heads/${input.baseRef}`;
  try {
    const delivery = await dependencies.resolveDelivery(input.workUnitId, protectedBaseRef);
    if (delivery.status === "absent") return delivery;
    if (delivery.status === "unavailable") {
      return { status: "refused", reason: "delivery-unavailable" };
    }
    if (delivery.status === "bound") {
      return { status: "refused", reason: "delivery-bound" };
    }
    const { plan } = delivery;
    if (plan.workUnitId !== input.workUnitId) {
      return { status: "refused", reason: "delivery-unavailable" };
    }
    const [gitCommonDir, topRef] = await Promise.all([
      dependencies.resolveGitCommonDir(),
      dependencies.resolveOriginatingTop(plan),
    ]);
    if (topRef === null) return { status: "refused", reason: "evidence-unavailable" };
    const located = deriveDeliveryResidueLocators(plan, gitCommonDir);
    if (located.status === "refused") return { status: "refused", reason: located.reason };
    const lifecyclePaths = await dependencies.resolveLifecyclePaths({
      plan,
      protectedBaseRef,
      topRef,
    });
    if (lifecyclePaths === null) return { status: "refused", reason: "evidence-unavailable" };
    const prepared = await prepareDeliveryEligibility({
      plan,
      protectedBaseRef,
      topRef,
      candidates: located.locators.map(({ deliverableId, candidateRef }) => ({
        deliverableId,
        ref: candidateRef,
      })),
      lifecyclePaths,
    }, dependencies.eligibility);
    if (prepared.status === "refused") return prepared;
    for (const [index, locator] of located.locators.entries()) {
      const exact = await verifyDeliveryCandidateCheckout(
        prepared.snapshot,
        index,
        locator.gatePath,
        dependencies.eligibility,
      );
      if (exact.status === "refused") return exact;
    }
    const eligible = await closeDeliveryEligibility(prepared.snapshot, dependencies.eligibility);
    if (eligible.status === "refused") return eligible;
    const materialized = deriveDeliveryMaterialization(plan, eligible.snapshot);
    if (materialized.status === "refused") return { status: "refused", reason: materialized.reason };

    const targets: PreBindingDeliveryReviewTarget[] = [];
    for (const member of materialized.value.members) {
      const target = await dependencies.composeTarget({
        baseRef: input.baseRef,
        base: member.coordinates.base,
        head: member.coordinates.head,
      });
      if (target.kind !== "delivery-member"
        || target.baseRef !== input.baseRef
        || target.diffBaseSha !== member.coordinates.base
        || target.headSha !== member.coordinates.head) {
        return { status: "refused", reason: "target-mismatch", deliverableId: member.deliverableId };
      }
      targets.push({
        target,
        vehicle: DeliveryReviewMemberVehicleSchema.parse({
          kind: "delivery-member",
          planId: plan.planId,
          deliverableId: member.deliverableId,
          workUnitId: plan.workUnitId,
          head: member.coordinates.head,
        }),
      });
    }
    return { status: "composed", planId: plan.planId, targets };
  } catch (error) {
    const detail = (error instanceof Error ? error.message : String(error))
      .replace(/\s+/gu, " ")
      .trim()
      .slice(0, 1_000);
    return {
      status: "refused",
      reason: "evidence-unavailable",
      detail: detail === "" ? "Delivery evidence could not be read." : detail,
    };
  }
}
