/** Exact driver admission for one delegated delivery-member review. */

import { z } from "zod";

import { DeliveryReviewMemberVehicleSchema } from "../../../lib/delivery/review-vehicle.js";
import { ChangeRequestTargetRefSchema } from "../change-request.js";
import { HostedTargetSchema } from "../hosted/request.js";
import { ReviewCeilingOverrideSchema } from "./review-policy-driver.js";
import { IncrementalReviewScopeSchema } from "../core/incremental-review-scope.js";
import type { IncrementalReviewScope } from "../core/incremental-review-scope.js";

export const DeliveryLocalReviewScopeSelectionSchema = z.strictObject({
  mode: z.literal("chunked"),
  target: HostedTargetSchema,
});
export type DeliveryLocalReviewScopeSelection = z.infer<
  typeof DeliveryLocalReviewScopeSelectionSchema
>;

const DeliveryLocalReviewSelectionShape = {
  schemaVersion: z.literal(1),
  sourceId: z.literal("delegated-agent"),
  target: HostedTargetSchema,
  vehicle: DeliveryReviewMemberVehicleSchema,
  pass: z.int().positive(),
  ceilingOverride: ReviewCeilingOverrideSchema.optional(),
  scopeSelection: DeliveryLocalReviewScopeSelectionSchema.optional(),
  correctionScope: IncrementalReviewScopeSchema.optional(),
};

function validateSelectionTarget(
  selection: {
    target: z.infer<typeof HostedTargetSchema>;
    vehicle: z.infer<typeof DeliveryReviewMemberVehicleSchema>;
    scopeSelection?: DeliveryLocalReviewScopeSelection;
    correctionScope?: IncrementalReviewScope;
  },
  context: z.RefinementCtx,
  label: string,
): void {
  if (selection.target.headSha !== selection.vehicle.head) {
    context.addIssue({
      code: "custom",
      path: ["target", "headSha"],
      message: `${label} must identify the exact delivery-member head`,
    });
  }
  const scoped = selection.scopeSelection?.target;
  if (scoped !== undefined
    && (scoped.repository.toLowerCase() !== selection.target.repository.toLowerCase()
      || scoped.pullRequest !== selection.target.pullRequest
      || scoped.headSha !== selection.target.headSha)) {
    context.addIssue({
      code: "custom",
      path: ["scopeSelection", "target"],
      message: `${label} scope must identify the exact selected target`,
    });
  }
  if (selection.correctionScope !== undefined
    && selection.correctionScope.headSha !== selection.target.headSha) {
    context.addIssue({
      code: "custom",
      path: ["correctionScope", "headSha"],
      message: `${label} correction scope must end at the exact selected target`,
    });
  }
}

export const DeliveryLocalReviewSelectionSchema = z.strictObject(
  DeliveryLocalReviewSelectionShape,
).superRefine((selection, context) => {
  validateSelectionTarget(selection, context, "local review selection");
});
export type DeliveryLocalReviewSelection = z.infer<typeof DeliveryLocalReviewSelectionSchema>;

export const DeliveryLocalReviewAdmissionSchema = z.strictObject({
  ...DeliveryLocalReviewSelectionShape,
  statusTarget: ChangeRequestTargetRefSchema,
}).superRefine((admission, context) => {
  validateSelectionTarget(admission, context, "local review admission");
  if (admission.target.repository.toLowerCase() !== admission.statusTarget.repository.toLowerCase()) {
    context.addIssue({
      code: "custom",
      path: ["statusTarget", "repository"],
      message: "local review admission repositories must match",
    });
  }
});
export type DeliveryLocalReviewAdmission = z.infer<typeof DeliveryLocalReviewAdmissionSchema>;
