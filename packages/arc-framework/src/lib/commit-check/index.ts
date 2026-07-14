/** Public commit-message validation contracts. */

export {
  COMMIT_CHECK_DEFAULTS,
  readCommitCheckConfiguration,
  resolveCommitCheckPolicy,
} from "./config.js";
export { createFilesystemArtifactResolver } from "./artifact-resolver.js";
export { createCommitCheckContext } from "./context.js";

export type {
  CommitCheckArtifactFamily,
  CommitCheckArtifactReference,
  CommitCheckArtifactResolution,
  CommitCheckArtifactResolver,
  CommitCheckConfiguration,
  CommitCheckConfigurationKey,
  CommitCheckConfigurationLocation,
  CommitCheckContext,
  CommitCheckContextInput,
  CommitCheckDetailValue,
  CommitCheckExemptionReason,
  CommitCheckFinding,
  CommitCheckFindingCode,
  CommitCheckFindingDetail,
  CommitCheckLocation,
  CommitCheckMessageLineLocation,
  CommitCheckOutcome,
  CommitCheckPolicy,
  CommitCheckPolicyResolution,
  CommitCheckRepositoryState,
  CommitCheckRole,
  CommitCheckSeverity,
  CommitCheckSkippedOutcome,
  CommitCheckValidatedOutcome,
  CommitCheckVerdict,
  CommitCheckWholeMessageLocation,
  CommitMessageFormat,
  ContextFooterMode,
} from "./types.js";
