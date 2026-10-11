/** Structured decoding of cohort Purpose and authoritative Parent fields. */
import { SlugSchema, type Slug } from "../../../kernel/index.js";
import { readDesignPurpose } from "../design/index.js";

/** Parsed prose and nesting identity from a cohort document. */
export interface ParsedCohortDocument { readonly purpose: string | null; readonly parent: Slug | null }
/** Content fields or a diagnostic-preserving structural refusal. */
export type CohortDocumentParseResult = { success: true; data: ParsedCohortDocument } | { success: false; error: string };

/** Read Purpose and the single allowed Parent line from a cohort document.
 * @param content - Whole cohort-document Markdown.
 * @returns Parsed fields, or a refusal for a duplicate or invalid Parent.
 */
export function parseCohortDocument(content: string): CohortDocumentParseResult {
  const parentLines = content.split(/\r?\n/u).filter((line) => line.startsWith("**Parent:**"));
  if (parentLines.length > 1) return { success: false, error: "Parent: expected at most one line." };
  const value = parentLines[0]?.slice("**Parent:**".length).trim();
  let parent: Slug | null = null;
  if (value !== undefined && value !== "[none]") {
    const match = /^`([^`]+)`$/u.exec(value);
    const parsed = SlugSchema.safeParse(match?.[1]);
    if (!parsed.success) return { success: false, error: "Parent: expected [none] or one backticked slug." };
    parent = parsed.data;
  }
  return { success: true, data: { purpose: readDesignPurpose(content), parent } };
}
