/**
 * User subcommand public surface.
 *
 * Keeps the stable `commands/user.ts` import path while the implementation is
 * split into smaller internal modules.
 */

export { runUserAdd } from "./user/add.js";
export { runUserClose } from "./user/close.js";
export {
  findStaleUserWuSubdirs,
  listUserWuSubdirContents,
  removeStaleUserWuSubdir,
  runUserOpen,
} from "./user/open.js";
export {
  clearPartialPushMarker,
  findNearestUserNote,
  hashSyncManifest,
  listBackupFiles,
  readLocalSyncState,
  recordPartialPushMarker,
  runUserLoad,
  runUserSave,
} from "./user/save-load.js";
export {
  hasLocalNotes,
  hasRemoteNotes,
  runUserFetch,
  runUserPull,
  runUserPush,
} from "./user/push-fetch.js";
export { runPairedPush } from "./user/paired-push.js";
export {
  runUserSessionInitStatus,
  buildUserStatusResult,
  computeUserSyncSpine,
  computeUnsavedDirection,
  formatWorktreeQualifierLine,
  inspectUserSyncRefsDetailed,
  inspectUserSyncState,
  runUserStatus,
} from "./user/sync-status.js";
export {
  buildLoadSummary,
  buildSaveSummary,
  buildUserSessionInitStatusSummary,
  buildUserStatusSummary,
} from "./user/format.js";
export {
  BACKUP_FILENAME,
  UserPushBlockedError,
  UserSaveError,
  UserSaveVerificationError,
  type InspectUserSyncOptions,
  type UserAddOptions,
  type UserFetchOptions,
  type UserIOContext,
  type UserLoadOutcome,
  type UserLoadOptions,
  type UserLoadResult,
  type UserCloseOptions,
  type UserLoadWalkExhausted,
  type UserOpenOptions,
  type PairedPushLegOutcome,
  type PairedPushNotesContext,
  type PairedPushNotesOutcome,
  type PairedPushNotesPusher,
  type PairedPushNotesPusherResult,
  type PairedPushResult,
  type PairedPushSaveOutcome,
  type PairedPushSkipReason,
  type RunPairedPushOptions,
  type UserPullOptions,
  type UserPushOptions,
  type UserPushResult,
  type UserSaveOptions,
  type UserSaveResult,
  type UserSessionInitState,
  type UserSessionInitStatusOptions,
  type UserSessionInitStatusResult,
  type UserStatusHeadline,
  type UserStatusOptions,
  type UserStatusRemoteIdentity,
  type UserStatusResult,
  type UserSyncCoherenceState,
  type UserSyncDiskState,
  type UserSyncRefState,
  type UserSyncSpine,
  type UserSyncState,
  type UserUnsavedDirection,
} from "./user/types.js";
