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
