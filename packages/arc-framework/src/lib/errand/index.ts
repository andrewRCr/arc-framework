/**
 * Errand domain — the errand record model, the orphan state-ref read/write
 * primitives, and the per-slug tree-merge backing the errand lifecycle.
 *
 * @module
 */

export {
  errandsRef,
  type ErrandRecordIO,
  type GitExecInput,
} from "./ref-tree.js";

export {
  serializeErrandRecord,
  deserializeErrandRecord,
  readErrandRecord,
  listErrandRecords,
  listErrandRecordsResult,
  writeErrandRecord,
  removeErrandRecord,
  type ErrandRecord,
  type ErrandOrigin,
  type ListErrandRecordsResult,
  ErrandRecordReadError,
  type ErrandRecordReadFailure,
} from "./record.js";

export {
  TransientIdentityRecordV3Schema,
  TransientIdentityRecordSchema,
  mintClaimId,
  serializeTransientIdentityRecord,
  deserializeTransientIdentityRecord,
  projectLocusIdentity,
  type TransientIdentityRecordV3,
  type TransientIdentityRecord,
  type TransientIdentityDecodeResult,
  type TransientIdentityOperation,
  LegacyIdentityOperationError,
  assertTransientIdentityOperation,
} from "./identity-record.js";

export {
  readTransientIdentitySnapshot,
  readTransientIdentitySnapshotAtRef,
  type IdentitySnapshotIO,
  type IdentitySnapshotDiagnostic,
  type TransientIdentitySnapshot,
} from "./identity-snapshot.js";

export {
  reconcileIdentityObjects,
  transactTransientIdentities,
  type IdentityObjectReconcile,
  type IdentityTransformDecision,
  type IdentityTransform,
  type IdentityTransactionParams,
  type IdentityTransactionOutcome,
} from "./identity-transaction.js";

export {
  ordinaryErrandTransform,
  provePauseHead,
  type OrdinaryErrandRecord,
  type PauseHeadEvidence,
  type ProvePauseHeadParams,
  type ProvePauseHeadOutcome,
  type AwaitMergeConfiguredCoordinates,
  type OrdinaryErrandTransition,
  type OrdinaryErrandTransform,
} from "./identity-transitions.js";

export {
  groomClaimTransform,
  groomAwaitMergeTransform,
  groomResumeTransform,
  groomSettleTransform,
  rollbackGroomResumeTransform,
  housekeepAwaitMergeTransform,
  housekeepClaimTransform,
  identityClaimRollbackTransform,
  rollbackIdentityClaim,
  pinGroomOpenedBaseHead,
  type GroomIdentityRecord,
  type GroomClaimVerdict,
  type GroomAwaitMergeRequest,
  type GroomResumeRequest,
  type GroomSettleRequest,
  type SettledPartialGroomRecord,
  type HousekeepAwaitMergeRequest,
  type HousekeepIdentityRecord,
  type HousekeepClaimVerdict,
  type IdentityClaimRollbackParams,
  type IdentityClaimRollbackOutcome,
  type PinGroomOpenedBaseHeadParams,
  type PinGroomOpenedBaseHeadOutcome,
} from "./identity-claims.js";

export {
  createGhChangeRequestLifecyclePort,
  evaluateChangeRequestReentry,
  transientTailRetirementTransform,
  type ChangeRequestLifecycleConfiguration,
  type ChangeRequestLifecycleTruth,
  type ChangeRequestLifecycleEvidence,
  type ChangeRequestLifecyclePort,
  type ChangeRequestReentryVerdict,
  type TransientIdentityTailRecord,
  type TransientTailRetirementRequest,
} from "./change-request-lifecycle.js";

export {
  mergeErrandTrees,
  reconcileErrandPush,
  incomingErrandRef,
  type ErrandTreeMerge,
  type ErrandPushOutcome,
} from "./merge.js";

export {
  ERRAND_BRANCH_TYPES,
  DEFAULT_ERRAND_BRANCH_TYPE,
  isErrandBranchType,
  type ErrandBranchType,
} from "./branch-type.js";

export {
  openErrand,
  openOrdinaryErrand,
  type OpenErrandParams,
  type OpenErrandResult,
  type OpenOrdinaryErrandDependencies,
  type OpenOrdinaryErrandOptions,
} from "./open.js";

export {
  linkErrandToInbox,
  linkOrdinaryErrand,
  type LinkErrandToInboxParams,
  type LinkErrandToInboxResult,
  type LinkOrdinaryErrandDependencies,
  type LinkOrdinaryErrandOptions,
} from "./link.js";

export {
  linkOrdinaryErrandAtRuntime,
  type LinkOrdinaryErrandRuntimeOptions,
} from "./link-runtime.js";

export {
  leaveOrdinaryErrand,
  type LeaveAuthorization,
  type LeaveCleanupResult,
  type LeaveOrdinaryErrandDependencies,
  type LeaveOrdinaryErrandOptions,
} from "./leave.js";

export {
  leaveOrdinaryErrandAtRuntime,
  type LeaveOrdinaryErrandRuntimeOptions,
} from "./leave-runtime.js";

export {
  prepareMaterializedBranch,
  type PrepareMaterializedBranchOptions,
  type PrepareMaterializedBranchResult,
} from "./materialize-branch.js";

export {
  closeErrand,
  closeLegacyErrand,
  type CloseErrandParams,
  type CloseErrandResult,
  type RemoteHeadCleanup,
} from "./close.js";

export {
  closeOrdinaryErrand,
  type CloseInboxResult,
  type CloseOrdinaryErrandDependencies,
  type CloseOrdinaryErrandOptions,
  type CloseRefCleanupResult,
} from "./close-locus.js";

export {
  cleanupOrdinaryErrandRefs,
  closeOrdinaryErrandAtRuntime,
  type CloseOrdinaryErrandRuntimeOptions,
} from "./close-runtime.js";

export {
  promoteOrdinaryErrand,
  type PromoteOrdinaryErrandDependencies,
  type PromoteOrdinaryErrandOptions,
  type PromotionFrameReceipt,
  type PromotionFrameResult,
  type PromoteFloor,
} from "./promote.js";

export {
  promoteOrdinaryErrandAtRuntime,
  type PromoteOrdinaryErrandRuntimeOptions,
} from "./promote-runtime.js";
