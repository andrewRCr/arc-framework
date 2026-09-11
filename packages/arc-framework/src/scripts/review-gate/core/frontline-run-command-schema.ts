/** Public and internal request contracts for an exact-target frontline run. */

import { z } from "zod";

import type { KernelRegistry } from "../../../lib/kernel/index.js";
import {
  BoundFrontlineResponseBindingSchema,
  FrontlineResponseBindingSchema,
} from "./frontline-response-binding.js";
import { ReviewTargetSchema } from "./gate-contract-v2-schema.js";
import { FrontlineResolveEnvelopeSchema } from "./review-command-envelope.js";
import { ReviewTargetCoordinatesSchema } from "./review-target-coordinates.js";

export const REVIEW_FRONTLINE_RUN_REQUEST_SCHEMA_ID = "review-frontline-run-request";

const frontlineRunFields = {
  schemaVersion: z.literal(1),
  resolution: FrontlineResolveEnvelopeSchema,
  timeoutMs: z.number().int().positive().max(2_147_483_647).optional(),
} as const;

/** Public request: callers supply exact Git coordinates, never repository-local identities. */
export const FrontlineRunRequestSchema = z.strictObject({
  ...frontlineRunFields,
  target: ReviewTargetCoordinatesSchema,
  responseBinding: FrontlineResponseBindingSchema.optional(),
}).superRefine((request, context) => {
  if (request.responseBinding !== undefined
    && (request.target.kind !== "delivery-member"
      || request.target.headSha !== request.responseBinding.deliveryMember.head)) {
    context.addIssue({
      code: "custom",
      path: ["responseBinding", "deliveryMember"],
      message: "must identify the exact private delivery-member target",
    });
  }
});
export type FrontlineRunRequest = z.infer<typeof FrontlineRunRequestSchema>;

/** Trusted internal request after the public boundary has derived a canonical target. */
export const FrontlineRunCommandRequestSchema = z.strictObject({
  ...frontlineRunFields,
  target: ReviewTargetSchema,
  responseBinding: BoundFrontlineResponseBindingSchema.optional(),
}).superRefine((request, context) => {
  const binding = request.responseBinding;
  if (binding !== undefined
    && (request.target.kind !== "delivery-member"
      || request.target.repositoryId !== binding.candidate.target.repositoryId
      || request.target.baseRef !== binding.candidate.target.baseRef
      || request.target.headSha !== binding.deliveryMember.head)) {
    context.addIssue({
      code: "custom",
      path: ["responseBinding"],
      message: "must bind the root Candidate and exact private delivery-member target",
    });
  }
});
export type FrontlineRunCommandRequest = z.infer<typeof FrontlineRunCommandRequestSchema>;

/** Register the strict-current public frontline-run request contract. */
export function registerFrontlineRunCommandSchemas(registry: KernelRegistry): KernelRegistry {
  registry.register(FrontlineRunRequestSchema, {
    id: REVIEW_FRONTLINE_RUN_REQUEST_SCHEMA_ID,
    version: 1,
    migrationPosture: "strict-current",
  });
  return registry;
}
