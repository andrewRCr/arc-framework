/** Additive identity evidence for lineage lookup, separate from direct owner resolution. */
import type { RefMetadata } from "./metadata.js";
import type { Slug } from "../../kernel/schema/slug.js";

type LineageAliases = NonNullable<RefMetadata["lineageFormerSlugs"]>;

/** Union already authenticated names per generation without merging distinct owners. */
export function mergeLineageAliases(...sources: readonly (Readonly<LineageAliases> | undefined)[]): LineageAliases | undefined {
  const names = new Map<string, Set<Slug>>();
  for (const source of sources) for (const [uid, aliases] of Object.entries(source ?? {})) {
    if (!aliases.length) continue;
    const held = names.get(uid) ?? new Set<Slug>();
    for (const alias of aliases) held.add(alias);
    names.set(uid, held);
  }
  return names.size ? Object.fromEntries([...names].sort(([left], [right]) => left.localeCompare(right))
    .map(([uid, aliases]) => [uid, [...aliases].sort()])) : undefined;
}
