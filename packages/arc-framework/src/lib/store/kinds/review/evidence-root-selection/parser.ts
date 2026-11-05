/** Issue-preserving JSON codec for explicit approval-root choices. */
import { ReviewEvidenceRootSelectionSchema, type ReviewEvidenceRootSelection } from "./schema.js";

/** Decode one choice without accepting malformed JSON or an incomplete envelope. */
export function decodeReviewEvidenceRootSelection(content: string):
  { success: true; data: ReviewEvidenceRootSelection } | { success: false; error: string } {
  let value: unknown;
  try { value = JSON.parse(content) as unknown; }
  catch (error) { return { success: false, error: `JSON: ${error instanceof Error ? error.message : String(error)}` }; }
  const parsed = ReviewEvidenceRootSelectionSchema.safeParse(value);
  return parsed.success ? { success: true, data: parsed.data } : { success: false,
    error: parsed.error.issues.map(issue => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ") };
}
