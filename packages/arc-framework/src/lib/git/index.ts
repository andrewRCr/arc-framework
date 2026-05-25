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
  gitConfigUnset,
  configureNotesRefspec,
  getCurrentBranch,
  gitMergeFile,
  type ExecResult,
  type GitConfigScope,
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
  runWorktreeRoster,
  type WorktreeRosterEntry,
  type WorktreeRosterFs,
  type WorktreeRosterResult,
  type WorktreeRosterState,
  type RunWorktreeRosterOptions,
} from "./worktree-roster.js";

export {
  runDirtyStateStatus,
  type DirtyState,
  type DirtyStateResult,
  type RunDirtyStateStatusOptions,
} from "./dirty-state.js";

export {
  isRefusalCondition,
  runPushabilityStatus,
  type AccessFn,
  type PushabilityCondition,
  type PushabilityConditionKind,
  type PushabilityDisposition,
  type PushabilityResult,
  type PushabilityTarget,
  type RunPushabilityStatusOptions,
} from "./pushability.js";

export {
  runHeadHashStatus,
  type HeadHashResult,
  type RunHeadHashStatusOptions,
} from "./head-hash.js";

export { shortHash } from "./short-hash.js";

export {
  resolveWorktreeLocation,
  type WorktreeLocationParams,
} from "./worktree-location.js";

export {
  slugifyIdentity,
  resolveIdentity,
  type IdentityOptions,
} from "./identity.js";

export {
  isAllowedFile,
  isExcludedFile,
  isSafeManifestPath,
  serialize,
  deserialize,
  MAX_FILE_SIZE,
  type DirEntry,
  type SyncManifest,
  type SerializeResult,
  type SkipWarning,
} from "./user-sync.js";
