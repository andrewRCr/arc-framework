/** JSON decoding for immutable review decisions. */
import { ReviewDecisionSchema, type ReviewDecision } from "./schema.js";

/** Parse one complete decision, refusing malformed JSON and incomplete choice envelopes. */
export function parseReviewDecision(content: string): ReviewDecision | null {
  const decoded = decodeReviewDecision(content);
  return decoded.success ? decoded.data : null;
}

/** Decode one decision and retain precise content refusals for store diagnostics. */
export function decodeReviewDecision(content: string): { success: true; data: ReviewDecision } | { success: false; error: string } {
  let input: unknown;
  try { input = JSON.parse(content) as unknown; }
  catch (error) { return { success: false, error: `JSON: ${error instanceof Error ? error.message : String(error)}` }; }
  const result = ReviewDecisionSchema.safeParse(input);
  return result.success ? { success: true, data: result.data } : { success: false,
    error: result.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ") };
}
