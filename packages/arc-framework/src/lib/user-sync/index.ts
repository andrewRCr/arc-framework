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
  readNoteContentAtAnnotatedCommit,
  readRecentUserNotes,
  CROSS_WU_NOTE_WINDOW,
  type RecentNote,
} from "./notes-ref.js";

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
  mergeEntries,
  mergeCrossWuFile,
  type MergeNote,
  type MergeResult,
} from "./merge.js";

export { projectManifest } from "./projection.js";

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
