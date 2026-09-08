/** Stable identity and schema helpers for review-lane subject lineages. */

import { z } from "zod";

import { DeliveryReviewMemberVehicleSchema } from "../../../lib/delivery/review-vehicle.js";
import { canonicalDigest } from "../../../lib/kernel/index.js";
import { GitObjectIdSchema, ReviewCanonicalDigestSchema, ReviewIdentifierSchema } from
  "./gate-contract-v2-schema.js";

/** Runtime-resolved subject shared by every attempt in one lane allowance. */
export const LaneSubjectLineageSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("candidate"),
    candidateId: ReviewCanonicalDigestSchema,
  }),
  DeliveryReviewMemberVehicleSchema.omit({ head: true }),
  z.strictObject({
    kind: z.literal("head-bound"),
    vehicleKind: ReviewIdentifierSchema,
    vehicleIdentity: ReviewIdentifierSchema,
    headSha: GitObjectIdSchema,
  }),
]);
export type LaneSubjectLineage = z.infer<typeof LaneSubjectLineageSchema>;

/** Derive the canonical identity shared by every attempt in one lane lineage. */
export function laneSubjectLineageId(input: LaneSubjectLineage): string {
  const lineage = LaneSubjectLineageSchema.parse(input);
  return canonicalDigest({
    domain: "arc.review.lane-subject-lineage/v1",
    lineage,
  });
}
