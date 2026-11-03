/** Shared action, reservation, and Candidate identity schemas for publication boundaries. */
import { z } from "zod";
import { DeliveryReviewMemberVehicleSchema } from "../../../lib/delivery/review-vehicle.js";
import { canonicalize, canonicalDigest } from "../../../lib/kernel/canonical/canonical-json.js";
import { CanonicalDigestSchema } from "../../../lib/kernel/schema/vocabulary.js";
import { SlugSchema } from "../../../lib/kernel/schema/slug.js";
import { DeliveryPlanIdSchema } from "../../../lib/delivery/schema.js";
import { GitObjectIdSchema, ReviewIdentifierSchema } from "../core/gate-contract-v2-schema.js";
import { ReviewResponseSettlementSourceSchema } from "../core/response-plan-schema.js";
import { FrontlineResolveRequestSchema } from "./frontline-command-schema.js";
import { StandardReviewObligationProjectionSchema } from "./standard-review-projection-schema.js";

export const CandidateIdSchema = CanonicalDigestSchema;
export const CandidateSubjectDigestSchema = CanonicalDigestSchema;

export const ActionFields = {
  command: z.string().trim().min(1),
  interactionText: z.string().trim().min(1),
};
export const RunSelfReviewActionSchema = z.strictObject({
  kind: z.literal("run-self-review"),
  ...ActionFields,
});
export const ContinuePrePublicationActionSchema = z.strictObject({
  kind: z.literal("continue-pre-publication-review"),
  authorizationRequest: FrontlineResolveRequestSchema.optional(),
  request: FrontlineResolveRequestSchema.optional(),
  resumeCommand: z.string().trim().min(1).optional(),
  responseOperationId: ReviewIdentifierSchema.optional(),
  responseSource: ReviewResponseSettlementSourceSchema.optional(),
  ...ActionFields,
}).superRefine((action, context) => {
  const responds = action.command === "arc review respond -";
  if (responds !== (action.responseOperationId !== undefined)) {
    context.addIssue({
      code: "custom",
      path: ["responseOperationId"],
      message: "the review response action requires its exact producer operation ID",
    });
  }
  if (responds !== (action.responseSource !== undefined)) {
    context.addIssue({
      code: "custom",
      path: ["responseSource"],
      message: "the review response action requires its bound producer source",
    });
  }
  const resolvesFrontline = action.command === "arc review frontline resolve -";
  if (!resolvesFrontline && (action.request !== undefined || action.authorizationRequest !== undefined)) {
    context.addIssue({
      code: "custom",
      path: ["request"],
      message: "only the frontline resolver action may carry typed stdin requests",
    });
    return;
  }
  if (!resolvesFrontline) return;
  if (action.request === undefined || action.authorizationRequest === undefined) {
    context.addIssue({
      code: "custom",
      path: action.request === undefined ? ["request"] : ["authorizationRequest"],
      message: "the frontline resolver action requires initial and authorized typed stdin requests",
    });
    return;
  }
  if (action.request.invocation.mode !== "inherit") {
    context.addIssue({
      code: "custom",
      path: ["request", "invocation", "mode"],
      message: "the initial frontline resolver request must preserve the offered-review authorization step",
    });
  }
  const expectedAuthorizationRequest = {
    ...action.request,
    invocation: { ...action.request.invocation, mode: "force" },
  };
  if (canonicalize(action.authorizationRequest) !== canonicalize(expectedAuthorizationRequest)) {
    context.addIssue({
      code: "custom",
      path: ["authorizationRequest"],
      message: "the authorized frontline request may change only invocation mode to force",
    });
  }
});

export const ContinueHostedReviewActionSchema = z.strictObject({
  kind: z.literal("continue-hosted-review"),
  workUnitId: SlugSchema,
  ...ActionFields,
}).superRefine((action, context) => {
  if (action.command !== `arc review status --work-unit ${action.workUnitId}`) {
    context.addIssue({
      code: "custom",
      path: ["command"],
      message: "the hosted-review action must be self-contained for its work unit",
    });
  }
});
export const ResolveDeliveryStatusActionSchema = z.strictObject({
  kind: z.literal("resolve-delivery-status"),
  workUnitId: SlugSchema,
  ...ActionFields,
}).superRefine((action, context) => {
  if (action.command !== `arc review status --work-unit ${action.workUnitId}`) {
    context.addIssue({
      code: "custom",
      path: ["command"],
      message: "the delivery-status action must be self-contained for its work unit",
    });
  }
});

export const PublishCandidateActionSchema = z.strictObject({
  kind: z.literal("publish-candidate"),
  ...ActionFields,
});
export const ContinuePublicationActionSchema = z.strictObject({
  kind: z.literal("continue-publication"),
  ...ActionFields,
});


export const StandardReviewReservationTargetSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("pinned-head"),
    repository: z.string().trim().min(1),
    headSha: GitObjectIdSchema,
  }),
  z.strictObject({
    kind: z.literal("delivery"),
    repository: z.string().trim().min(1),
    workUnitId: SlugSchema,
    planId: DeliveryPlanIdSchema,
  }),
]);
export type StandardReviewReservationTarget = z.infer<typeof StandardReviewReservationTargetSchema>;

export const StandardReviewReservationV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  semanticsVersion: z.literal("standard-review-reservation/v1"),
  reservationId: CandidateIdSchema,
  sources: z.array(z.string().trim().min(1)).min(1),
  target: StandardReviewReservationTargetSchema,
  obligation: StandardReviewObligationProjectionSchema,
});
export type StandardReviewReservationV1 = z.infer<typeof StandardReviewReservationV1Schema>;


export const BoundaryIdentityShape = {
  mode: z.enum(["pre-publication-review", "integration-boundary"]),
  workUnit: SlugSchema,
  candidateId: CandidateIdSchema,
  /**
   * The reviewable subject the boundary was written for — what submission authorizes against.
   *
   * The reviewable subject, not the head: operational-only writes advance the head without changing
   * what review covered, and a boundary invalidated by its own ceremony's churn would send the
   * operator back through a review whose evidence never went stale.
   */
  candidateSubjectDigest: CandidateSubjectDigestSchema.nullable().default(null),
};

/** Refuse two carried review termini for the same exact member vehicle. */
export function validateUniqueDeliveryTerminusVehicles(
  records: readonly { vehicle: z.infer<typeof DeliveryReviewMemberVehicleSchema> }[], context: z.RefinementCtx,
): void {
  const seen = new Set<string>();
  for (const [index, record] of records.entries()) {
    const key = canonicalDigest(record.vehicle);
    if (seen.has(key)) {
      context.addIssue({
        code: "custom",
        path: [index, "vehicle"],
        message: "delivery-member review termini must have unique exact vehicles",
      });
    }
    seen.add(key);
  }

}
