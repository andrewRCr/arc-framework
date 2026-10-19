/** Store-backed publication boundary content with named decisions and readiness bindings. */
import { z } from "zod";
import { canonicalize } from "../../../lib/kernel/canonical/canonical-json.js";
import { CanonicalDigestSchema } from "../../../lib/kernel/schema/vocabulary.js";
import { DeliveryReviewMemberVehicleSchema } from "../../../lib/delivery/review-vehicle.js";
import { DeliveryPublicReviewContinuationV1Schema } from "../../../lib/delivery/public-review-continuation.js";
import { CANDIDATE_VERIFICATION_EVIDENCE_PLACEHOLDER } from "../../../lib/work-unit/candidate-attestation.js";
import { attestConvergenceArgv } from "../../integration/spine-refusal.js";
import { GitObjectIdSchema } from "../core/gate-contract-v2-schema.js";
import { ActionFields, BoundaryIdentityShape, RunSelfReviewActionSchema, ContinuePrePublicationActionSchema,
  PublishCandidateActionSchema, ContinuePublicationActionSchema, ResolveDeliveryStatusActionSchema,
  StandardReviewReservationV1Schema, validateUniqueDeliveryTerminusVehicles } from "./integration-boundary-locus-shared.js";

export const PostAttestContinuationV2Schema = z.strictObject({
  reviewedHead: GitObjectIdSchema, nextAction: ContinuePrePublicationActionSchema,
});
export type PostAttestContinuationV2 = z.infer<typeof PostAttestContinuationV2Schema>;
export const RunConvergenceVerificationActionV2Schema = z.strictObject({
  kind: z.literal("run-convergence-verification"), requiredScope: z.enum(["focused", "full"]),
  verificationKind: z.enum(["focused", "merge"]), verificationEvidenceRefRequired: z.literal(true),
  attestArgv: z.array(z.string().trim().min(1)).length(8), ...ActionFields,
  postAttestContinuation: PostAttestContinuationV2Schema,
}).superRefine((action, context) => {
  const expectedKind = action.requiredScope === "focused" ? "focused" : "merge";
  if (action.verificationKind !== expectedKind) context.addIssue({ code: "custom", path: ["verificationKind"],
    message: "convergence verification kind must match the required scope" });
  const expectedArgv = attestConvergenceArgv(action.attestArgv[2] ?? "", action.requiredScope, CANDIDATE_VERIFICATION_EVIDENCE_PLACEHOLDER);
  if (canonicalize(action.attestArgv) !== canonicalize(expectedArgv)) context.addIssue({ code: "custom", path: ["attestArgv"],
    message: "convergence attest argv must match its required scope and evidence placeholder" });
  if (action.command !== expectedArgv.join(" ")) context.addIssue({ code: "custom", path: ["command"],
    message: "convergence attest command must display the exact required argv" });
});
const common = {
  schemaVersion: z.literal(2), ...BoundaryIdentityShape,
  terminus: CanonicalDigestSchema.nullable().default(null),
  deliveryReviewTermini: z.array(z.strictObject({ vehicle: DeliveryReviewMemberVehicleSchema, terminus: CanonicalDigestSchema })).default([]).superRefine(validateUniqueDeliveryTerminusVehicles),
};
const review = { ...common, locus: z.literal("candidate-review-pending") };
export const CandidateSelfReviewBoundaryV2Schema = z.strictObject({ ...review, nextAction: RunSelfReviewActionSchema, reservation: z.null() });
export const CandidateReviewResumeBoundaryV2Schema = z.strictObject({ ...review, nextAction: ContinuePrePublicationActionSchema,
  reservation: StandardReviewReservationV1Schema.nullable(), postAttestContinuation: PostAttestContinuationV2Schema.optional() });
export const CandidateReviewBoundaryV2Schema = z.union([CandidateSelfReviewBoundaryV2Schema, CandidateReviewResumeBoundaryV2Schema]);
export const CandidateFixBoundaryV2Schema = z.strictObject({ ...common, locus: z.literal("candidate-fix-pending"),
  nextAction: ContinuePrePublicationActionSchema, reservation: z.null() });
export const CandidateConvergenceBoundaryV2Schema = z.strictObject({ ...common, locus: z.literal("candidate-convergence-verification-pending"),
  nextAction: RunConvergenceVerificationActionV2Schema, reservation: StandardReviewReservationV1Schema.nullable(),
}).superRefine((boundary, context) => {
  if (boundary.nextAction.attestArgv[2] !== boundary.workUnit) context.addIssue({ code: "custom", path: ["nextAction", "attestArgv", 2],
    message: "must match the enclosing Candidate boundary work unit" });
});
export const CandidatePublishReadyBoundaryV2Schema = z.strictObject({ ...common, locus: z.literal("candidate-publish-ready"),
  nextAction: PublishCandidateActionSchema, reservation: StandardReviewReservationV1Schema.nullable(), readinessBinding: CanonicalDigestSchema.nullable() });
export const PublicationPendingBoundaryV2Schema = z.strictObject({ ...common, mode: z.literal("integration-boundary"), locus: z.literal("publication-pending"),
  nextAction: ContinuePublicationActionSchema, reservation: StandardReviewReservationV1Schema.nullable(), readinessBinding: CanonicalDigestSchema.nullable() });
export const HostedReviewPendingBoundaryV2Schema = z.strictObject({ ...common, mode: z.literal("integration-boundary"), locus: z.literal("hosted-review-pending"),
  nextAction: ContinuePrePublicationActionSchema, reservation: StandardReviewReservationV1Schema,
}).superRefine((boundary, context) => {
  if (boundary.reservation.target.kind !== "pinned-head") context.addIssue({ code: "custom", path: ["reservation", "target", "kind"],
    message: "hosted-review-pending is reserved for a pinned singleton target" });
});
export const DeliveryStatusRequiredBoundaryV2Schema = z.strictObject({ ...common, mode: z.literal("integration-boundary"), locus: z.literal("delivery-status-required"),
  nextAction: ResolveDeliveryStatusActionSchema, reservation: StandardReviewReservationV1Schema,
  deliveryContinuation: DeliveryPublicReviewContinuationV1Schema.optional(),
}).superRefine((boundary, context) => {
  if (boundary.reservation.target.kind !== "delivery") context.addIssue({ code: "custom", path: ["reservation", "target", "kind"],
    message: "delivery status requires a delivery reservation" });
  if (boundary.nextAction.workUnitId !== boundary.workUnit) context.addIssue({ code: "custom", path: ["nextAction", "workUnitId"],
    message: "the delivery-status action must identify the boundary work unit" });
  if (boundary.deliveryContinuation !== undefined && (boundary.reservation.target.kind !== "delivery"
    || boundary.deliveryContinuation.planId !== boundary.reservation.target.planId)) context.addIssue({ code: "custom", path: ["deliveryContinuation"],
    message: "the delivery continuation must match the carried delivery reservation" });
});
export const IntegrationBoundaryLocusV2Schema = z.union([CandidateReviewBoundaryV2Schema, CandidateFixBoundaryV2Schema,
  CandidateConvergenceBoundaryV2Schema, CandidatePublishReadyBoundaryV2Schema, PublicationPendingBoundaryV2Schema,
  HostedReviewPendingBoundaryV2Schema, DeliveryStatusRequiredBoundaryV2Schema]);
export type IntegrationBoundaryLocusV2 = z.infer<typeof IntegrationBoundaryLocusV2Schema>;
