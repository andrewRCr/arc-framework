/** Shared v2 finding vocabulary owned by the review domain. */

import { z } from "zod";

import type { KernelRegistry } from "../../../lib/kernel/index.js";

export const ReviewSeveritySchema = z.enum(["critical", "major", "minor"]);
export type ReviewSeverity = z.infer<typeof ReviewSeveritySchema>;

export const FindingDispositionSchema = z.enum(["fix", "defer", "reject"]);
export type FindingDisposition = z.infer<typeof FindingDispositionSchema>;

export const FindingClassificationSchema = z.strictObject({
  severity: ReviewSeveritySchema,
  nit: z.boolean().optional(),
}).refine((finding) => finding.nit !== true || finding.severity === "minor", {
  message: "nit is valid only for minor findings",
});
export type FindingClassification = z.infer<typeof FindingClassificationSchema>;

/** Register shared finding vocabulary with a caller-owned registry. */
export function registerReviewPrimitiveSchemas(registry: KernelRegistry): KernelRegistry {
  registry.register(ReviewSeveritySchema, {
    id: "review-severity",
    version: 2,
    migrationPosture: "strict-current",
  });
  registry.register(FindingDispositionSchema, {
    id: "finding-disposition",
    version: 2,
    migrationPosture: "strict-current",
  });
  registry.register(FindingClassificationSchema, {
    id: "finding-classification",
    version: 2,
    migrationPosture: "strict-current",
  });
  return registry;
}
