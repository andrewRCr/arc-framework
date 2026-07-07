/**
 * Sync-state generation marker for user-notes compaction.
 *
 * The marker is an advisory seam: siblings may read it to notice that the
 * notes ref was compacted, but correctness stays with the in-band prune
 * manifest carried by the notes tree.
 *
 * @module
 */

import { reconcileSyncStatePush } from "./sync-state-merge.js";
import { readEntry, writeEntry, type SyncStateRefIO, type SyncStateRefReadIO } from "./sync-state-ref.js";

/** Stable sync-state entry key carrying the latest compaction generation. */
export const NOTES_COMPACTION_SYNC_MARKER_KEY = "notes-compaction";

/** Latest compacted generation published as a sync-state hint. */
export interface NotesCompactionSyncMarker {
  version: 1;
  kind: "notes-compaction";
  generation: number;
  preCompactionTip: string;
  snapshotTip: string;
  publishedAt: string;
}

/** Outcome of publishing the advisory marker to origin. */
export type PublishNotesCompactionMarkerOutcome =
  | { kind: "published" }
  | { kind: "reconciled" }
  | { kind: "skipped"; reason: "nothing-to-push" | "no-remote" }
  | { kind: "failed"; error: Error };

/** Serialize a compaction marker in stable field order. */
export function serializeNotesCompactionSyncMarker(marker: NotesCompactionSyncMarker): string {
  return `${JSON.stringify({
    version: 1,
    kind: "notes-compaction",
    generation: marker.generation,
    preCompactionTip: marker.preCompactionTip,
    snapshotTip: marker.snapshotTip,
    publishedAt: marker.publishedAt,
  }, null, 2)}\n`;
}

/** Parse a compaction marker blob, returning null for malformed external data. */
export function deserializeNotesCompactionSyncMarker(blob: string): NotesCompactionSyncMarker | null {
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
    || record.kind !== "notes-compaction"
    || !isPositiveSafeInteger(record.generation)
    || !isObjectId(record.preCompactionTip)
    || !isObjectId(record.snapshotTip)
    || !isParseableTimestamp(record.publishedAt)
  ) {
    return null;
  }
  return {
    version: 1,
    kind: "notes-compaction",
    generation: record.generation,
    preCompactionTip: record.preCompactionTip,
    snapshotTip: record.snapshotTip,
    publishedAt: record.publishedAt,
  };
}

/** Read the advisory compaction marker from the sync-state ref. */
export async function readNotesCompactionSyncMarker(
  io: SyncStateRefReadIO,
): Promise<NotesCompactionSyncMarker | null> {
  const blob = await readEntry(io, NOTES_COMPACTION_SYNC_MARKER_KEY);
  return blob === null ? null : deserializeNotesCompactionSyncMarker(blob);
}

/** Write the marker locally without pushing. */
export async function writeNotesCompactionSyncMarker(
  io: SyncStateRefIO,
  marker: NotesCompactionSyncMarker,
): Promise<string> {
  return writeEntry(io, NOTES_COMPACTION_SYNC_MARKER_KEY, serializeNotesCompactionSyncMarker(marker));
}

/** Write and reconcile-push the advisory compaction marker. */
export async function publishNotesCompactionSyncMarker(
  io: SyncStateRefIO,
  marker: NotesCompactionSyncMarker,
): Promise<PublishNotesCompactionMarkerOutcome> {
  try {
    await writeNotesCompactionSyncMarker(io, marker);
    const outcome = await reconcileSyncStatePush(io, NOTES_COMPACTION_SYNC_MARKER_KEY);
    switch (outcome.kind) {
      case "pushed":
        return { kind: "published" };
      case "reconciled":
        return { kind: "reconciled" };
      case "noop":
        return { kind: "skipped", reason: "nothing-to-push" };
      case "no-remote":
        return { kind: "skipped", reason: "no-remote" };
      case "failed":
        return { kind: "failed", error: outcome.error };
    }
  } catch (err) {
    return { kind: "failed", error: err instanceof Error ? err : new Error(String(err)) };
  }
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isObjectId(value: unknown): value is string {
  return typeof value === "string" && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(value);
}

function isParseableTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !Number.isNaN(Date.parse(value));
}
