/** Custom Markdownlint rule for avoidable short soft-wrapped prose lines. */
import type { Rule, RuleOnError, RuleParams } from "markdownlint";
import type { z } from "zod";
import { ProseWidthsSchema, htmlProseBreakLines, isProseHardBreak, isStructuralProseLine, proseParagraphs } from "./prose-scope.js";
import { displayWidth } from "./display-width.js";
import { nextLineProseAtoms } from "./prose-tokens.js";

function checkParagraph(
  params: RuleParams, onError: RuleOnError, start: number, end: number,
  widths: z.infer<typeof ProseWidthsSchema>, htmlBreaks: ReadonlySet<number>,
): void {
  if (params.lines.slice(start, end).some(isStructuralProseLine)) return;
  const words = nextLineProseAtoms(params.lines.slice(start, end));
  for (let index = start; index < end - 1; index += 1) {
    const line = params.lines[index];
    const next = params.lines[index + 1];
    if (line === undefined || next === undefined || isProseHardBreak(line) || htmlBreaks.has(index + 1)) continue;
    const word = words[index - start];
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
    const widths = ProseWidthsSchema.parse(params.config);
    const htmlBreaks = htmlProseBreakLines(params.parsers.markdownit.tokens);
    for (const { start, end } of proseParagraphs(params.parsers.markdownit.tokens)) {
      checkParagraph(params, onError, start, end, widths, htmlBreaks);
    }
  },
};
