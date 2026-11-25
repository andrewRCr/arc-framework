/** Public and locally derived frontline resolver request contracts. */

import { z } from "zod";

import { DeliveryReviewMemberVehicleSchema } from "../../../lib/delivery/review-vehicle.js";
import { ReviewTargetSchema } from "../core/gate-contract-v2-schema.js";
import type { FrontlineAdmission } from "../core/frontline-admission.js";
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

type FrontlineResolveReplayBasis = Pick<FrontlineAdmission, "target" | "routing" | "lineage"> & {
  frontlineReview: Pick<FrontlineAdmission["frontlineReview"], "reasons"> & { source: { sourceId: string } | null };
};

/** Project the admitted facts into a public resolver replay; resolution revalidates its authority. */
export function frontlineResolveRequestFromAdmission(admission: FrontlineResolveReplayBasis): FrontlineResolveRequest {
  const { kind, baseRef, diffBaseSha, headSha } = admission.target;
  const source = admission.frontlineReview.source;
  return FrontlineResolveRequestSchema.parse({
    schemaVersion: 1,
    target: { kind, baseRef, diffBaseSha, headSha },
    changeSet: admission.routing.facts,
    invocation: {
      mode: admission.frontlineReview.reasons.includes("invocation-force") ? "force" : "inherit",
      ...(admission.frontlineReview.reasons.includes("source-invocation") && source !== null
        ? { sourceId: source.sourceId } : {}),
    },
    ...(admission.lineage.kind === "delivery-member"
      ? { vehicle: { ...admission.lineage, head: headSha } } : {}),
  });
}
