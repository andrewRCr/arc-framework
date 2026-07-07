/**
 * In-band metadata for user-notes compaction snapshots.
 *
 * The manifest lives as a non-note tree entry inside the notes ref. It records
 * every `(blob, annotated commit)` pair deliberately pruned so lagging siblings
 * can adopt a snapshot without re-exporting retained-history sediment.
 *
 * @module
 */

const GIT_OBJECT_ID_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;

/** Reserved tree path for the in-band compaction manifest. Not a git-note object id. */
export const NOTES_COMPACTION_MANIFEST_PATH = ".arc-user-notes-compaction-manifest.json";

/** A note-tree pair: note blob object id plus annotated commit object id. */
export interface NotesCompactionPair {
  blob: string;
  commit: string;
}

/** The persisted manifest carried inside compacted notes-ref snapshots. */
export interface NotesCompactionManifest {
  version: 1;
  /** Monotonic generation number; absent manifests are generation zero. */
  generation: number;
  /** Notes-ref tip compacted by this generation, or null for an absent prior ref. */
  preCompactionTip: string | null;
  /** Cumulative deliberately-pruned `(blob, commit)` set through this generation. */
  pruned: NotesCompactionPair[];
}

/** Inputs for deriving the next manifest from a previous one plus this compaction's prunes. */
export interface BuildNextNotesCompactionManifestInput {
  previous: NotesCompactionManifest | null;
  preCompactionTip: string | null;
  pruned: readonly NotesCompactionPair[];
}

/** Build the next cumulative compaction manifest. */
export function buildNextNotesCompactionManifest(
  input: BuildNextNotesCompactionManifestInput,
): NotesCompactionManifest {
  const generation = (input.previous?.generation ?? 0) + 1;
  const pairs = new Map<string, NotesCompactionPair>();
  for (const pair of [...(input.previous?.pruned ?? []), ...input.pruned]) {
    if (!isObjectId(pair.blob) || !isObjectId(pair.commit)) continue;
    pairs.set(pairKey(pair), { blob: pair.blob, commit: pair.commit });
  }
  return {
    version: 1,
    generation,
    preCompactionTip: isObjectId(input.preCompactionTip) ? input.preCompactionTip : null,
    pruned: [...pairs.values()].sort(comparePairs),
  };
}

/** Serialize the manifest with stable field order and a trailing newline. */
export function serializeNotesCompactionManifest(manifest: NotesCompactionManifest): string {
  return `${JSON.stringify({
    version: 1,
    generation: manifest.generation,
    preCompactionTip: manifest.preCompactionTip,
    pruned: [...manifest.pruned].sort(comparePairs),
  } satisfies NotesCompactionManifest, null, 2)}\n`;
}

/** Parse a manifest blob, returning null for malformed, unsupported, or unsafe content. */
export function deserializeNotesCompactionManifest(blob: string): NotesCompactionManifest | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(blob);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const record = parsed as Record<string, unknown>;
  if (
    record.version !== 1
    || !isPositiveInteger(record.generation)
    || !(record.preCompactionTip === null || isObjectId(record.preCompactionTip))
    || !Array.isArray(record.pruned)
  ) {
    return null;
  }

  const pruned: NotesCompactionPair[] = [];
  for (const entry of record.pruned) {
    if (typeof entry !== "object" || entry === null) return null;
    const pair = entry as Record<string, unknown>;
    if (!isObjectId(pair.blob) || !isObjectId(pair.commit)) return null;
    pruned.push({ blob: pair.blob, commit: pair.commit });
  }

  return {
    version: 1,
    generation: record.generation,
    preCompactionTip: record.preCompactionTip,
    pruned: uniqueSortedPairs(pruned),
  };
}

/** Whether a note pair is listed in a manifest's cumulative pruned set. */
export function isPairPrunedByManifest(
  manifest: NotesCompactionManifest,
  pair: NotesCompactionPair,
): boolean {
  const key = pairKey(pair);
  return manifest.pruned.some((entry) => pairKey(entry) === key);
}

function isObjectId(value: unknown): value is string {
  return typeof value === "string" && GIT_OBJECT_ID_PATTERN.test(value);
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === "number" && value >= 1;
}

function pairKey(pair: NotesCompactionPair): string {
  return `${pair.blob}\0${pair.commit}`;
}

function comparePairs(left: NotesCompactionPair, right: NotesCompactionPair): number {
  const byCommit = left.commit.localeCompare(right.commit);
  return byCommit === 0 ? left.blob.localeCompare(right.blob) : byCommit;
}

function uniqueSortedPairs(pairs: NotesCompactionPair[]): NotesCompactionPair[] {
  const unique = new Map(pairs.map((pair) => [pairKey(pair), pair]));
  return [...unique.values()].sort(comparePairs);
}
