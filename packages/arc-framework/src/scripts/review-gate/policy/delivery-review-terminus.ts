/** Exact member-scoped transport for an explicit Work Unit Owner review terminus. */

import { z } from "zod";

import { canonicalize } from "../../../lib/canonical/canonical-json.js";
import {
  DeliveryReviewMemberVehicleSchema,
  sameDeliveryReviewMemberVehicle,
} from "../../../lib/delivery/review-vehicle.js";
import { SlugSchema } from "../../../lib/kernel/schema/slug.js";
import type { VersionedSubmissionBoundary } from
  "../../../lib/work-unit/submission-boundary-store.js";
import { CompletedReviewPassCountSchema } from "../core/review-pass.js";
import { HostedTargetSchema } from "../hosted/request.js";
import type { IntegrationBoundaryLocus } from "./integration-boundary-locus.js";
import {
  DeliveryReviewMemberTerminusSchema,
  OwnerAcceptedReviewTerminusJudgmentSchema,
} from "./review-terminus.js";

const DigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);

/** Submit-ready Owner-terminus offer for one exact first-outstanding delivery member. */
export const DeliveryReviewTerminusOfferSchema = z.strictObject({
  schemaVersion: z.literal(1),
  kind: z.literal("delivery-member-owner-terminus"),
  workUnitId: SlugSchema,
  remote: z.string().trim().min(1),
  expectedBoundaryVersion: DigestSchema,
  candidateId: DigestSchema,
  candidateSubjectDigest: DigestSchema,
  target: HostedTargetSchema,
  vehicle: DeliveryReviewMemberVehicleSchema,
  completedPasses: CompletedReviewPassCountSchema,
  interactionText: z.string().trim().min(1),
}).superRefine((offer, context) => {
  if (offer.vehicle.workUnitId !== offer.workUnitId) {
    context.addIssue({
      code: "custom",
      path: ["vehicle", "workUnitId"],
      message: "the delivery-member terminus vehicle must belong to the offered work unit",
    });
  }
  if (offer.target.headSha !== offer.vehicle.head) {
    context.addIssue({
      code: "custom",
      path: ["target", "headSha"],
      message: "the delivery-member terminus target must match the offered vehicle head",
    });
  }
}).readonly();
/** Exact member-scoped Owner-terminus offer returned by work-unit review status. */
export type DeliveryReviewTerminusOffer = z.infer<typeof DeliveryReviewTerminusOfferSchema>;

/** Owner-authenticated acceptance of one exact status offer. */
export const DeliveryReviewTerminusAcceptanceInputSchema = z.strictObject({
  schemaVersion: z.literal(1),
  offer: DeliveryReviewTerminusOfferSchema,
  judgment: OwnerAcceptedReviewTerminusJudgmentSchema,
});
/** Mutation request for one exact delivery-member Owner terminus. */
export type DeliveryReviewTerminusAcceptanceInput = z.infer<
  typeof DeliveryReviewTerminusAcceptanceInputSchema
>;

const AcceptedResultShape = {
  schemaVersion: z.literal(1),
  mode: z.literal("review-terminus-accept"),
  record: DeliveryReviewMemberTerminusSchema,
  recommendedActionText: z.string().trim().min(1),
};

/** Closed result of a member-scoped Owner-terminus mutation attempt. */
export const DeliveryReviewTerminusAcceptanceResultSchema = z.union([
  z.strictObject({
    ...AcceptedResultShape,
    state: z.literal("recorded"),
    nextAction: z.literal("commit-boundary"),
    boundaryPath: z.string().trim().min(1),
  }),
  z.strictObject({
    ...AcceptedResultShape,
    state: z.literal("exact-replay"),
    nextAction: z.literal("continue"),
  }),
  z.strictObject({
    schemaVersion: z.literal(1),
    mode: z.literal("review-terminus-accept"),
    state: z.literal("refused"),
    nextAction: z.literal("rerun-status"),
    reason: z.enum([
      "boundary-unavailable",
      "owner-authority-refused",
      "stale-offer",
      "record-conflict",
    ]),
    detail: z.string().trim().min(1),
    recommendedActionText: z.string().trim().min(1),
  }),
]);
/** Closed member-scoped Owner-terminus mutation result. */
export type DeliveryReviewTerminusAcceptanceResult = z.infer<
  typeof DeliveryReviewTerminusAcceptanceResultSchema
>;

