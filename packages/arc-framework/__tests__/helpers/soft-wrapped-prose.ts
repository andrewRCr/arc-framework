/** Match prose words across soft line breaks within the same blockquote context. */
export function softWrappedProse(phrase: string): RegExp {
  const trimmed = phrase.trim();
  if (trimmed.length === 0) throw new Error("prose assertion must not be empty");
  const words = trimmed.split(/\s+/u);
  const escaped = words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"));
  const plainSeparator = "(?:[ \\t]+|[ \\t]*\\r?\\n[ \\t]*(?!>))";
  const quoteSeparator = "(?:[ \\t]+|[ \\t]*\\r?\\n[ \\t]*>[ \\t]*(?!>))";
  const plain = `(?<!^[ \\t]*>[^\\r\\n]*)${escaped.join(plainSeparator)}`;
  const quoted = `(?<=^[ \\t]*>[ \\t]*[^\\r\\n]*)(?<!^[ \\t]*>[ \\t]*>[^\\r\\n]*)${escaped.join(quoteSeparator)}`;
  return new RegExp(`(?:${plain}|${quoted})`, "mu");
}

/** Preserve source offsets for ordering checks that locate prose anchors. */
export function indexOfSoftWrappedProse(document: string, phrase: string): number {
  return document.search(softWrappedProse(phrase));
}
