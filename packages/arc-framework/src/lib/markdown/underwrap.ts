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

function checkParagraph(
  params: RuleParams, onError: RuleOnError, start: number, end: number, widths: z.infer<typeof WidthsSchema>,
): void {
  if (params.lines.slice(start, end).some(structuralLine)) return;
  for (let index = start; index < end - 1; index += 1) {
    const line = params.lines[index];
    const next = params.lines[index + 1];
    if (line === undefined || next === undefined || hardBreak(line)) continue;
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
    let quoteDepth = 0;
    for (const token of params.parsers.markdownit.tokens) {
      if (token.type === "blockquote_open") quoteDepth += 1;
      if (token.type === "blockquote_close") quoteDepth -= 1;
      if (token.type !== "paragraph_open" || quoteDepth > 0) continue;
      const [start, end] = token.map;
      if (start !== undefined && end !== undefined) checkParagraph(params, onError, start, end, widths);
    }
  },
};
