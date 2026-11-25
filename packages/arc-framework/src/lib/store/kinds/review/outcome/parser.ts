/** JSON decoding for immutable review outcomes. */
import { ReviewOutcomeSchema, type ReviewOutcome } from "./schema.js";

/** Parse an ended review outcome, refusing malformed JSON and inconsistent producer facts. */
export function parseReviewOutcome(content: string): ReviewOutcome | null {
  const decoded = decodeReviewOutcome(content);
  return decoded.success ? decoded.data : null;
}

/** Decode one outcome and retain the precise content refusal for store diagnostics. */
export function decodeReviewOutcome(content: string): { success: true; data: ReviewOutcome } | { success: false; error: string } {
  let input: unknown;
  try { input = JSON.parse(content) as unknown; }
  catch (error) { return { success: false, error: `JSON: ${error instanceof Error ? error.message : String(error)}` }; }
  const result = ReviewOutcomeSchema.safeParse(input);
  return result.success ? { success: true, data: result.data } : {
    success: false,
    error: result.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; "),
  };
}
