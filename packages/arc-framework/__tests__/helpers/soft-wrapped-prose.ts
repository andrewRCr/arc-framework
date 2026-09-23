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
export function indexOfSoftWrappedProse(document: string, phrase: string): number {
  return document.search(softWrappedProse(phrase));
}
