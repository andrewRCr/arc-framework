/** Exact review coordinates shared by projection and canonical Candidate authority. */

import { z } from "zod";

import { DeliveryReviewMemberVehicleSchema } from "../delivery/review-vehicle.js";

const ObjectIdSchema = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u);
const IdentifierSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u);
const SourceIdSchema = z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u);
const RepositorySchema = z.string()
  .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u)
  .transform((value) => value.toLowerCase());

export const ReviewContributionApplicabilitySelectorSchema = z.strictObject({
  schemaVersion: z.literal(1),
  repositoryId: IdentifierSchema,
  repository: RepositorySchema,
  pullRequest: z.int().positive(),
  lane: z.literal("standard"),
  sourceId: SourceIdSchema,
  priorAttemptId: IdentifierSchema,
  priorHead: ObjectIdSchema,
  currentHead: ObjectIdSchema,
  priorBase: ObjectIdSchema,
  currentBase: ObjectIdSchema,
  priorVehicle: DeliveryReviewMemberVehicleSchema.optional(),
  currentVehicle: DeliveryReviewMemberVehicleSchema.optional(),
}).superRefine((selector, context) => {
  if ((selector.priorVehicle === undefined) !== (selector.currentVehicle === undefined)) {
    context.addIssue({ code: "custom", path: ["currentVehicle"], message: "review vehicle coordinates mismatch" });
    return;
  }
  if (selector.priorVehicle === undefined || selector.currentVehicle === undefined) return;
  if (selector.priorVehicle.head !== selector.priorHead
    || selector.currentVehicle.head !== selector.currentHead
    || selector.priorVehicle.planId !== selector.currentVehicle.planId
    || selector.priorVehicle.deliverableId !== selector.currentVehicle.deliverableId
    || selector.priorVehicle.workUnitId !== selector.currentVehicle.workUnitId) {
    context.addIssue({ code: "custom", path: ["currentVehicle"], message: "review vehicle coordinates mismatch" });
  }
});
export type ReviewContributionApplicabilitySelector = z.infer<
  typeof ReviewContributionApplicabilitySelectorSchema
>;
