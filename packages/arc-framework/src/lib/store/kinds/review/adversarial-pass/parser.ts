/** JSON decoding for advisory adversarial pass records. */
import { ReviewAdversarialPassSchema, type ReviewAdversarialPass } from "./schema.js";

/** Parse one complete advisory pass, refusing malformed headers and artifact bindings. */
export function parseReviewAdversarialPass(content: string): ReviewAdversarialPass | null {
  const decoded = decodeReviewAdversarialPass(content);
  return decoded.success ? decoded.data : null;
}

/** Decode a pass and retain precise content refusals for store diagnostics. */
export function decodeReviewAdversarialPass(content: string): { success: true; data: ReviewAdversarialPass } | { success: false; error: string } {
  let input: unknown;
  try { input = JSON.parse(content) as unknown; }
  catch (error) { return { success: false, error: `JSON: ${error instanceof Error ? error.message : String(error)}` }; }
  const result = ReviewAdversarialPassSchema.safeParse(input);
  return result.success ? { success: true, data: result.data } : { success: false,
    error: result.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ") };
}
