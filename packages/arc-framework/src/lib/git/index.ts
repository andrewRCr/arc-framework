/**
 * Git domain — executor, identity resolution, user directory portability.
 *
 * @module
 */

export {
  checkGitAvailable,
  isGitRepo,
  gitConfigGet,
  gitConfigSet,
  configureNotesRefspec,
  getCurrentBranch,
  gitMergeFile,
  type ExecResult,
  type GitExec,
  type GitExecOptions,
  type MergeResult,
} from "./exec.js";

export {
  runWorktreeSyncStatus,
  type WorktreeSyncState,
  type WorktreeSyncStatusResult,
  type RunWorktreeSyncStatusOptions,
} from "./worktree-sync.js";

export {
  runDirtyStateStatus,
  type DirtyState,
  type DirtyStateResult,
  type RunDirtyStateStatusOptions,
} from "./dirty-state.js";

export {
  slugifyIdentity,
  resolveIdentity,
  type IdentityOptions,
} from "./identity.js";

export {
  isAllowedFile,
  isExcludedFile,
  serialize,
  deserialize,
  MAX_FILE_SIZE,
  type DirEntry,
  type SyncManifest,
  type SerializeResult,
  type SkipWarning,
} from "./user-sync.js";
