/** Typed Owner judgment and durable conclusion for a standard-review terminus. */

import { z } from "zod";

import { DeliveryReviewMemberVehicleSchema } from "../../../lib/delivery/review-vehicle.js";
import { ReviewCanonicalDigestSchema, ReviewIdentifierSchema } from "../core/gate-contract-v2-schema.js";
import { CompletedReviewPassCountSchema } from "../core/review-pass.js";

/** Conversational judgment supplied only after the Work Unit Owner explicitly accepts the terminus. */
export const OwnerAcceptedReviewTerminusJudgmentSchema = z.strictObject({
  mode: z.literal("owner-accepted"),
}).readonly();
/** Caller judgment that the Work Unit Owner explicitly accepted the current review terminus. */
export type OwnerAcceptedReviewTerminusJudgment = z.infer<
  typeof OwnerAcceptedReviewTerminusJudgmentSchema
>;

/**
 * Durable Candidate-scoped residual-risk verdict composed from live Owner identity and lane progress.
 * Subject movement carries it only when typed Candidate currentness proves that movement non-semantic.
 */
export const OwnerAcceptedReviewTerminusSchema = z.strictObject({
  schemaVersion: z.literal(1),
  semanticsVersion: z.literal("review-terminus/v1"),
  kind: z.literal("owner-accepted"),
  lane: z.literal("standard"),
  acceptedBy: ReviewIdentifierSchema,
  /** Pass count at acceptance: provenance of the verdict, not fresh authority over a moved subject. */
  completedPasses: CompletedReviewPassCountSchema,
}).readonly();
/** Durable Owner-accepted verdict bound by its containing Candidate identity. */
export type OwnerAcceptedReviewTerminus = z.infer<typeof OwnerAcceptedReviewTerminusSchema>;

/** Resolved native decision provenance, including an unknown author on imported authority. */
export const NativeOwnerAcceptedReviewTerminusSchema = OwnerAcceptedReviewTerminusSchema.unwrap().extend({
  schemaVersion: z.literal(2),
  semanticsVersion: z.literal("review-terminus/v2"),
  decisionKey: ReviewCanonicalDigestSchema,
  acceptedBy: ReviewIdentifierSchema.nullable(),
}).readonly();
/** Native decision projection bound by the owning composition. */
export type NativeOwnerAcceptedReviewTerminus = z.infer<typeof NativeOwnerAcceptedReviewTerminusSchema>;

/** Policy output preserves the provenance of either storage backend. */
export const ResolvedOwnerAcceptedReviewTerminusSchema = z.union([
  OwnerAcceptedReviewTerminusSchema,
  NativeOwnerAcceptedReviewTerminusSchema,
]);
/** Backend-specific accepted verdict after authority binding. */
export type ResolvedOwnerAcceptedReviewTerminus = z.infer<typeof ResolvedOwnerAcceptedReviewTerminusSchema>;

/** One Owner terminus bound to an exact delivery member and head. */
export const DeliveryReviewMemberTerminusSchema = z.strictObject({
  vehicle: DeliveryReviewMemberVehicleSchema,
  terminus: OwnerAcceptedReviewTerminusSchema,
}).readonly();
/** Durable Owner conclusion scoped to one exact delivery-member review subject. */
export type DeliveryReviewMemberTerminus = z.infer<typeof DeliveryReviewMemberTerminusSchema>;


/** Internal member view retaining the resolved verdict's backend provenance. */
export const ResolvedDeliveryReviewMemberTerminusSchema = DeliveryReviewMemberTerminusSchema.unwrap().extend({
  terminus: ResolvedOwnerAcceptedReviewTerminusSchema,
}).readonly();
/** An exact member and its authority-bound verdict, never a caller acceptance judgment. */
export type ResolvedDeliveryReviewMemberTerminus = z.infer<typeof ResolvedDeliveryReviewMemberTerminusSchema>;
