/** Normalize identity-bearing Markdown H2 source for decompose locators. */
export function normalizeDecomposeHeadingSource(source: string): string {
  return source.replace(/[ \t]+/gu, " ").replace(/^[ \t]+|[ \t]+$/gu, "").normalize("NFC");
}
