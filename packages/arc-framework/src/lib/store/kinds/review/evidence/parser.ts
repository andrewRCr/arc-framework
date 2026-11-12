/** JSON decoding for approved review evidence. */
import { ReviewEvidenceSchema, type ReviewEvidence } from "./schema.js";

/** Parse one complete approved response, refusing malformed or inconsistent evidence. */
export function parseReviewEvidence(content: string): ReviewEvidence | null {
  const decoded = decodeReviewEvidence(content);
  return decoded.success ? decoded.data : null;
}

/** Decode one response and retain precise content refusals for store diagnostics. */
export function decodeReviewEvidence(content: string): { success: true; data: ReviewEvidence } | { success: false; error: string } {
  let input: unknown;
  try { input = JSON.parse(content) as unknown; }
  catch (error) { return { success: false, error: `JSON: ${error instanceof Error ? error.message : String(error)}` }; }
  const result = ReviewEvidenceSchema.safeParse(input);
  return result.success ? { success: true, data: result.data } : { success: false,
    error: result.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ") };
}
