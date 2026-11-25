/** Tolerant header fields shared by all stored task-list forms. */
import { z } from "zod";

/** Runtime narrowing for a task list's decoded fields. */
export const ParsedTaskListRecordSchema = z.strictObject({ design: z.string().nullable() });

/** The task list's sibling design reference, independent of structural admission. */
export type ParsedTaskListRecord = Readonly<z.infer<typeof ParsedTaskListRecordSchema>>;

/** Read the Design filename above the first phase heading without rejecting content.
 * @param content - Whole task-list Markdown.
 * @returns The header reference with code delimiters removed, or null when absent.
 */
export function parseTaskListRecord(content: string): ParsedTaskListRecord {
  const lines = content.split(/\r?\n/u);
  const phase = lines.findIndex((line) => /^##\s+\*\*Phase\s+/u.test(line));
  const header = lines.slice(0, phase < 0 ? undefined : phase).join("\n");
  const match = /^-[ \t]+\*\*Design:\*\*[ \t]*(.*)$/mu.exec(header);
  return { design: match?.[1]?.replaceAll("`", "").trim() || null };
}
