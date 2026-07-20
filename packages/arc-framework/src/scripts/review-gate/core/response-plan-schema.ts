/** Runtime schemas for channel-neutral review-response planning. */

import { z } from "zod";

import type { KernelRegistry } from "../../../lib/kernel/index.js";
import { DispositionApprovalSchema, DispositionSetSchema } from "./disposition-records.js";
import { NormalizedReviewFindingSchema } from "./finding-records.js";
import { ReviewTargetSchema } from "./gate-contract-v2-schema.js";
import { ReviewRoutingDecisionSchema } from "../policy/routing-schema.js";

export const ReviewResponseCapabilitySchema = z.enum(["approve", "fix", "persist", "close", "reroute"]);
export type ReviewResponseCapability = z.infer<typeof ReviewResponseCapabilitySchema>;

export const ReviewResponseCapabilitiesSchema = z.strictObject({
  approve: z.boolean(),
  fix: z.boolean(),
  persist: z.boolean(),
  close: z.boolean(),
  reroute: z.boolean(),
});
export type ReviewResponseCapabilities = z.infer<typeof ReviewResponseCapabilitiesSchema>;

export const ReviewResponseInputSchema = z.strictObject({
  currentTarget: ReviewTargetSchema,
  findings: z.array(NormalizedReviewFindingSchema).min(1),
  routing: ReviewRoutingDecisionSchema,
  dispositionSet: DispositionSetSchema.nullable(),
  approval: DispositionApprovalSchema.nullable(),
  candidateTarget: ReviewTargetSchema.nullable(),
  persistedTargetId: z.string().regex(/^sha256:[0-9a-f]{64}$/u).nullable(),
  verificationPassed: z.boolean(),
  verificationRefs: z.array(z.string().trim().min(1)),
  capabilities: ReviewResponseCapabilitiesSchema,
});
export type ReviewResponseInput = z.infer<typeof ReviewResponseInputSchema>;

export const ReviewResponseStateSchema = z.enum([
  "awaiting-approval",
  "ready-to-fix",
  "ready-to-persist",
  "ready-to-close",
  "reroute",
  "blocked",
]);
export type ReviewResponseState = z.infer<typeof ReviewResponseStateSchema>;

export const ReviewResponsePlanSchema = z.strictObject({
  schemaVersion: z.literal(2),
  semanticsVersion: z.literal("review-response/v1"),
  state: ReviewResponseStateSchema,
  oldTarget: ReviewTargetSchema,
  newTarget: ReviewTargetSchema.nullable(),
  approvedDispositionSet: DispositionSetSchema.nullable(),
  verificationRefs: z.array(z.string().trim().min(1)),
  blocking: z.boolean(),
  allowedCapabilities: z.array(ReviewResponseCapabilitySchema),
  nextAction: z.string().trim().min(1),
});
export type ReviewResponsePlan = z.infer<typeof ReviewResponsePlanSchema>;

/** Register deterministic response-planning records with the review domain. */
export function registerReviewResponseSchemas(registry: KernelRegistry): KernelRegistry {
  registry.register(ReviewResponseInputSchema, {
    id: "review-response-input",
    version: 1,
    migrationPosture: "strict-current",
  });
  registry.register(ReviewResponsePlanSchema, {
    id: "review-response-plan",
    version: 1,
    migrationPosture: "strict-current",
  });
  return registry;
}
