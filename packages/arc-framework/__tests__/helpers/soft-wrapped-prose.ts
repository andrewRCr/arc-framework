/** Match prose words in order while allowing one Markdown soft line break between them. */
export function softWrappedProse(phrase: string): RegExp {
  const trimmed = phrase.trim();
  if (trimmed.length === 0) throw new Error("prose assertion must not be empty");
  const words = trimmed.split(/\s+/u);
  const escaped = words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"));
  return new RegExp(escaped.join("(?:[ \\t]+|[ \\t]*\\r?\\n[ \\t]*(?:>[ \\t]*)*)"), "u");
}

/** Preserve source offsets for ordering checks that locate prose anchors. */
export function indexOfSoftWrappedProse(document: string, phrase: string): number {
  return document.search(softWrappedProse(phrase));
}
