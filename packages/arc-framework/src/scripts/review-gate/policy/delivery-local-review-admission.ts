/** Exact driver admission for one delegated delivery-member review. */

import { z } from "zod";

import { DeliveryReviewMemberVehicleSchema } from "../../../lib/delivery/review-vehicle.js";
import { ChangeRequestTargetRefSchema } from "../change-request.js";
import { HostedTargetSchema } from "../hosted/request.js";
import { ReviewCeilingOverrideSchema } from "./review-policy-driver.js";

const DeliveryLocalReviewSelectionShape = {
  schemaVersion: z.literal(1),
  sourceId: z.literal("delegated-agent"),
  target: HostedTargetSchema,
  vehicle: DeliveryReviewMemberVehicleSchema,
  pass: z.int().positive(),
  ceilingOverride: ReviewCeilingOverrideSchema.optional(),
};

export const DeliveryLocalReviewSelectionSchema = z.strictObject(
  DeliveryLocalReviewSelectionShape,
).superRefine((selection, context) => {
  if (selection.target.headSha !== selection.vehicle.head) {
    context.addIssue({
      code: "custom",
      path: ["target", "headSha"],
      message: "local review selection must identify the exact delivery-member head",
    });
  }
});
export type DeliveryLocalReviewSelection = z.infer<typeof DeliveryLocalReviewSelectionSchema>;

export const DeliveryLocalReviewAdmissionSchema = z.strictObject({
  ...DeliveryLocalReviewSelectionShape,
  statusTarget: ChangeRequestTargetRefSchema,
}).superRefine((admission, context) => {
  if (admission.target.headSha !== admission.vehicle.head) {
    context.addIssue({
      code: "custom",
      path: ["target", "headSha"],
      message: "local review admission must identify the exact delivery-member head",
    });
  }
  if (admission.target.repository.toLowerCase() !== admission.statusTarget.repository.toLowerCase()) {
    context.addIssue({
      code: "custom",
      path: ["statusTarget", "repository"],
      message: "local review admission repositories must match",
    });
  }
});
export type DeliveryLocalReviewAdmission = z.infer<typeof DeliveryLocalReviewAdmissionSchema>;
