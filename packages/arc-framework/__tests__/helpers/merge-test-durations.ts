/** Merge disjoint native results from writer shards into one duration file per tier. */
import { z } from "zod";

const nativeResults = z.object({ version: z.string(), results: z.array(z.tuple([
  z.string(), z.object({ duration: z.unknown(), failed: z.boolean() }),
])) });

/**
 * Merge each writer shard's fresh native results, refusing overlapping membership.
 * @param documents - Tier-labelled native results files
 * @returns One native results document per tier
 */
export function mergeTestDurations(documents: readonly { tier: string; content: string }[]): Record<string, string> {
  const tiers = new Map<string, { version: string; results: Map<string, { duration: unknown; failed: boolean }> }>();
  const membership = new Set<string>();
  for (const document of documents) {
    const parsed = nativeResults.parse(JSON.parse(document.content));
    const tier = tiers.get(document.tier) ?? { version: parsed.version, results: new Map() };
    tiers.set(document.tier, tier);
    for (const [key, value] of parsed.results) {
      if (membership.has(key)) throw new Error(`Overlapping duration membership: ${key}`);
      membership.add(key);
      tier.results.set(key, value);
    }
  }
  return Object.fromEntries([...tiers].map(([name, tier]) => [name,
    JSON.stringify({ version: tier.version, results: [...tier.results] })]));
}

/**
 * Update a handed input with fresh writer results, keeping every entry the writers did not measure.
 * @param base - The handed native results per tier; an empty string is a tier with no recorded results
 * @param writers - Merged writer results per tier
 * @returns One native results document per tier in either
 */
export function overlayTestDurations(base: Readonly<Record<string, string>>,
  writers: Readonly<Record<string, string>>): Record<string, string> {
  const tiers: Record<string, string> = { ...base };
  for (const [name, content] of Object.entries(writers)) {
    const fresh = nativeResults.parse(JSON.parse(content));
    const handed = base[name] ?? "";
    const results = new Map(handed.trim().length === 0 ? [] : nativeResults.parse(JSON.parse(handed)).results);
    for (const [key, value] of fresh.results) results.set(key, value);
    tiers[name] = JSON.stringify({ version: fresh.version, results: [...results] });
  }
  return tiers;
}
