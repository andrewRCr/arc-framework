/** Typed, non-persistent result of reconstructing one suspended review operation. */

import { z } from "zod";

import type { KernelRegistry } from "../../../lib/kernel/index.js";
import { ReviewResponsePlanSchema } from "./response-plan-schema.js";

const CanonicalDigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);

export const ReviewReentryResultSchema = z.strictObject({
  schemaVersion: z.literal(1),
  semanticsVersion: z.literal("review-reentry/v1"),
  state: z.enum([
    "suspended",
    "review-complete",
    "respond-to-findings",
    "stale-target",
    "timed-out",
    "provider-failed",
    "operation-conflict",
  ]),
  operationId: z.string().trim().min(1),
  persistedVersion: z.number().int().nonnegative(),
  targetId: CanonicalDigestSchema,
  responsePlan: ReviewResponsePlanSchema.nullable(),
  resumeText: z.string().trim().min(1),
});
export type ReviewReentryResult = z.infer<typeof ReviewReentryResultSchema>;

/** Register the derived re-entry result without adding it to persisted operation state. */
export function registerReviewReentrySchema(registry: KernelRegistry): KernelRegistry {
  registry.register(ReviewReentryResultSchema, {
    id: "review-reentry-result",
    version: 1,
    migrationPosture: "strict-current",
  });
  return registry;
}
