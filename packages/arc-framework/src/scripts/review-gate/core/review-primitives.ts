/** Shared v2 finding vocabulary owned by the review domain. */

import { z } from "zod";

export const ReviewSeveritySchema = z.enum(["blocker", "major", "minor"]);
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
