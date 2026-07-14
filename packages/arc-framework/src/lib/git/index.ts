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
  getCurrentBranch,
  gitMergeFile,
  type ExecResult,
  type GitConfigScope,
  type GitExec,
  type GitExecInput,
  type GitExecOptions,
  type MergeResult,
} from "./exec.js";

export {
  countAheadBehindRef,
  runWorktreeSyncStatus,
  type WorktreeSyncState,
  type WorktreeSyncStatusResult,
  type RunWorktreeSyncStatusOptions,
} from "./worktree-sync.js";

export {
  runBaseDistanceStatus,
  type BaseDistanceStatusResult,
  type RunBaseDistanceStatusOptions,
} from "./base-distance.js";

export {
  filterCommitsReachableFromHead,
  reduceCommitsToCausallyMaximal,
} from "./ancestry.js";

export {
  detectSupersession,
  type SupersessionResult,
  type DetectSupersessionOptions,
} from "./supersession.js";

export {
  runWorktreeRoster,
  filterRosterByIdentity,
  resolvePrimaryWorktreePath,
  resolveWorktreePathsByBranch,
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
  detectForeignArtifactOverlap,
  preferRemoteBaseRef,
  projectInFlightToOverlapRoster,
  type ForeignArtifactDetectionOptions,
  type ForeignArtifactDetectionResult,
  type ForeignArtifactIndeterminateProbe,
  type ForeignArtifactOverlap,
  type ForeignArtifactSkippedEntry,
  type ForeignArtifactSkippedReason,
  type OverlapCandidateEntry,
  type OverlapRoster,
} from "./foreign-artifact-detection.js";

export {
  listLiveRemoteBranches,
  readLiveRemoteHeads,
  listPrunedRemoteTrackingBranches,
  fetchRefBounded,
  readMetaAtRef,
  type ListLiveRemoteBranchesOptions,
  type LiveRemoteHeadsResult,
  type ReadLiveRemoteHeadsOptions,
  type ListPrunedRemoteTrackingBranchesOptions,
  type FetchRefBoundedOptions,
  type ReadMetaAtRefOptions,
} from "./remote-ref-reader.js";

export {
  deriveInFlight,
  type DeriveInFlightOptions,
  type InFlightEntry,
  type InFlightWorkUnit,
  type InFlightErrand,
  type InFlightInputSnapshot,
  type InFlightState,
  type OpenPrSignal,
  type PrSource,
} from "./in-flight-derivation.js";

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
  resolveWorktreeIdentity,
  type WorktreeIdentity,
} from "./worktree-identity.js";

export {
  readWorktreeMarker,
  stampWorktreeHusk,
  writeWorktreeMarker,
  writeWorktreeOwnershipMarker,
  resolveWorktreeMarkerPath,
  isWorktreeMarker,
  type WorktreeMarker,
  type WorktreeHuskStamp,
  type WorktreeHuskStampResult,
  type WorktreeMarkerReadResult,
  type WorktreeSubject,
  type WriteWorktreeOwnershipMarkerOptions,
} from "./worktree-marker.js";

export {
  scaffoldIntoWorktree,
  type SpawnWorktreeContext,
  type ScaffoldWorktreeParams,
  type WorktreeLifePhase,
} from "./worktree-scaffold.js";

export {
  decideWorktreeCleanup,
  type WorktreeCleanupContext,
  type WorktreeCleanupDecision,
  type WorktreeCleanupInputs,
} from "./worktree-cleanup.js";

export {
  assessReapSafety,
  isContainedIn,
  isLandedInBase,
  type AssessReapSafetyParams,
  type ReapSafety,
} from "./branch-containment.js";

export {
  slugifyIdentity,
  resolveIdentity,
  type IdentityOptions,
} from "./identity.js";

export {
  classifyPathSurface,
  classifyWriteContext,
  resolveWriteContext,
  type PathSurface,
  type WriteContext,
  type WriteContextInput,
  type ResolveWriteContextOptions,
} from "./write-context.js";

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