interface DeliveryReviewTerminusAcceptanceDependencies {
  readBoundary(workUnitId: string): Promise<VersionedSubmissionBoundary>;
  readOwnerAuthority(workUnitId: string): Promise<
    | { readonly status: "authorized"; readonly ownerIdentity: string }
    | { readonly status: "refused"; readonly reason: string }
  >;
  readCurrentOffer(workUnitId: string): Promise<DeliveryReviewTerminusOffer | null>;
  writeBoundary(boundary: IntegrationBoundaryLocus, expectedVersion: string): Promise<
    | { readonly status: "written"; readonly path: string }
    | { readonly status: "version-conflict" }
  >;
}

function refused(
  reason: Extract<DeliveryReviewTerminusAcceptanceResult, { state: "refused" }>["reason"],
  detail: string,
): DeliveryReviewTerminusAcceptanceResult {
  return DeliveryReviewTerminusAcceptanceResultSchema.parse({
    schemaVersion: 1,
    mode: "review-terminus-accept",
    state: "refused",
    nextAction: "rerun-status",
    reason,
    detail,
    recommendedActionText: "Re-run work-unit review status and act only on its current exact offer.",
  });
}

/** Authenticate and append one exact delivery-member Owner terminus through boundary CAS. */
export async function resolveDeliveryReviewTerminusAcceptance(
  input: DeliveryReviewTerminusAcceptanceInput,
  dependencies: DeliveryReviewTerminusAcceptanceDependencies,
): Promise<DeliveryReviewTerminusAcceptanceResult> {
  const request = DeliveryReviewTerminusAcceptanceInputSchema.parse(input);
  const { offer } = request;
  const current = await dependencies.readBoundary(offer.workUnitId);
  const boundary = current.boundary;
  if (boundary === null
    || boundary.locus !== "delivery-status-required"
    || boundary.reservation.target.kind !== "delivery"
    || boundary.workUnit !== offer.workUnitId
    || boundary.reservation.target.planId !== offer.vehicle.planId) {
    return refused("boundary-unavailable", "The exact delivery status is unavailable.");
  }
  const authority = await dependencies.readOwnerAuthority(offer.workUnitId);
  if (authority.status !== "authorized") {
    return refused("owner-authority-refused", authority.reason);
  }
  const existing = boundary.deliveryReviewTermini.find((record) => (
    sameDeliveryReviewMemberVehicle(record.vehicle, offer.vehicle)
  ));
  if (existing !== undefined) {
    if (existing.terminus.completedPasses !== offer.completedPasses) {
      return refused("record-conflict", "The exact member already carries a different Owner terminus.");
    }
    return DeliveryReviewTerminusAcceptanceResultSchema.parse({
      schemaVersion: 1,
      mode: "review-terminus-accept",
      state: "exact-replay",
      nextAction: "continue",
      record: existing,
      recommendedActionText: "Re-enter work-unit review status; this exact member terminus is already durable.",
    });
  }
  if (current.version !== offer.expectedBoundaryVersion
    || boundary.candidateId !== offer.candidateId
    || boundary.candidateSubjectDigest !== offer.candidateSubjectDigest) {
    return refused("stale-offer", "The Candidate or publication boundary changed after this offer was issued.");
  }
  const liveOffer = await dependencies.readCurrentOffer(offer.workUnitId);
  if (liveOffer === null || canonicalize(liveOffer) !== canonicalize(offer)) {
    return refused("stale-offer", "The first-outstanding member or its review progress changed after this offer.");
  }
  const record = DeliveryReviewMemberTerminusSchema.parse({
    vehicle: offer.vehicle,
    terminus: {
      schemaVersion: 1,
      semanticsVersion: "review-terminus/v1",
      kind: "owner-accepted",
      lane: "standard",
      acceptedBy: authority.ownerIdentity,
      completedPasses: offer.completedPasses,
    },
  });
  const write = await dependencies.writeBoundary({
    ...boundary,
    deliveryReviewTermini: [...boundary.deliveryReviewTermini, record],
  }, offer.expectedBoundaryVersion);
  if (write.status === "version-conflict") {
    return refused("stale-offer", "The publication boundary changed before the Owner terminus could be recorded.");
  }
  return DeliveryReviewTerminusAcceptanceResultSchema.parse({
    schemaVersion: 1,
    mode: "review-terminus-accept",
    state: "recorded",
    nextAction: "commit-boundary",
    boundaryPath: write.path,
    record,
    recommendedActionText: "Commit and push the staged Owner terminus, then re-enter work-unit review status.",
  });
}
