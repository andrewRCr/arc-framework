/** Store-facing JSON parsing for a whole managed Candidate record. */
import { CandidateManagedRecordV1Schema, type CandidateManagedRecordV1 } from "./schema.js";

/** Parse the complete Candidate with its original identity and ordered-lineage invariants. */
export function parseReviewCandidate(content: string): CandidateManagedRecordV1 | null {
  const decoded = decodeReviewCandidate(content);
  return decoded.success ? decoded.data : null;
}

/** Decode a Candidate and retain precise schema refusals for store diagnostics. */
export function decodeReviewCandidate(content: string): { success: true; data: CandidateManagedRecordV1 } | { success: false; error: string } {
  let input: unknown;
  try { input = JSON.parse(content) as unknown; }
  catch (error) { return { success: false, error: `JSON: ${error instanceof Error ? error.message : String(error)}` }; }
  const result = CandidateManagedRecordV1Schema.safeParse(input);
  return result.success ? { success: true, data: result.data } : { success: false,
    error: result.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ") };
}
