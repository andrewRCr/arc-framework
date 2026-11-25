/** Pure JSON decoding for terminal lineage records. */
import { LineageRecordSchema, type LineageRecord } from "./schema.js";

/** Decode content with a refusal carrying its schema issues.
 * @param content - Untrusted JSON bytes decoded as UTF-8.
 * @returns A validated record or a content refusal.
 */
export function decodeLineageContent(content: string): { success: true; data: LineageRecord } | { success: false; error: string } {
  let candidate: unknown;
  try { candidate = JSON.parse(content) as unknown; }
  catch (error) { return { success: false, error: `JSON: ${error instanceof Error ? error.message : String(error)}` }; }
  const parsed = LineageRecordSchema.safeParse(candidate);
  return parsed.success ? { success: true, data: parsed.data } : {
    success: false,
    error: parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; "),
  };
}

/** Parse one terminal lineage record.
 * @param content - Untrusted JSON bytes decoded as UTF-8.
 * @returns The validated record, or null when decoding or validation refuses.
 */
export function parseLineageRecord(content: string): LineageRecord | null {
  const parsed = decodeLineageContent(content);
  return parsed.success ? parsed.data : null;
}
