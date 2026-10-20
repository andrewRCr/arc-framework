/** Field-wise three-way selection for canonical group metadata. */

import { canonicalize } from "../../kernel/canonical/canonical-json.js";
import { RefMetadataSchema, type RefMetadata } from "./metadata.js";
import { mergeLineageAliases } from "./lineage-aliases.js";

/** Merge independent metadata fields, retaining the local value of a competing scalar. */
export function mergeSyncMetadata(base: RefMetadata | undefined, local: RefMetadata, incoming: RefMetadata): { metadata: RefMetadata; conflicts: string[][] } {
  const conflicts: string[][] = [];
  const metadata = RefMetadataSchema.parse(mergeValue(withoutLineageAliases(base), withoutLineageAliases(local), withoutLineageAliases(incoming), [], conflicts));
  const aliases = mergeLineageAliases(base?.lineageFormerSlugs, local.lineageFormerSlugs, incoming.lineageFormerSlugs);
  if (aliases) metadata.lineageFormerSlugs = aliases;
  return { metadata, conflicts };
}

function withoutLineageAliases(metadata: RefMetadata | undefined): RefMetadata | undefined {
  if (!metadata) return undefined;
  const fields = { ...metadata };
  Reflect.deleteProperty(fields, "lineageFormerSlugs");
  return fields;
}

function equal(left: unknown, right: unknown): boolean {
  return left === undefined || right === undefined ? left === right : canonicalize(left) === canonicalize(right);
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function mergeValue(base: unknown, local: unknown, incoming: unknown, path: string[], conflicts: string[][]): unknown {
  if (equal(base, local)) return incoming;
  if (equal(base, incoming) || equal(local, incoming)) return local;
  const current = object(local), remote = object(incoming), previous = object(base);
  if (!current || !remote || current.kind !== remote.kind) { conflicts.push(path); return local; }
  const result: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(previous ?? {}), ...Object.keys(current), ...Object.keys(remote)])) {
    const value = mergeValue(previous?.[key], current[key], remote[key], [...path, key], conflicts);
    if (value !== undefined) result[key] = value;
  }
  return result;
}
