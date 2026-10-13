/** Custom Markdownlint rule for avoidable short soft-wrapped prose lines. */
import type { Rule, RuleOnError, RuleParams } from "markdownlint";
import { z } from "zod";
import { displayWidth } from "./display-width.js";

const WidthsSchema = z.object({
  min: z.number().int().positive().default(75),
  max: z.number().int().positive().default(120),
}).refine(widths => widths.min <= widths.max, "min must not exceed max");

function structuralLine(line: string): boolean {
  const prose = line.replace(/^\s*(?:[-+*]\s+|\d+[.)]\s+)?/u, "");
  return /^\[[^\]]+\]:/u.test(prose)
    || /^\|.*\|\s*$/u.test(prose)
    || /^\*\*[^*]+:\*\*(?:\s|$)/u.test(prose)
    || /^\*\*[^*]+\*\*:(?:\s|$)/u.test(prose)
    || /^\*\*[^*]+\*\*\s*$/u.test(prose);
}

function hardBreak(line: string): boolean {
  return line.endsWith("  ") || (line.match(/\\+$/u)?.[0].length ?? 0) % 2 === 1;
}

function htmlBreakLines(params: RuleParams): ReadonlySet<number> {
  const lines = new Set<number>();
  for (const token of params.parsers.markdownit.tokens) {
    if (token.type !== "inline") continue;
    const children = token.children;
    for (const [index, child] of children.entries()) {
      if (child.type !== "html_inline" || !/^<br(?:\s|\/?>)/iu.test(child.content)) continue;
      const next = children.slice(index + 1).find(sibling => sibling.nesting !== -1
        && !(sibling.type === "text" && sibling.content.trim() === ""));
      if (next?.type === "softbreak" || next?.type === "hardbreak") lines.add(child.lineNumber);
    }
  }
  return lines;
}

function checkParagraph(
  params: RuleParams, onError: RuleOnError, start: number, end: number,
  widths: z.infer<typeof WidthsSchema>, htmlBreaks: ReadonlySet<number>,
): void {
  if (params.lines.slice(start, end).some(structuralLine)) return;
  for (let index = start; index < end - 1; index += 1) {
    const line = params.lines[index];
    const next = params.lines[index + 1];
    if (line === undefined || next === undefined || hardBreak(line) || htmlBreaks.has(index + 1)) continue;
    const word = next.trim().match(/^\S+/u)?.[0];
    const width = displayWidth(line.trimEnd());
    if (word === undefined || width >= widths.min || displayWidth(`${line.trimEnd()} ${word}`) > widths.max) continue;
    onError({
      lineNumber: index + 1,
      detail: `Line is ${width} columns; the next word fits within ${widths.max}.`,
      context: line,
    });
  }
}

/** Lint short non-final paragraph lines without changing source text. */
export const underwrapRule: Rule = {
  names: ["ARC001", "under-wrap"],
  description: "Short prose line can include the next word",
  tags: ["line_length"],
  parser: "markdownit",
  function: (params, onError) => {
    const widths = WidthsSchema.parse(params.config);
    const htmlBreaks = htmlBreakLines(params);
    let quoteDepth = 0;
    for (const token of params.parsers.markdownit.tokens) {
      if (token.type === "blockquote_open") quoteDepth += 1;
      if (token.type === "blockquote_close") quoteDepth -= 1;
      if (token.type !== "paragraph_open" || quoteDepth > 0) continue;
      const [start, end] = token.map;
      if (start !== undefined && end !== undefined) checkParagraph(params, onError, start, end, widths, htmlBreaks);
    }
  },
};
