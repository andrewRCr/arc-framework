/**
 * Classify extension-point references against the extensions directory.
 *
 * A reference is **resolved** when its `extensionName` matches a known
 * extension file, and **orphaned** otherwise. Orphans surface renamed,
 * removed, or typo'd fire points — a workflow still pointing at a name
 * the directory no longer recognizes.
 *
 * Reference-level granularity: if the same extension is pointed at from
 * two workflows and the file doesn't exist, both references appear in the
 * orphans bucket. Each fire point is independently actionable.
 *
 * @module
 */

import type { ExtensionPointRef } from "./point-scanner.js";

/** Outcome of classifying a batch of refs against a directory listing. */
export interface ExtensionRefClassification {
  resolved: ExtensionPointRef[];
  orphans: ExtensionPointRef[];
}

/**
 * Split references into resolved and orphaned buckets.
 *
 * @param refs - References produced by {@link scanExtensionPoints}.
 * @param extensionNames - Listing of extension filenames (without `.md`).
 * @returns `{ resolved, orphans }` — each bucket preserves input order.
 */
export function classifyExtensionRefs(
  refs: ExtensionPointRef[],
  extensionNames: string[],
): ExtensionRefClassification {
  const known = new Set(extensionNames);
  const resolved: ExtensionPointRef[] = [];
  const orphans: ExtensionPointRef[] = [];
  for (const ref of refs) {
    if (known.has(ref.extensionName)) resolved.push(ref);
    else orphans.push(ref);
  }
  return { resolved, orphans };
}
