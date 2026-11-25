/** An attributed choice of one complete approved-response branch. */
import { z } from "zod";
import { ReviewCanonicalDigestSchema, ReviewIdentifierSchema } from
  "../../../../../scripts/review-gate/core/gate-contract-v2-schema.js";

export const ReviewEvidenceRootSelectionSchema = z.strictObject({
  schemaVersion: z.literal(1), producerId: ReviewIdentifierSchema,
  outcomeKey: z.string().min(1).refine(key => !key.includes("/"), "outcome key is one path segment"),
  resultDigest: ReviewCanonicalDigestSchema,
  roots: z.array(ReviewCanonicalDigestSchema).min(2), selectedRoot: ReviewCanonicalDigestSchema,
  decidedBy: ReviewIdentifierSchema, decidedAt: z.iso.datetime({ offset: true }), reason: z.string().trim().min(1),
}).superRefine((value, context) => {
  if (value.roots.some((root, index) => {
    const previous = value.roots[index - 1];
    return previous !== undefined && root <= previous;
  })) {
    context.addIssue({ code: "custom", path: ["roots"], message: "Roots must be sorted and unique." });
  }
  if (!value.roots.includes(value.selectedRoot)) {
    context.addIssue({ code: "custom", path: ["selectedRoot"], message: "Select a root from the complete inventory." });
  }
});
export type ReviewEvidenceRootSelection = z.infer<typeof ReviewEvidenceRootSelectionSchema>;
