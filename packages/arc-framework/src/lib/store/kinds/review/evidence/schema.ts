/** One approved response, its immutable binding, and monotonic performance and settlement facts. */
import { z } from "zod";
import { validateReviewEvidenceContent } from "./validation.js";
import { ApprovedDispositionRecordSchema, ErrandReviewBindingSchema, ErrandReviewFixResponseSchema,
  DeliveryMemberReviewFixResponseSchema } from "../../../../../scripts/review-gate/core/advisory-records.js";
import { DispositionSetSchema, DispositionApprovalSchema } from "../../../../../scripts/review-gate/core/disposition-records.js";
import { ReviewCanonicalDigestSchema } from "../../../../../scripts/review-gate/core/gate-contract-v2-schema.js";
import { LaneResponsePerformanceSchema, HostedSettlementEvidenceSchema, HostedDispositionFindingActionSchema } from
  "../../../../../scripts/review-gate/core/operation-state-schema.js";
import { ReviewFixTagsSchema } from "../../../../../scripts/review-gate/core/review-report-inputs.js";
import { ReviewPolicyCommandRequestSchema } from "../../../../../scripts/review-gate/policy/review-policy-driver.js";
import { DeliveryReviewMemberVehicleSchema } from "../../../../delivery/review-vehicle.js";

const CandidateBindingSchema = ApprovedDispositionRecordSchema.shape.candidate.unwrap();
export const ReviewEvidenceBindingSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("candidate"), candidate: CandidateBindingSchema }),
  z.strictObject({ kind: z.literal("errand"), errand: ErrandReviewBindingSchema }),
  z.strictObject({ kind: z.literal("delivery-member"), deliveryMember: DeliveryReviewMemberVehicleSchema }),
  z.strictObject({ kind: z.literal("candidate-member"), candidate: CandidateBindingSchema,
    deliveryMember: DeliveryReviewMemberVehicleSchema }),
]).nullable();
export const ReviewEvidencePerformanceSchema = LaneResponsePerformanceSchema.extend({
  fixResponse: z.union([ErrandReviewFixResponseSchema, DeliveryMemberReviewFixResponseSchema]).optional(),
});
const ReviewEvidenceObjectSchema = z.strictObject({
  schemaVersion: z.literal(1),
  result: z.strictObject({ outcomeKey: z.string().min(1).refine((key) => !key.includes("/"), "outcome key is one path segment"),
    resultDigest: ReviewCanonicalDigestSchema }),
  binding: ReviewEvidenceBindingSchema,
  dispositionSet: DispositionSetSchema, approval: DispositionApprovalSchema,
  advisoryFixTags: ReviewFixTagsSchema.optional(),
  predecessorDispositionSetId: ReviewCanonicalDigestSchema.nullable(),
  successorDispositionSetId: ReviewCanonicalDigestSchema.nullable(),
  responsePolicyRequest: ReviewPolicyCommandRequestSchema,
  policyProjectionPending: z.literal(true).optional(),
  performance: ReviewEvidencePerformanceSchema.optional(),
  settlement: z.strictObject({ findingActions: z.array(HostedDispositionFindingActionSchema),
    evidence: z.array(HostedSettlementEvidenceSchema) }).optional(),
});
export type ReviewEvidence = z.infer<typeof ReviewEvidenceObjectSchema>;
export const ReviewEvidenceSchema = ReviewEvidenceObjectSchema.superRefine(validateReviewEvidenceContent);
