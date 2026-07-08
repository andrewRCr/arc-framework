/**
 * Pure retention policy for user-notes compaction.
 *
 * @module
 */

import { CROSS_WU_NOTE_WINDOW } from "./notes-ref.js";
import type { NotesCompactionPair } from "./compaction-manifest.js";

/** Newest note entries retained regardless of age. */
export const COMPACTION_NEWEST_RETAIN_COUNT = CROSS_WU_NOTE_WINDOW;

/** Retired work stays out of pruning until this many days after archival. */
export const COMPACTION_PRUNE_AGE_DAYS = 30;

/** Backup refs are retained until a later verified compaction, for at least this many days. */
export const COMPACTION_BACKUP_RETENTION_DAYS = 30;

/** Ref-history length where status/session-init suggests manual compaction. */
export const COMPACTION_ADVISORY_HISTORY_THRESHOLD = 2000;

/** A note entry plus the policy facts needed to retain or prune it. */
export interface RetentionPolicyNoteEntry extends NotesCompactionPair {
  /** Timestamp used to rank newest entries. Invalid or absent timestamps rank oldest. */
  committedAt: string | null;
  /** WU slugs represented by per-WU files in the note. */
  workUnitNames: readonly string[];
  /** Archival timestamp/date for represented retired work, or null when not archived. */
  archivedAt: string | null;
  /** Whether any represented WU is still in flight. */
  inFlight: boolean;
  /** Legacy root `SESSION-NOTES.md` note. These prune regardless of other retention arms. */
  preMigrationRootSessionNotes: boolean;
}

/** Inputs for the pure retention decision. */
export interface DecideNotesCompactionRetentionInput {
  entries: readonly RetentionPolicyNoteEntry[];
  now: string;
  newestRetainCount?: number;
  pruneAgeDays?: number;
}

/** The retained/pruned partition consumed by the snapshot writer. */
export interface NotesCompactionRetentionDecision {
  retained: RetentionPolicyNoteEntry[];
  pruned: RetentionPolicyNoteEntry[];
}

/** Partition entries by the compaction retention policy. */
export function decideNotesCompactionRetention(
  input: DecideNotesCompactionRetentionInput,
): NotesCompactionRetentionDecision {
  const newestRetainCount = input.newestRetainCount ?? COMPACTION_NEWEST_RETAIN_COUNT;
  const pruneAgeMs = (input.pruneAgeDays ?? COMPACTION_PRUNE_AGE_DAYS) * 24 * 60 * 60 * 1000;
  const nowMs = Date.parse(input.now);
  if (!Number.isFinite(nowMs)) {
    throw new Error(`decideNotesCompactionRetention: invalid \`now\` timestamp: ${input.now}`);
  }
  const newest = new Set(
    [...input.entries]
      .sort(compareByRecency)
      .filter((entry) => !entry.preMigrationRootSessionNotes)
      .slice(0, newestRetainCount)
      .map(pairKey),
  );

  const retained: RetentionPolicyNoteEntry[] = [];
  const pruned: RetentionPolicyNoteEntry[] = [];

  for (const entry of [...input.entries].sort(compareByRecency)) {
    if (entry.preMigrationRootSessionNotes) {
      pruned.push(entry);
      continue;
    }
    if (newest.has(pairKey(entry)) || entry.inFlight || isWithinAgeGate(entry, nowMs, pruneAgeMs)) {
      retained.push(entry);
    } else {
      pruned.push(entry);
    }
  }
  return { retained, pruned };
}

function isWithinAgeGate(entry: RetentionPolicyNoteEntry, nowMs: number, pruneAgeMs: number): boolean {
  if (entry.archivedAt === null) return false;
  const archivedAtMs = Date.parse(entry.archivedAt);
  if (Number.isNaN(archivedAtMs)) return false;
  return nowMs - archivedAtMs < pruneAgeMs;
}

function compareByRecency(left: RetentionPolicyNoteEntry, right: RetentionPolicyNoteEntry): number {
  const leftTime = timestampForSort(left.committedAt);
  const rightTime = timestampForSort(right.committedAt);
  if (leftTime !== rightTime) return rightTime - leftTime;
  return left.commit.localeCompare(right.commit);
}

function timestampForSort(value: string | null): number {
  if (value === null) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

function pairKey(pair: NotesCompactionPair): string {
  return `${pair.blob}\0${pair.commit}`;
}
