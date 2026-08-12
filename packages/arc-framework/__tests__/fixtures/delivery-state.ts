import {
  DeliveryStateV1Schema,
  type DeliveryPlanV1,
  type DeliveryStateV1,
} from "../../src/lib/delivery/schema.js";
import { deliveryPlanFixture } from "./delivery-plan.js";

/** Construct valid exact state for a two-member delivery plan. */
export function deliveryStateFixture(
  plan: DeliveryPlanV1 = deliveryPlanFixture(),
): DeliveryStateV1 {
  return DeliveryStateV1Schema.parse({
    schemaVersion: 1,
    semanticsVersion: "delivery-state/v1",
    planId: plan.planId,
    workUnitId: plan.workUnitId,
    boundPlan: {
      planRevision: plan.planRevision,
      planDigest: plan.planDigest,
    },
    target: {
      ref: "refs/heads/delivery-target",
      coordinates: { head: "1".repeat(40), tree: "2".repeat(40) },
    },
    members: plan.members.map((member, index) => ({
      deliverableId: member.deliverableId,
      ref: `refs/heads/member-${index + 1}`,
      changeRequest: null,
      coordinates: {
        base: "3".repeat(40),
        head: String(index + 4).repeat(40),
        tree: String(index + 6).repeat(40),
      },
    })),
    activeOperation: null,
  });
}
