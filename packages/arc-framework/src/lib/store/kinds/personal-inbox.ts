/** Personal inbox grammar and the interim title-keyed reader. */
import { basename } from "node:path";
import { resolveArcPath } from "../../layout/index.js";
import { SlugSchema } from "../../kernel/schema/slug.js";
import { matchInboxEntryTitle } from "./entry-fields.js";
import type { EntryParse } from "../../user-sync/schema.js";

/** Drop comment examples before compatibility parsing.
 * @param content - Markdown with opaque guidance comments.
 * @returns Visible Markdown.
 */
export function stripHtmlComments(content: string): string { return content.replace(/<!--[\s\S]*?-->/gu, ""); }
/** Read personal captures with the existing title-keyed outcomes until the deletion pass.
 * @param content - Personal inbox document.
 * @returns Per-entry success or a diagnostic in section order.
 */
export function parsePersonalInboxEntries(content: string): EntryParse[] {
  const label = basename(resolveArcPath({ kind: "inbox", scope: { kind: "identity", identity: SlugSchema.parse("display") } }), ".md");
  const visible = stripHtmlComments(content).split("\n");
  const outcomes: EntryParse[] = [];
  for (const section of ["Errand", "Work Unit"] as const) {
    const start = visible.findIndex((line) => line.trimEnd() === `## ${section}`);
    if (start < 0) continue;
    const tail = visible.slice(start + 1);
    const boundary = tail.findIndex((line) => line.trimEnd().startsWith("## ") || line.trimEnd() === "---");
    const body = boundary < 0 ? tail : tail.slice(0, boundary);
    let block: string[] = [];
    const flush = (): void => {
      if (block.length === 0) return;
      const raw = block.join("\n").replace(/^\n+/u, "").replace(/\n+$/u, "");
      const heading = block[0] ?? "";
      const key = matchInboxEntryTitle(heading);
      outcomes.push(key === null ? { ok: false, reason: `${label} ${section} entry missing bold title: ${heading.trim()}` }
        : { ok: true, entry: { section, key, raw } });
    };
    for (const line of body) {
      if (/^###\s/u.test(line)) { flush(); block = [line]; }
      else if (block.length > 0) block.push(line);
    }
    flush();
  }
  return outcomes;
}
