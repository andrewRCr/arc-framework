/**
 * User subcommand public surface.
 *
 * Keeps the stable `commands/user.ts` import path while the implementation is
 * split into smaller internal modules.
 */

export { runUserAdd } from "./user/add.js";
export {
  findNearestUserNote,
  listBackupFiles,
  runUserLoad,
  runUserSave,
} from "./user/save-load.js";
export {
  runUserSessionInitStatus,
  buildUserStatusResult,
  computeUnsavedDirection,
  hasLocalNotes,
  hasRemoteNotes,
  inspectUserSyncState,
  runUserFetch,
  runUserPull,
  runUserPush,
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
  UserSaveError,
  type InspectUserSyncOptions,
  type UserAddOptions,
  type UserFetchOptions,
  type UserIOContext,
  type UserLoadOptions,
  type UserLoadResult,
  type UserPullOptions,
  type UserPushOptions,
  type UserSaveOptions,
  type UserSaveResult,
  type UserSessionInitState,
  type UserSessionInitStatusOptions,
  type UserSessionInitStatusResult,
  type UserStatusHeadline,
  type UserStatusOptions,
  type UserStatusRemoteIdentity,
  type UserStatusResult,
  type UserSyncDiskState,
  type UserSyncRefState,
  type UserSyncState,
  type UserUnsavedDirection,
} from "./user/types.js";
