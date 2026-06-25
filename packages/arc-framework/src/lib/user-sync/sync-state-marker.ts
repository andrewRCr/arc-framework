/**
 * The sync-state marker entry — the typed per-machine payload the sibling
 * sync-state ref carries, its serialize/parse boundary, and the typed read and
 * write over the ref.
 *
 * Each machine owns one entry, keyed by its `machineId` in the ref's tree (see
 * {@link module:lib/user-sync/sync-state-ref}). The entry records a notes-push
 * attempt — what HEAD it was advancing for, when, and the notes-ref target it
 * was advancing to — everything the consumer surface and the liveness predicate
 * read. The blob is untrusted external data: the parse boundary narrows it from
 * `unknown` and returns `null` on malformed input, never throwing, so a later
 * schema validator can swap in mechanically.
 *
 * @module
 */

import {
  readEntry,
  writeEntry,
  type SyncStateRefIO,
  type SyncStateRefReadIO,
} from "./sync-state-ref.js";

/**
 * A machine's outstanding notes-push intent — minted when a push is attempted,
 * self-invalidated once the notes ref reaches {@link intent}.
 */
export interface SyncStateMarker {
  /** Schema version — bumped on a shape change; reads tolerate and normalize. */
  version: 1;
  /** The writing machine's stable id; the entry's tree key. */
  machineId: string;
  /** The HEAD the notes push was advancing for (→ the short-sha in the consumer surface). */
  lastAttemptedCommit: string;
  /** ISO-8601 timestamp of the attempt (→ "from A's session on <when>"; also the TTL input). */
  attemptTimestamp: string;
  /** The notes-ref target state the push was advancing to — the basis for self-invalidation. */
  intent: string;
}

/**
 * Serialize a marker to its blob form — a normalized field order so a
 * round-trip (and a same-machine re-write) is byte-stable, which the per-key
 * tree-merge relies on to treat identical entries as idempotent.
 */
export function serializeSyncStateMarker(marker: SyncStateMarker): string {
  const normalized: SyncStateMarker = {
    version: 1,
    machineId: marker.machineId,
    lastAttemptedCommit: marker.lastAttemptedCommit,
    attemptTimestamp: marker.attemptTimestamp,
    intent: marker.intent,
  };
  return `${JSON.stringify(normalized, null, 2)}\n`;
}

/**
 * Parse a blob back into a marker, or `null` when it is malformed — never
 * throws. External data is narrowed from `unknown`; a non-object, a wrong
 * version, or any missing/empty required field is rejected at the boundary
 * rather than trusted downstream.
 */
export function deserializeSyncStateMarker(blob: string): SyncStateMarker | null {
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
    || !isNonEmptyString(record.machineId)
    || !isNonEmptyString(record.lastAttemptedCommit)
    || !isNonEmptyString(record.attemptTimestamp)
    || !isNonEmptyString(record.intent)
  ) {
    return null;
  }

  return {
    version: 1,
    machineId: record.machineId,
    lastAttemptedCommit: record.lastAttemptedCommit,
    attemptTimestamp: record.attemptTimestamp,
    intent: record.intent,
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Read one machine's marker from the ref, or `null` when the ref, the key, or
 * the blob's shape is absent/invalid.
 *
 * @param io - Injected read seam and identity.
 * @param machineId - The machine whose entry to read.
 * @returns The parsed marker, or `null` when missing or unparseable.
 */
export async function readSyncStateMarker(
  io: SyncStateRefReadIO,
  machineId: string,
): Promise<SyncStateMarker | null> {
  const blob = await readEntry(io, machineId);
  return blob === null ? null : deserializeSyncStateMarker(blob);
}

/**
 * Write (create or overwrite) this machine's marker into the ref, keyed by
 * `marker.machineId`. Touches only the writer's own key.
 *
 * @param io - Injected git seams (including the stdin-fed writer) and identity.
 * @param marker - The marker to store.
 * @returns The new commit sha.
 */
export async function writeSyncStateMarker(
  io: SyncStateRefIO,
  marker: SyncStateMarker,
): Promise<string> {
  return writeEntry(io, marker.machineId, serializeSyncStateMarker(marker));
}
