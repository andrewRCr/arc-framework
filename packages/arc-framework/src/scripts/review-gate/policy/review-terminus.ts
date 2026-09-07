/** Typed Owner judgment and durable conclusion for a standard-review terminus. */

import { z } from "zod";

import { DeliveryReviewMemberVehicleSchema } from "../../../lib/delivery/review-vehicle.js";
import { ReviewIdentifierSchema } from "../core/gate-contract-v2-schema.js";
import { CompletedReviewPassCountSchema } from "../core/review-pass.js";

/** Conversational judgment supplied only after the Work Unit Owner explicitly accepts the terminus. */
export const OwnerAcceptedReviewTerminusJudgmentSchema = z.strictObject({
  mode: z.literal("owner-accepted"),
}).readonly();
/** Caller judgment that the Work Unit Owner explicitly accepted the current review terminus. */
export type OwnerAcceptedReviewTerminusJudgment = z.infer<
  typeof OwnerAcceptedReviewTerminusJudgmentSchema
>;

/** Durable, Candidate-bound conclusion composed from live Owner identity and lane progress. */
export const OwnerAcceptedReviewTerminusSchema = z.strictObject({
  schemaVersion: z.literal(1),
  semanticsVersion: z.literal("review-terminus/v1"),
  kind: z.literal("owner-accepted"),
  lane: z.literal("standard"),
  acceptedBy: ReviewIdentifierSchema,
  completedPasses: CompletedReviewPassCountSchema,
}).readonly();
/** Durable Owner-accepted conclusion bound by its containing Candidate boundary. */
export type OwnerAcceptedReviewTerminus = z.infer<typeof OwnerAcceptedReviewTerminusSchema>;

/** One Owner terminus bound to an exact delivery member and head. */
export const DeliveryReviewMemberTerminusSchema = z.strictObject({
  vehicle: DeliveryReviewMemberVehicleSchema,
  terminus: OwnerAcceptedReviewTerminusSchema,
}).readonly();
/** Durable Owner conclusion scoped to one exact delivery-member review subject. */
export type DeliveryReviewMemberTerminus = z.infer<typeof DeliveryReviewMemberTerminusSchema>;
