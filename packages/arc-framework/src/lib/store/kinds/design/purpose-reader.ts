/** Raw Purpose fields shared by design artifacts and their presentations. */

import { fromMarkdown } from "mdast-util-from-markdown";

type MarkdownNode = ReturnType<typeof fromMarkdown> | ReturnType<typeof fromMarkdown>["children"][number];

/** Preserve code-span source offsets for presentation over raw Markdown.
 * @param field - Field text whose code spans must remain intact.
 * @returns Code-span start offsets mapped to their exclusive ends.
 */
export function codeSpanEnds(field: string): Map<number, number> {
  const prefix = "Purpose: ";
  const ends = new Map<number, number>();
  const visit = (node: MarkdownNode): void => {
    if (node.type === "inlineCode") {
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (start !== undefined && end !== undefined) ends.set(start - prefix.length, end - prefix.length);
    }
    if ("children" in node) for (const child of node.children) visit(child);
  };
  visit(fromMarkdown(prefix + field));
  return ends;
}

/** Read the first Purpose field from a Markdown paragraph.
 * @param content - Whole design artifact Markdown.
 * @returns The joined raw field, preserving empty and placeholder values, or null when absent.
 */
export function readDesignPurpose(content: string): string | null {
  const paragraph = purposeParagraph(content);
  if (paragraph === null) return null;
  const lines = paragraph.split(/\r?\n/u);
  const values = [(lines[0] ?? "").replace(/^\*\*Purpose:\*\*\s*/u, "")];
  const codeSpans = codeSpanEnds(paragraph);
  let lineStart = 0;
  for (const line of lines.slice(1)) {
    lineStart = paragraph.indexOf("\n", lineStart) + 1;
    const insideCode = [...codeSpans].some(([start, end]) => start <= lineStart && lineStart < end);
    if (!insideCode && /^\*\*[^*]+:\*\*/u.test(line)) break;
    values.push(line.trim());
  }
  return values.join(" ").replace(/\s+/gu, " ").trim();
}

const PURPOSE_FIELD = "**Purpose:**";

/** Locate a real field inside a paragraph rather than in code or HTML.
 *
 * A record's decode calls this for every design document a listing reads, so the document is parsed only as far as
 * the block holding its first candidate field: one with no candidate is not parsed, and a whole parse runs only
 * when that first candidate turns out to sit in code or HTML and another follows.
 */
function purposeParagraph(content: string): string | null {
  const first = nextCandidate(content, 0);
  if (first === -1) return null;
  const blockEnd = content.slice(first).search(/\r?\n[ \t]*\r?\n/u);
  const head = blockEnd === -1 ? content : content.slice(0, first + blockEnd);
  const field = firstField(head);
  if (field !== null || head.length === content.length) return field;
  return nextCandidate(content, first + PURPOSE_FIELD.length) === -1 ? null : firstField(content);
}

/** The next offset at or after `from` where the field's text opens a line or a list item, or -1. */
function nextCandidate(content: string, from: number): number {
  for (let at = content.indexOf(PURPOSE_FIELD, from); at !== -1; at = content.indexOf(PURPOSE_FIELD, at + 1)) {
    const prefix = content.slice(content.lastIndexOf("\n", at - 1) + 1, at);
    if (prefix === "" || prefix === "- ") return at;
  }
  return -1;
}

/** The first field Markdown reads as paragraph text, with its paragraph's remainder. */
function firstField(content: string): string | null {
  const visit = (node: MarkdownNode, paragraphEnd?: number): string | null => {
    const end = node.type === "paragraph" ? node.position?.end.offset : paragraphEnd;
    if (node.type === "strong" && end !== undefined) {
      const start = node.position?.start.offset;
      if (start !== undefined && content.startsWith(PURPOSE_FIELD, start)) {
        const lineStart = content.lastIndexOf("\n", start - 1) + 1;
        const prefix = content.slice(lineStart, start);
        if (prefix === "" || prefix === "- ") return content.slice(start, end);
      }
    }
    if ("children" in node) {
      for (const child of node.children) {
        const field = visit(child, end);
        if (field !== null) return field;
      }
    }
    return null;
  };
  return visit(fromMarkdown(content));
}
