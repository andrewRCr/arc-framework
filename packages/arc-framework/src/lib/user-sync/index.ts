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

export type { CrossWuEntry, CrossWuShape, EntryParse } from "./types.js";
