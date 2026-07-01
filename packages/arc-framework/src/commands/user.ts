/**
 * User subcommand public surface.
 *
 * Keeps the stable `commands/user.ts` import path while the implementation is
 * split into smaller internal modules.
 */

export { runUserAdd } from "./user/add.js";
export { runUserClose } from "./user/close.js";
export { runUserInboxRemove } from "./user/inbox-remove.js";
export {
  findStaleUserWuSubdirs,
  listUserWuSubdirContents,
  removeStaleUserWuSubdir,
  runUserOpen,
} from "./user/open.js";
export {
  findNearestUserNote,
  hashSyncManifest,
  listBackupFiles,
  reconcileRetiredSubdirsStandalone,
  runUserLoad,
  runUserSave,
} from "./user/save-load.js";
export {
  clearErrandPartialPushMarker,
  clearPartialPushMarker,
  readLocalSyncState,
  recordErrandPartialPushMarker,
  recordPartialPushMarker,
} from "../lib/user-sync/index.js";
export {
  hasLocalNotes,
  hasRemoteNotes,
  reconcileNotesPush,
  runUserFetch,
  runUserPull,
  runUserPush,
  type NotesPushOutcome,
  type ReconcileNotesPushOptions,
} from "./user/push-fetch.js";
export { runPairedPush } from "./user/paired-push.js";
export {
  runUserSessionInitStatus,
  buildUserStatusResult,
  computeUserSyncSpine,
  formatWorktreeQualifierLine,
  inspectUserSyncRefsDetailed,
  inspectUserSyncState,
  runUserStatus,
} from "./user/sync-status.js";
export {
  computeUnsavedDirection,
  hasUnpushedLocalDrift,
  hasUnpushedLocalDriftForScope,
  missingFilesAreIntentionalRetirement,
  resolveCleanArmNotesVerdict,
  unsavedDirectionForScope,
  type CleanArmNotesVerdict,
  type DriftScope,
} from "./user/drift.js";
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
  type UserOpenOptions,
  type PairedPushLegOutcome,
  type PairedPushMarkerContext,
  type PairedPushMarkerPublisher,
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
