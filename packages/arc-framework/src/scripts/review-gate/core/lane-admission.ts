/** Stable identity and schema helpers for review-lane subject lineages. */

import { z } from "zod";

import { DeliveryReviewMemberVehicleSchema } from "../../../lib/delivery/review-vehicle.js";
import { canonicalDigest, type CanonicalDigest } from "../../../lib/kernel/index.js";
import { GitObjectIdSchema, ReviewCanonicalDigestSchema, ReviewIdentifierSchema } from
  "./gate-contract-v2-schema.js";

/** Runtime-resolved exact subject of one lane attempt. */
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

/** Stable owner identity shared by exact lineages for one lane subject. */
export type LaneSubjectOwner = Omit<
  Extract<LaneSubjectLineage, { kind: "head-bound" }>,
  "headSha"
> | Exclude<LaneSubjectLineage, { kind: "head-bound" }>;

/** Project one exact lineage onto the stable subject that owns its lane progress. */
export function laneSubjectOwner(lineage: LaneSubjectLineage): LaneSubjectOwner {
  return lineage.kind === "head-bound"
    ? {
        kind: lineage.kind,
        vehicleKind: lineage.vehicleKind,
        vehicleIdentity: lineage.vehicleIdentity,
      }
    : lineage;
}

/** Compare two exact lineages by the stable subject that owns their lane progress. */
export function laneSubjectOwnerMatches(
  left: LaneSubjectLineage,
  right: LaneSubjectLineage,
): boolean {
  switch (left.kind) {
    case "candidate":
      return right.kind === "candidate" && left.candidateId === right.candidateId;
    case "delivery-member":
      return right.kind === "delivery-member"
        && left.planId === right.planId
        && left.workUnitId === right.workUnitId
        && left.deliverableId === right.deliverableId;
    case "head-bound":
      return right.kind === "head-bound"
        && left.vehicleKind === right.vehicleKind
        && left.vehicleIdentity === right.vehicleIdentity;
  }
}

/** Derive the canonical identity of one exact lane lineage. */
export function laneSubjectLineageId(input: LaneSubjectLineage): CanonicalDigest {
  const lineage = LaneSubjectLineageSchema.parse(input);
  return canonicalDigest({
    domain: "arc.review.lane-subject-lineage/v1",
    lineage,
  });
}
