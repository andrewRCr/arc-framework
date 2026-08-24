/** Exact delivery-member selector shared by hosted review progress surfaces. */

import { z } from "zod";

import { SlugSchema } from "../kernel/schema/slug.js";
import {
  DeliveryCanonicalDigestSchema,
  DeliveryGitObjectIdSchema,
  DeliveryPlanIdSchema,
} from "./schema.js";

/** One exact delivery member and head within a work unit's immutable plan. */
export const DeliveryReviewMemberVehicleSchema = z.strictObject({
  kind: z.literal("delivery-member"),
  planId: DeliveryPlanIdSchema,
  deliverableId: DeliveryCanonicalDigestSchema,
  workUnitId: SlugSchema,
  head: DeliveryGitObjectIdSchema,
});
export type DeliveryReviewMemberVehicle = z.infer<typeof DeliveryReviewMemberVehicleSchema>;

/**
 * Compare the complete optional delivery-member selector carried by hosted progress.
 *
 * @param expected - Selector required by the current hosted target, or no delivery selector.
 * @param actual - Selector retained on one hosted progress attempt, or no delivery selector.
 * @returns Whether both values identify the same complete selector state.
 */
export function sameDeliveryReviewMemberVehicle(
  expected: DeliveryReviewMemberVehicle | undefined,
  actual: DeliveryReviewMemberVehicle | undefined,
): boolean {
  if (expected === undefined || actual === undefined) return expected === actual;
  return expected.planId === actual.planId
    && expected.deliverableId === actual.deliverableId
    && expected.workUnitId === actual.workUnitId
    && expected.head === actual.head;
}
