/** Registered input contract for exact-target review-chunking resolution. */

import { z } from "zod";

import type { KernelRegistry } from "../../../lib/kernel/index.js";
import { ReviewTargetSchema } from "./gate-contract-v2-schema.js";
import { ReviewTargetCoordinatesSchema } from "./review-target-coordinates.js";

export const REVIEW_CHUNKING_RESOLVE_REQUEST_SCHEMA_ID = "review-chunking-resolve-request";

/** Public request: callers supply exact Git coordinates, never repository-local identities. */
export const ReviewChunkingResolveRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  target: ReviewTargetCoordinatesSchema,
  scopeSelection: z.strictObject({
    mode: z.enum(["whole-target", "chunked"]),
    target: ReviewTargetCoordinatesSchema,
  }).readonly().optional(),
});
export type ReviewChunkingResolveRequest = z.infer<typeof ReviewChunkingResolveRequestSchema>;

/** Trusted internal request after the public boundary has derived canonical targets. */
export const ReviewChunkingResolveCommandRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  target: ReviewTargetSchema,
  scopeSelection: z.strictObject({
    mode: z.enum(["whole-target", "chunked"]),
    target: ReviewTargetSchema,
  }).readonly().optional(),
});
export type ReviewChunkingResolveCommandRequest =
  z.infer<typeof ReviewChunkingResolveCommandRequestSchema>;

/** Register the strict-current review-chunking request contract. */
export function registerReviewChunkingCommandSchemas(registry: KernelRegistry): KernelRegistry {
  registry.register(ReviewChunkingResolveRequestSchema, {
    id: REVIEW_CHUNKING_RESOLVE_REQUEST_SCHEMA_ID,
    version: 1,
    migrationPosture: "strict-current", authored: "request",
  });
  return registry;
}
