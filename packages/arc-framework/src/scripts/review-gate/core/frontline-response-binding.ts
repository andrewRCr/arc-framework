/** Candidate authority retained for a frontline review of one private delivery member. */

import { z } from "zod";

import { DeliveryReviewMemberVehicleSchema } from "../../../lib/delivery/review-vehicle.js";
import { SlugSchema } from "../../../lib/kernel/schema/slug.js";
import {
  GitObjectIdSchema,
  ReviewCanonicalDigestSchema,
  ReviewTargetSchema,
} from "./gate-contract-v2-schema.js";

const CandidateIdentitySchema = z.strictObject({
  workUnit: SlugSchema,
  candidateId: ReviewCanonicalDigestSchema,
});

/** Public binding projected by pre-publication review and replayed into a Frontline run. */
export const FrontlineResponseBindingSchema = z.strictObject({
  candidate: CandidateIdentitySchema.extend({ head: GitObjectIdSchema }),
  deliveryMember: DeliveryReviewMemberVehicleSchema,
}).superRefine((binding, context) => {
  if (binding.candidate.workUnit !== binding.deliveryMember.workUnitId) {
    context.addIssue({
      code: "custom",
      path: ["deliveryMember", "workUnitId"],
      message: "must match the bound Candidate work unit",
    });
  }
});
export type FrontlineResponseBinding = z.infer<typeof FrontlineResponseBindingSchema>;

/** Trusted durable binding after the public coordinates have been re-derived locally. */
export const BoundFrontlineResponseBindingSchema = z.strictObject({
  candidate: CandidateIdentitySchema.extend({ target: ReviewTargetSchema }),
  deliveryMember: DeliveryReviewMemberVehicleSchema,
}).superRefine((binding, context) => {
  if (binding.candidate.workUnit !== binding.deliveryMember.workUnitId) {
    context.addIssue({
      code: "custom",
      path: ["deliveryMember", "workUnitId"],
      message: "must match the bound Candidate work unit",
    });
  }
  if (binding.candidate.target.kind !== "change-set") {
    context.addIssue({
      code: "custom",
      path: ["candidate", "target", "kind"],
      message: "must identify the root Candidate change set",
    });
  }
});
export type BoundFrontlineResponseBinding = z.infer<typeof BoundFrontlineResponseBindingSchema>;
