/** Tolerant header fields shared by all stored task-list forms. */

/** The task list's sibling design reference, independent of structural admission. */
export interface ParsedTaskListRecord { readonly design: string | null }

/** Read the Design filename above the first phase heading without rejecting content.
 * @param content - Whole task-list Markdown.
 * @returns The header reference with code delimiters removed, or null when absent.
 */
export function parseTaskListRecord(content: string): ParsedTaskListRecord {
  const header = content.split(/^##[ \t]+\*\*Phase[ \t]+/mu, 1)[0] ?? "";
  const match = /^-[ \t]+\*\*Design:\*\*[ \t]*(.*)$/mu.exec(header);
  return { design: match?.[1]?.replaceAll("`", "").trim() || null };
}
