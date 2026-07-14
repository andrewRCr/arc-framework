/**
 * Pure content relations between local and remote user-notes trees.
 *
 * @module
 */

import {
  pairKey,
  type NotesCompactionManifest,
  type NotesCompactionPair,
} from "./compaction-manifest.js";

/** Content relation between two notes trees after compaction exclusions. */
export type NoteSetRelation =
  | "remote-subset"
  | "local-subset"
  | "equal"
  | "mixed-uncontested"
  | "conflicting";

/** One side of a notes-tree comparison. */
export interface NoteSetSnapshot {
  entries: readonly NotesCompactionPair[];
  manifest: NotesCompactionManifest | null;
}

/**
 * Resolve the pruned note pairs excluded from comparison and union operations.
 *
 * The newer compaction generation is authoritative. Local wins a generation
 * tie because neither side then proves a later compaction boundary.
 *
 * @param localManifest - Manifest carried by the local notes tree.
 * @param remoteManifest - Manifest carried by the remote notes tree.
 * @returns Pair keys excluded by the authoritative compaction manifest.
 */
export function resolveExcludedNotePairKeys(
  localManifest: NotesCompactionManifest | null,
  remoteManifest: NotesCompactionManifest | null,
): ReadonlySet<string> {
  const authoritative = remoteManifest !== null
    && remoteManifest.generation > (localManifest?.generation ?? 0)
    ? remoteManifest
    : localManifest;
  return new Set(authoritative?.pruned.map(pairKey) ?? []);
}

/**
 * Classify two notes trees by their non-pruned `(commit, blob)` pairs.
 *
 * @param local - Local notes entries and compaction manifest.
 * @param remote - Remote notes entries and compaction manifest.
 * @returns Exactly one five-way content relation.
 */
export function classifyNoteSetRelation(
  local: NoteSetSnapshot,
  remote: NoteSetSnapshot,
): NoteSetRelation {
  const excluded = resolveExcludedNotePairKeys(local.manifest, remote.manifest);
  const localPairs = uniqueIncludedPairs(local.entries, excluded);
  const remotePairs = uniqueIncludedPairs(remote.entries, excluded);

  if (hasContestedCommit(localPairs.values(), remotePairs.values())) {
    return "conflicting";
  }

  const localOnly = [...localPairs.keys()].some((key) => !remotePairs.has(key));
  const remoteOnly = [...remotePairs.keys()].some((key) => !localPairs.has(key));
  if (!localOnly && !remoteOnly) return "equal";
  if (localOnly && !remoteOnly) return "remote-subset";
  if (!localOnly && remoteOnly) return "local-subset";
  return "mixed-uncontested";
}

function uniqueIncludedPairs(
  entries: readonly NotesCompactionPair[],
  excluded: ReadonlySet<string>,
): Map<string, NotesCompactionPair> {
  const included = new Map<string, NotesCompactionPair>();
  for (const entry of entries) {
    const key = pairKey(entry);
    if (!excluded.has(key)) included.set(key, entry);
  }
  return included;
}

function hasContestedCommit(
  local: Iterable<NotesCompactionPair>,
  remote: Iterable<NotesCompactionPair>,
): boolean {
  const localBlobs = new Map<string, Set<string>>();
  for (const entry of local) {
    const blobs = localBlobs.get(entry.commit) ?? new Set<string>();
    blobs.add(entry.blob);
    localBlobs.set(entry.commit, blobs);
  }
  for (const entry of remote) {
    const blobs = localBlobs.get(entry.commit);
    if (blobs !== undefined && [...blobs].some((blob) => blob !== entry.blob)) return true;
  }
  return false;
}
