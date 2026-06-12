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

export { parseCrossWuEntries, shapeForFile } from "./parser.js";

export { readRecentUserNotes, CROSS_WU_NOTE_WINDOW, type RecentNote } from "./notes-ref.js";

export {
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
  collectNotesWuNames,
  planRetiredSubdirReconcile,
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
  clearPartialPushMarker,
  getUserInternalDir,
  readLocalSyncState,
  recordPartialPushMarker,
  writeLocalSyncState,
  type LocalSyncState,
  type PartialPushMarker,
} from "./sync-state.js";

export type { CrossWuEntry, CrossWuShape, EntryParse } from "./types.js";
