/** Shared paragraph eligibility and physical width limits for Markdown prose tooling. */

import { z } from "zod";

/** Parser fields shared by markdown-it and markdownlint's annotated tokens. */
export interface ProseToken {
  readonly type: string;
  readonly nesting: number;
  readonly content: string;
  readonly map?: readonly number[] | null;
  readonly children?: readonly ProseToken[] | null;
  readonly lineNumber?: number;
}

/** An eligible paragraph's zero-based, end-exclusive physical lines and inline source. */
export interface ProseParagraph {
  readonly start: number;
  readonly end: number;
  readonly content: string;
}

/** Validated physical source widths, shared with ARC001. */
export const ProseWidthsSchema = z.object({
  min: z.number().int().positive().default(75),
  max: z.number().int().positive().default(120),
}).refine(widths => widths.min <= widths.max, "min must not exceed max");

/** Paragraphs containing structural fields or rows are outside prose wrapping. */
export function isStructuralProseLine(line: string): boolean {
  const prose = line.replace(/^\s*(?:[-+*]\s+|\d+[.)]\s+)?/u, "");
  return /^\[[^\]]+\]:/u.test(prose)
    || /^\|.*\|\s*$/u.test(prose)
    || /^\*\*[^*]+:\*\*(?:\s|$)/u.test(prose)
    || /^\*\*[^*]+\*\*:(?:\s|$)/u.test(prose)
    || /^\*\*[^*]+\*\*\s*$/u.test(prose);
}

/** Source spelling of an explicit Markdown line break. */
export function isProseHardBreak(line: string): boolean {
  return line.endsWith("  ") || (line.match(/\\+$/u)?.[0].length ?? 0) % 2 === 1;
}

/** Physical HTML-break lines from markdownlint's annotated inline tokens. */
export function htmlProseBreakLines(tokens: readonly ProseToken[]): ReadonlySet<number> {
  const lines = new Set<number>();
  for (const token of tokens) {
    if (token.type !== "inline") continue;
    const children = token.children ?? [];
    for (const [index, child] of children.entries()) {
      if (child.type !== "html_inline" || !/^<br(?:\s|\/?>)/iu.test(child.content)) continue;
      const next = children.slice(index + 1).find(sibling => sibling.nesting !== -1
        && !(sibling.type === "text" && sibling.content.trim() === ""));
      if ((next?.type === "softbreak" || next?.type === "hardbreak") && child.lineNumber !== undefined) {
        lines.add(child.lineNumber);
      }
    }
  }
  return lines;
}

/** Select the same paragraph/list-item spans as ARC001, excluding every blockquote. */
export function proseParagraphs(tokens: readonly ProseToken[]): readonly ProseParagraph[] {
  const paragraphs: ProseParagraph[] = [];
  let quoteDepth = 0;
  for (const [index, token] of tokens.entries()) {
    if (token.type === "blockquote_open") quoteDepth += 1;
    if (token.type === "blockquote_close") quoteDepth -= 1;
    if (token.type !== "paragraph_open" || quoteDepth > 0) continue;
    const [start, end] = token.map ?? [];
    if (start !== undefined && end !== undefined) {
      paragraphs.push({ start, end, content: tokens[index + 1]?.content ?? "" });
    }
  }
  return paragraphs;
}
