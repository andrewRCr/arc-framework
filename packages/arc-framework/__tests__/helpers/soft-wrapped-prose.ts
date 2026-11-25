/** Match prose words across soft line breaks without changing quote indentation. */
export function softWrappedProse(phrase: string): RegExp {
  const trimmed = phrase.trim();
  if (trimmed.length === 0) throw new Error("prose assertion must not be empty");
  const words = trimmed.split(/\s+/u);
  const escaped = words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"));
  const plainSeparator = "(?:[ \\t]+|[ \\t]*\\r?\\n[ \\t]*(?!>))";
  const quoteSeparator = "(?:[ \\t]+|[ \\t]*\\r?\\n\\k<quoteIndent>>[ \\t]*(?!>))";
  const plain = `(?<!^[ \\t]*>[^\\r\\n]*)${escaped.join(plainSeparator)}`;
  const quoted = `(?<=^(?<quoteIndent>[ \\t]*)>[ \\t]*[^\\r\\n]*)(?<!^[ \\t]*>[ \\t]*>[^\\r\\n]*)${escaped.join(quoteSeparator)}`;
  const headingOrigin = "(?<!^[ \\t]*(?:>[ \\t]*)?#{1,6}[ \\t]+[^\\r\\n]*)";
  return new RegExp(`${headingOrigin}(?:${plain}|${quoted})`, "mu");
}

/** Preserve source offsets for ordering checks that locate prose anchors. */
export function indexOfSoftWrappedProse(document: string, phrase: string, fromIndex = 0): number {
  const prose = softWrappedProse(phrase);
  const search = new RegExp(prose.source, `${prose.flags}g`);
  search.lastIndex = fromIndex;
  return search.exec(document)?.index ?? -1;
}

/**
 * Compile prose patterns whose `\s+` tokens separate words, preserving regex syntax and flags.
 * @param pattern - Prose pattern with explicit cross-section spans where required.
 * @returns A matcher that keeps word separators within one Markdown prose block.
 */
export function softWrappedPattern(pattern: RegExp): RegExp {
  const blockStart = "(?:[-+*]|\\d+[.)])[ \\t]|#{1,6}(?:[ \\t]|$)|`{3,}|~{3,}|>";
  const blockOrigin = "(?<!(?:^|[\\r\\n])[ \\t]*(?:>|#{1,6}[ \\t])[^\\r\\n]*)";
  const continuation = `${blockOrigin}[ \\t]*\\r?\\n[ \\t]*(?![ \\t\\r\\n]|${blockStart})`;
  const separator = `(?:[ \\t]+|${continuation})`;
  return new RegExp(pattern.source.replaceAll("\\s+", separator), pattern.flags);
}
