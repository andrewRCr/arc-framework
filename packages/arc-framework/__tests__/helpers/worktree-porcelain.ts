/**
 * Encode readable line-oriented fixture stanzas as Git's exact
 * `worktree list --porcelain -z` protocol.
 */
export function worktreePorcelainZ(presentation: string): string {
  const normalized = presentation.trim();
  if (normalized === "") return "";

  return normalized
    .split(/\n{2,}/u)
    .map((stanza) => `${stanza.split("\n").join("\0")}\0\0`)
    .join("");
}
