/**
 * User-sync inference domain — pure helpers for classifying user-notes-ref
 * divergence and related signals.
 *
 * @module
 */

export {
  inferUserSyncCause,
  SAVED_AT_RECENCY_THRESHOLD_MS,
  type InferUserSyncCauseInput,
  type InferUserSyncCauseOutput,
  type UserSyncCause,
  type UserSyncCauseConfidence,
  type UserSyncRefRelation,
} from "./inference.js";

export { classifyUserSyncPath, wuNameOfPath, type UserSyncClass } from "./classifier.js";

export { resolveCurrentWuName, type ExecForBranch } from "./current-wu.js";

export { matchInboxEntryTitle, parseCrossWuEntries, shapeForFile } from "./parser.js";

export { removeInboxEntry, type RemoveInboxEntryResult } from "./inbox-writer.js";

export {
  listAnnotatedNoteCommits,
  listNoteEntries,
  listNoteTreeEntries,
  notePathToCommit,
  parseNotesHistoryNameStatus,
  readNoteContentAtAnnotatedCommit,
  readRecentUserNotes,
  CROSS_WU_NOTE_WINDOW,
  CROSS_WU_NOTE_WINDOW_MS,
  NOTES_COMPACTION_SNAPSHOT_MESSAGE,
  type NoteEntry,
  type RecentNote,
} from "./notes-ref.js";

export {
  adoptCompactedNotesRef,
  compactNotesRefSnapshot,
  readNotesCompactionManifest,
  type AdoptCompactedNotesRefInput,
  type AdoptCompactedNotesRefResult,
  type CompactNotesRefSnapshotInput,
  type CompactNotesRefSnapshotResult,
} from "./compaction.js";

export {
  NOTES_COMPACTION_MANIFEST_PATH,
  buildNextNotesCompactionManifest,
  deserializeNotesCompactionManifest,
  isPairPrunedByManifest,
  serializeNotesCompactionManifest,
  type NotesCompactionManifest,
  type NotesCompactionPair,
} from "./compaction-manifest.js";

export {
  classifyNoteSetRelation,
  resolveExcludedNotePairKeys,
  type NoteSetRelation,
  type NoteSetSnapshot,
} from "./note-set-relation.js";

export {
  COMPACTION_ADVISORY_HISTORY_THRESHOLD,
  COMPACTION_BACKUP_RETENTION_DAYS,
  COMPACTION_NEWEST_RETAIN_COUNT,
  COMPACTION_PRUNE_AGE_DAYS,
  decideNotesCompactionRetention,
  type DecideNotesCompactionRetentionInput,
  type NotesCompactionRetentionDecision,
  type RetentionPolicyNoteEntry,
} from "./compaction-retention.js";

export {
  inspectNotesCompactionAdvisory,
  type NotesCompactionAdvisory,
} from "./compaction-advisory.js";

export {
  NOTES_COMPACTION_SYNC_MARKER_KEY,
  deserializeNotesCompactionSyncMarker,
  publishNotesCompactionSyncMarker,
  readNotesCompactionSyncMarker,
  serializeNotesCompactionSyncMarker,
  writeNotesCompactionSyncMarker,
  type NotesCompactionSyncMarker,
  type PublishNotesCompactionMarkerOutcome,
} from "./compaction-marker.js";

export {
  isCasRejectionError,
  isNonFastForwardError,
  isRemoteUnavailableError,
  isResolvedNoteValid,
  incomingNotesRef,
  incomingFetchRefspec,
  notesMergeArgs,
} from "./notes-merge.js";

export {
  appendRemovalTombstones,
  appendRemovalTombstonesFromEntries,
  mergeEntries,
  mergeCrossWuFile,
  TOMBSTONE_TTL_MS,
  type MergeNote,
  type MergeResult,
  type RemovalTombstoneBasisEntry,
} from "./merge.js";

export { projectManifest } from "./projection.js";

export {
  getMaterializedBaselineStampPath,
  readMaterializedBaselineStamp,
  writeMaterializedBaselineStamp,
  type MaterializedBaselineEntry,
  type MaterializedBaselineFile,
  type MaterializedBaselineStamp,
} from "./materialized-baseline.js";

export {
  ARC_PER_WU_FILENAMES,
  planRetiredSubdirReconcile,
  stashedFilesInSubdir,
  subdirsFromPaths,
  type PreservedReason,
  type PreservedSubdir,
  type RetiredSubdirPlan,
  type RetiredSubdirPlanInput,
} from "./retired-subdir.js";

export {
  classifyOrphans,
  type ClassifyOrphansInput,
  type OrphanClassification,
} from "./orphan-classification.js";

export {
  clearErrandPartialPushMarker,
  clearPartialPushMarker,
  getOrCreateMachineId,
  getUserInternalDir,
  isComparableSourceCommit,
  NO_COMPARABLE_SOURCE_COMMIT,
  readLocalSyncState,
  recordErrandPartialPushMarker,
  recordPartialPushMarker,
  writeLocalSyncState,
  type LocalSyncState,
  type PartialPushMarker,
} from "./sync-state.js";

export {
  syncStateRef,
  incomingSyncStateRef,
  readEntries,
  readEntry,
  writeEntry,
  pushSyncStateRef,
  fetchSyncStateRef,
  type SyncStateRefIO,
  type SyncStateRefReadIO,
} from "./sync-state-ref.js";

export {
  serializeSyncStateMarker,
  deserializeSyncStateMarker,
  syncStateMarkerKey,
  evaluateMarkerLiveness,
  isMarkerExpired,
  SYNC_STATE_MARKER_TTL_DAYS,
  readSyncStateMarker,
  writeSyncStateMarker,
  type SyncStateMarker,
  type MarkerLiveness,
  type AncestryResolver,
} from "./sync-state-marker.js";

export {
  mergeSyncStateEntries,
  reconcileSyncStatePush,
  MAX_RECONCILE_ATTEMPTS,
  type SyncStatePushOutcome,
} from "./sync-state-merge.js";

export {
  publishSyncStateMarker,
  type PublishSyncStateMarkerInput,
  type PublishSyncStateMarkerOutcome,
  type PublishSkipReason,
} from "./sync-state-publish.js";

export {
  acquireAdvisoryLock,
  releaseAdvisoryLock,
  getNotesLockPath,
  AdvisoryLockTimeoutError,
  type AdvisoryLockHandle,
  type AdvisoryLockOptions,
  type IsProcessAliveFn,
} from "./notes-lock.js";

export type { CrossWuEntry, CrossWuShape, EntryParse } from "./types.js";
