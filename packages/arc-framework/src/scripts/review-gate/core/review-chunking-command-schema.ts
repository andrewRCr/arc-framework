/** Registered input contract for exact-target review-chunking resolution. */

import { z } from "zod";

import type { KernelRegistry } from "../../../lib/kernel/index.js";
import { ReviewTargetSchema } from "./gate-contract-v2-schema.js";

export const ReviewChunkingResolveRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  target: ReviewTargetSchema,
});
export type ReviewChunkingResolveRequest = z.infer<typeof ReviewChunkingResolveRequestSchema>;

/** Register the strict-current review-chunking request contract. */
export function registerReviewChunkingCommandSchemas(registry: KernelRegistry): KernelRegistry {
  registry.register(ReviewChunkingResolveRequestSchema, {
    id: "review-chunking-resolve-request",
    version: 1,
    migrationPosture: "strict-current",
  });
  return registry;
}
