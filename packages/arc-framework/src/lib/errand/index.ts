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
  type IdentityConflictInput,
  type IdentityConflictDecision,
  type IdentityConflictResolver,
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
  groomClaimConflictResolver,
  groomAwaitMergeTransform,
  housekeepClaimTransform,
  housekeepClaimConflictResolver,
  identityClaimRollbackTransform,
  rollbackIdentityClaim,
  mintHousekeepDispatchId,
  pinGroomOpenedBaseHead,
  type GroomIdentityRecord,
  type GroomClaimVerdict,
  type GroomAwaitMergeRequest,
  type HousekeepIdentityRecord,
  type HousekeepClaimVerdict,
  type IdentityClaimRollbackParams,
  type IdentityClaimRollbackOutcome,
  type PinGroomOpenedBaseHeadParams,
  type PinGroomOpenedBaseHeadOutcome,
} from "./identity-claims.js";

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
  type OpenErrandParams,
  type OpenErrandResult,
} from "./open.js";

export {
  linkErrandToInbox,
  type LinkErrandToInboxParams,
  type LinkErrandToInboxResult,
} from "./link.js";

export {
  closeErrand,
  type CloseErrandParams,
  type CloseErrandResult,
  type RemoteHeadCleanup,
} from "./close.js";

export {
  retireErrand,
  type RetireErrandParams,
  type RetireErrandResult,
} from "./retire.js";

export {
  promoteErrand,
  type PromoteErrandContext,
  type PromoteErrandFs,
  type PromoteErrandParams,
  type PromoteErrandResult,
  type PromoteFloor,
} from "./promote.js";
