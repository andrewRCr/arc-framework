/** Public and locally derived frontline resolver request contracts. */

import { z } from "zod";

import { DeliveryReviewMemberVehicleSchema } from "../../../lib/delivery/review-vehicle.js";
import { ReviewTargetSchema } from "../core/gate-contract-v2-schema.js";
import { ReviewTargetCoordinatesSchema } from "../core/review-target-coordinates.js";
import { FrontlineInvocationOverrideSchema } from "./frontline-resolution.js";
import { ReviewLaneJudgmentSchema } from "./review-policy-driver.js";

const FrontlinePolicyJudgmentSchema = ReviewLaneJudgmentSchema.unwrap()
  .pick({ ceilingOverride: true })
  .readonly();

const FrontlineRequestFields = {
  schemaVersion: z.literal(1),
  changeSet: z.unknown(),
  invocation: FrontlineInvocationOverrideSchema,
  policyJudgment: FrontlinePolicyJudgmentSchema.optional(),
  vehicle: DeliveryReviewMemberVehicleSchema.optional(),
} as const;

function validateFrontlineRequestVehicle(
  request: { target: { kind: string }; vehicle?: { kind: "delivery-member" } },
  context: z.RefinementCtx,
): void {
  if ((request.target.kind === "delivery-member") !== (request.vehicle !== undefined)) {
    context.addIssue({
      code: "custom",
      path: ["vehicle"],
      message: "frontline delivery targets require one exact member vehicle",
    });
  }
}

/** Public frontline resolve request composed only from caller-held facts. */
export const FrontlineResolveRequestSchema = z.strictObject({
  ...FrontlineRequestFields,
  target: ReviewTargetCoordinatesSchema,
}).superRefine(validateFrontlineRequestVehicle);
export type FrontlineResolveRequest = z.infer<typeof FrontlineResolveRequestSchema>;

/** Trusted frontline resolve request after repository-local target derivation. */
export const FrontlineCommandRequestSchema = z.strictObject({
  ...FrontlineRequestFields,
  target: ReviewTargetSchema,
}).superRefine(validateFrontlineRequestVehicle);
export type FrontlineCommandRequest = z.infer<typeof FrontlineCommandRequestSchema>;
