/** Advisory report judgments live outside canonical approved dispositions. */
import { z } from "zod";

export const ReviewFixTagSchema = z.strictObject({
  findingId: z.string().trim().min(1), tag: z.enum(["new-design", "local-correction"]),
});
export const ReviewFixTagsSchema = z.array(ReviewFixTagSchema);
export type ReviewFixTags = z.infer<typeof ReviewFixTagsSchema>;

export const ReviewReportInputSchema = z.strictObject({
  tags: ReviewFixTagsSchema,
  fails: z.array(z.strictObject({ findingId: z.string().trim().min(1), fails: z.string().trim().min(1)
    .refine(value => value.toLowerCase() !== "none", "none requires its reason") })),
  successorRecommendation: z.string().trim().min(1),
  origin: z.array(z.strictObject({ origin: z.string().trim().min(1), findings: z.number().int().nonnegative(),
    newDesignFixes: z.number().int().nonnegative() })),
  reading: z.strictObject({ kind: z.enum(["baseline", "converging", "discovering", "sustained non-convergence"]),
    rationale: z.string().trim().min(1) }),
});
export type ReviewReportInput = z.infer<typeof ReviewReportInputSchema>;

/** A recoverable mismatch between report notes and canonical finding identities. */
export class ReviewReportInputError extends Error {
  readonly code = "invalid-input";
  constructor(readonly correction: string) {
    super(correction);
    this.name = "ReviewReportInputError";
  }
}

function requireExactIdentities(field: string, expected: readonly string[], entries: readonly { findingId: string }[]): void {
  const counts = new Map<string, number>();
  for (const entry of entries) counts.set(entry.findingId, (counts.get(entry.findingId) ?? 0) + 1);
  const wanted = new Set(expected);
  const missing = expected.filter(identity => !counts.has(identity));
  const extra = [...counts.keys()].filter(identity => !wanted.has(identity));
  const duplicate = [...counts.entries()].filter(([, count]) => count > 1).map(([identity]) => identity);
  if (missing.length === 0 && extra.length === 0 && duplicate.length === 0) return;
  const detail = [missing.length === 0 ? "" : `missing: ${missing.join(", ")}`,
    extra.length === 0 ? "" : `extra: ${extra.join(", ")}`,
    duplicate.length === 0 ? "" : `duplicate: ${duplicate.join(", ")}`].filter(Boolean).join("; ");
  throw new ReviewReportInputError(`Correct ${field} (${detail}). Supply exactly one entry for each required finding `
    + "identity, remove extra and duplicate entries, then retry the same response request.");
}

/** Check fix tags against exactly the canonical set's FIX findings. */
export function validateReviewFixTags(
  findings: readonly { findingId: string; disposition: "fix" | "defer" | "reject" }[],
  tags: ReviewFixTags,
): void {
  requireExactIdentities("tags", findings.filter(finding => finding.disposition === "fix").map(finding => finding.findingId), tags);
}

/** Check each report's tags and rubric anchors without adding them to the canonical disposition set. */
export function validateReviewReportInput(
  findings: readonly { findingId: string; disposition: "fix" | "defer" | "reject" }[],
  report: ReviewReportInput,
): void {
  validateReviewFixTags(findings, report.tags);
  requireExactIdentities("report.fails", findings.map(finding => finding.findingId), report.fails);
}
