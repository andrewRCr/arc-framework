/** Strict CLI composition for delivery execution services. */

import { access, mkdir, readdir, readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { z } from "zod";

import {
  declareCliOperandSite,
  declareCliOptionSite,
  declareInteractionSite,
  type CommandInputDeclaration,
} from "../lib/command-input/declaration.js";
import type { InteractionContext } from "../lib/command-input/interaction-context.js";
import type { CommandInputRegistration } from "../lib/command-input/registry.js";
import { readConfigSettings } from "../lib/config/status-reader.js";
import { parseMetaFile } from "../lib/active/meta-reader.js";
import { workUnitPathTreatmentContext } from "../lib/base-drift/current-adapters.js";
import {
  closeDeliveryEligibilityForPublication,
  deriveDeliveryMemberLifecycleRevalidation,
  deriveDeliveryRewriteLifecycleRevalidation,
  executeWithFreshDeliveryEligibility,
  prepareDeliveryEligibility,
  type DeliveryEligibilitySnapshot,
} from "../lib/delivery/eligibility.js";
import {
  compareGitNormalizedDeliveryTrees,
  inspectDeliveryAuthoringCheckout,
  inspectDeliveryCandidateCheckout,
  observeDeliveryEligibilityRef,
} from "../lib/delivery/git-eligibility.js";
import {
  readGitDeliveryLifecycleArtifactsAtRef,
  revalidateDeliveryLifecycleContribution,
} from "../lib/delivery/git-lifecycle-contribution.js";
import { CurrentDeliveryLifecycleContributionPathSource } from "../lib/delivery/lifecycle-contribution.js";
import { observeRepositoryDeliveryPosition } from "../lib/session-init/delivery-position-facts.js";
import { projectDeliveryContributionEndpoints } from "../lib/delivery/contribution-proof.js";
import {
  proveGitDeliveryContribution,
  proveGitDeliveryProviderRefreshContribution,
} from "../lib/delivery/git-contribution-proof.js";
import { observeGitDeliveryLandingResult } from "../lib/delivery/git-landing-result.js";
import {
  deleteDeliveryRemoteRef,
  deleteDeliveryLocalRef,
  deleteDeliveryCandidateRef,
  deleteDeliveryRefreshCandidateRef,
  observeDeliveryLocalRef,
  observeDeliveryMemberRefCheckouts,
  observeDeliveryRefreshCandidateRefs,
  observeDeliveryRemoteRef,
  publishDeliveryMemberRef,
  publishDeliveryTopRef,
  rebindDeliveryCandidateRef,
  rewriteDeliveryLocalRef,
  rewriteDeliveryMemberRef,
} from "../lib/delivery/git-materialization.js";
import { closeoutCompletedDelivery } from "../lib/delivery/closeout.js";
import { GitDeliveryRenameTransitionSource } from "../lib/delivery/plan-resolution.js";
import {
  bindInitialDeliveryRef,
  bindInitialDeliveryRequest,
  deriveDeliveryMaterialization,
  materializeBoundDeliveryChain,
  publishDeliveryRequests,
  resolveDeliveryPublicationPresentations,
  type DeliveryMaterializationPlan,
  type DeliveryPublicationPresentations,
} from "../lib/delivery/materialization.js";
import { adoptGitDeliveryChain } from "../lib/delivery/chain-adoption.js";
import {
  absorbGitDeliveryChain,
  preflightGitDeliveryChainAbsorption,
} from "../lib/delivery/chain-absorption.js";
import { DeliveryPlanV1Codec } from "../lib/delivery/plan.js";
import {
  deriveDeliveryPosition,
  resolveDeliveryPredecessorHead,
  routeDeliveryPosition,
} from "../lib/delivery/position.js";
import { RepositoryDeliveryPlanStore, RepositoryDeliveryStateStore } from "../lib/delivery/local-stores.js";
import { inspectRepositoryDeliveryEntry as inspectRepositoryDeliveryEntryAt } from
  "../lib/delivery/repository-entry.js";
import {
  deriveDeliveryResidueLocators,
  observeDeliveryGateCheckout,
  removeDeliveryGateCheckout,
} from "../lib/delivery/residue-reaping.js";
import {
  DeliveryCanonicalDigestSchema,
  DeliveryChangeRequestV1Schema,
  DeliveryMergePolicyBindingV1Schema,
  DeliveryOperationSnapshotV1Schema,
  DeliveryPlanIdSchema,
  DeliveryPlanV1Schema,
  DeliveryStateV1Schema,
  type DeliveryMergePolicyBindingV1,
  type DeliveryStateV1,
} from "../lib/delivery/schema.js";
import {
  applyDeliveryLanding,
  DeliveryLandingRefusalSchema,
  DeliveryRecoveryResultV1Schema,
  prepareDeliveryLanding,
  reconcileDeliveryExecution,
} from "../lib/delivery/landing.js";
import {
  adoptExternalDeliverySuffixRefresh,
  executeDeliverySuffixRewrite,
  findExactPendingSelectedRefresh,
  settleReservedDeliverySuffixRefresh,
  type DeliveryProviderRefreshMovement,
} from "../lib/delivery/suffix-reconciliation.js";
import {
  deriveDeliveryProviderRefreshSubject,
  observeDeliveryProviderRefresh,
  type DeliveryProviderRefreshSubject,
} from "../lib/delivery/provider-refresh-observation.js";
import {
  executeDeliveryProviderRefresh,
  type DeliveryProviderRefreshPublishedHead,
} from "../lib/delivery/provider-refresh-execution.js";
import { planDeliverySuffixRefresh } from "../lib/delivery/refresh.js";
import {
  advanceDeliveryReviewFixResponse,
  acknowledgeDeliveryReviewFixVerification,
  carryDeliveryReviewFixPublicBoundary,
  planDeliveryReviewFixRoute,
  projectDeliveryReviewFixVerificationAcknowledgement,
  publishSelectedDeliveryReviewFix,
  recordDeliveryReviewFixCandidateVerification,
} from "../lib/delivery/review-fix.js";
import { projectDeliveryReviewFixVerificationContinuation } from
  "../lib/delivery/review-fix-verification.js";
import {
  classifyDeliveryReviewFixAuthoringReadiness,
  pendingDeliveryReviewFixAuthorityIsCurrent,
  pendingDeliveryReviewFixCanResumeFromIntegrationStatus,
  projectDeliveryReviewFixContinuation,
  selectDurableDeliveryReviewFixResponseReplay,
  selectDurableLocalDeliveryReviewFixAcknowledgementReplay,
  selectPendingDeliveryReviewFixAuthority,
} from
  "../lib/delivery/review-fix-continuation.js";
import {
  createDeliveryReviewFixCandidatePair,
  observeDeliveryReviewFixCandidateGate,
  prepareDeliveryReviewFixCandidateGate,
  resetDeliveryReviewFixCandidateGate,
} from "../lib/delivery/review-fix-candidate-gate.js";
import {
  classifyDeliveryReviewFixReviewStatusStop,
  driveDeliveryReviewFixContinuation,
  isDeliveryReviewFixDispatchStep,
  type DeliveryReviewFixDriveDispatchAction,
  type DeliveryReviewFixDriveProgress,
  type DeliveryReviewFixDriveStep,
} from "../lib/delivery/review-fix-driver.js";
import {
  classifyDeliveryReviewFixStagedRecords,
  deliveryReviewFixRecordDigest,
  isDeliveryReviewFixRecordCommitMessage,
  isDeliveryReviewFixVerificationResponseAppend,
  reconstructDeliveryReviewFixExpectedRecords,
  settleDeliveryReviewFixRecordEffects,
  type DeliveryReviewFixExpectedRecord,
} from
  "../lib/delivery/review-fix-record-effects.js";
import { createDeliveryReviewFixReleaseEffectPorts } from
  "./delivery-review-fix-release-effects.js";
import {
  inspectDeliveryPlanLocus,
  type DeliveryEntryInspectionResult,
  DeliveryCorrectionDerivationSchema,
} from "../lib/delivery/entry-inspection.js";
import { validateDeliveryStateAgainstPlan } from "../lib/delivery/state.js";
import {
  completeDeliverySuffixMutationTail,
  DeliveryPendingVerificationSupersessionIdentitySchema,
  executeFreshDeliverySuffixRematerialization,
} from "../lib/delivery/suffix-rematerialization.js";
import {
  deliveryTeardownAcceptedBaseRefs,
  matchesDeliveryTeardownRequest,
  teardownLandedDeliveryMember,
} from "../lib/delivery/teardown.js";
import {
  applyDeliveryTopRemedy,
  classifyDeliveryTopRemedyObservation,
  matchesDeliveryTopRemedyTrigger,
} from "../lib/delivery/top-remedy.js";
import {
  assessDeliveryTerminalTop,
  rebindDeliveryTerminalCoordinates,
  type DeliveryTerminalCandidateRebindAuthority,
} from "../lib/delivery/terminal-integration.js";
import {
  degradePlannedDeliveryNativeStack,
  deriveDeliveryNativeTarget,
  linkPlannedDeliveryNativeStack,
  observeDeliveryNativeStack,
} from "../lib/delivery/native-stack.js";
import {
  deriveNativeDeliveryMemberChain,
  deriveNativeDeliveryRegisteredRemainder,
  reconcileLinkedNativeDeliverySuffix,
  reconcileReservedNativeDeliveryMerge,
  reserveNativeDeliveryLanding,
  selectNativeDeliveryLandingArm,
  submitReservedNativeDeliveryMerge,
  type DeliveryNativeEffectFacts,
} from "../lib/delivery/native-landing.js";
import {
  GitCommonStateAccessError,
  RepositoryGitCommonStatePublisher,
} from "../lib/git-common-state.js";
import { isGitProcessError } from "../lib/git/process-error.js";
import {
  canonicalDigest,
  canonicalize,
  SlugSchema,
  sortByCanonicalBytes,
  validateManagedPath,
} from "../lib/kernel/index.js";
import { resolveActiveWu } from "../lib/release/wu-resolution.js";
import { resolveTaskListCursor } from "../lib/task-list/cursor.js";
import { resolveTaskListPath } from "../commands/active/status.js";
import { buildLifecycleIndex } from "../lib/work-unit/lifecycle-index.js";
import { readAncestry } from "../lib/work-unit/git-decomposition-object-readers.js";
import {
  readCandidateRecord,
  readCandidateRecordVersioned,
  resolveCandidateRecordRelativePath,
  writeCandidateRecord,
} from "../lib/work-unit/candidate-record-store.js";
import {
  projectGitCandidateEffectiveTarget,
  resolveGitCandidateTargetBase,
} from "../lib/work-unit/git-candidate-effective-target.js";
import {
  collectGitCandidateTarget,
  collectUnstagedReviewablePaths,
  resolveGitCandidateBaseRevision,
} from "../lib/work-unit/git-candidate-subject.js";
import {
  parseCandidateManagedRecord,
  projectCandidateCurrentness,
  reduceCandidateDurableBaseline,
} from "../lib/work-unit/candidate-attestation.js";
import {
  readSubmissionBoundary,
  readSubmissionBoundaryVersioned,
  resolveSubmissionBoundaryPath,
  writeSubmissionBoundary,
} from "../lib/work-unit/submission-boundary-store.js";
import { parseIntegrationBoundaryLocus } from
  "../scripts/review-gate/policy/integration-boundary-locus.js";
import { createGitExec, createRawGitExec } from "../lib/io-context.js";
import { resolveGitCommonDir } from "../lib/user-sync/repo-shared-paths.js";
import type { GitExec } from "../lib/git/exec.js";
import { analyzeRevisionOverlap } from "../lib/git/base-overlap.js";
import { GhDeliveryHostPort } from "../scripts/delivery/hosts/github.js";
import { GhDeliveryProviderRefreshPort } from "../scripts/delivery/hosts/github-refresh.js";
import { deliveryProviderGhRunner } from "../scripts/delivery/provider-process.js";
import { releaseMergeLock } from "../scripts/review-gate/merge-lock.js";
import { evaluateReviewReadiness } from "../scripts/review-gate/readiness.js";
import { MergeMethodSchema, resolveMergeMethod } from "../scripts/review-gate/merge-method.js";
import {
  assessDeliveryLandingReviewReadiness,
  createDeliveryLandingSetReviewReadiness,
} from
  "../scripts/review-gate/delivery-landing-readiness.js";
import { createGhMergeMethodPolicyPort } from "../scripts/review-gate/hosts/github/merge-method.js";
import { RepositoryDeliveryMemberLookup } from "../scripts/review-gate/hosts/local/delivery-member-lookup.js";
import { LocalApprovedDispositionRecordStore } from
  "../scripts/review-gate/hosts/local/disposition-record-store.js";
import { LocalReviewOperationStateStore } from
  "../scripts/review-gate/hosts/local/operation-state-store.js";
import { parseReviewSourceReference } from
  "../scripts/review-gate/core/review-source-reference.js";
import { RespondEnvelopeSchema } from
  "../scripts/review-gate/core/review-command-envelope.js";
import { HostedFindingsResponsePlanSchema } from
  "../scripts/review-gate/core/response-plan-schema.js";
import { settleLaneAttempt } from "../scripts/review-gate/lane-progress.js";
import { projectGitReviewContributionApplicability } from
  "../scripts/review-gate/policy/git-review-contribution-applicability.js";
import { createRespondDependencies } from
  "../scripts/review-gate/runtime/respond-composition.js";
import { RespondCommandError, RespondRequestSchema, respondToReviewCommand } from
  "../scripts/review-gate/runtime/respond-command.js";
import { hostedGhRunner } from "../scripts/review-gate/hosted/gh-process.js";
import {
  createReviewStatusPort,
  resolveReviewStatusForWorkUnit,
} from "../scripts/review-gate/status-composition.js";
import { ReviewStatusResultSchema } from "../scripts/review-gate/status.js";
import { defaultMergeLockPort } from "./review.js";
import { resolveCandidateMutationOwner } from "./candidate-mutation-owner.js";
import { inspectActiveRepositoryDeliveryEntry } from "./delivery-entry.js";
import { requireArcProjectRoot, resolveUserIdentity } from "./shared.js";
import { ResolveDeliveryStatusActionSchema, ContinuePublicationActionSchema } from
  "../scripts/review-gate/policy/integration-boundary-locus.js";

const GitObjectIdSchema = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u);
const RefSchema = z.string().startsWith("refs/");
const CandidateSchema = z.strictObject({ deliverableId: DeliveryCanonicalDigestSchema, ref: RefSchema });
const CoordinateSchema = z.strictObject({ head: GitObjectIdSchema, tree: GitObjectIdSchema });
const ReviewFixVerificationSchema = z.strictObject({
  memberDeliverableIds: z.array(DeliveryCanonicalDigestSchema).min(1),
  tier1Required: z.literal(true),
  target: CoordinateSchema,
  tier1Reuse: z.strictObject({
    kind: z.literal("exact-tree"),
    targetTree: GitObjectIdSchema,
    requiredResult: z.literal("passed"),
    coveredInputs: z.literal("unchanged"),
  }),
});
const ReviewFixAuthoringAuthoritySchema = z.strictObject({
  repository: z.string().min(1),
  remote: z.string().min(1).default("origin"),
  derivedFrom: DeliveryCorrectionDerivationSchema,
  route: z.literal("provider-refresh"),
  affectedDeliverableIds: z.array(DeliveryCanonicalDigestSchema).min(1),
  requiredAncestorHeads: z.array(GitObjectIdSchema).min(1),
  requiredFindingPaths: z.array(z.string().min(1)),
});
const ReviewFixAuthoringRebindSchema = ReviewFixAuthoringAuthoritySchema.extend({
  planId: DeliveryPlanIdSchema,
  selectedDeliverableId: DeliveryCanonicalDigestSchema,
  expectedStateRevision: z.number().int().positive(),
  ref: RefSchema,
  checkoutPath: z.string().min(1),
  beforeHead: GitObjectIdSchema,
  beforeTree: GitObjectIdSchema,
  requestedHead: GitObjectIdSchema,
  requestedTree: GitObjectIdSchema,
  publishedHead: GitObjectIdSchema,
  publishedTree: GitObjectIdSchema,
});
const ReviewFixAuthoringRematerializeSchema = ReviewFixAuthoringAuthoritySchema.extend({
  planId: DeliveryPlanIdSchema,
  selectedDeliverableId: DeliveryCanonicalDigestSchema,
  expectedStateRevision: z.number().int().positive(),
  ref: RefSchema,
  checkoutPath: z.string().min(1),
  beforeHead: GitObjectIdSchema.nullable(),
  beforeTree: GitObjectIdSchema.nullable(),
  requestedHead: GitObjectIdSchema,
  requestedTree: GitObjectIdSchema,
});
type DeliveryCorrectionRoutingEntry = Extract<
  DeliveryEntryInspectionResult,
  { readonly status: "correction-routing-required" }
>;
const EligibilityMemberSchema = CandidateSchema.extend(CoordinateSchema.shape);
const CandidateGateResultSchema = z.strictObject({
  deliverableId: DeliveryCanonicalDigestSchema,
  ...CoordinateSchema.shape,
  status: z.enum(["passed", "failed"]),
});
const DeliveryOverlapSchema = z.strictObject({
  status: z.literal("available"),
  substantivePaths: z.array(z.string().min(1)),
  regenerablePaths: z.array(z.string().min(1)),
});
const PredecessorRelationSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("exact"),
    observedTip: GitObjectIdSchema,
    chainBase: GitObjectIdSchema,
  }),
  z.strictObject({
    kind: z.literal("disjoint-ahead"),
    observedTip: GitObjectIdSchema,
    chainBase: GitObjectIdSchema,
    mergeBase: GitObjectIdSchema,
    overlap: DeliveryOverlapSchema,
  }),
  z.strictObject({
    kind: z.literal("overlapping-ahead"),
    observedTip: GitObjectIdSchema,
    mergeBase: GitObjectIdSchema,
    overlap: DeliveryOverlapSchema,
  }),
  z.strictObject({
    kind: z.literal("unrelated"),
    observedTip: GitObjectIdSchema,
    detail: z.string().min(1),
  }),
]);
const EligibilitySnapshotSchema = z.strictObject({
  planId: DeliveryPlanIdSchema,
  workUnitId: z.string().min(1),
  planRevision: z.number().int().positive(),
  planDigest: DeliveryCanonicalDigestSchema,
  protectedBase: CoordinateSchema.extend({ ref: RefSchema }),
  chainBase: CoordinateSchema,
  predecessorRelation: PredecessorRelationSchema,
  top: CoordinateSchema.extend({ ref: RefSchema }),
  members: z.array(EligibilityMemberSchema).min(1),
  lifecyclePaths: z.array(z.string().min(1)),
  regenerablePaths: z.array(z.string().min(1)),
});
const DeliveryEligibilitySourceMovedSchema = z.strictObject({
  status: z.literal("refused"),
  reason: z.literal("source-moved"),
  source: z.strictObject({
    ref: RefSchema,
    expected: CoordinateSchema,
    observed: CoordinateSchema.nullable(),
  }),
  nextAction: z.strictObject({
    kind: z.literal("reprepare-delivery-eligibility"),
    planId: DeliveryPlanIdSchema,
    protectedBaseRef: RefSchema,
    topRef: RefSchema,
    candidates: z.array(CandidateSchema).min(1),
    lifecyclePaths: z.array(z.string().min(1)),
  }),
});
const DeliveryWrongPredecessorSchema = z.strictObject({
  status: z.literal("refused"),
  reason: z.literal("wrong-predecessor"),
  deliverableId: DeliveryCanonicalDigestSchema.optional(),
  relation: PredecessorRelationSchema,
  paths: z.array(z.string().min(1)).optional(),
  detail: z.string().min(1).max(1_000),
  remedy: z.strictObject({
    kind: z.literal("delivery-authoring-rebuild-required"),
    automatedCommand: z.null(),
  }).optional(),
});

const PrepareSchema = z.strictObject({
  plan: DeliveryPlanV1Schema,
  protectedBaseRef: RefSchema,
  topRef: RefSchema,
  candidates: z.array(CandidateSchema).min(1),
  lifecyclePaths: z.array(z.string().min(1)),
});
const CloseSchema = z.strictObject({
  snapshot: EligibilitySnapshotSchema,
  gateResults: z.array(CandidateGateResultSchema).min(1),
});
const MutationCandidateSchema = CandidateSchema.extend({ checkoutPath: z.string().min(1) });
const MaterializeSchema = z.strictObject({
  planId: DeliveryPlanIdSchema,
  protectedBaseRef: RefSchema,
  topRef: RefSchema,
  candidates: z.array(MutationCandidateSchema).min(1),
  remote: z.string().min(1).default("origin"),
});
const PublishSchema = MaterializeSchema.extend({
  gateResults: z.array(CandidateGateResultSchema).min(1),
  repository: z.string().min(1),
  draft: z.boolean(),
  presentations: z.array(z.strictObject({
    deliverableId: DeliveryCanonicalDigestSchema,
    summary: z.string().trim().min(1),
    changes: z.array(z.strictObject({
      topic: z.string().trim().min(1).regex(/^[^\r\n]+$/u),
      description: z.string().trim().min(1),
    })).min(1).optional(),
    designReference: z.string().trim().min(1).regex(/^[^\r\n]+$/u).optional(),
  })),
  terminalPresentation: z.strictObject({
    title: z.string().trim().min(1).regex(/^[^\r\n]+$/u),
    body: z.string().trim().min(1),
  }),
});
const PositionSchema = z.strictObject({
  planId: DeliveryPlanIdSchema,
  repository: z.string().min(1),
  remote: z.string().min(1).default("origin"),
});
const AuthoringLocateSchema = z.strictObject({ planId: DeliveryPlanIdSchema });
const CloseoutSchema = z.strictObject({
  workUnitId: SlugSchema,
  repository: z.string().min(1),
  remote: z.string().min(1).default("origin"),
});
const ReconcileSchema = z.strictObject({
  planId: DeliveryPlanIdSchema,
  repository: z.string().min(1),
  remote: z.string().min(1).default("origin"),
  continuation: z.enum(["rerun-checkpoint", "read-position"]).default("rerun-checkpoint"),
  reviewFixSelectedDeliverableId: DeliveryCanonicalDigestSchema.optional(),
});
const PreparedLandingSchema = z.strictObject({
  operationId: z.string().min(1),
  planId: DeliveryPlanIdSchema,
  deliverableId: DeliveryCanonicalDigestSchema,
  head: GitObjectIdSchema,
  repository: z.string().min(1),
  changeRequestId: z.string().min(1),
  mergeStrategy: z.enum(["merge", "rebase", "squash"]),
  settledReviewState: z.string().min(1),
  consequence: z.string().min(1),
  releaseMergeLock: z.boolean(),
});
const LandPrepareSchema = z.strictObject({
  planId: DeliveryPlanIdSchema,
  selectedDeliverableId: DeliveryCanonicalDigestSchema,
  repository: z.string().min(1),
  remote: z.string().min(1).default("origin"),
  baseRef: RefSchema,
  targetRef: RefSchema,
  releaseMergeLock: z.boolean(),
  treeRoot: z.string().min(1),
});
const LandApplySchema = z.strictObject({
  planId: DeliveryPlanIdSchema,
  approved: PreparedLandingSchema,
  remote: z.string().min(1).default("origin"),
  treeRoot: z.string().min(1),
});
const RewriteSchema = z.strictObject({
  planId: DeliveryPlanIdSchema,
  deliverableId: DeliveryCanonicalDigestSchema,
  requested: DeliveryOperationSnapshotV1Schema,
  remote: z.string().min(1).default("origin"),
});
const RematerializeSchema = z.strictObject({
  planId: DeliveryPlanIdSchema,
  protectedBaseRef: RefSchema,
  topRef: RefSchema,
  selectedDeliverableIds: z.array(DeliveryCanonicalDigestSchema).min(1),
  supersedePendingReviewFixVerification: DeliveryPendingVerificationSupersessionIdentitySchema.optional(),
  repository: z.string().min(1),
  remote: z.string().min(1).default("origin"),
});
const TeardownSchema = z.strictObject({
  planId: DeliveryPlanIdSchema,
  deliverableId: DeliveryCanonicalDigestSchema,
  repository: z.string().min(1),
  protectedTargetRef: RefSchema,
  remote: z.string().min(1).default("origin"),
});
const TopRemedySchema = z.strictObject({
  planId: DeliveryPlanIdSchema,
  action: z.enum(["retarget", "reopen-and-retarget"]),
  repository: z.string().min(1),
  protectedBaseRef: z.string().min(1).refine((value) => !value.startsWith("refs/")),
  remote: z.string().min(1).default("origin"),
});
const NativeMemberSchema = z.strictObject({
  deliverableId: DeliveryCanonicalDigestSchema,
  changeRequestId: z.string().min(1),
  headRef: z.string().min(1),
  headSha: GitObjectIdSchema,
  baseRef: z.string().min(1),
  headRepository: z.string().min(1).optional(),
});
const NativeObserveSchema = z.strictObject({
  repository: z.string().min(1),
  members: z.array(NativeMemberSchema).min(1),
});
const NativeUnlinkSchema = NativeObserveSchema.extend({
  planId: DeliveryPlanIdSchema,
  members: z.array(NativeMemberSchema),
});
const NativeLinkSchema = NativeObserveSchema.extend({
  planId: DeliveryPlanIdSchema,
  protectedBaseRef: RefSchema,
  members: z.array(NativeMemberSchema),
  optIn: z.boolean().optional(),
});
const NativeLandingMemberSchema = z.strictObject({
  deliverableId: DeliveryCanonicalDigestSchema,
  changeRequestId: z.string().min(1),
  headSha: GitObjectIdSchema,
});
const NativeSelectSchema = z.strictObject({
  planId: DeliveryPlanIdSchema,
  repository: z.string().min(1),
  remote: z.string().min(1).default("origin"),
  mergeAction: z.enum(["direct", "queue"]),
  explicitAtomic: z.boolean(),
});
const NativeSelectionSchema = z.strictObject({
  status: z.literal("selected"),
  arm: z.enum(["unlinked", "linked-single", "linked-atomic"]),
  members: z.array(NativeLandingMemberSchema).min(1),
  recommendedActionText: z.string().min(1),
});
const NativePrepareSchema = z.strictObject({
  planId: DeliveryPlanIdSchema,
  operationId: z.string().min(1),
  selection: NativeSelectionSchema,
  repository: z.string().min(1),
  remote: z.string().min(1).default("origin"),
  baseRef: z.string().min(1).refine((value) => !value.startsWith("refs/"), {
    message: "baseRef must be a short branch name",
  }),
  targetRef: RefSchema,
  treeRoot: z.string().min(1),
});
const NativeMergeRequestSchema = z.strictObject({
  repository: z.string().min(1), topChangeRequestId: z.string().min(1), topHeadSha: GitObjectIdSchema,
  mergeAction: z.literal("direct_merge"), mergeMethod: z.literal("merge"),
});
const NativeSubmitSchema = z.strictObject({
  planId: DeliveryPlanIdSchema, operationId: z.string().min(1), request: NativeMergeRequestSchema,
  treeRoot: z.string().min(1), remote: z.string().min(1).default("origin"),
});
const NativeStatusSchema = z.strictObject({
  planId: DeliveryPlanIdSchema,
  request: NativeMergeRequestSchema,
  remote: z.string().min(1).default("origin"),
});
const NativePreparedRecoveryResultSchema = z.strictObject({
  status: z.literal("prepared"),
  transition: z.literal("preserved"),
  action: z.literal("delivery-native-land-submit"),
  presentation: z.strictObject({
    operationId: z.string().min(1),
    members: z.array(NativeLandingMemberSchema).min(1),
    consequence: z.string().min(1),
  }),
  submitAction: z.strictObject({
    command: z.literal("arc delivery native land-submit - --json"),
    input: NativeSubmitSchema,
  }),
  recommendedActionText: z.string().min(1),
});
const NativeMemberNotReadyResultSchema = z.strictObject({
  status: z.literal("blocked"),
  reason: z.literal("member-not-ready"),
  unreadyMembers: z.array(NativeLandingMemberSchema).min(1),
  recommendedActionText: z.string().min(1),
});
const RefreshTriggerSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("landing-refused"),
    reason: z.enum(["conflict", "native-stale-suffix", "host-up-to-date"]),
  }),
  z.strictObject({ kind: z.literal("operator-choice") }),
]);
const DependentRefreshExecutionScopeSchema = z.strictObject({
  kind: z.literal("dependent-suffix"),
  selectedDeliverableId: DeliveryCanonicalDigestSchema,
});
const RefreshExecutionScopeSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("complete-remainder") }),
  DependentRefreshExecutionScopeSchema,
]);
const RefreshConflictSchema = z.strictObject({
  deliverableId: DeliveryCanonicalDigestSchema,
  paths: z.array(z.string().min(1)).min(1),
});
const RefreshConflictResolutionSchema = z.strictObject({
  planId: DeliveryPlanIdSchema,
  scope: DependentRefreshExecutionScopeSchema,
  expectedStateRevision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  observedSuffixDigest: DeliveryCanonicalDigestSchema,
  conflicts: z.array(RefreshConflictSchema).min(1),
});
const DeliveryTerminalConflictPreparationSchema = z.strictObject({
  topRef: z.string().min(1),
  logicalMergeBase: GitObjectIdSchema,
  parents: z.strictObject({
    top: GitObjectIdSchema,
    refreshedPredecessor: GitObjectIdSchema,
  }),
  mergeTree: z.strictObject({
    argv: z.tuple([
      z.literal("git"), z.literal("merge-tree"), z.literal("--write-tree"),
      z.literal("--merge-base"), GitObjectIdSchema, z.literal("--name-only"), z.literal("-z"),
      z.literal("--no-messages"), GitObjectIdSchema, GitObjectIdSchema,
    ]),
  }),
  workspace: z.strictObject({
    path: z.string().min(1),
    head: GitObjectIdSchema,
  }).optional(),
});
const RefreshPlanSchema = z.strictObject({
  planId: DeliveryPlanIdSchema,
  repository: z.string().min(1),
  trigger: RefreshTriggerSchema,
  mechanics: z.literal("operator-initiated").optional(),
  scope: RefreshExecutionScopeSchema.optional(),
  remote: z.string().min(1).default("origin"),
});
const RefreshAdoptSchema = z.strictObject({
  planId: DeliveryPlanIdSchema,
  repository: z.string().min(1),
  remote: z.string().min(1).default("origin"),
  scope: RefreshExecutionScopeSchema.optional(),
  operationId: z.string().min(1).optional(),
  conflictResolution: RefreshConflictResolutionSchema.optional(),
});
const RefreshExecuteSchema = z.strictObject({
  planId: DeliveryPlanIdSchema,
  repository: z.string().min(1),
  remote: z.string().min(1).default("origin"),
  scope: RefreshExecutionScopeSchema.optional(),
  operationId: z.string().min(1).optional(),
});
const ReviewFixBaseSchema = z.strictObject({
  planId: DeliveryPlanIdSchema,
  selectedDeliverableId: DeliveryCanonicalDigestSchema,
  repository: z.string().min(1),
  remote: z.string().min(1).default("origin"),
});
const ReviewFixPlanSchema = ReviewFixBaseSchema.extend({
  entryMode: z.enum(["execution", "integrating"]),
});
const ReviewFixPublishSchema = ReviewFixBaseSchema;
const ReviewFixAcknowledgementInputSchema = z.strictObject({
  planId: DeliveryPlanIdSchema,
  selectedDeliverableId: DeliveryCanonicalDigestSchema,
  memberDeliverableIds: z.array(DeliveryCanonicalDigestSchema).min(1),
  expectedStateRevision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  continuationDigest: DeliveryCanonicalDigestSchema,
});
const ReviewFixTier1VerificationSchema = z.discriminatedUnion("provenance", [
  z.strictObject({
    outcome: z.literal("passed"),
    provenance: z.literal("rerun"),
    targetTree: GitObjectIdSchema,
  }),
  z.strictObject({
    outcome: z.literal("passed"),
    provenance: z.literal("exact-tree-reuse"),
    targetTree: GitObjectIdSchema,
    coveredInputs: z.literal("unchanged"),
  }),
]);
const ReviewFixAcknowledgeSchema = ReviewFixAcknowledgementInputSchema.extend({
  verification: z.strictObject({
    applicability: z.enum(["targeted", "focused", "full"]),
    target: CoordinateSchema,
    tier1: ReviewFixTier1VerificationSchema,
    verificationEvidenceRefs: z.array(z.string().trim().min(1)).min(1),
  }),
});
const ReviewFixRecordEffectSchema = z.strictObject({
  path: z.string().trim().min(1),
  digest: DeliveryCanonicalDigestSchema,
});
const ReviewFixContinueSchema = z.strictObject({
  repository: z.string().min(1),
  remote: z.string().min(1).default("origin"),
  verification: ReviewFixAcknowledgeSchema.shape.verification.optional(),
  recordEffects: z.array(ReviewFixRecordEffectSchema).max(2).optional(),
});

const RequestSchemas = {
  "authoring-locate": AuthoringLocateSchema,
  "authoring-rematerialize": ReviewFixAuthoringRematerializeSchema,
  "authoring-rebind": ReviewFixAuthoringRebindSchema,
  closeout: CloseoutSchema,
  "eligibility-prepare": PrepareSchema,
  "eligibility-close": CloseSchema,
  publish: PublishSchema,
  position: PositionSchema,
  "land-prepare": LandPrepareSchema,
  "land-apply": LandApplySchema,
  reconcile: ReconcileSchema,
  rematerialize: RematerializeSchema,
  rewrite: RewriteSchema,
  teardown: TeardownSchema,
  "top-remedy": TopRemedySchema,
  "native-observe": NativeObserveSchema,
  "native-link": NativeLinkSchema,
  "native-unlink": NativeUnlinkSchema,
  "native-land-select": NativeSelectSchema,
  "native-land-prepare": NativePrepareSchema,
  "native-land-submit": NativeSubmitSchema,
  "native-land-status": NativeStatusSchema,
  "refresh-plan": RefreshPlanSchema,
  "refresh-execute": RefreshExecuteSchema,
  "refresh-adopt": RefreshAdoptSchema,
  "review-fix-plan": ReviewFixPlanSchema,
  "review-fix-publish": ReviewFixPublishSchema,
  "review-fix-acknowledge": ReviewFixAcknowledgeSchema,
  "review-fix-continue": ReviewFixContinueSchema,
} as const;

export type DeliveryExecutionCommand = keyof typeof RequestSchemas;

const ContributionPathReasonSchema = z.enum(["contribution-conflicted", "contribution-diverged"]);
const ContributionRefusalSchema = z.strictObject({
  status: z.literal("refused"),
  reason: ContributionPathReasonSchema,
  paths: z.array(z.string()),
});
const ContainmentRefusalSchema = z.strictObject({
  status: z.literal("refused"),
  reason: z.literal("containment-diverged"),
  paths: z.array(z.string()),
});
const DeliveryLifecycleContributionRefusalSchema = z.strictObject({
  status: z.literal("refused"),
  reason: z.literal("lifecycle-contribution"),
  deliverableId: DeliveryCanonicalDigestSchema,
  paths: z.array(z.string()),
});
const BlockedContributionRefusalSchema = z.strictObject({
  status: z.literal("blocked"),
  reason: ContributionPathReasonSchema,
  paths: z.array(z.string()),
  guidance: z.string().min(1),
});
const ContributionVerdictSchema = z.strictObject({
  deliverableId: DeliveryCanonicalDigestSchema,
  contribution: z.enum(["changed", "equivalent"]),
  proof: z.enum(["selected-change", "tree-equality", "mechanical-reapply"]),
});
const DeliveryHostRequestSchema = z.strictObject({
  binding: DeliveryChangeRequestV1Schema,
  repository: z.string().min(1),
  headRef: z.string().min(1),
  headSha: GitObjectIdSchema,
  baseRef: z.string().min(1),
  state: z.enum(["open", "merged", "closed"]),
  mergeCommitSha: GitObjectIdSchema.nullable().optional(),
});
const DeliveryTopReadySchema = z.strictObject({
  status: z.literal("ready"),
  request: DeliveryHostRequestSchema,
});
const DeliveryTopRemedyRefusalSchema = z.strictObject({
  status: z.literal("refused"),
  reason: z.literal("top-target-mismatch"),
  remedy: z.strictObject({
    nextAction: z.enum(["retarget", "reopen-and-retarget"]),
    repository: z.string().min(1),
    changeRequestId: z.string().min(1),
    protectedBaseRef: z.string().min(1),
  }),
});
const DeliveryCloseoutBlockedSchema = z.strictObject({
  status: z.literal("blocked"),
  reason: z.string().min(1),
  planId: DeliveryPlanIdSchema.optional(),
  deliverableId: DeliveryCanonicalDigestSchema.optional(),
  recommendedActionText: z.string().min(1),
});
const OperationalStateAccessRefusalSchema = z.strictObject({
  status: z.literal("refused"),
  reason: z.enum(["operational-state-not-readable", "operational-state-not-writable"]),
  storage: z.literal("repository-git-common"),
  cause: z.enum(["permission-denied", "read-only-filesystem"]),
  recommendedActionText: z.string().min(1),
});
const ReviewFixRoutingRequiredRefusalSchema = z.strictObject({
  status: z.literal("refused"),
  reason: z.literal("review-fix-routing-required"),
  nextAction: z.literal("plan-review-fix"),
  entryMode: z.literal("integrating"),
  recommendedActionText: z.string().min(1),
});
const RetainedOperationBlockSchema = z.strictObject({
  status: z.literal("blocked"),
  reason: z.string().min(1),
  paths: z.array(z.string()).optional(),
  conflictPreparation: DeliveryTerminalConflictPreparationSchema.optional(),
  operationId: z.string().min(1),
  nextAction: z.enum(["reconcile", "resolve-terminal-conflicts"]),
  recommendedActionText: z.string().min(1),
});
const InvalidServiceResultRefusalSchema = z.strictObject({
  status: z.literal("refused"),
  reason: z.literal("invalid-service-result"),
  detail: z.string().min(1).max(1_000),
  recommendedActionText: z.string().min(1),
});

const ReviewFixContinuationResumeActionSchema = z.strictObject({
  argv: z.tuple([
    z.literal("arc"), z.literal("delivery"), z.literal("review-fix"), z.literal("continue"),
    z.literal("-"), z.literal("--json"),
  ]),
  input: ReviewFixContinueSchema.omit({ verification: true }),
});
const ReviewFixContinuationDispatchActionSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("delivery-review-fix-publish"),
    argv: z.tuple([
      z.literal("arc"), z.literal("delivery"), z.literal("review-fix"), z.literal("publish"),
      z.literal("-"), z.literal("--json"),
    ]),
    input: ReviewFixPublishSchema,
  }),
  z.strictObject({
    kind: z.literal("delivery-rematerialize"),
    argv: z.tuple([
      z.literal("arc"), z.literal("delivery"), z.literal("rematerialize"), z.literal("-"),
      z.literal("--json"),
    ]),
    input: RematerializeSchema,
  }),
  z.strictObject({
    kind: z.literal("delivery-refresh-execute"),
    argv: z.tuple([
      z.literal("arc"), z.literal("delivery"), z.literal("refresh"), z.literal("execute"),
      z.literal("-"), z.literal("--json"),
    ]),
    input: RefreshExecuteSchema,
  }),
  z.strictObject({
    kind: z.literal("delivery-refresh-adopt"),
    argv: z.tuple([
      z.literal("arc"), z.literal("delivery"), z.literal("refresh"), z.literal("adopt"),
      z.literal("-"), z.literal("--json"),
    ]),
    input: RefreshAdoptSchema,
  }),
  z.strictObject({
    kind: z.literal("delivery-reconcile"),
    argv: z.tuple([
      z.literal("arc"), z.literal("delivery"), z.literal("reconcile"), z.literal("-"),
      z.literal("--json"),
    ]),
    input: ReconcileSchema,
  }),
  z.strictObject({
    kind: z.literal("delivery-review-fix-acknowledge"),
    argv: z.tuple([
      z.literal("arc"), z.literal("delivery"), z.literal("review-fix"), z.literal("acknowledge"),
      z.literal("-"), z.literal("--json"),
    ]),
    input: ReviewFixAcknowledgeSchema,
  }),
]);
const ReviewFixContinuationAuthorityActionSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("candidate-renewal"),
    argv: z.tuple([z.literal("arc"), z.literal("attest"), SlugSchema, z.literal("--json")]),
  }),
  z.strictObject({
    kind: z.literal("delivery-status"),
    action: ResolveDeliveryStatusActionSchema,
  }),
  z.strictObject({
    kind: z.literal("publication"),
    action: ContinuePublicationActionSchema,
  }),
]);
const ReviewFixDriveActionKindSchema = z.enum([
  "delivery-review-fix-authoring-rematerialize",
  "delivery-review-fix-authoring-rebind",
  "delivery-review-fix-publish",
  "delivery-rematerialize",
  "delivery-refresh-execute",
  "delivery-refresh-adopt",
  "delivery-reconcile",
  "delivery-review-fix-acknowledge",
  "review-respond",
]);
const ReviewFixDriveProgressActionKindSchema = z.union([
  ReviewFixDriveActionKindSchema,
  z.literal("boundary-carry"),
  z.literal("record-settlement"),
]);
const ReviewFixDriveEffectSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.enum(["dispatch", "no-op-replay"]),
    actionKind: ReviewFixDriveActionKindSchema,
    resultStatus: z.string().min(1),
  }),
  z.strictObject({
    kind: z.literal("boundary-carry"),
    path: z.string().min(1),
    candidateId: DeliveryCanonicalDigestSchema,
    stateRevision: z.number().int().positive(),
  }),
  z.strictObject({
    kind: z.literal("commit"),
    recordClass: z.string().min(1),
    head: GitObjectIdSchema,
    replayed: z.literal(true).optional(),
  }),
  z.strictObject({
    kind: z.literal("push"),
    ref: z.string().min(1),
    beforeHead: GitObjectIdSchema.nullable(),
    afterHead: GitObjectIdSchema,
  }),
]);
const ReviewFixDriveEffectLogField = {
  effectLog: z.array(ReviewFixDriveEffectSchema).optional(),
};
const ReviewFixDriveProgressSchema = z.strictObject({
  stateRevision: z.number().int().positive().nullable(),
  operationId: z.string().min(1).nullable(),
  boundaryVersion: z.string().min(1).nullable(),
  relevantHeads: z.array(GitObjectIdSchema),
});
const ReviewFixRouteResultSchema = z.discriminatedUnion("route", [
  z.strictObject({
    status: z.literal("planned"),
    route: z.literal("provider-refresh"),
    selectedDeliverableId: DeliveryCanonicalDigestSchema,
    affectedDeliverableIds: z.array(DeliveryCanonicalDigestSchema).min(1),
    nextAction: z.literal("publish-selected-member"),
    candidateRequirements: z.strictObject({ requiredAncestorHeads: z.array(GitObjectIdSchema).min(1) }),
    recommendedActionText: z.string().min(1),
  }),
  z.strictObject({
    status: z.literal("planned"),
    route: z.literal("rematerialize"),
    selectedDeliverableId: DeliveryCanonicalDigestSchema,
    affectedDeliverableIds: z.array(DeliveryCanonicalDigestSchema).min(1),
    nextAction: z.literal("rematerialize"),
    recommendedActionText: z.string().min(1),
  }),
  z.strictObject({
    status: z.literal("planned"),
    route: z.literal("terminal-authoring"),
    selectedDeliverableId: DeliveryCanonicalDigestSchema,
    affectedDeliverableIds: z.array(DeliveryCanonicalDigestSchema).min(1),
    nextAction: z.literal("author-terminal"),
    publicationRequired: z.literal(true).optional(),
    recommendedActionText: z.string().min(1),
  }),
  z.strictObject({
    status: z.literal("planned"),
    route: z.literal("terminal-rebind"),
    selectedDeliverableId: DeliveryCanonicalDigestSchema,
    affectedDeliverableIds: z.array(DeliveryCanonicalDigestSchema).min(1),
    nextAction: z.literal("reconcile-terminal-publication"),
    reconcileInput: z.strictObject({
      planId: DeliveryPlanIdSchema,
      repository: z.string().min(1),
      remote: z.string().min(1),
      continuation: z.literal("read-position"),
      reviewFixSelectedDeliverableId: DeliveryCanonicalDigestSchema,
    }),
    recommendedActionText: z.string().min(1),
  }),
]);
const ReviewFixContinuationResultSchema = z.union([
  z.strictObject({
    status: z.literal("dispatch"),
    nextAction: z.literal("dispatch"),
    action: ReviewFixContinuationDispatchActionSchema,
    recommendedActionText: z.string().min(1),
    ...ReviewFixDriveEffectLogField,
  }),
  z.strictObject({
    status: z.literal("verification-required"),
    nextAction: z.literal("verify-review-fix"),
    selectedDeliverableId: DeliveryCanonicalDigestSchema,
    verification: ReviewFixVerificationSchema,
    resumeAction: ReviewFixContinuationResumeActionSchema,
    recommendedActionText: z.string().min(1),
    ...ReviewFixDriveEffectLogField,
  }),
  z.strictObject({
    status: z.literal("authoring-required"),
    route: z.enum(["provider-refresh", "rematerialize", "terminal-authoring"]),
    selectedDeliverableId: DeliveryCanonicalDigestSchema,
    derivedFrom: DeliveryCorrectionDerivationSchema,
    nextAction: z.enum(["author-terminal", "author-correction"]),
    authoring: z.strictObject({
      kind: z.enum(["candidate", "top"]),
      ref: z.string().min(1),
      checkoutPath: z.string().min(1),
    }).optional(),
    requiredAncestorHeads: z.array(GitObjectIdSchema).optional(),
    approvedDispositionSet: z.strictObject({
      dispositionSetId: DeliveryCanonicalDigestSchema,
      authorizedFindingIds: z.array(z.string().min(1)).min(1),
      authorizedFindingLoci: z.array(z.string().min(1)).min(1).optional(),
    }).optional(),
    authoringAuthorization: z.strictObject({
      fixAuthorizationId: DeliveryCanonicalDigestSchema,
      dispositionSetId: DeliveryCanonicalDigestSchema,
      planId: DeliveryPlanIdSchema,
      workUnitId: SlugSchema,
      selectedDeliverableId: DeliveryCanonicalDigestSchema,
      reviewedHead: GitObjectIdSchema,
      ref: z.string().min(1),
      checkoutPath: z.string().min(1),
    }).optional(),
    resumeAction: ReviewFixContinuationResumeActionSchema,
    recommendedActionText: z.string().min(1),
    ...ReviewFixDriveEffectLogField,
  }),
  z.strictObject({
    status: z.literal("authority-required"),
    authority: z.enum(["candidate-renewal", "delivery-status", "publication"]),
    nextAction: z.literal("dispatch-authority-action"),
    action: ReviewFixContinuationAuthorityActionSchema,
    recommendedActionText: z.string().min(1),
    ...ReviewFixDriveEffectLogField,
  }),
  z.strictObject({
    status: z.literal("candidate-verification-required"),
    nextAction: z.literal("verify-work-unit"),
    planId: DeliveryPlanIdSchema,
    stateRevision: z.number().int().positive(),
    recommendedActionText: z.string().min(1),
    ...ReviewFixDriveEffectLogField,
  }),
  z.strictObject({
    status: z.literal("idle"),
    nextAction: z.literal("continue-work-unit"),
    recommendedActionText: z.string().min(1),
    ...ReviewFixDriveEffectLogField,
  }),
  z.strictObject({
    status: z.literal("refused"),
    reason: z.string().min(1),
    nextAction: z.string().min(1).optional(),
    recommendedActionText: z.string().min(1).optional(),
    ...ReviewFixDriveEffectLogField,
  }),
  z.strictObject({
    status: z.literal("refused"),
    reason: z.literal("delivery-review-fix-no-progress"),
    actionKind: z.union([ReviewFixDriveActionKindSchema, z.literal("boundary-carry")]),
    progress: ReviewFixDriveProgressSchema,
    effectLog: z.array(ReviewFixDriveEffectSchema),
    recommendedActionText: z.string().min(1),
  }),
  z.strictObject({
    status: z.literal("refused"),
    reason: z.literal("delivery-review-fix-no-progress"),
    actionKind: z.literal("record-settlement"),
    effectLog: z.array(ReviewFixDriveEffectSchema),
    recommendedActionText: z.string().min(1),
  }),
  z.strictObject({
    status: z.literal("effect-stopped"),
    reason: z.literal("delivery-review-fix-effect-stopped"),
    actionKind: ReviewFixDriveProgressActionKindSchema,
    result: z.unknown(),
    effectLog: z.array(ReviewFixDriveEffectSchema),
    recommendedActionText: z.string().min(1),
  }),
  z.strictObject({
    status: z.literal("hosted-settlement-required"),
    stopKind: z.literal("finding-settlement"),
    nextAction: z.literal("review-hosted-settle"),
    responsePlan: HostedFindingsResponsePlanSchema,
    responseRequest: RespondRequestSchema,
    response: RespondEnvelopeSchema,
    effectLog: z.array(ReviewFixDriveEffectSchema),
    recommendedActionText: z.string().min(1),
  }),
  z.strictObject({
    status: z.literal("review-status-required"),
    stopKind: z.enum(["finding-disposition", "review-spend", "external-wait", "blocked", "integration"]),
    nextAction: z.string().min(1),
    reviewStatus: ReviewStatusResultSchema,
    authorityPreservation: z.strictObject({
      reviewedHead: GitObjectIdSchema,
      currentHead: GitObjectIdSchema,
      proof: z.enum(["tree-equality", "mechanical-reapply"]),
      projectionDigest: DeliveryCanonicalDigestSchema,
      residualDigest: DeliveryCanonicalDigestSchema,
    }).optional(),
    recommendedActionText: z.string().min(1),
    ...ReviewFixDriveEffectLogField,
  }),
  z.strictObject({
    status: z.literal("conflict-required"),
    stopKind: z.literal("conflict"),
    paths: z.array(z.string().min(1)).min(1),
    conflictPreparation: DeliveryTerminalConflictPreparationSchema,
    resumeAction: ReviewFixContinuationResumeActionSchema,
    recommendedActionText: z.string().min(1),
    effectLog: z.array(ReviewFixDriveEffectSchema),
  }),
]);

const REVIEW_FIX_ROUTING_REQUIRED_TEXT = "Select the delivery member that owns the approved correction, then run "
  + "`arc delivery review-fix plan` before authoring or publishing replacement content.";

const OwnedDeliveryFailureCoordinatesSchema = z.strictObject({
  planId: DeliveryPlanIdSchema.nullable(),
  deliverableId: DeliveryCanonicalDigestSchema.nullable(),
  snapshotBaseHead: GitObjectIdSchema.nullable(),
  snapshotTopHead: GitObjectIdSchema.nullable(),
  requestedBase: GitObjectIdSchema.nullable(),
  requestedHead: GitObjectIdSchema.nullable(),
  observedHead: GitObjectIdSchema.nullable(),
});
const OwnedDeliveryFailureContinuationSchema = z.union([
  z.strictObject({ kind: z.literal("remedy"), argv: z.array(z.string().min(1)).min(1) }),
  z.strictObject({
    kind: z.literal("terminal-explanation"),
    terminalExplanation: z.string().trim().min(1).max(4_096),
  }),
]);
const OwnedDeliveryPublicFailureSchema = z.strictObject({
  status: z.enum(["refused", "blocked"]),
  reason: z.string().trim().min(1).max(128),
  detail: z.string().trim().min(1).max(4_096),
  coordinates: OwnedDeliveryFailureCoordinatesSchema,
  deliverableId: DeliveryCanonicalDigestSchema.optional(),
  paths: z.array(z.string().min(1)).optional(),
  source: DeliveryEligibilitySourceMovedSchema.shape.source.optional(),
  nextAction: DeliveryEligibilitySourceMovedSchema.shape.nextAction.optional(),
  relation: PredecessorRelationSchema.optional(),
  remedy: DeliveryWrongPredecessorSchema.shape.remedy.optional(),
  continuation: OwnedDeliveryFailureContinuationSchema,
});

const GitProcessCauseSchema = z.enum([
  "git.canceled",
  "git.timed-out",
  "git.output-limit",
  "git.nonzero-exit",
  "git.spawn-failure",
  "git.unexpected",
]);

const ResultSchema = z.union([
  OwnedDeliveryPublicFailureSchema,
  ReviewFixContinuationResultSchema,
  DeliveryLandingRefusalSchema,
  DeliveryRecoveryResultV1Schema,
  NativePreparedRecoveryResultSchema,
  NativeMemberNotReadyResultSchema,
  DeliveryEligibilitySourceMovedSchema,
  DeliveryWrongPredecessorSchema,
  z.strictObject({ status: z.literal("prepared"), snapshot: EligibilitySnapshotSchema }),
  z.strictObject({ status: z.literal("eligible"), snapshot: EligibilitySnapshotSchema }),
  z.strictObject({
    status: z.literal("closed-out"),
    workUnitId: SlugSchema,
    planIds: z.array(DeliveryPlanIdSchema),
    recommendedActionText: z.string().min(1),
  }),
  z.strictObject({
    status: z.literal("located"),
    planId: DeliveryPlanIdSchema,
    locators: z.array(z.strictObject({
      deliverableId: DeliveryCanonicalDigestSchema,
      candidateRef: z.string().min(1),
      gatePath: z.string().min(1),
    })),
  }),
  z.strictObject({ status: z.literal("rematerialized") }),
  z.strictObject({ status: z.literal("already-rematerialized"), replayed: z.literal(true) }),
  z.strictObject({ status: z.literal("rebound") }),
  z.strictObject({ status: z.literal("already-rebound"), replayed: z.literal(true) }),
  z.strictObject({ status: z.literal("materialized"), state: z.strictObject({ revision: z.number().int().positive(), value: DeliveryStateV1Schema }) }),
  z.strictObject({ status: z.literal("published"), state: z.strictObject({ revision: z.number().int().positive(), value: DeliveryStateV1Schema }) }),
  z.strictObject({
    status: z.enum(["acknowledged", "already-acknowledged"]),
    state: z.strictObject({ revision: z.number().int().positive(), value: DeliveryStateV1Schema }),
    candidate: z.strictObject({
      candidateId: DeliveryCanonicalDigestSchema,
      verificationId: DeliveryCanonicalDigestSchema,
      recordPath: z.string().min(1),
    }),
    nextAction: z.literal("resolve-delivery-status"),
    boundaryCarry: z.strictObject({
      path: z.string().min(1),
      candidateId: DeliveryCanonicalDigestSchema,
      stateRevision: z.number().int().positive(),
    }),
    recordEffects: z.array(ReviewFixRecordEffectSchema).length(2),
  }),
  z.strictObject({
    status: z.literal("published"),
    state: z.strictObject({ revision: z.number().int().positive(), value: DeliveryStateV1Schema }),
    selectedDeliverableId: DeliveryCanonicalDigestSchema,
    affectedDeliverableIds: z.array(DeliveryCanonicalDigestSchema).min(1),
    nextAction: z.literal("execute-provider-refresh"),
    verification: z.strictObject({
      memberDeliverableIds: z.array(DeliveryCanonicalDigestSchema).min(1),
      tier1Required: z.literal(true),
    }),
    recommendedActionText: z.string().min(1),
  }),
  z.strictObject({ status: z.literal("prepared"), presentation: PreparedLandingSchema }),
  z.strictObject({ status: z.literal("landed"), state: z.strictObject({ revision: z.number().int().positive(), value: DeliveryStateV1Schema }) }),
  z.strictObject({
    status: z.literal("rebound"),
    state: z.strictObject({ revision: z.number().int().positive(), value: DeliveryStateV1Schema }),
    nextAction: z.enum(["rerun-checkpoint", "read-position"]),
  }),
  z.strictObject({
    status: z.literal("rebound"),
    state: z.strictObject({ revision: z.number().int().positive(), value: DeliveryStateV1Schema }),
    selectedDeliverableId: DeliveryCanonicalDigestSchema,
    nextAction: z.literal("verify-review-fix"),
    verification: ReviewFixVerificationSchema,
    acknowledgementInput: ReviewFixAcknowledgementInputSchema,
  }),
  z.strictObject({
    status: z.literal("position"),
    position: z.unknown(),
    nextAction: z.string().min(1),
    selectedDeliverableId: DeliveryCanonicalDigestSchema.optional(),
    plannedSuffix: z.array(DeliveryCanonicalDigestSchema).optional(),
    recommendedActionText: z.string().min(1).optional(),
    ...ReviewFixDriveEffectLogField,
  }),
  z.strictObject({
    status: z.literal("applied"),
    state: z.strictObject({ revision: z.number().int().positive(), value: DeliveryStateV1Schema }),
    selectedDeliverableId: DeliveryCanonicalDigestSchema,
    nextAction: z.literal("verify-review-fix"),
    verification: ReviewFixVerificationSchema,
    acknowledgementInput: ReviewFixAcknowledgementInputSchema,
  }),
  z.strictObject({
    status: z.literal("applied"),
    state: z.strictObject({ revision: z.number().int().positive(), value: DeliveryStateV1Schema }),
    nextAction: z.literal("read-position").optional(),
  }),
  z.strictObject({
    status: z.literal("rematerialized"),
    state: z.strictObject({ revision: z.number().int().positive(), value: DeliveryStateV1Schema }),
    selectedDeliverableId: DeliveryCanonicalDigestSchema,
    contributionVerdicts: z.array(ContributionVerdictSchema),
    nextAction: z.literal("verify-review-fix"),
    verification: ReviewFixVerificationSchema,
    acknowledgementInput: ReviewFixAcknowledgementInputSchema,
  }),
  z.strictObject({
    status: z.literal("retryable"),
    guidance: z.string().min(1),
    nextAction: z.literal("read-position").optional(),
  }),
  z.strictObject({ status: z.literal("retryable"), recommendedActionText: z.string().min(1) }),
  z.strictObject({
    status: z.literal("retryable"),
    reason: z.string().min(1),
    publication: z.union([
      z.strictObject({
        status: z.literal("retry"),
        pendingDeliverableIds: z.array(DeliveryCanonicalDigestSchema),
      }),
      z.strictObject({
        status: z.literal("partial-published"),
        publishedDeliverableIds: z.array(DeliveryCanonicalDigestSchema),
        pendingDeliverableIds: z.array(DeliveryCanonicalDigestSchema),
      }),
      z.strictObject({ status: z.literal("published") }),
      z.strictObject({ status: z.literal("blocked"), reason: z.literal("ambiguous-result") }),
    ]),
    reservation: z.strictObject({ revision: z.number().int().positive(), value: DeliveryStateV1Schema }),
  }),
  z.strictObject({
    status: z.literal("disclosed"),
    plannedSuffix: z.array(DeliveryCanonicalDigestSchema),
    recommendedActionText: z.string().min(1),
  }),
  z.strictObject({
    status: z.literal("refresh-required"),
    mechanics: z.enum(["provider-invoked", "operator-initiated"]),
    plannedSuffix: z.array(DeliveryCanonicalDigestSchema).min(1),
    recommendedActionText: z.string().min(1),
  }),
  z.strictObject({
    status: z.literal("conflict-resolution-required"),
    conflicts: z.array(RefreshConflictSchema).min(1),
    resolutionInput: RefreshConflictResolutionSchema,
    externalRefRestorations: z.array(z.strictObject({
      ref: z.string().min(1),
      observedHead: GitObjectIdSchema,
      restoreHead: GitObjectIdSchema,
    })).min(1),
    recommendedActionText: z.string().min(1),
  }),
  z.strictObject({
    status: z.literal("planned"),
    route: z.literal("provider-refresh"),
    selectedDeliverableId: DeliveryCanonicalDigestSchema,
    affectedDeliverableIds: z.array(DeliveryCanonicalDigestSchema).min(1),
    nextAction: z.literal("publish-selected-member"),
    candidateRequirements: z.strictObject({
      requiredAncestorHeads: z.array(GitObjectIdSchema).min(1),
    }),
    recommendedActionText: z.string().min(1),
  }),
  z.strictObject({
    status: z.literal("planned"),
    route: z.literal("rematerialize"),
    selectedDeliverableId: DeliveryCanonicalDigestSchema,
    affectedDeliverableIds: z.array(DeliveryCanonicalDigestSchema).min(1),
    nextAction: z.literal("rematerialize"),
    recommendedActionText: z.string().min(1),
  }),
  z.strictObject({
    status: z.literal("planned"),
    route: z.literal("terminal-authoring"),
    selectedDeliverableId: DeliveryCanonicalDigestSchema,
    affectedDeliverableIds: z.array(DeliveryCanonicalDigestSchema).min(1),
    nextAction: z.literal("author-terminal"),
    publicationRequired: z.literal(true).optional(),
    recommendedActionText: z.string().min(1),
  }),
  z.strictObject({
    status: z.literal("planned"),
    route: z.literal("terminal-rebind"),
    selectedDeliverableId: DeliveryCanonicalDigestSchema,
    affectedDeliverableIds: z.array(DeliveryCanonicalDigestSchema).min(1),
    nextAction: z.literal("reconcile-terminal-publication"),
    reconcileInput: z.strictObject({
      planId: DeliveryPlanIdSchema,
      repository: z.string().min(1),
      remote: z.string().min(1),
      continuation: z.literal("read-position"),
      reviewFixSelectedDeliverableId: DeliveryCanonicalDigestSchema,
    }),
    recommendedActionText: z.string().min(1),
  }),
  z.strictObject({ status: z.literal("blocked"), guidance: z.string().min(1) }),
  BlockedContributionRefusalSchema,
  z.strictObject({ status: z.literal("blocked"), reason: z.string().min(1), guidance: z.string().min(1) }),
  DeliveryCloseoutBlockedSchema,
  RetainedOperationBlockSchema,
  z.strictObject({
    status: z.literal("blocked"),
    reason: z.literal("top-remedy-required"),
    nextAction: z.literal("reopen-and-retarget"),
    top: DeliveryTopRemedyRefusalSchema,
  }),
  z.strictObject({
    status: z.literal("blocked"),
    reason: z.literal("trigger-ref-restore-required"),
    recovery: z.strictObject({ ref: z.string().min(1), head: GitObjectIdSchema }),
    recommendedActionText: z.string().min(1),
  }),
  z.strictObject({
    status: z.literal("blocked"),
    reason: z.literal("content-conflict"),
    paths: z.array(z.string().min(1)).min(1),
    conflictPreparation: DeliveryTerminalConflictPreparationSchema,
  }),
  z.strictObject({ status: z.literal("blocked"), reason: z.string().min(1), reservation: z.strictObject({ revision: z.number().int().positive(), value: DeliveryStateV1Schema }) }),
  z.strictObject({
    status: z.literal("blocked"),
    reason: z.string().min(1),
    paths: z.array(z.string()).optional(),
  }),
  z.strictObject({
    status: z.literal("torn-down"),
    state: z.strictObject({ revision: z.number().int().positive(), value: DeliveryStateV1Schema }),
    nextAction: z.literal("continue"),
  }),
  z.strictObject({
    status: z.literal("torn-down"),
    state: z.strictObject({ revision: z.number().int().positive(), value: DeliveryStateV1Schema }),
    nextAction: z.literal("terminal-checkpoint"),
    top: DeliveryTopReadySchema,
  }),
  z.strictObject({
    status: z.literal("torn-down"),
    state: z.strictObject({ revision: z.number().int().positive(), value: DeliveryStateV1Schema }),
    nextAction: z.enum(["retarget", "reopen-and-retarget"]),
    top: DeliveryTopRemedyRefusalSchema,
  }),
  z.strictObject({
    status: z.literal("remedied"),
    state: z.strictObject({ revision: z.number().int().positive(), value: DeliveryStateV1Schema }),
    nextAction: z.literal("teardown-member"),
    selectedDeliverableId: DeliveryCanonicalDigestSchema,
    top: DeliveryTopReadySchema,
  }),
  z.strictObject({
    status: z.literal("remedied"),
    state: z.strictObject({ revision: z.number().int().positive(), value: DeliveryStateV1Schema }),
    nextAction: z.literal("terminal-checkpoint"),
    top: DeliveryTopReadySchema,
  }),
  z.strictObject({
    status: z.literal("remedied"),
    state: z.strictObject({ revision: z.number().int().positive(), value: DeliveryStateV1Schema }),
    nextAction: z.literal("terminal-checkpoint"),
    terminalHeadAction: z.literal("rebind-required"),
  }),
  z.strictObject({ status: z.literal("registered"), stackNumber: z.number().int().positive() }),
  z.strictObject({ status: z.literal("unregistered") }),
  z.strictObject({ status: z.enum(["partial", "incoherent"]), affectedDeliverableIds: z.array(DeliveryCanonicalDigestSchema) }),
  z.strictObject({ status: z.enum(["unsupported", "unavailable", "malformed", "ambiguous"]) }),
  z.strictObject({
    status: z.literal("decision-required"),
    recommendedOptInText: z.string().min(1),
    recommendedOptOutText: z.string().min(1),
    recommendedActionText: z.string().min(1),
  }),
  z.strictObject({ status: z.literal("linked"), stackNumber: z.number().int().positive(), recommendedActionText: z.string().min(1) }),
  z.strictObject({ status: z.literal("unlinked"), recommendedActionText: z.string().min(1) }),
  z.strictObject({ status: z.literal("downgrade-required"), reason: z.string().min(1), recommendedActionText: z.string().min(1) }),
  NativeSelectionSchema,
  z.strictObject({ status: z.literal("prepared"), state: z.strictObject({ revision: z.number().int().positive(), value: DeliveryStateV1Schema }), operationId: z.string().min(1), members: z.array(NativeLandingMemberSchema), consequence: z.string().min(1) }),
  z.strictObject({ status: z.literal("pending"), effectIdentity: z.string().min(1), state: z.strictObject({ revision: z.number().int().positive(), value: DeliveryStateV1Schema }) }),
  z.strictObject({ status: z.literal("pending"), recommendedActionText: z.string().min(1) }),
  ContributionRefusalSchema,
  ContainmentRefusalSchema,
  DeliveryLifecycleContributionRefusalSchema,
  OperationalStateAccessRefusalSchema,
  ReviewFixRoutingRequiredRefusalSchema,
  InvalidServiceResultRefusalSchema,
  z.strictObject({ status: z.literal("refused") }),
  z.strictObject({
    status: z.literal("refused"),
    reason: z.literal("terminal-rebind-unavailable"),
    cause: GitProcessCauseSchema,
    detail: z.string().min(1).max(1_000),
  }),
  z.strictObject({
    status: z.literal("refused"),
    reason: z.string().min(1),
    recommendedActionText: z.string().min(1),
  }),
  z.strictObject({ status: z.literal("refused"), reason: z.string().min(1), deliverableId: DeliveryCanonicalDigestSchema.optional() }),
  z.strictObject({
    status: z.literal("refused"),
    reason: z.string().min(1),
    paths: z.array(z.string()).optional(),
    detail: z.string().min(1).max(1_000).optional(),
  }),
]);
export type DeliveryExecutionResult = z.infer<typeof ResultSchema>;

function invalidServiceResult(result: unknown): z.infer<typeof InvalidServiceResultRefusalSchema> {
  const record = typeof result === "object" && result !== null && !Array.isArray(result)
    ? result as Record<string, unknown>
    : null;
  const fields = record === null
    ? []
    : Object.keys(record)
      .filter((field) => /^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(field))
      .sort()
      .slice(0, 16);
  const status = record?.status;
  const statusText = typeof status === "string" && /^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(status)
    ? ` for status '${status}'`
    : "";
  return {
    status: "refused",
    reason: "invalid-service-result",
    detail: `Strict delivery result validation failed${statusText}; observed fields: ${
      fields.length === 0 ? "none" : fields.join(", ")
    }.`,
    recommendedActionText:
      "Treat the delivery outcome as unknown. Inspect current delivery recovery state before retrying, and report this ARC contract mismatch.",
  };
}

function operationalStateAccessRefusal(
  error: GitCommonStateAccessError,
): z.infer<typeof OperationalStateAccessRefusalSchema> {
  const causeText = error.failureCause === "read-only-filesystem"
    ? "the filesystem is read-only"
    : "the process was denied access";
  if (error.access === "write") {
    return {
      status: "refused",
      reason: "operational-state-not-writable",
      storage: "repository-git-common",
      cause: error.failureCause,
      recommendedActionText:
        `ARC could not write repository-scoped operational state in the repository's shared Git metadata because ${causeText}. `
        + "Ensure the invoking process can write the logical repository, including its shared Git directory, "
        + "or use its approved elevated-execution path, then retry.",
    };
  }
  return {
    status: "refused",
    reason: "operational-state-not-readable",
    storage: "repository-git-common",
    cause: error.failureCause,
    recommendedActionText:
      `ARC could not read repository-scoped operational state from the repository's shared Git metadata because ${causeText}. `
      + "Ensure the invoking process can read the logical repository, including its shared Git directory, then retry.",
  };
}

export interface DeliveryExecutionOptions { readonly input?: string; readonly json?: boolean }

function deliveryExecutionInputOptionSchema() {
  return z.strictObject({ input: z.string().min(1), json: z.boolean().optional() });
}

const InputOptionSchema = deliveryExecutionInputOptionSchema();

export const deliveryExecutionCommandInputRegistrations = Object.keys(RequestSchemas).map((command) => ({
  commandPath: executionPath(command as DeliveryExecutionCommand),
  schema: deliveryExecutionInputOptionSchema(),
  schemaFields: { "operand.input": "input", "option.json": "json" },
})) satisfies readonly CommandInputRegistration[];

export const deliveryExecutionCommandInputPolicyDeclarations = Object.keys(RequestSchemas).map((command) => ({
  commandPath: executionPath(command as DeliveryExecutionCommand),
  aliases: [],
  sites: [
    declareCliOperandSite("input", {
      acquisition: "handler-required",
      schemaOwnership: "owned",
      schemaField: "input",
      cancellation: "not-applicable",
      automation: { noInput: "read-explicit-stdin", flags: [], acceptedSyntax: ["<json-path>", "-"] },
      mutationBoundary: "delivery execution request validation",
      subprocess: "explicit-stdin",
    }),
    declareCliOptionSite("json", {
      acquisition: "machine-mode",
      schemaOwnership: "owned",
      schemaField: "json",
      cancellation: "not-applicable",
      automation: { noInput: "same", flags: ["--json"], acceptedSyntax: [] },
      mutationBoundary: "output selection",
      subprocess: "none",
    }),
    ...(command === "eligibility-prepare" ? [declareInteractionSite(
      { file: "handlers/delivery-execution.ts", kind: "explicit-stdin", callee: "process.stdin", occurrence: 1 },
      {
        acquisition: "explicit-stdin", schemaOwnership: "none", cancellation: "not-applicable",
        automation: { noInput: "read-explicit-stdin", flags: [], acceptedSyntax: ["-"] },
        mutationBoundary: "delivery execution request read", subprocess: "explicit-stdin",
      },
    )] : []),
    ...(command === "refresh-execute" ? [declareInteractionSite(
      { file: "scripts/delivery/provider-process.ts", kind: "subprocess", callee: "execa", occurrence: 1 },
      {
        acquisition: "subprocess",
        schemaOwnership: "none",
        cancellation: "not-applicable",
        automation: { noInput: "same", flags: [], acceptedSyntax: [] },
        mutationBoundary: "provider-native refresh preparation",
        subprocess: "close-stdin",
      },
    )] : []),
  ],
})) satisfies readonly CommandInputDeclaration[];

function executionPath(command: DeliveryExecutionCommand): string {
  if (command.startsWith("authoring-")) return `delivery authoring ${command.slice("authoring-".length)}`;
  if (command.startsWith("eligibility-")) return `delivery eligibility ${command.slice("eligibility-".length)}`;
  if (command.startsWith("land-")) return `delivery land ${command.slice("land-".length)}`;
  if (command.startsWith("native-")) return `delivery native ${command.slice("native-".length)}`;
  if (command.startsWith("refresh-")) return `delivery refresh ${command.slice("refresh-".length)}`;
  if (command.startsWith("review-fix-")) return `delivery review-fix ${command.slice("review-fix-".length)}`;
  return `delivery ${command}`;
}

function reviewFixFindingPath(locus: string): string | null {
  const matched = /^(.*?):\d+(?::\d+)?$/u.exec(locus.trim());
  const path = matched?.[1]?.trim() ?? "";
  return path === "" || path.includes("\0") ? null : path;
}

function requireTerminalMutationCommand(
  command: DeliveryExecutionCommand,
): asserts command is "teardown" | "top-remedy" {
  if (command !== "teardown" && command !== "top-remedy") {
    throw new Error(`Unhandled delivery execution command: ${command}`);
  }
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin as AsyncIterable<Buffer | string>) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export interface DeliveryExecutionHandlerDependencies {
  readText(source: string): Promise<string>;
  execute(command: DeliveryExecutionCommand, request: unknown, interaction?: InteractionContext): Promise<unknown>;
  write(text: string): void;
  setExitCode(code: number): void;
}

function defaultDependencies(): DeliveryExecutionHandlerDependencies {
  return {
    readText: (source) => source === "-" ? readStdin() : readFile(source, "utf8"),
    execute: executeDeliveryCommand,
    write: (text) => process.stdout.write(text),
    setExitCode: (code) => { process.exitCode = code; },
  };
}

type OwnedDeliveryAuthorityCommand =
  | "eligibility-prepare"
  | "eligibility-close"
  | "publish"
  | "rematerialize"
  | "rewrite";

function isOwnedDeliveryAuthorityCommand(
  command: DeliveryExecutionCommand,
): command is OwnedDeliveryAuthorityCommand {
  return command === "eligibility-prepare" || command === "eligibility-close"
    || command === "publish" || command === "rematerialize" || command === "rewrite";
}

function boundedDeliveryFailureDetail(value: unknown, fallback: string): string {
  const detail = (value instanceof Error ? value.message : typeof value === "string" ? value : fallback)
    .replace(/\s+/gu, " ")
    .trim();
  return (detail || fallback).slice(0, 4_096);
}

function ownedDeliveryFailure(
  command: OwnedDeliveryAuthorityCommand,
  result: Record<string, unknown>,
  request: unknown,
): z.infer<typeof OwnedDeliveryPublicFailureSchema> {
  const input = typeof request === "object" && request !== null && !Array.isArray(request)
    ? request as Record<string, unknown>
    : {};
  const requested = typeof input.requested === "object" && input.requested !== null
    ? input.requested as Record<string, unknown>
    : {};
  const requestedMembers = Array.isArray(requested.members) ? requested.members : [];
  const requestedMember = typeof requestedMembers[0] === "object" && requestedMembers[0] !== null
    ? requestedMembers[0] as Record<string, unknown>
    : {};
  const requestedCoordinates = typeof requestedMember.coordinates === "object"
    && requestedMember.coordinates !== null
    ? requestedMember.coordinates as Record<string, unknown>
    : {};
  const snapshot = typeof input.snapshot === "object" && input.snapshot !== null
    ? input.snapshot as Record<string, unknown>
    : {};
  const snapshotBase = typeof snapshot.protectedBase === "object" && snapshot.protectedBase !== null
    ? snapshot.protectedBase as Record<string, unknown>
    : {};
  const snapshotTop = typeof snapshot.top === "object" && snapshot.top !== null
    ? snapshot.top as Record<string, unknown>
    : {};
  const snapshotMembers = Array.isArray(snapshot.members) ? snapshot.members : [];
  const snapshotFinal = typeof snapshotMembers.at(-1) === "object" && snapshotMembers.at(-1) !== null
    ? snapshotMembers.at(-1) as Record<string, unknown>
    : {};
  const plan = typeof input.plan === "object" && input.plan !== null
    ? input.plan as Record<string, unknown>
    : {};
  const candidates = Array.isArray(input.candidates) ? input.candidates : [];
  const firstCandidate = typeof candidates[0] === "object" && candidates[0] !== null
    ? candidates[0] as Record<string, unknown>
    : {};
  const selectedDeliverableIds = Array.isArray(input.selectedDeliverableIds)
    ? input.selectedDeliverableIds
    : [];
  const gateResults = Array.isArray(input.gateResults) ? input.gateResults : [];
  const finalGate = typeof gateResults.at(-1) === "object" && gateResults.at(-1) !== null
    ? gateResults.at(-1) as Record<string, unknown>
    : {};
  const source = typeof result.source === "object" && result.source !== null
    ? result.source as Record<string, unknown>
    : {};
  const observed = typeof source.observed === "object" && source.observed !== null
    ? source.observed as Record<string, unknown>
    : {};
  const relation = typeof result.relation === "object" && result.relation !== null
    ? result.relation as Record<string, unknown>
    : {};
  const oidOrNull = (value: unknown) => GitObjectIdSchema.safeParse(value).success ? value as string : null;
  const planId = DeliveryPlanIdSchema.safeParse(input.planId ?? snapshot.planId ?? plan.planId);
  const deliverableId = DeliveryCanonicalDigestSchema.safeParse(
    input.deliverableId ?? result.deliverableId ?? snapshotFinal.deliverableId
      ?? selectedDeliverableIds[0] ?? firstCandidate.deliverableId,
  );
  const reason = typeof result.reason === "string" && result.reason.trim() !== ""
    ? result.reason.trim().slice(0, 128)
    : "delivery-operation-refused";
  const invalidInput = reason === "invalid-command-input";
  const preservedSource = DeliveryEligibilitySourceMovedSchema.shape.source.safeParse(result.source);
  const preservedNextAction = DeliveryEligibilitySourceMovedSchema.shape.nextAction.safeParse(result.nextAction);
  const preservedRelation = PredecessorRelationSchema.safeParse(result.relation);
  const preservedRemedy = DeliveryWrongPredecessorSchema.shape.remedy.safeParse(result.remedy);
  return OwnedDeliveryPublicFailureSchema.parse({
    status: result.status === "blocked" ? "blocked" : "refused",
    reason,
    detail: boundedDeliveryFailureDetail(
      result.detail,
      `The ${executionPath(command)} operation stopped because ${reason}.`,
    ),
    coordinates: {
      planId: planId.success ? planId.data : null,
      deliverableId: deliverableId.success ? deliverableId.data : null,
      snapshotBaseHead: oidOrNull(snapshotBase.head),
      snapshotTopHead: oidOrNull(snapshotTop.head),
      requestedBase: oidOrNull(requestedCoordinates.base),
      requestedHead: oidOrNull(requestedCoordinates.head ?? finalGate.head),
      observedHead: oidOrNull(observed.head ?? relation.observedTip),
    },
    ...(deliverableId.success ? { deliverableId: deliverableId.data } : {}),
    ...(Array.isArray(result.paths)
      ? { paths: result.paths.filter((path): path is string => typeof path === "string" && path !== "") }
      : {}),
    ...(preservedSource.success ? { source: preservedSource.data } : {}),
    ...(preservedNextAction.success ? { nextAction: preservedNextAction.data } : {}),
    ...(preservedRelation.success ? { relation: preservedRelation.data } : {}),
    ...(preservedRemedy.success ? { remedy: preservedRemedy.data } : {}),
    continuation: invalidInput
      ? { kind: "remedy", argv: ["arc", ...executionPath(command).split(" "), "--help"] }
      : {
          kind: "terminal-explanation",
          terminalExplanation: command === "rewrite"
            ? "No caller-authored field can restore rewrite authority; re-observe delivery state and use its guarded continuation."
            : command === "eligibility-prepare"
              ? "Resolve the reported candidate-chain evidence, then prepare eligibility again from current repository state."
              : "Reprepare eligibility from current repository state and rerun all required candidate gates before retrying publication.",
        },
  });
}

function normalizeOwnedDeliveryFailure(
  command: DeliveryExecutionCommand,
  result: DeliveryExecutionResult,
  request?: unknown,
): DeliveryExecutionResult {
  if (!isOwnedDeliveryAuthorityCommand(command)
    || (result.status !== "refused" && result.status !== "blocked")) return result;
  return ownedDeliveryFailure(command, result, request);
}

/** Validate one verb request, execute its domain service, and preserve its exact closed result. */
export async function handleDeliveryExecution(
  command: DeliveryExecutionCommand,
  opts: DeliveryExecutionOptions,
  interaction?: InteractionContext,
  overrides: Partial<DeliveryExecutionHandlerDependencies> = {},
): Promise<void> {
  const deps = { ...defaultDependencies(), ...overrides };
  const options = InputOptionSchema.safeParse(opts);
  if (!options.success) {
    emit(deps, command, { status: "refused", reason: "invalid-command-input" });
    return;
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(await deps.readText(options.data.input));
  } catch (error) {
    emit(deps, command, {
      status: "refused",
      reason: "invalid-command-input",
      ...(isOwnedDeliveryAuthorityCommand(command)
        ? { detail: boundedDeliveryFailureDetail(error, "The delivery request is not valid JSON.") }
        : {}),
    });
    return;
  }
  const request = RequestSchemas[command].safeParse(decoded);
  if (!request.success) {
    emit(deps, command, {
      status: "refused",
      reason: "invalid-command-input",
      ...(isOwnedDeliveryAuthorityCommand(command)
        ? { detail: boundedDeliveryFailureDetail(request.error.issues[0]?.message, "The request shape is invalid.") }
        : {}),
    }, decoded);
    return;
  }
  let result: unknown;
  try {
    result = await deps.execute(command, request.data, interaction);
  } catch (error) {
    emit(
      deps,
      command,
      error instanceof GitCommonStateAccessError
        ? operationalStateAccessRefusal(error)
        : {
            status: "refused",
            reason: "execution-unavailable",
            ...(isOwnedDeliveryAuthorityCommand(command)
              ? { detail: boundedDeliveryFailureDetail(error, "Delivery execution is unavailable.") }
              : {}),
          },
      request.data,
    );
    return;
  }
  const parsed = ResultSchema.safeParse(result);
  emit(deps, command, parsed.success ? parsed.data : invalidServiceResult(result), request.data);
}

function emit(
  deps: DeliveryExecutionHandlerDependencies,
  command: DeliveryExecutionCommand,
  result: DeliveryExecutionResult,
  request?: unknown,
): void {
  const output = normalizeOwnedDeliveryFailure(command, result, request);
  deps.write(`${JSON.stringify({ schemaVersion: 1, command: executionPath(command), ...output })}\n`);
  if (output.status === "refused" || output.status === "blocked") deps.setExitCode(1);
}

async function observeNativeDeliveryEffect(
  host: GhDeliveryHostPort,
  state: DeliveryStateV1,
  repository: string,
  operation: Extract<NonNullable<DeliveryStateV1["activeOperation"]>, { kind: "land" }>,
  exec: GitExec,
  cwd: string,
  remote: string,
): Promise<DeliveryNativeEffectFacts> {
  const merged: Array<{
    readonly deliverableId: string;
    readonly mergeCommitSha: string;
    readonly coordinates: { readonly base: string; readonly head: string; readonly tree: string };
  }> = [];
  for (const [index, entry] of operation.before.members.entries()) {
    const member = state.members.find((candidate) => candidate.deliverableId === entry.deliverableId);
    const prior = operation.before.members[index - 1];
    const expectedBaseRef = prior === undefined
      ? operation.effect.baseRef
      : prior.ref?.replace(/^refs\/heads\//u, "");
    if (entry.ref === null || entry.changeRequest === null || entry.coordinates === null
      || expectedBaseRef === undefined
      || member?.ref !== entry.ref || member.changeRequest === null || member.coordinates === null
      || member.changeRequest.providerId !== entry.changeRequest.providerId
      || member.changeRequest.changeRequestId !== entry.changeRequest.changeRequestId
      || member.coordinates.base !== entry.coordinates.base
      || member.coordinates.head !== entry.coordinates.head
      || member.coordinates.tree !== entry.coordinates.tree) {
      return { outcome: "ambiguous" };
    }
    const observed = await host.readRequest(repository, entry.changeRequest);
    if (observed.status !== "observed"
      || observed.request.repository !== repository
      || observed.request.headRepository !== repository
      || observed.request.binding.providerId !== entry.changeRequest.providerId
      || observed.request.binding.changeRequestId !== entry.changeRequest.changeRequestId
      || observed.request.headRef !== entry.ref.replace(/^refs\/heads\//u, "")
      || observed.request.headSha !== entry.coordinates.head
      || observed.request.baseRef !== expectedBaseRef) {
      return { outcome: "ambiguous" };
    }
    if (observed.request.state === "merged") {
      if (observed.request.mergeCommitSha === null || observed.request.mergeCommitSha === undefined) {
        return { outcome: "ambiguous" };
      }
      merged.push({
        deliverableId: entry.deliverableId,
        mergeCommitSha: observed.request.mergeCommitSha,
        coordinates: entry.coordinates,
      });
    }
  }
  if (merged.length === 0) return { outcome: "none-landed" };
  if (merged.length !== operation.before.members.length) {
    return { outcome: "partial-landed", affectedDeliverableIds: merged.map(({ deliverableId }) => deliverableId) };
  }
  const targetBefore = operation.before.target?.coordinates;
  if (targetBefore === null || targetBefore === undefined) {
    return { outcome: "ambiguous" };
  }
  const landedResults: Array<NonNullable<Awaited<ReturnType<typeof observeGitDeliveryLandingResult>>>> = [];
  if (operation.native?.arm === "linked-atomic" && merged.length > 1) {
    const commonMergeCommit = merged[0]?.mergeCommitSha;
    const highest = merged.at(-1);
    if (commonMergeCommit === undefined || highest === undefined
      || merged.some(({ mergeCommitSha }) => mergeCommitSha !== commonMergeCommit)) {
      return { outcome: "ambiguous" };
    }
    const aggregateResult = await observeGitDeliveryLandingResult({
      exec,
      cwd,
      remote,
      resultHead: commonMergeCommit,
      strategy: "merge",
      beforeMember: highest.coordinates,
    });
    if (aggregateResult === null) return { outcome: "ambiguous" };
    landedResults.push(aggregateResult);
  } else {
    for (const entry of merged) {
      const landedResult = await observeGitDeliveryLandingResult({
        exec,
        cwd,
        remote,
        resultHead: entry.mergeCommitSha,
        strategy: "merge",
        beforeMember: entry.coordinates,
      });
      if (landedResult === null) return { outcome: "ambiguous" };
      const previous = landedResults.at(-1);
      if (previous !== undefined && landedResult.predecessor.head !== previous.member.head) {
        return { outcome: "ambiguous" };
      }
      landedResults.push(landedResult);
    }
  }
  const firstResult = landedResults[0];
  const finalResult = landedResults.at(-1);
  if (firstResult === undefined || finalResult === undefined) return { outcome: "ambiguous" };
  const localOnlyExec: GitExec = (command, args, options) => exec(command, args, {
    ...options,
    cwd,
    objectAccess: "local-only",
  });
  if (await readAncestry(localOnlyExec, targetBefore.head, firstResult.predecessor.head) !== "ancestor") {
    return { outcome: "ambiguous" };
  }
  return {
    outcome: "all-landed",
    snapshot: {
      target: { ref: operation.effect.targetRef, coordinates: finalResult.member },
      members: operation.before.members,
    },
  };
}

async function resolveIntermediateDeliveryMergePolicy(
  cwd: string,
  repository: string,
): Promise<DeliveryMergePolicyBindingV1 | null> {
  try {
    const config = await readConfigSettings(cwd);
    const configured = MergeMethodSchema.safeParse(config.settings["merge.strategy"]);
    if (config.warnings.length > 0 || !configured.success) return null;
    const resolved = await resolveMergeMethod(
      configured.data,
      createGhMergeMethodPolicyPort(hostedGhRunner),
      repository,
      "intermediate",
    );
    if (resolved.state !== "validated") return null;
    const binding = DeliveryMergePolicyBindingV1Schema.safeParse({
      repository: resolved.repository,
      stackPosition: resolved.stackPosition,
      method: resolved.method,
      allowedMethods: resolved.allowedMethods,
      policyFingerprint: resolved.policyFingerprint,
    });
    return binding.success ? binding.data : null;
  } catch {
    return null;
  }
}

async function revalidateIntermediateDeliveryMergePolicy(
  cwd: string,
  binding: DeliveryMergePolicyBindingV1,
): Promise<{ readonly status: "exact" | "refused" }> {
  const current = await resolveIntermediateDeliveryMergePolicy(cwd, binding.repository);
  return current !== null && canonicalize(current) === canonicalize(binding)
    ? { status: "exact" }
    : { status: "refused" };
}

async function executeDeliveryCommand(
  command: DeliveryExecutionCommand,
  request: unknown,
  interaction?: InteractionContext,
  internalContext?: { readonly settledRecordEffectHead: string | null },
): Promise<unknown> {
  const cwd = requireArcProjectRoot();
  if (cwd === null) return { status: "refused", reason: "arc-project-root-unresolved" };
  const exec = createGitExec(interaction?.subprocess);
  const publisher = new RepositoryGitCommonStatePublisher(exec, cwd);
  const planStore = new RepositoryDeliveryPlanStore(publisher, DeliveryPlanV1Codec);
  const stateStore = new RepositoryDeliveryStateStore(publisher);
  const revalidateAuthoringAuthority = async (
    expected: z.infer<typeof ReviewFixAuthoringAuthoritySchema> & {
      readonly planId: string;
      readonly selectedDeliverableId: string;
      readonly expectedStateRevision: number;
    },
    state: DeliveryStateV1,
  ): Promise<{ readonly status: "current" } | { readonly status: "moved" }> => {
    let currentDerivation: z.infer<typeof DeliveryCorrectionDerivationSchema> | undefined;
    let requiredFindingPaths: readonly string[] = [];
    try {
      const entry = await inspectActiveRepositoryDeliveryEntry({ entryMode: "execution" }, interaction);
      if (expected.derivedFrom.kind === "open-task") {
        if (entry.status !== "correction-routing-required"
          || entry.planId !== expected.planId
          || entry.stateRevision !== expected.expectedStateRevision
          || entry.selectedDeliverableId !== expected.selectedDeliverableId
          || canonicalize(entry.derivedFrom) !== canonicalize(expected.derivedFrom)) {
          return { status: "moved" };
        }
        currentDerivation = entry.derivedFrom;
      } else if (expected.derivedFrom.kind === "pending-verification") {
        if (entry.status !== "review-fix-verification-required"
          || entry.planId !== expected.planId
          || entry.stateRevision !== expected.expectedStateRevision
          || entry.selectedDeliverableId !== expected.selectedDeliverableId
          || entry.acknowledgementInput.continuationDigest
            !== expected.derivedFrom.continuationDigest) {
          return { status: "moved" };
        }
        currentDerivation = expected.derivedFrom;
      } else {
        if (entry.status !== "not-applicable") return { status: "moved" };
        const records = await new LocalApprovedDispositionRecordStore(publisher).listDispositionRecords();
        const selection = selectPendingDeliveryReviewFixAuthority({
          workUnitId: state.workUnitId,
          records,
        });
        if (selection.status !== "selected"
          || selection.planId !== expected.planId
          || selection.selectedDeliverableId !== expected.selectedDeliverableId
          || selection.reviewedHead !== expected.derivedFrom.reviewedHead
          || selection.dispositionSetId !== expected.derivedFrom.dispositionSetId
          || !pendingDeliveryReviewFixAuthorityIsCurrent({
            selectedDeliverableId: selection.selectedDeliverableId,
            reviewedHead: selection.reviewedHead,
            state,
          })) {
          return { status: "moved" };
        }
        currentDerivation = expected.derivedFrom;
        requiredFindingPaths = selection.authorizedFindingLoci
          .map(reviewFixFindingPath)
          .filter((path): path is string => path !== null);
      }
    } catch {
      return { status: "moved" };
    }
    if (canonicalize(currentDerivation) !== canonicalize(expected.derivedFrom)) {
      return { status: "moved" };
    }

    const planned = ReviewFixRouteResultSchema.safeParse(await executeDeliveryCommand(
      "review-fix-plan",
      {
        planId: expected.planId,
        selectedDeliverableId: expected.selectedDeliverableId,
        repository: expected.repository,
        remote: expected.remote,
        entryMode: "integrating",
      },
      interaction,
    ));
    if (!planned.success || planned.data.route !== "provider-refresh"
      || planned.data.selectedDeliverableId !== expected.selectedDeliverableId
      || canonicalize(planned.data.affectedDeliverableIds)
        !== canonicalize(expected.affectedDeliverableIds)
      || canonicalize(planned.data.candidateRequirements.requiredAncestorHeads)
        !== canonicalize(expected.requiredAncestorHeads)) {
      return { status: "moved" };
    }

    const canonicalPaths = (paths: readonly string[]) =>
      sortByCanonicalBytes([...new Set(paths)]);
    return canonicalize(canonicalPaths(requiredFindingPaths))
      === canonicalize(canonicalPaths(expected.requiredFindingPaths))
      ? { status: "current" }
      : { status: "moved" };
  };
  const executeAuthoringRebind = async (input: unknown) => {
    const reboundInput = ReviewFixAuthoringRebindSchema.safeParse(input);
    if (!reboundInput.success) return { status: "refused" as const, reason: "authoring-rebind-invalid" };
    const expected = reboundInput.data;
    const [planRead, stateRead, active, gitCommonDir] = await Promise.all([
      planStore.readCurrent(expected.planId),
      stateStore.read(expected.planId),
      resolveActiveWu({ cwd }),
      resolveGitCommonDir(exec, cwd),
    ]);
    if (planRead.status !== "ok" || planRead.value === null
      || stateRead.status !== "ok" || stateRead.value === null
      || stateRead.value.revision !== expected.expectedStateRevision
      || stateRead.value.value.activeOperation !== null
      || active.status !== "resolved" || active.name !== planRead.value.workUnitId
      || validateDeliveryStateAgainstPlan(stateRead.value.value, planRead.value).status !== "valid") {
      return { status: "refused" as const, reason: "authoring-rebind-authority-moved" };
    }
    if ((await revalidateAuthoringAuthority(expected, stateRead.value.value)).status !== "current") {
      return { status: "refused" as const, reason: "authoring-rebind-authority-moved" };
    }
    const locatorResult = deriveDeliveryResidueLocators(planRead.value, gitCommonDir);
    const locators = locatorResult.status === "derived"
      ? locatorResult.locators.filter(
          ({ deliverableId }) => deliverableId === expected.selectedDeliverableId,
        )
      : [];
    const stateMembers = stateRead.value.value.members.filter(
      ({ deliverableId }) => deliverableId === expected.selectedDeliverableId,
    );
    const locator = locators[0];
    const member = stateMembers[0];
    if (locators.length !== 1 || stateMembers.length !== 1 || locator === undefined || member === undefined
      || locator.candidateRef !== expected.ref || resolve(locator.gatePath) !== resolve(expected.checkoutPath)
      || member.coordinates === null || member.ref === null
      || member.coordinates.head !== expected.publishedHead
      || member.coordinates.tree !== expected.publishedTree) {
      return { status: "refused" as const, reason: "authoring-rebind-coordinate-mismatch" };
    }
    const [gate, observedRef, publicCoordinates] = await Promise.all([
      observeDeliveryReviewFixCandidateGate({ exec, path: expected.checkoutPath, pathExists }),
      observeDeliveryEligibilityRef(exec, expected.ref),
      observeDeliveryEligibilityRef(exec, member.ref),
    ]);
    if (gate.status === "refused") {
      return {
        status: "refused" as const,
        reason: gate.reason === "dirty" ? "authoring-locus-dirty" : `authoring-rebind-${gate.reason}`,
      };
    }
    if (gate.status !== "observed" || observedRef === null || publicCoordinates === null) {
      return { status: "refused" as const, reason: "authoring-rebind-unavailable" };
    }
    if (publicCoordinates.head !== expected.publishedHead
      || publicCoordinates.tree !== expected.publishedTree) {
      return { status: "refused" as const, reason: "authoring-rebind-public-moved" };
    }
    const replayed = observedRef.head === expected.requestedHead
      && observedRef.tree === expected.requestedTree;
    if (gate.head !== expected.requestedHead || gate.tree !== expected.requestedTree
      || (!replayed && (observedRef.head !== expected.beforeHead || observedRef.tree !== expected.beforeTree))) {
      return { status: "refused" as const, reason: "authoring-rebind-moved" };
    }
    if (expected.beforeHead === expected.requestedHead
      || await readAncestry(exec, expected.beforeHead, expected.requestedHead) !== "ancestor") {
      return { status: "refused" as const, reason: "authoring-rebind-not-descendant" };
    }
    for (const ancestor of expected.requiredAncestorHeads) {
      if (await readAncestry(exec, ancestor, expected.requestedHead) !== "ancestor") {
        return { status: "refused" as const, reason: "authoring-rebind-ancestor-mismatch" };
      }
    }
    if (expected.requiredFindingPaths.length > 0) {
      const authoredPaths = (await exec(
        "git",
        ["diff", "--name-only", "-z", expected.publishedHead, expected.requestedHead, "--"],
        { cwd: expected.checkoutPath, objectAccess: "local-only" },
      )).stdout.split("\0").filter((path) => path !== "");
      if (!expected.requiredFindingPaths.some((path) => authoredPaths.includes(path))) {
        return { status: "refused" as const, reason: "authoring-rebind-finding-path-missing" };
      }
    }
    if (replayed) return { status: "already-rebound" as const, replayed: true };
    const rebound = await rebindDeliveryCandidateRef({
      exec,
      ref: expected.ref,
      beforeHead: expected.beforeHead,
      requestedHead: expected.requestedHead,
    });
    if (rebound.status === "refused") {
      return { status: "refused" as const, reason: `authoring-rebind-${rebound.reason}` };
    }
    return rebound.status === "adopted"
      ? { status: "already-rebound" as const, replayed: true }
      : { status: "rebound" as const };
  };
  const executeAuthoringRematerialize = async (input: unknown) => {
    const rematerializeInput = ReviewFixAuthoringRematerializeSchema.safeParse(input);
    if (!rematerializeInput.success) {
      return { status: "refused" as const, reason: "authoring-rematerialize-invalid" };
    }
    const expected = rematerializeInput.data;
    if ((expected.beforeHead === null) !== (expected.beforeTree === null)) {
      return { status: "refused" as const, reason: "authoring-rematerialize-invalid" };
    }
    const [planRead, stateRead, active, gitCommonDir] = await Promise.all([
      planStore.readCurrent(expected.planId),
      stateStore.read(expected.planId),
      resolveActiveWu({ cwd }),
      resolveGitCommonDir(exec, cwd),
    ]);
    if (planRead.status !== "ok" || planRead.value === null
      || stateRead.status !== "ok" || stateRead.value === null
      || stateRead.value.revision !== expected.expectedStateRevision
      || stateRead.value.value.activeOperation !== null
      || active.status !== "resolved" || active.name !== planRead.value.workUnitId
      || validateDeliveryStateAgainstPlan(stateRead.value.value, planRead.value).status !== "valid") {
      return { status: "refused" as const, reason: "authoring-rematerialize-authority-moved" };
    }
    if ((await revalidateAuthoringAuthority(expected, stateRead.value.value)).status !== "current") {
      return { status: "refused" as const, reason: "authoring-rematerialize-authority-moved" };
    }
    const locatorResult = deriveDeliveryResidueLocators(planRead.value, gitCommonDir);
    const locators = locatorResult.status === "derived"
      ? locatorResult.locators.filter(
          ({ deliverableId }) => deliverableId === expected.selectedDeliverableId,
        )
      : [];
    const stateMembers = stateRead.value.value.members.filter(
      ({ deliverableId }) => deliverableId === expected.selectedDeliverableId,
    );
    const locator = locators[0];
    const member = stateMembers[0];
    if (locators.length !== 1 || stateMembers.length !== 1 || locator === undefined || member === undefined
      || locator.candidateRef !== expected.ref || resolve(locator.gatePath) !== resolve(expected.checkoutPath)
      || member.coordinates === null || member.ref === null
      || member.coordinates.head !== expected.requestedHead
      || member.coordinates.tree !== expected.requestedTree) {
      return { status: "refused" as const, reason: "authoring-rematerialize-coordinate-mismatch" };
    }
    const publicCoordinates = await observeDeliveryEligibilityRef(exec, member.ref);
    if (publicCoordinates?.head !== expected.requestedHead
      || publicCoordinates.tree !== expected.requestedTree) {
      return { status: "refused" as const, reason: "authoring-rematerialize-public-moved" };
    }
    const observeCandidate = async () => {
      const local = await observeDeliveryLocalRef(exec, expected.ref);
      if (local.status === "refused") {
        return { status: "refused" as const, reason: local.reason };
      }
      if (local.status === "absent") return { status: "absent" as const };
      const coordinates = await observeDeliveryEligibilityRef(exec, expected.ref);
      return coordinates === null || coordinates.head !== local.head
        ? { status: "refused" as const, reason: "coordinate-unavailable" }
        : { status: "observed" as const, ...coordinates };
    };
    return prepareDeliveryReviewFixCandidateGate({
      before: expected.beforeHead === null || expected.beforeTree === null
        ? { head: expected.requestedHead, tree: expected.requestedTree }
        : { head: expected.beforeHead, tree: expected.beforeTree },
      current: { head: expected.requestedHead, tree: expected.requestedTree },
    }, {
      observeGate: () => observeDeliveryReviewFixCandidateGate({
        exec,
        path: expected.checkoutPath,
        pathExists,
      }),
      observeCandidate,
      rewriteCandidate: ({ beforeHead, requestedHead }) => rebindDeliveryCandidateRef({
        exec,
        ref: expected.ref,
        beforeHead,
        requestedHead,
      }),
      resetGate: ({ beforeHead, requestedHead }) => resetDeliveryReviewFixCandidateGate({
        exec,
        path: expected.checkoutPath,
        beforeHead,
        requestedHead,
      }),
      createPair: (coordinates) => createDeliveryReviewFixCandidatePair({
        exec,
        ref: expected.ref,
        path: expected.checkoutPath,
        coordinates,
        ensureParent: async (path) => {
          await mkdir(dirname(path), { recursive: true });
        },
      }),
    });
  };
  if (command === "authoring-rematerialize") return executeAuthoringRematerialize(request);
  if (command === "authoring-rebind") return executeAuthoringRebind(request);
  const readExpectedRecordEffects = async (
    paths: readonly string[],
  ): Promise<readonly DeliveryReviewFixExpectedRecord[]> => Promise.all(
    sortByCanonicalBytes([...new Set(paths)]).map(async (path) => ({
      path,
      digest: deliveryReviewFixRecordDigest(await readFile(resolve(cwd, path), "utf8")),
    })),
  );
  if (command === "review-fix-continue") {
    const parsed = ReviewFixContinueSchema.parse(request);
    const readLandedDeliverableIds = async (planId: string): Promise<readonly string[] | null> => {
      const positioned = await executeDeliveryCommand("position", {
        planId,
        repository: parsed.repository,
        remote: parsed.remote,
      }, interaction);
      const result = z.object({
        status: z.literal("position"),
        position: z.object({ landedPrefix: z.array(DeliveryCanonicalDigestSchema) }),
      }).safeParse(positioned);
      return result.success ? result.data.position.landedPrefix : null;
    };
    let projectionRequest: z.infer<typeof ReviewFixContinueSchema> = parsed;
    let expectedRecordEffects: readonly DeliveryReviewFixExpectedRecord[] = parsed.recordEffects ?? [];
    let settledRecordEffectHead: string | null = null;
    type DeliveryReviewFixWorkUnitLocus = {
      readonly name: string;
      readonly path: string;
      readonly branch: string | null;
      readonly baseBranch: string;
    };
    let reviewFixLocusPromise: Promise<DeliveryReviewFixWorkUnitLocus | null> | null = null;
    const resolveReviewFixLocus = (): Promise<DeliveryReviewFixWorkUnitLocus | null> => {
      reviewFixLocusPromise ??= (async () => {
        const [{ settings }, active] = await Promise.all([
          readConfigSettings(cwd),
          resolveActiveWu({ cwd }),
        ]);
        if (active.status === "resolved" && active.name !== "") {
          return { ...active, baseBranch: settings["branch.base"] };
        }
        const owner = await resolveCandidateMutationOwner({ cwd, exec });
        if (owner.status !== "owned") return null;
        const index = await buildLifecycleIndex({
          cwd,
          fs: {
            readdir: (path) => readdir(path, { withFileTypes: true }),
            readFile: (path) => readFile(path, "utf8"),
          },
        });
        const completed = index.get(owner.workUnit);
        if (completed?.location !== "completed") return null;
        const branch = await exec("git", ["symbolic-ref", "--quiet", "--short", "HEAD"], {
          cwd,
          objectAccess: "local-only",
        }).then(({ stdout }) => stdout.trim(), () => null);
        return {
          name: owner.workUnit,
          path: completed.path,
          branch,
          baseBranch: settings["branch.base"],
        };
      })();
      return reviewFixLocusPromise;
    };
    const inspectReviewFixRepositoryEntry = async (
      entryMode: "execution" | "integrating",
    ): Promise<DeliveryEntryInspectionResult> => {
      const locus = await resolveReviewFixLocus();
      if (locus === null) throw new Error("Delivery review-fix work unit unavailable");
      const meta = parseMetaFile(await readFile(resolve(cwd, locus.path), "utf8"));
      const taskListPath = meta.taskList === null || meta.taskList === "[none]"
        ? null
        : resolveTaskListPath(locus.path, meta.taskList);
      if (taskListPath === null) throw new Error("Delivery review-fix task list unavailable");
      return inspectRepositoryDeliveryEntryAt({
        cwd,
        taskListPath,
        request: { workUnitId: SlugSchema.parse(locus.name), entryMode },
        baseBranch: locus.baseBranch,
        exec,
      });
    };
    const captureExpectedRecordEffects = async (paths: readonly string[]): Promise<void> => {
      expectedRecordEffects = await readExpectedRecordEffects(paths);
    };
    const reconstructExpectedRecordEffects = async (workUnitId: string): Promise<
      | { readonly status: "none" }
      | { readonly status: "defer-acknowledgement" }
      | { readonly status: "ready"; readonly records: readonly DeliveryReviewFixExpectedRecord[] }
      | { readonly status: "refused"; readonly reason: string; readonly paths: readonly string[] }
    > => {
      const candidatePath = resolveCandidateRecordRelativePath(workUnitId);
      const boundaryPath = resolveSubmissionBoundaryPath(workUnitId);
      const readGitRecord = async (revision: string, path: string): Promise<string | null> => {
        try {
          return (await exec("git", ["show", revision === "" ? `:${path}` : `${revision}:${path}`], {
            cwd,
            objectAccess: "local-only",
          })).stdout;
        } catch {
          return null;
        }
      };
      let stagedPaths: readonly string[];
      try {
        stagedPaths = sortByCanonicalBytes((await exec(
          "git",
          ["diff", "--cached", "--name-only", "-z", "--"],
          { cwd, objectAccess: "local-only" },
        )).stdout.split("\0").filter((path) => path !== ""));
      } catch {
        return { status: "none" };
      }
      let recordClass: "candidate-boundary-projection" | "boundary-projection";
      let beforeRevision: string;
      let currentRevision: string;
      let effectPaths: readonly string[];
      let currentBoundaryFromWorktree = false;
      let acknowledgementCandidatePrefix = false;
      let pathsToStage: readonly string[] = [];
      const staged = classifyDeliveryReviewFixStagedRecords({ workUnitId, paths: stagedPaths });
      if (staged.status === "ready") {
        if (staged.recordClass === "review-applicability-selection") {
          acknowledgementCandidatePrefix = true;
          recordClass = "candidate-boundary-projection";
          beforeRevision = "HEAD";
          currentRevision = "";
          effectPaths = sortByCanonicalBytes([candidatePath, boundaryPath]);
          currentBoundaryFromWorktree = true;
          pathsToStage = [boundaryPath];
        } else {
          recordClass = staged.recordClass;
          beforeRevision = "HEAD";
          currentRevision = "";
          effectPaths = staged.paths;
        }
      } else {
        let unstagedPaths: readonly string[];
        try {
          unstagedPaths = sortByCanonicalBytes((await exec(
            "git",
            ["diff", "--name-only", "-z", "--", candidatePath, boundaryPath],
            { cwd, objectAccess: "local-only" },
          )).stdout.split("\0").filter((path) => path !== ""));
        } catch {
          unstagedPaths = [];
        }
        const unstaged = classifyDeliveryReviewFixStagedRecords({ workUnitId, paths: unstagedPaths });
        if (unstaged.status === "ready" && unstaged.recordClass === "boundary-projection") {
          recordClass = "boundary-projection";
          beforeRevision = "HEAD";
          currentRevision = "HEAD";
          effectPaths = unstaged.paths;
          currentBoundaryFromWorktree = true;
          pathsToStage = unstaged.paths;
        } else {
          let head: string;
          let branch: string;
          try {
            [head, branch] = await Promise.all([
              exec("git", ["rev-parse", "HEAD"], { cwd, objectAccess: "local-only" })
                .then(({ stdout }) => stdout.trim()),
              exec("git", ["symbolic-ref", "--quiet", "--short", "HEAD"], {
                cwd,
                objectAccess: "local-only",
              }).then(({ stdout }) => stdout.trim()),
            ]);
          } catch {
            return { status: "none" };
          }
          if (head === settledRecordEffectHead) return { status: "none" };
          let committedPaths: readonly string[];
          let parent: string;
          let message: string;
          try {
            [committedPaths, parent, message] = await Promise.all([
              exec("git", ["diff-tree", "--no-commit-id", "--name-only", "-z", "-r", "HEAD", "--"], {
                cwd,
                objectAccess: "local-only",
              }).then(({ stdout }) => sortByCanonicalBytes(stdout.split("\0").filter((path) => path !== ""))),
              exec("git", ["rev-parse", "HEAD^"], { cwd, objectAccess: "local-only" })
                .then(({ stdout }) => stdout.trim()),
              exec("git", ["log", "-1", "--format=%B"], { cwd, objectAccess: "local-only" })
                .then(({ stdout }) => stdout.trimEnd()),
            ]);
          } catch {
            return { status: "none" };
          }
          const classified = classifyDeliveryReviewFixStagedRecords({ workUnitId, paths: committedPaths });
          if (classified.status !== "ready"
            || classified.recordClass === "review-applicability-selection"
            || canonicalize(committedPaths) !== canonicalize(classified.paths)
            || !isDeliveryReviewFixRecordCommitMessage({
              message,
              recordClass: classified.recordClass,
              context: `meta-${workUnitId}.md (integration)`,
            })) {
            return { status: "none" };
          }
          recordClass = classified.recordClass;
          beforeRevision = parent;
          currentRevision = head;
          effectPaths = classified.paths;
          const remote = await observeDeliveryRemoteRef(exec, parsed.remote, `refs/heads/${branch}`);
          if (remote.status === "observed" && remote.head === head) return { status: "none" };
        }
      }
      const [beforeCandidateContent, currentCandidateContent, beforeBoundaryContent, worktreeBoundaryContent] =
        await Promise.all([
          readGitRecord(beforeRevision, candidatePath),
          readGitRecord(currentRevision, candidatePath),
          readGitRecord(beforeRevision, boundaryPath),
          currentBoundaryFromWorktree
            ? readFile(resolve(cwd, boundaryPath), "utf8").catch(() => null)
            : readGitRecord(currentRevision, boundaryPath),
        ]);
      if (beforeCandidateContent === null || currentCandidateContent === null
        || beforeBoundaryContent === null || worktreeBoundaryContent === null) {
        return { status: "refused", reason: "record-effect-recovery-unprovable", paths: effectPaths };
      }
      const beforeCandidate = parseCandidateManagedRecord(beforeCandidateContent);
      const currentCandidate = parseCandidateManagedRecord(currentCandidateContent);
      let beforeBoundary;
      let currentBoundary;
      try {
        beforeBoundary = parseIntegrationBoundaryLocus(JSON.parse(beforeBoundaryContent) as unknown);
        currentBoundary = parseIntegrationBoundaryLocus(JSON.parse(worktreeBoundaryContent) as unknown);
      } catch {
        return { status: "refused", reason: "record-effect-recovery-unprovable", paths: effectPaths };
      }
      if (beforeCandidate === null || currentCandidate === null
        || beforeBoundary.workUnit !== workUnitId || currentBoundary.workUnit !== workUnitId
        || currentBoundary.locus !== "delivery-status-required"
        || currentBoundary.reservation.target.kind !== "delivery") {
        return { status: "refused", reason: "record-effect-recovery-unprovable", paths: effectPaths };
      }
      const planId = currentBoundary.reservation.target.planId;
      const [planRead, stateRead] = await Promise.all([
        planStore.readCurrent(planId),
        stateStore.read(planId),
      ]);
      if (planRead.status !== "ok" || planRead.value === null
        || stateRead.status !== "ok" || stateRead.value === null
        || planRead.value.workUnitId !== workUnitId
        || stateRead.value.value.workUnitId !== workUnitId
        || validateDeliveryStateAgainstPlan(stateRead.value.value, planRead.value).status !== "valid") {
        return { status: "refused", reason: "record-effect-recovery-unprovable", paths: effectPaths };
      }
      if (recordClass === "candidate-boundary-projection" && currentRevision === "") {
        const pending = stateRead.value.value.pendingReviewFixVerification;
        if (!acknowledgementCandidatePrefix
          || pending === null
          || canonicalize(beforeBoundary) !== canonicalize(currentBoundary)
          || !isDeliveryReviewFixVerificationResponseAppend(
            beforeCandidate,
            currentCandidate,
            canonicalDigest(stateRead.value.value),
          )) {
          return { status: "refused", reason: "record-effect-recovery-unprovable", paths: effectPaths };
        }
        return { status: "defer-acknowledgement" };
      }
      let candidateSubjectDigest: string;
      if (recordClass === "boundary-projection") {
        const locus = await resolveReviewFixLocus();
        if (locus === null || locus.name !== workUnitId) {
          return { status: "refused", reason: "record-effect-recovery-unprovable", paths: effectPaths };
        }
        try {
          const effectiveCandidate = await projectGitCandidateEffectiveTarget({
            cwd,
            name: locus.name,
            baseBranch: locus.baseBranch,
            record: currentCandidate,
            exec,
            rawExec: createRawGitExec(cwd),
          });
          if (effectiveCandidate.state !== "current"
            || effectiveCandidate.candidateId !== currentBoundary.candidateId) {
            return { status: "refused", reason: "record-effect-recovery-unprovable", paths: effectPaths };
          }
          candidateSubjectDigest = effectiveCandidate.recognizedTarget.subject.subjectDigest;
        } catch {
          return { status: "refused", reason: "record-effect-recovery-unprovable", paths: effectPaths };
        }
      } else {
        candidateSubjectDigest = reduceCandidateDurableBaseline(currentCandidate).target.subject.subjectDigest;
      }
      const records = reconstructDeliveryReviewFixExpectedRecords({
        recordClass,
        plan: planRead.value,
        state: stateRead.value,
        beforeCandidate,
        currentCandidate,
        beforeBoundary,
        currentBoundary,
        candidateSubjectDigest,
        candidateRecord: { path: candidatePath, content: currentCandidateContent },
        boundaryRecord: { path: boundaryPath, content: worktreeBoundaryContent },
      });
      if (records === null) {
        return { status: "refused", reason: "record-effect-recovery-unprovable", paths: effectPaths };
      }
      if (pathsToStage.length > 0) {
        try {
          await exec("git", ["add", "--", ...pathsToStage], { cwd });
        } catch {
          return { status: "refused", reason: "record-effect-recovery-unprovable", paths: effectPaths };
        }
      }
      return { status: "ready", records };
    };
    const project = async () => {
      let approvedDispositionSet: {
        readonly dispositionSetId: string;
        readonly authorizedFindingIds: readonly string[];
        readonly authorizedFindingLoci: readonly string[];
      } | undefined;
      let approvedFix: {
        readonly fixAuthorizationId: string;
        readonly workUnitId: string;
        readonly reviewedHead: string;
      } | undefined;
      let authorityPreservation: {
        readonly reviewedHead: string;
        readonly currentHead: string;
        readonly proof: "tree-equality" | "mechanical-reapply";
        readonly projectionDigest: string;
        readonly residualDigest: string;
      } | undefined;
      const projectTerminalRecordRebind = async (
        planId: string,
        reviewFixSelectedDeliverableId?: string,
        authoringEntry?: DeliveryCorrectionRoutingEntry,
      ) => {
        const [currentPlan, currentState, locus] = await Promise.all([
          planStore.readCurrent(planId),
          stateStore.read(planId),
          resolveReviewFixLocus(),
        ]);
        if (currentPlan.status !== "ok" || currentPlan.value === null
          || currentState.status !== "ok" || currentState.value === null
          || locus === null || locus.branch === null) {
          return { status: "refused" as const, reason: "delivery-unavailable" };
        }
        const terminal = currentState.value.value.members.at(-1);
        if (terminal?.ref !== `refs/heads/${locus.branch}`
          || terminal.coordinates === null
          || terminal.changeRequest === null) {
          return { status: "not-required" as const };
        }
        const terminalCheckout = await inspectDeliveryAuthoringCheckout(exec, cwd);
        if (terminalCheckout === null) {
          return { status: "refused" as const, reason: "terminal-rebind-unavailable" };
        }
        if (terminalCheckout.trackedDirty) {
          return { status: "refused" as const, reason: "authoring-locus-dirty" };
        }
        if (terminalCheckout.head === terminal.coordinates.head) {
          return { status: "not-required" as const };
        }
        const observedTop = await new GhDeliveryHostPort(hostedGhRunner).readRequest(
          parsed.repository,
          terminal.changeRequest,
        );
        if (observedTop.status !== "observed") {
          return { status: "refused" as const, reason: "top-request-unavailable" };
        }
        if (observedTop.request.repository !== parsed.repository
          || observedTop.request.headRepository !== parsed.repository
          || observedTop.request.headRef !== locus.branch
          || observedTop.request.state !== "open") {
          return { status: "refused" as const, reason: "terminal-publication-moved" };
        }
        if (observedTop.request.headSha === terminal.coordinates.head) {
          if (authoringEntry === undefined
            || reviewFixSelectedDeliverableId !== authoringEntry.selectedDeliverableId) {
            return { status: "refused" as const, reason: "terminal-publication-required" };
          }
          return projectDeliveryReviewFixContinuation({
            request: projectionRequest,
            entry: authoringEntry,
            state: currentState.value,
            activeBranch: locus.branch,
            route: {
              status: "planned" as const,
              route: "terminal-authoring" as const,
              selectedDeliverableId: authoringEntry.selectedDeliverableId,
              affectedDeliverableIds: [authoringEntry.selectedDeliverableId],
              nextAction: "author-terminal" as const,
              recommendedActionText:
                "Verify and commit the approved correction on the exact terminal work-unit branch, push that "
                + "branch, then resume; no delivery member rewrite is required.",
            },
            authoring: {
              status: "authoring-required" as const,
              kind: "top" as const,
              ref: terminal.ref,
              checkoutPath: cwd,
            },
          });
        }
        if (observedTop.request.headSha !== terminalCheckout.head) {
          return { status: "refused" as const, reason: "terminal-publication-moved" };
        }
        return {
          status: "dispatch" as const,
          action: {
            kind: "delivery-reconcile" as const,
            argv: ["arc", "delivery", "reconcile", "-", "--json"] as const,
            input: {
              planId,
              repository: parsed.repository,
              remote: parsed.remote,
              continuation: "read-position" as const,
              ...(reviewFixSelectedDeliverableId === undefined
                ? {}
                : { reviewFixSelectedDeliverableId }),
            },
          },
          recommendedActionText:
            "Rebind the machine-owned terminal record advance before resolving delivery status.",
        };
      };
      const prepareCorrection = async (correctionEntry: DeliveryCorrectionRoutingEntry) => {
        const planned = ReviewFixRouteResultSchema.safeParse(await executeDeliveryCommand(
          "review-fix-plan",
          {
            planId: correctionEntry.planId,
            selectedDeliverableId: correctionEntry.selectedDeliverableId,
            repository: parsed.repository,
            remote: parsed.remote,
            entryMode: "integrating",
          },
          interaction,
        ));
        if (!planned.success) {
          return {
            status: "refused" as const,
            result: { status: "refused" as const, reason: "review-fix-route-unavailable" },
          };
        }
        const [stateRead, locus, currentPlanRead] = await Promise.all([
          stateStore.read(correctionEntry.planId),
          resolveReviewFixLocus(),
          planStore.readCurrent(correctionEntry.planId),
        ]);
        const landedDeliverableIds = stateRead.status === "ok" && stateRead.value !== null
          ? await readLandedDeliverableIds(correctionEntry.planId)
          : [];
        if (landedDeliverableIds === null) {
          return {
            status: "refused" as const,
            result: { status: "refused" as const, reason: "review-fix-position-unavailable" },
          };
        }
        let authoring;
        if (stateRead.status === "ok" && stateRead.value !== null
          && locus !== null && locus.branch !== null
          && currentPlanRead.status === "ok" && currentPlanRead.value !== null
          && (planned.data.route === "provider-refresh"
            || planned.data.route === "rematerialize"
            || planned.data.route === "terminal-authoring")) {
          const state = stateRead.value.value;
          const selected = state.members.find(
            ({ deliverableId }) => deliverableId === correctionEntry.selectedDeliverableId,
          );
          const terminalHead = state.members.at(-1)?.coordinates?.head;
          if (selected?.coordinates !== null && selected?.coordinates !== undefined
            && terminalHead !== undefined) {
            const candidateRoute = planned.data.route === "provider-refresh";
            const gitCommonDir = candidateRoute ? await resolveGitCommonDir(exec, cwd) : null;
            const locator = candidateRoute && gitCommonDir !== null
              ? deriveDeliveryResidueLocators(currentPlanRead.value, gitCommonDir)
              : null;
            const candidateLocator = locator?.status === "derived"
              ? locator.locators.find(
                  ({ deliverableId }) => deliverableId === correctionEntry.selectedDeliverableId,
                )
              : undefined;
            const ref = candidateRoute
              ? candidateLocator?.candidateRef ?? ""
              : `refs/heads/${locus.branch}`;
            const checkoutPath = candidateRoute ? candidateLocator?.gatePath ?? "" : cwd;
            if (ref !== "" && checkoutPath !== "") {
              const [checkout, observedRef, candidateGate] = await Promise.all([
                candidateRoute
                  ? Promise.resolve(null)
                  : inspectDeliveryAuthoringCheckout(exec, checkoutPath),
                observeDeliveryEligibilityRef(exec, ref),
                candidateRoute
                  ? observeDeliveryReviewFixCandidateGate({ exec, path: checkoutPath, pathExists })
                  : Promise.resolve(null),
              ]);
              if (candidateGate?.status === "refused") {
                return {
                  status: "prepared" as const,
                  authoring: undefined,
                  result: {
                    status: "refused" as const,
                    reason: `authoring-locus-${candidateGate.reason}`,
                  },
                };
              }
              const observed = candidateRoute
                ? candidateGate?.status === "observed"
                  ? { head: candidateGate.head, tree: candidateGate.tree, trackedDirty: false }
                  : null
                : checkout;
              const requiredAncestorHeads: readonly string[] = planned.data.route === "provider-refresh"
                ? planned.data.candidateRequirements.requiredAncestorHeads
                : [terminalHead];
              const authoredPaths = observed === null
                ? undefined
                : (await exec(
                    "git",
                    ["diff", "--name-only", "-z", candidateRoute
                      ? selected.coordinates.head
                      : terminalHead, observed.head, "--"],
                    { cwd: checkoutPath, objectAccess: "local-only" },
                  )).stdout.split("\0").filter((path) => path !== "");
              const requiredFindingPaths = approvedDispositionSet?.authorizedFindingLoci
                .map(reviewFixFindingPath)
                .filter((path): path is string => path !== null) ?? [];
              const ancestry = observed === null
                ? []
                : await Promise.all(requiredAncestorHeads.map(async (ancestor: string) => ({
                    ancestor,
                    status: await readAncestry(exec, ancestor, observed.head),
                  })));
              if (candidateRoute && observed !== null && observedRef !== null
                && observed.head !== observedRef.head) {
                return {
                  status: "prepared" as const,
                  authoring: undefined,
                  result: {
                    status: "dispatch" as const,
                    nextAction: "dispatch" as const,
                    action: {
                      kind: "delivery-review-fix-authoring-rebind" as const,
                      input: {
                        repository: parsed.repository,
                        remote: parsed.remote,
                        derivedFrom: correctionEntry.derivedFrom,
                        route: "provider-refresh" as const,
                        affectedDeliverableIds: planned.data.affectedDeliverableIds,
                        planId: correctionEntry.planId,
                        selectedDeliverableId: correctionEntry.selectedDeliverableId,
                        expectedStateRevision: stateRead.value.revision,
                        ref,
                        checkoutPath,
                        beforeHead: observedRef.head,
                        beforeTree: observedRef.tree,
                        requestedHead: observed.head,
                        requestedTree: observed.tree,
                        publishedHead: selected.coordinates.head,
                        publishedTree: selected.coordinates.tree,
                        requiredAncestorHeads,
                        requiredFindingPaths,
                      },
                    },
                    recommendedActionText:
                      "Bind the exact clean detached authoring head to its candidate ref, then continue correction.",
                  },
                };
              }
              const readiness = classifyDeliveryReviewFixAuthoringReadiness({
                locus: { kind: candidateRoute ? "candidate" : "top", ref, checkoutPath },
                publishedHead: candidateRoute ? selected.coordinates.head : terminalHead,
                observed,
                refCoordinates: observedRef,
                ...(authoredPaths === undefined ? {} : { authoredPaths }),
                requiredFindingPaths,
                requiredAncestorHeads,
                ancestry,
              });
              authoring = planned.data.route === "terminal-authoring"
                && planned.data.publicationRequired === true && readiness.status === "ready"
                ? { status: "authoring-required" as const, kind: "top" as const, ref, checkoutPath }
                : readiness;
              if (candidateRoute && authoring.status === "authoring-required") {
                const gateAbsent = candidateGate?.status === "absent";
                const refAbsent = observedRef === null;
                if (gateAbsent !== refAbsent) {
                  return {
                    status: "prepared" as const,
                    authoring: undefined,
                    result: { status: "refused" as const, reason: "authoring-candidate-pair-split" },
                  };
                }
                const ancestryRequiresPreparation = ancestry.some(({ status }) => status === "not-ancestor");
                if ((gateAbsent && refAbsent) || ancestryRequiresPreparation) {
                  return {
                    status: "prepared" as const,
                    authoring: undefined,
                    result: {
                      status: "dispatch" as const,
                      nextAction: "dispatch" as const,
                      action: {
                        kind: "delivery-review-fix-authoring-rematerialize" as const,
                        input: {
                          repository: parsed.repository,
                          remote: parsed.remote,
                          derivedFrom: correctionEntry.derivedFrom,
                          route: "provider-refresh" as const,
                          affectedDeliverableIds: planned.data.affectedDeliverableIds,
                          planId: correctionEntry.planId,
                          selectedDeliverableId: correctionEntry.selectedDeliverableId,
                          expectedStateRevision: stateRead.value.revision,
                          ref,
                          checkoutPath,
                          beforeHead: observedRef?.head ?? null,
                          beforeTree: observedRef?.tree ?? null,
                          requestedHead: selected.coordinates.head,
                          requestedTree: selected.coordinates.tree,
                          requiredAncestorHeads,
                          requiredFindingPaths,
                        },
                      },
                      recommendedActionText:
                        "Prepare the exact clean private candidate gate at the current public member, then continue.",
                    },
                  };
                }
              }
            }
          }
        }
        return {
          status: "prepared" as const,
          authoring,
          publicationRequired: planned.data.route === "terminal-authoring"
            && planned.data.publicationRequired === true,
          result: projectDeliveryReviewFixContinuation({
            request: projectionRequest,
            entry: correctionEntry,
            route: planned.data,
            landedDeliverableIds,
            ...(stateRead.status === "ok" && stateRead.value !== null ? { state: stateRead.value } : {}),
            ...(locus === null || locus.branch === null ? {} : { activeBranch: locus.branch }),
            ...(authoring === undefined ? {} : { authoring }),
            ...(approvedDispositionSet === undefined ? {} : { approvedDispositionSet }),
            ...(approvedFix === undefined ? {} : { approvedFix }),
          }),
        };
      };
      const applyDurableLocalAcknowledgementReplay = async (
        workUnitId: string,
        pending: Extract<DeliveryEntryInspectionResult, { readonly status: "review-fix-verification-required" }>,
        records: Parameters<typeof selectDurableLocalDeliveryReviewFixAcknowledgementReplay>[0]["records"],
      ) => {
        const stateRead = await stateStore.read(pending.planId);
        const selectedMembers = stateRead.status === "ok" && stateRead.value !== null
          ? stateRead.value.value.members.filter(
              ({ deliverableId }) => deliverableId === pending.selectedDeliverableId,
            )
          : [];
        const selected = selectedMembers[0];
        if (selectedMembers.length !== 1 || selected?.coordinates === null
          || selected?.coordinates === undefined) {
          return { status: "refused" as const, reason: "review-fix-acknowledgement-replay-invalid" as const };
        }
        const replay = selectDurableLocalDeliveryReviewFixAcknowledgementReplay({
          workUnitId,
          planId: pending.planId,
          selectedDeliverableId: pending.selectedDeliverableId,
          selectedMemberTarget: {
            head: selected.coordinates.head,
            tree: selected.coordinates.tree,
          },
          target: pending.verification.target,
          records,
        });
        if (replay.status === "selected") {
          projectionRequest = {
            repository: parsed.repository,
            remote: parsed.remote,
            verification: {
              ...replay.verification,
              verificationEvidenceRefs: [...replay.verification.verificationEvidenceRefs],
            },
          };
        }
        return replay.status === "refused" ? replay : null;
      };
      let entry = await inspectReviewFixRepositoryEntry("execution");
      if (entry.status === "review-fix-verification-required") {
        const locus = await resolveReviewFixLocus();
        if (locus === null) {
          return { status: "refused", reason: "active-work-unit-unavailable" };
        }
        let dispositionRecords;
        try {
          dispositionRecords = await new LocalApprovedDispositionRecordStore(publisher).listDispositionRecords();
        } catch {
          return { status: "refused", reason: "review-fix-response-unavailable" };
        }
        const refused = await applyDurableLocalAcknowledgementReplay(locus.name, entry, dispositionRecords);
        if (refused !== null) return refused;
      }
    if (entry.status === "not-applicable") {
      const locus = await resolveReviewFixLocus();
      if (locus === null) {
        return { status: "refused", reason: "active-work-unit-unavailable" };
      }
      const meta = parseMetaFile(await readFile(resolve(cwd, locus.path), "utf8"));
      const taskListPath = meta.taskList === null || meta.taskList === "[none]"
        ? null
        : resolveTaskListPath(locus.path, meta.taskList);
      if (taskListPath === null) return { status: "refused", reason: "task-list-unavailable" };
      const taskList = await readFile(resolve(cwd, taskListPath), "utf8");
      const cursor = resolveTaskListCursor(taskList);
      if (cursor.status !== "no-open-task") {
        return cursor.status === "malformed"
          ? { status: "refused", reason: "task-cursor-unavailable" }
          : {
              status: "idle",
              nextAction: "continue-work-unit",
              recommendedActionText: "Continue the current non-delivery task before resuming delivery integration.",
            };
      }
      let dispositionRecords;
      try {
        dispositionRecords = await new LocalApprovedDispositionRecordStore(publisher).listDispositionRecords();
      } catch {
        return { status: "refused", reason: "review-fix-response-unavailable" };
      }
      const selection = selectPendingDeliveryReviewFixAuthority({
        workUnitId: locus.name,
        records: dispositionRecords,
      });
      if (selection.status === "refused") return selection;
      if (selection.status === "selected") {
        approvedFix = {
          fixAuthorizationId: selection.fixAuthorizationId,
          workUnitId: selection.workUnitId,
          reviewedHead: selection.reviewedHead,
        };
        approvedDispositionSet = {
          dispositionSetId: selection.dispositionSetId,
          authorizedFindingIds: selection.authorizedFindingIds,
          authorizedFindingLoci: selection.authorizedFindingLoci,
        };
        const [planRead, stateRead] = await Promise.all([
          planStore.readCurrent(selection.planId),
          stateStore.read(selection.planId),
        ]);
        if (planRead.status !== "ok" || planRead.value === null
          || stateRead.status !== "ok" || stateRead.value === null
          || planRead.value.workUnitId !== locus.name
          || stateRead.value.value.workUnitId !== locus.name
          || inspectDeliveryPlanLocus(taskList, planRead.value).status !== "canonical"
          || validateDeliveryStateAgainstPlan(stateRead.value.value, planRead.value).status !== "valid") {
          return { status: "refused", reason: "review-fix-response-stale" };
        }
        const planMembers = planRead.value.members.filter(
          ({ deliverableId }) => deliverableId === selection.selectedDeliverableId,
        );
        const stateMembers = stateRead.value.value.members.filter(
          ({ deliverableId }) => deliverableId === selection.selectedDeliverableId,
        );
        if (planMembers.length !== 1 || stateMembers.length !== 1) {
          return { status: "refused", reason: "review-fix-response-stale" };
        }
        if (!pendingDeliveryReviewFixAuthorityIsCurrent({
            selectedDeliverableId: selection.selectedDeliverableId,
            reviewedHead: selection.reviewedHead,
            state: stateRead.value.value,
          })) {
          const selectedHead = stateMembers[0]?.coordinates?.head;
          if (selectedHead === undefined || selectedHead === selection.reviewedHead
            || await readAncestry(exec, selection.reviewedHead, selectedHead) !== "ancestor") {
            return { status: "refused", reason: "review-fix-response-stale" };
          }
          const selectedState = stateMembers[0];
          const pullRequest = Number(selectedState?.changeRequest?.changeRequestId);
          if (selectedState?.coordinates === null || selectedState?.coordinates === undefined
            || !Number.isSafeInteger(pullRequest) || pullRequest <= 0) {
            return { status: "refused", reason: "review-fix-response-stale" };
          }
          if (selection.source.kind !== "hosted") {
            return { status: "refused", reason: "review-fix-response-stale" };
          }
          let operationReference;
          try {
            operationReference = parseReviewSourceReference(selection.source.attemptRef, "hosted");
          } catch {
            return { status: "refused", reason: "review-fix-response-stale" };
          }
          const operationRead = await new LocalReviewOperationStateStore(publisher)
            .readOperation(operationReference.operationId);
          const attempts = operationRead.state?.kind === "lane-progress"
            ? operationRead.state.attempts.filter(({ attemptId }) => attemptId === selection.operationId)
            : [];
          const attempt = attempts.length === 1 ? attempts[0] : undefined;
          if (attempt?.hosted === undefined
            || attempt.hosted.target.pullRequest !== pullRequest
            || attempt.hosted.target.repository.toLowerCase() !== parsed.repository.toLowerCase()
            || attempt.hosted.reviewTarget.headSha !== selection.reviewedHead
            || attempt.hosted.vehicle?.planId !== selection.planId
            || attempt.hosted.vehicle.deliverableId !== selection.selectedDeliverableId
            || attempt.hosted.vehicle.workUnitId !== locus.name) {
            return { status: "refused", reason: "review-fix-response-stale" };
          }
          const currentVehicle = { ...attempt.hosted.vehicle, head: selectedHead };
          const applicability = await projectGitReviewContributionApplicability({
            selector: {
              schemaVersion: 1,
              repositoryId: selection.repositoryId,
              repository: parsed.repository.toLowerCase(),
              pullRequest,
              lane: "standard",
              sourceId: attempt.sourceId,
              priorAttemptId: attempt.attemptId,
              priorHead: selection.reviewedHead,
              currentHead: selectedHead,
              priorBase: attempt.hosted.reviewTarget.diffBaseSha,
              currentBase: selectedState.coordinates.base,
              priorVehicle: attempt.hosted.vehicle,
              currentVehicle,
            },
            exec: createRawGitExec(cwd),
            observeEndpoints: async () => {
              const fresh = await stateStore.read(selection.planId);
              const member = fresh.status === "ok" && fresh.value !== null
                ? fresh.value.value.members.find(
                    ({ deliverableId }) => deliverableId === selection.selectedDeliverableId,
                  )
                : undefined;
              if (member?.coordinates === null || member?.coordinates === undefined) {
                throw new Error("selected member coordinates moved during applicability projection");
              }
              return { head: member.coordinates.head, base: member.coordinates.base };
            },
          });
          const mechanicallyPreserved = applicability.state === "applicable"
            && applicability.contributionChanged === false
            && applicability.proof !== "head-unchanged";
          const requiresCurrentReviewAuthority = applicability.state === "decision-required"
            && applicability.contributionChanged === true;
          if (!mechanicallyPreserved && !requiresCurrentReviewAuthority) {
            return { status: "refused", reason: "review-fix-response-stale" };
          }
          const integratingEntry = await inspectReviewFixRepositoryEntry("integrating");
          if (applicability.state === "applicable"
            && applicability.contributionChanged === false
            && applicability.proof !== "head-unchanged") {
            authorityPreservation = {
              reviewedHead: selection.reviewedHead,
              currentHead: selectedHead,
              proof: applicability.proof,
              projectionDigest: applicability.projectionDigest,
              residualDigest: applicability.residualDigest,
            };
          }
          const mayResume = mechanicallyPreserved
            ? pendingDeliveryReviewFixCanResumeFromIntegrationStatus(integratingEntry.status)
            : integratingEntry.status === "resolve-delivery-status";
          if (!mayResume) {
            return { status: "refused", reason: "review-fix-response-stale" };
          }
          entry = integratingEntry;
        } else {
          entry = {
            status: "correction-routing-required",
            nextAction: "plan-review-fix",
            planId: selection.planId,
            stateRevision: stateRead.value.revision,
            selectedDeliverableId: selection.selectedDeliverableId,
            entryMode: "execution",
            derivedFrom: {
              kind: "pending-review-response",
              reviewedHead: selection.reviewedHead,
              dispositionSetId: selection.dispositionSetId,
            },
            recommendedActionText:
              "Plan the approved correction for the delivery member bound by the pending review response.",
          };
        }
      } else {
        entry = await inspectReviewFixRepositoryEntry("integrating");
        if (entry.status === "review-fix-verification-required") {
          const refused = await applyDurableLocalAcknowledgementReplay(locus.name, entry, dispositionRecords);
          if (refused !== null) return refused;
        }
      }
    }

      let preparedCorrection: Awaited<ReturnType<typeof prepareCorrection>> | undefined;
      if (entry.status === "review-fix-verification-required"
        && projectionRequest.verification === undefined) {
        const correctionEntry: DeliveryCorrectionRoutingEntry = {
          status: "correction-routing-required",
          nextAction: "plan-review-fix",
          planId: entry.planId,
          stateRevision: entry.stateRevision,
          selectedDeliverableId: entry.selectedDeliverableId,
          entryMode: "execution",
          derivedFrom: {
            kind: "pending-verification",
            continuationDigest: entry.acknowledgementInput.continuationDigest,
          },
          recommendedActionText:
            "Supersede the pending verification with the newer exact correction authoring.",
        };
        const prepared = await prepareCorrection(correctionEntry);
        if (prepared.status === "prepared" && prepared.authoring?.status === "ready") {
          entry = correctionEntry;
          preparedCorrection = prepared;
        } else if (prepared.status === "prepared"
          && "publicationRequired" in prepared && prepared.publicationRequired === true
          && prepared.result.status === "authoring-required") {
          return prepared.result;
        } else if (prepared.status === "prepared"
          && prepared.result.status === "dispatch"
          && "kind" in prepared.result.action
          && prepared.result.action.kind === "delivery-review-fix-authoring-rebind") {
          return prepared.result;
        } else {
          const terminalRebind = await projectTerminalRecordRebind(
            entry.planId,
            entry.selectedDeliverableId,
            correctionEntry,
          );
          if (terminalRebind.status !== "not-required") return terminalRebind;
        }
      }

      if (entry.status === "review-fix-verification-required"
        || projectionRequest.verification !== undefined) {
        return projectDeliveryReviewFixContinuation({ request: projectionRequest, entry });
      }

      if (entry.status === "resume-bound") {
        const stateRead = await stateStore.read(entry.planId);
        if (stateRead.status !== "ok" || stateRead.value === null) {
          return { status: "refused", reason: "delivery-unavailable" };
        }
        return projectDeliveryReviewFixContinuation({ request: projectionRequest, entry, state: stateRead.value });
      }

      if (entry.status === "candidate-verification-required") {
        const stateRead = await stateStore.read(entry.planId);
        if (stateRead.status !== "ok" || stateRead.value === null) {
          return { status: "refused", reason: "delivery-unavailable" };
        }
        const landedDeliverableIds = findExactPendingSelectedRefresh(stateRead.value.value) === null
          ? []
          : await readLandedDeliverableIds(entry.planId);
        if (landedDeliverableIds === null) {
          return { status: "refused", reason: "review-fix-position-unavailable" };
        }
        return projectDeliveryReviewFixContinuation({
          request: projectionRequest, entry, state: stateRead.value, landedDeliverableIds,
        });
      }

      if (entry.status === "correction-routing-required") {
        const stateRead = await stateStore.read(entry.planId);
        if (stateRead.status === "ok" && stateRead.value !== null) {
          const landedDeliverableIds = await readLandedDeliverableIds(entry.planId);
          if (landedDeliverableIds === null) {
            return { status: "refused", reason: "review-fix-position-unavailable" };
          }
          const resumed = projectDeliveryReviewFixContinuation({
            request: projectionRequest,
            entry,
            state: stateRead.value,
            landedDeliverableIds,
          });
          if (resumed.status === "dispatch"
            || (resumed.status === "refused" && resumed.reason === "review-fix-route-mismatch")) {
            return resumed;
          }
        }
        const prepared = preparedCorrection ?? await prepareCorrection(entry);
        return prepared.result;
      }

      if (entry.status === "candidate-renewal-required") {
        const terminalRebind = await projectTerminalRecordRebind(entry.planId);
        if (terminalRebind.status !== "not-required") return terminalRebind;
      }
      const continuation = projectDeliveryReviewFixContinuation({ request: projectionRequest, entry });
      if (continuation.status !== "authority-required" || continuation.authority !== "delivery-status") {
        return continuation;
      }
      if (entry.status !== "resolve-delivery-status") {
        return { status: "refused" as const, reason: "review-status-entry-mismatch" };
      }
      const terminalRebind = await projectTerminalRecordRebind(entry.planId);
      if (terminalRebind.status !== "not-required") return terminalRebind;
      try {
        const reviewStatus = await resolveReviewStatusForWorkUnit({
          cwd,
          exec,
          workUnitId: continuation.action.action.workUnitId,
          remote: parsed.remote,
        });
        const settledDeliveryConjunction = reviewStatus.routedObligation.state === "settled"
          && "conjunction" in reviewStatus.routedObligation
          && reviewStatus.routedObligation.conjunction.status === "discharged"
          && reviewStatus.deliveryCursor?.status === "discharged";
        if (settledDeliveryConjunction) {
          const positioned = await executeDeliveryCommand("position", {
            planId: entry.planId,
            repository: parsed.repository,
            remote: parsed.remote,
          }, interaction);
          const parsedPosition = ResultSchema.safeParse(positioned);
          return parsedPosition.success ? parsedPosition.data : invalidServiceResult(positioned);
        }
        if (reviewStatus.nextAction === "respond-to-findings") {
          let records;
          try {
            records = await new LocalApprovedDispositionRecordStore(publisher).listDispositionRecords();
          } catch {
            return { status: "refused" as const, reason: "review-fix-response-replay-unavailable" };
          }
          const replay = selectDurableDeliveryReviewFixResponseReplay({
            workUnitId: continuation.action.action.workUnitId,
            responsePlan: reviewStatus.responsePlan,
            records,
          });
          if (replay.status === "refused") return replay;
          if (replay.status === "selected") {
            const [replayPlan, replayState] = await Promise.all([
              planStore.readCurrent(replay.planId),
              stateStore.read(replay.planId),
            ]);
            const memberIndex = replayState.status === "ok" && replayState.value !== null
              ? replayState.value.value.members.findIndex(
                  ({ deliverableId }) => deliverableId === replay.selectedDeliverableId,
                )
              : -1;
            const member = memberIndex < 0 || replayState.status !== "ok" || replayState.value === null
              ? undefined
              : replayState.value.value.members[memberIndex];
            const pullRequest = Number(member?.changeRequest?.changeRequestId);
            if (replayPlan.status !== "ok" || replayPlan.value === null
              || replayState.status !== "ok" || replayState.value === null
              || replayPlan.value.workUnitId !== replay.workUnitId
              || replayState.value.value.workUnitId !== replay.workUnitId
              || member?.coordinates === null || member?.coordinates === undefined
              || replay.currentTarget.kind !== "delivery-member"
              || replay.currentTarget.repositoryId !== replay.repositoryId
              || replay.currentTarget.headSha !== member.coordinates.head
              || replay.currentTarget.headTree !== member.coordinates.tree
              || replay.currentTarget.diffBaseSha !== member.coordinates.base
              || !Number.isSafeInteger(pullRequest) || pullRequest <= 0
              || replay.hostedFixTarget.pullRequest !== pullRequest
              || replay.hostedFixTarget.repository.toLowerCase() !== parsed.repository.toLowerCase()
              || replay.hostedFixTarget.headSha !== member.coordinates.head) {
              return { status: "refused" as const, reason: "review-fix-response-replay-stale" };
            }
            return {
              status: "dispatch" as const,
              nextAction: "dispatch" as const,
              action: {
                kind: "review-respond" as const,
                argv: ["arc", "review", "respond", "-"] as const,
                input: replay.request,
                responsePlan: reviewStatus.responsePlan,
              },
              recommendedActionText:
                "Rebind the exact durable approved response to its rediscovered hosted attempt, then continue.",
            };
          }
        }
        return {
          status: "review-status-required" as const,
          stopKind: classifyDeliveryReviewFixReviewStatusStop(reviewStatus.nextAction),
          nextAction: reviewStatus.nextAction,
          reviewStatus,
          ...(authorityPreservation === undefined ? {} : { authorityPreservation }),
          recommendedActionText:
            "Continue from the exact composed delivery status without re-deriving a member or pass.",
        };
      } catch {
        return {
          status: "refused" as const,
          reason: "review-status-unavailable",
          recommendedActionText:
            "Restore the self-contained delivery status before retrying the correction.",
        };
      }
    };
    const observeProgress = async (
      step: DeliveryReviewFixDriveStep<DeliveryReviewFixDriveDispatchAction>,
    ): Promise<DeliveryReviewFixDriveProgress> => {
      const actionInput = isDeliveryReviewFixDispatchStep(step) && typeof step.action.input === "object"
        && step.action.input !== null
        ? step.action.input as Readonly<Record<string, unknown>>
        : null;
      const directPlanId = "planId" in step && typeof step.planId === "string" ? step.planId : null;
      const actionPlanId = actionInput !== null && typeof actionInput.planId === "string"
        ? actionInput.planId
        : null;
      const planId = directPlanId ?? actionPlanId;
      const [stateRead, locus] = await Promise.all([
        planId === null ? Promise.resolve(null) : stateStore.read(planId),
        resolveReviewFixLocus(),
      ]);
      const boundary = locus !== null
        ? await readSubmissionBoundaryVersioned(cwd, locus.name)
        : { boundary: null, version: null };
      const state = stateRead?.status === "ok" ? stateRead.value : null;
      return {
        stateRevision: state?.revision ?? null,
        operationId: state?.value.activeOperation?.operationId ?? null,
        boundaryVersion: boundary.version,
        relevantHeads: state === null
          ? []
          : [
              ...(state.value.target?.coordinates === undefined
                || state.value.target.coordinates === null ? [] : [state.value.target.coordinates.head]),
              ...state.value.members.flatMap(({ coordinates }) =>
                coordinates === null ? [] : [coordinates.head]),
            ],
      };
    };
    type DeliveryReviewFixServiceActionKind = Exclude<
      DeliveryReviewFixDriveDispatchAction["kind"],
      "delivery-review-fix-authoring-rematerialize" | "delivery-review-fix-authoring-rebind" | "review-respond"
    >;
    const commands: Readonly<Record<
      DeliveryReviewFixServiceActionKind,
      Exclude<DeliveryExecutionCommand, "review-fix-continue">
    >> = {
      "delivery-review-fix-publish": "review-fix-publish",
      "delivery-rematerialize": "rematerialize",
      "delivery-refresh-execute": "refresh-execute",
      "delivery-refresh-adopt": "refresh-adopt",
      "delivery-reconcile": "reconcile",
      "delivery-review-fix-acknowledge": "review-fix-acknowledge",
    };
    return driveDeliveryReviewFixContinuation({
      project: async () => {
        const step = await project() as DeliveryReviewFixDriveStep<DeliveryReviewFixDriveDispatchAction>;
        return { step, progress: await observeProgress(step) };
      },
      execute: async (action, context) => {
        let result;
        if (action.kind === "delivery-review-fix-authoring-rematerialize") {
          result = await executeAuthoringRematerialize(action.input);
        } else if (action.kind === "delivery-review-fix-authoring-rebind") {
          result = await executeAuthoringRebind(action.input);
        } else if (action.kind === "review-respond") {
          try {
            const response = await respondToReviewCommand(
              action.input,
              createRespondDependencies({ exec, cwd }),
            );
            result = { ...response, status: response.state };
          } catch (error) {
            result = {
              status: "refused",
              reason: "review-fix-response-replay-failed",
              ...(error instanceof RespondCommandError
                ? { detail: error.message, responseError: error.code }
                : {}),
            };
          }
        } else {
          result = await executeDeliveryCommand(
            commands[action.kind],
            action.input,
            interaction,
            { settledRecordEffectHead: context.settledRecordEffectHead },
          );
        }
        if (typeof result !== "object" || result === null || !("status" in result)
          || typeof result.status !== "string") {
          return { status: "invalid-service-result" };
        }
        const resultRecord = result as Readonly<Record<string, unknown>>;
        const candidate = typeof resultRecord.candidate === "object" && resultRecord.candidate !== null
          ? resultRecord.candidate as Readonly<Record<string, unknown>>
          : null;
        const boundaryCarry = typeof resultRecord.boundaryCarry === "object" && resultRecord.boundaryCarry !== null
          ? resultRecord.boundaryCarry as Readonly<Record<string, unknown>>
          : null;
        const recordPaths = [candidate?.recordPath, boundaryCarry?.path]
          .filter((path): path is string => typeof path === "string");
        if (recordPaths.length > 0) await captureExpectedRecordEffects(recordPaths);
        const resultStatus = result.status;
        if (action.kind === "delivery-review-fix-acknowledge"
          && (resultStatus === "acknowledged" || resultStatus === "already-acknowledged")) {
          projectionRequest = { repository: parsed.repository, remote: parsed.remote };
        }
        return {
          ...result,
          status: resultStatus,
          ...(resultStatus === "already-acknowledged" ? { replayed: true } : {}),
        };
      },
      carryBoundary: async ({ planId, stateRevision, candidateSubjectDigest }) => {
        const [planRead, stateRead] = await Promise.all([
          planStore.readCurrent(planId),
          stateStore.read(planId),
        ]);
        if (planRead.status !== "ok" || planRead.value === null
          || stateRead.status !== "ok" || stateRead.value === null
          || stateRead.value.revision !== stateRevision) {
          return { status: "refused" as const, reason: "boundary-carry-position-moved" };
        }
        const [candidate, boundary] = await Promise.all([
          readCandidateRecordVersioned(cwd, planRead.value.workUnitId),
          readSubmissionBoundaryVersioned(cwd, planRead.value.workUnitId),
        ]);
        if (candidate.record === null || boundary.boundary === null) {
          return { status: "refused" as const, reason: "boundary-carry-authority-unavailable" };
        }
        const locus = await resolveReviewFixLocus();
        if (locus === null || locus.name !== planRead.value.workUnitId) {
          return { status: "refused" as const, reason: "boundary-carry-position-moved" };
        }
        let effectiveCandidate;
        try {
          effectiveCandidate = await projectGitCandidateEffectiveTarget({
            cwd,
            name: locus.name,
            baseBranch: locus.baseBranch,
            record: candidate.record,
            exec,
            rawExec: createRawGitExec(cwd),
          });
        } catch {
          return { status: "refused" as const, reason: "boundary-carry-position-moved" };
        }
        if (effectiveCandidate.state !== "current"
          || effectiveCandidate.candidateId !== boundary.boundary.candidateId
          || effectiveCandidate.recognizedTarget.subject.subjectDigest !== candidateSubjectDigest) {
          return { status: "refused" as const, reason: "boundary-carry-position-moved" };
        }
        const carried = carryDeliveryReviewFixPublicBoundary({
          plan: planRead.value,
          state: stateRead.value,
          boundary: boundary.boundary,
          candidateId: candidate.record.attestation.candidateId,
          sourceCandidateSubjectDigest: boundary.boundary.candidateSubjectDigest ?? "",
          candidateSubjectDigest,
        });
        if (carried.status === "refused") return carried;
        const path = await writeSubmissionBoundary(cwd, carried.boundary, boundary.version);
        await exec("git", ["add", "--", path], { cwd });
        await captureExpectedRecordEffects([path]);
        return {
          status: "carried" as const,
          path,
          candidateId: carried.candidateId,
          stateRevision: carried.stateRevision,
        };
      },
      settleRecordEffects: async () => {
        const locus = await resolveReviewFixLocus();
        if (locus === null) {
          return { status: "refused" as const, reason: "record-effect-work-unit-unavailable" };
        }
        if (expectedRecordEffects.length === 0) {
          const reconstructed = await reconstructExpectedRecordEffects(locus.name);
          if (reconstructed.status === "refused") return reconstructed;
          if (reconstructed.status === "defer-acknowledgement") {
            return { status: "idle" as const, effects: [] };
          }
          if (reconstructed.status === "ready") expectedRecordEffects = reconstructed.records;
        }
        const identity = await resolveUserIdentity(exec);
        const settlement = await settleDeliveryReviewFixRecordEffects({
          workUnitId: locus.name,
          context: `meta-${locus.name}.md (integration)`,
          expectedRecords: expectedRecordEffects,
          ports: createDeliveryReviewFixReleaseEffectPorts({
            cwd,
            remote: parsed.remote,
            identity,
            exec,
            ...(interaction === undefined ? {} : { interaction }),
          }),
        });
        if (settlement.status !== "refused") {
          expectedRecordEffects = [];
          for (const effect of settlement.effects) {
            if (effect.kind === "commit") settledRecordEffectHead = effect.head;
          }
        }
        return settlement;
      },
    });
  }
  if (command === "review-fix-acknowledge") {
    const parsed = ReviewFixAcknowledgeSchema.parse(request);
    const [planRead, stateRead] = await Promise.all([
      planStore.readCurrent(parsed.planId),
      stateStore.read(parsed.planId),
    ]);
    if (planRead.status !== "ok" || planRead.value === null
      || stateRead.status !== "ok" || stateRead.value === null) {
      return { status: "refused", reason: "delivery-unavailable" };
    }
    const workUnitId = planRead.value.workUnitId;
    const terminal = stateRead.value.value.members.at(-1)?.coordinates ?? null;
    if (terminal === null
      || parsed.verification.target.head !== terminal.head
      || parsed.verification.target.tree !== terminal.tree
      || parsed.verification.tier1.targetTree !== terminal.tree) {
      return { status: "refused", reason: "verification-target-mismatch" };
    }
    try {
      const owner = await resolveCandidateMutationOwner({ cwd, exec });
      if (owner.status !== "owned" || owner.workUnit !== workUnitId) {
        return { status: "refused", reason: "candidate-mutation-unowned" };
      }
      const verifiedAt = new Date().toISOString();
      const dispositionStore = new LocalApprovedDispositionRecordStore(publisher);
      const dispositionRecords = await dispositionStore.listDispositionRecords();
      const validateLocalResponse = async (record: (typeof dispositionRecords)[number]) => {
        const responseMember = record.deliveryMember;
        if (record.source.kind !== "attested-local" || responseMember === null) return null;
        let sourceReference;
        try {
          sourceReference = parseReviewSourceReference(record.source.receiptRef, "attested-local");
        } catch {
          return null;
        }
        const operation = await new LocalReviewOperationStateStore(publisher)
          .readOperation(sourceReference.operationId);
        const admission = operation.state?.kind === "local-review"
          ? operation.state.deliveryAdmission
          : undefined;
        if (operation.state?.kind !== "local-review"
          || operation.state.operationId !== record.operationId
          || sourceReference.operationId !== record.operationId
          || operation.state.repositoryId !== record.repositoryId
          || admission === undefined
          || canonicalize(admission.vehicle) !== canonicalize(responseMember)
          || operation.state.target.kind !== "delivery-member"
          || operation.state.target.targetId !== record.approvedDisposition.dispositionSet.targetId
          || operation.state.target.headSha !== responseMember.head) return null;
        return {
          oldTarget: operation.state.target,
          settlement: {
            repositoryId: operation.state.repositoryId,
            headSha: operation.state.target.headSha,
            attemptId: operation.state.operationId,
          },
        };
      };
      let responseAdvance: Exclude<
        ReturnType<typeof advanceDeliveryReviewFixResponse>,
        { readonly status: "refused" }
      > | null = null;
      let localResponseSettlement: {
        readonly repositoryId: string;
        readonly headSha: string;
        readonly attemptId: string;
      } | null = null;
      let verification = parsed.verification;
      const selectedIndex = stateRead.value.value.members.findIndex(
        ({ deliverableId }) => deliverableId === parsed.selectedDeliverableId,
      );
      const selectedMember = stateRead.value.value.members[selectedIndex];
      const expectedBaseRef = selectedIndex === 0
        ? stateRead.value.value.target?.ref
        : stateRead.value.value.members[selectedIndex - 1]?.ref;
      const expectedBaseName = expectedBaseRef?.startsWith("refs/heads/") === true
        ? expectedBaseRef.slice("refs/heads/".length)
        : null;
      if (selectedMember?.coordinates === null || selectedMember?.coordinates === undefined
        || selectedMember.ref === null || selectedMember.changeRequest === null
        || expectedBaseName === null) {
        return { status: "refused", reason: "review-fix-response-invalid" };
      }
      const durableLocalReplay = selectDurableLocalDeliveryReviewFixAcknowledgementReplay({
        workUnitId,
        planId: parsed.planId,
        selectedDeliverableId: parsed.selectedDeliverableId,
        selectedMemberTarget: {
          head: selectedMember.coordinates.head,
          tree: selectedMember.coordinates.tree,
        },
        target: parsed.verification.target,
        records: dispositionRecords,
      });
      if (durableLocalReplay.status === "refused") return durableLocalReplay;
      const matchingResponseRecords = dispositionRecords.filter((record) => (
        record.deliveryMember?.planId === parsed.planId
        && record.deliveryMember.deliverableId === parsed.selectedDeliverableId
        && record.deliveryMember.workUnitId === workUnitId
        && record.fixAuthorization !== null
        && record.deliveryMemberFixResponse === null
      ));
      if (matchingResponseRecords.length > 1) {
        return { status: "refused", reason: "review-fix-response-ambiguous" };
      }
      const responseRecord = matchingResponseRecords[0];
      if (durableLocalReplay.status === "selected" || durableLocalReplay.status === "settlement-only") {
        if (responseRecord !== undefined) {
          return { status: "refused", reason: "review-fix-response-ambiguous" };
        }
        const replayRecords = dispositionRecords.filter((record) => (
          record.operationId === durableLocalReplay.operationId
          && record.deliveryMemberFixResponse !== null
        ));
        const replayRecord = replayRecords.length === 1 ? replayRecords[0] : undefined;
        const validated = replayRecord === undefined ? null : await validateLocalResponse(replayRecord);
        if (validated === null) {
          return { status: "refused", reason: "review-fix-response-invalid" };
        }
        localResponseSettlement = validated.settlement;
        if (durableLocalReplay.status === "selected") {
          verification = {
            ...durableLocalReplay.verification,
            verificationEvidenceRefs: [...durableLocalReplay.verification.verificationEvidenceRefs],
          };
        }
      }
      if (responseRecord !== undefined) {
        const responseMember = responseRecord.deliveryMember;
        if (responseRecord.source.kind === "frontline" || responseMember === null) {
          return { status: "refused", reason: "review-fix-response-invalid" };
        }
        let oldTarget;
        let hostedTarget = null;
        if (responseRecord.source.kind === "hosted") {
          let sourceReference;
          try {
            sourceReference = parseReviewSourceReference(responseRecord.source.attemptRef, "hosted");
          } catch {
            return { status: "refused", reason: "review-fix-response-invalid" };
          }
          const operation = await new LocalReviewOperationStateStore(publisher)
            .readOperation(sourceReference.operationId);
          const attempts = operation.state?.kind === "lane-progress"
            ? operation.state.attempts.filter(({ attemptId }) => attemptId === responseRecord.operationId)
            : [];
          const attempt = attempts.length === 1 ? attempts[0] : undefined;
          const pullRequest = Number(selectedMember.changeRequest.changeRequestId);
          const observed = Number.isSafeInteger(pullRequest) && pullRequest > 0
            ? await new GhDeliveryHostPort(hostedGhRunner).readRequest(
                attempt?.hosted?.target.repository ?? "",
                selectedMember.changeRequest,
              )
            : { status: "refused" as const, reason: "malformed" as const };
          if (attempt?.hosted === undefined || attempt.hosted.vehicle === undefined
            || canonicalize(attempt.hosted.vehicle) !== canonicalize(responseMember)
            || attempt.hosted.target.pullRequest !== pullRequest
            || observed.status !== "observed"
            || observed.request.repository.toLowerCase() !== attempt.hosted.target.repository.toLowerCase()
            || observed.request.headRepository.toLowerCase() !== attempt.hosted.target.repository.toLowerCase()
            || observed.request.binding.providerId !== selectedMember.changeRequest.providerId
            || observed.request.binding.changeRequestId !== selectedMember.changeRequest.changeRequestId
            || observed.request.headRef !== selectedMember.ref.slice("refs/heads/".length)
            || observed.request.headSha !== selectedMember.coordinates.head
            || observed.request.baseRef !== expectedBaseName
            || observed.request.state !== "open") {
            return { status: "refused", reason: "review-fix-response-invalid" };
          }
          oldTarget = attempt.hosted.reviewTarget;
          hostedTarget = attempt.hosted.target;
        } else {
          const validated = await validateLocalResponse(responseRecord);
          if (validated === null) return { status: "refused", reason: "review-fix-response-invalid" };
          oldTarget = validated.oldTarget;
          localResponseSettlement = validated.settlement;
        }
        const advanced = advanceDeliveryReviewFixResponse({
          record: responseRecord,
          oldTarget,
          hostedTarget,
          currentHead: selectedMember.coordinates.head,
          currentTree: selectedMember.coordinates.tree,
          applicability: verification.applicability,
          verificationEvidenceRefs: verification.verificationEvidenceRefs,
          verifiedAt,
        });
        if (advanced.status === "refused") return advanced;
        responseAdvance = advanced;
      }
      const settings = (await readConfigSettings(cwd)).settings;
      const checkoutCoordinates = await observeDeliveryEligibilityRef(exec, "HEAD");
      if (checkoutCoordinates === null) {
        return { status: "refused", reason: "candidate-verification-unavailable" };
      }
      const verifiedRevision = checkoutCoordinates.head === terminal.head ? undefined : terminal.head;
      const committedCandidatePath = resolveCandidateRecordRelativePath(planRead.value.workUnitId);
      const [candidate, currentTarget, unstagedReviewablePaths, actor, boundarySnapshot, committedPredecessorRecord] =
        await Promise.all([
        readCandidateRecordVersioned(cwd, planRead.value.workUnitId),
        collectGitCandidateTarget({
          cwd,
          name: planRead.value.workUnitId,
          baseBranch: settings["branch.base"],
          ...(verifiedRevision === undefined ? {} : { revision: verifiedRevision }),
          exec,
        }),
        collectUnstagedReviewablePaths({
          cwd,
          name: planRead.value.workUnitId,
          exec,
        }),
        resolveUserIdentity(exec),
        readSubmissionBoundaryVersioned(cwd, planRead.value.workUnitId),
        exec("git", ["show", `HEAD:${committedCandidatePath}`], { cwd, objectAccess: "local-only" })
          .then(({ stdout }) => parseCandidateManagedRecord(stdout))
          .catch(() => null),
      ]);
      if (candidate.record === null || candidate.version === null) {
        return { status: "refused", reason: "candidate-record-unavailable" };
      }
      if (boundarySnapshot.boundary === null) {
        return { status: "refused", reason: "public-boundary-unavailable" };
      }
      if (unstagedReviewablePaths.length > 0) {
        return { status: "refused", reason: "candidate-reviewable-content-unstaged" };
      }
      const recorded = recordDeliveryReviewFixCandidateVerification({
        plan: planRead.value,
        state: stateRead.value,
        acknowledgement: {
          selectedDeliverableId: parsed.selectedDeliverableId,
          memberDeliverableIds: parsed.memberDeliverableIds,
          expectedStateRevision: parsed.expectedStateRevision,
          continuationDigest: parsed.continuationDigest,
        },
        record: candidate.record,
        ...(committedPredecessorRecord === null
          ? {}
          : { committedPredecessorRecord }),
        currentTarget,
        verifiedBy: actor,
        verifiedAt,
        applicability: verification.applicability,
        verificationEvidenceRefs: verification.verificationEvidenceRefs,
      });
      if (recorded.status === "refused") return recorded;
      const acknowledgementProjection = projectDeliveryReviewFixVerificationAcknowledgement({
        plan: planRead.value,
        current: stateRead.value,
        selectedDeliverableId: parsed.selectedDeliverableId,
        memberDeliverableIds: parsed.memberDeliverableIds,
        expectedStateRevision: parsed.expectedStateRevision,
        continuationDigest: parsed.continuationDigest,
      });
      if (acknowledgementProjection.status === "refused") return acknowledgementProjection;
      const carried = carryDeliveryReviewFixPublicBoundary({
        plan: planRead.value,
        state: acknowledgementProjection.state,
        boundary: boundarySnapshot.boundary,
        candidateId: recorded.record.attestation.candidateId,
        sourceCandidateSubjectDigest: recorded.status === "already-recorded"
          ? recorded.transition.newTarget.subject.subjectDigest
          : recorded.transition.oldTarget.subject.subjectDigest,
        candidateSubjectDigest: recorded.transition.newTarget.subject.subjectDigest,
      });
      if (carried.status === "refused") return carried;

      if (responseAdvance !== null) {
        await dispositionStore.appendDispositionRecord(responseAdvance.record);
      }
      if (localResponseSettlement !== null) {
        await settleLaneAttempt(new LocalReviewOperationStateStore(publisher), {
          lane: "standard",
          ...localResponseSettlement,
          now: verifiedAt,
        });
      }
      const recordPath = recorded.status === "recorded"
        ? await writeCandidateRecord(
            cwd,
            planRead.value.workUnitId,
            recorded.record,
            candidate.version,
          )
        : resolveCandidateRecordRelativePath(planRead.value.workUnitId);
      await exec("git", ["add", "--", recordPath], { cwd });
      const acknowledged = await acknowledgeDeliveryReviewFixVerification({
        plan: planRead.value,
        current: stateRead.value,
        selectedDeliverableId: parsed.selectedDeliverableId,
        memberDeliverableIds: parsed.memberDeliverableIds,
        expectedStateRevision: parsed.expectedStateRevision,
        continuationDigest: parsed.continuationDigest,
        stateStore,
      });
      if (acknowledged.status === "refused") return acknowledged;
      const boundaryPath = await writeSubmissionBoundary(
        cwd,
        carried.boundary,
        boundarySnapshot.version,
      );
      await exec("git", ["add", "--", boundaryPath], { cwd });
      const recordEffects = await readExpectedRecordEffects([recordPath, boundaryPath]);
      return {
        ...acknowledged,
        candidate: {
          candidateId: recorded.record.attestation.candidateId,
          verificationId: recorded.transition.verificationId,
          recordPath,
        },
        nextAction: "resolve-delivery-status" as const,
        boundaryCarry: {
          path: boundaryPath,
          candidateId: carried.candidateId,
          stateRevision: carried.stateRevision,
        },
        recordEffects,
      };
    } catch {
      return { status: "refused", reason: "candidate-verification-unavailable" };
    }
  }
  if (command === "authoring-locate") {
    const parsed = AuthoringLocateSchema.parse(request);
    const planRead = await planStore.readCurrent(parsed.planId);
    if (planRead.status !== "ok" || planRead.value === null) {
      return { status: "refused", reason: "delivery-plan-unavailable" };
    }
    const locators = deriveDeliveryResidueLocators(
      planRead.value,
      await resolveGitCommonDir(exec, cwd),
    );
    return locators.status === "derived"
      ? { status: "located", planId: parsed.planId, locators: locators.locators }
      : { status: "refused", reason: locators.reason };
  }
  if (command === "closeout") {
    const parsed = CloseoutSchema.parse(request);
    const host = new GhDeliveryHostPort(hostedGhRunner);
    const baseBranch = (await readConfigSettings(cwd)).settings["branch.base"].trim();
    const pathExists = async (path: string): Promise<boolean> => {
      try {
        await stat(path);
        return true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
        throw error;
      }
    };
    return closeoutCompletedDelivery(parsed, {
      planStore,
      stateStore,
      gitCommonDir: await resolveGitCommonDir(exec, cwd),
      renameAuthority: baseBranch === ""
        ? { status: "unestablished" }
        : { status: "established", ref: `refs/heads/${baseBranch}` },
      renameTransitionSource: new GitDeliveryRenameTransitionSource(createRawGitExec(cwd)),
      residue: {
        observeRefreshCandidates: (planId) => observeDeliveryRefreshCandidateRefs(exec, planId),
        observeCandidate: (ref) => observeDeliveryLocalRef(exec, ref),
        observeGate: (path) => observeDeliveryGateCheckout({ exec, path, pathExists }),
        deleteCandidate: (input) => deleteDeliveryCandidateRef({ exec, ...input }),
        deleteRefreshCandidate: (input) => deleteDeliveryRefreshCandidateRef({ exec, ...input }),
        removeGate: (input) => removeDeliveryGateCheckout({ exec, pathExists, ...input }),
        deleteLocalMember: (input) => deleteDeliveryLocalRef({ exec, ...input }),
        deleteRemoteMember: (input) => deleteDeliveryRemoteRef({
          exec,
          remote: parsed.remote,
          ...input,
        }),
      },
      retirement: {
        observeLocalRef: (ref) => observeDeliveryLocalRef(exec, ref),
        observeRemoteRef: (ref) => observeDeliveryRemoteRef(exec, parsed.remote, ref),
        readTerminalRequest: (repository, binding) => host.readRequest(repository, binding),
      },
    });
  }
  const settleAppliedNativeLanding = (
    plan: z.infer<typeof DeliveryPlanV1Schema>,
    before: { readonly revision: number; readonly value: DeliveryStateV1 },
    landed: { readonly revision: number; readonly value: DeliveryStateV1 },
    repository: string,
    protectedTargetRef: string,
    remote: string,
  ) => {
    const host = new GhDeliveryHostPort(hostedGhRunner);
    const rawExec = createRawGitExec(cwd);
    return reconcileLinkedNativeDeliverySuffix({
      plan,
      before,
      landed,
      repository,
      protectedTargetRef,
    }, {
      observeRequest: (binding) => host.readRequest(repository, binding),
      observeRef: async (ref) => {
        const remoteRef = await observeDeliveryRemoteRef(exec, remote, ref);
        if (remoteRef.status !== "observed") return null;
        try {
          await exec("git", ["fetch", "--no-write-fetch-head", remote, remoteRef.head]);
        } catch {
          return null;
        }
        const observed = await observeDeliveryEligibilityRef(exec, remoteRef.head);
        return observed?.head === remoteRef.head ? observed : null;
      },
      proveContribution: (endpoints) => proveGitDeliveryContribution({
        exec: rawExec,
        ...projectDeliveryContributionEndpoints(endpoints),
      }),
      observeMemberRefCheckouts: (refs) => observeDeliveryMemberRefCheckouts(exec, refs),
      absorbTop: (input) => absorbGitDeliveryChain({ exec: rawExec, ...input }),
      publishTop: (input) => publishDeliveryTopRef({ exec, remote, ...input }),
      rewriteLocalRef: (input) => rewriteDeliveryLocalRef({ exec, ...input }),
      stateStore,
    });
  };
  const resolveMemberReadOnly = (head: string) => (
    stateStore.resolveMemberReadOnly({ selector: { kind: "head", objectId: head } })
  );
  const eligibilityDeps = {
    observeRef: (ref: string) => observeDeliveryEligibilityRef(exec, ref),
    readAncestry: (ancestor: string, descendant: string) => readAncestry(exec, ancestor, descendant),
    readOverlap: (input: { leftRevision: string; rightRevision: string; workUnitId: string }) => (
      analyzeRevisionOverlap({
        exec,
        leftRevision: input.leftRevision,
        rightRevision: input.rightRevision,
        treatmentContext: workUnitPathTreatmentContext(input.workUnitId),
      })
    ),
    revalidateLifecycleContribution: (input: {
      protectedBaseRef: string;
      chainBaseRef: string;
      candidateRef: string;
      paths: readonly string[];
      regenerablePaths: readonly string[];
    }) => (
      revalidateDeliveryLifecycleContribution({ exec, ...input })
    ),
    compareNormalizedCompleteness: async (input: z.infer<typeof EligibilitySnapshotSchema> extends never ? never : {
      protectedBase: { ref: string; head: string; tree: string };
      chainBase: { head: string; tree: string };
      top: { ref: string; head: string; tree: string };
      finalCandidate: { deliverableId: string; ref: string; head: string; tree: string };
      lifecyclePaths: readonly string[];
      regenerablePaths: readonly string[];
    }) => {
      const compared = await compareGitNormalizedDeliveryTrees({
        exec,
        protectedBaseTree: input.protectedBase.tree,
        chainBaseTree: input.chainBase.tree,
        topTree: input.top.tree,
        finalCandidateTree: input.finalCandidate.tree,
        lifecyclePaths: input.lifecyclePaths,
        regenerablePaths: input.regenerablePaths,
      });
      if (compared.status === "unavailable") return { status: "refused" as const, reason: "unavailable" as const };
      if (compared.status === "match") return compared;
      const reason = compared.droppedPaths.length > 0 ? "dropped" as const
        : compared.inventedPaths.length > 0 ? "invented" as const : "mismatched" as const;
      return { status: "refused" as const, reason };
    },
    readCurrentPlan: async (planId: string) => {
      const read = await planStore.readCurrent(planId);
      return read.status === "ok" ? read.value : null;
    },
    resolveMember: (head: string) => stateStore.resolveMember({ selector: { kind: "head", objectId: head } }),
    inspectCheckout: (path: string) => inspectDeliveryCandidateCheckout(exec, path),
  };
  const resolveOriginatingTopRef = async (plan: z.infer<typeof DeliveryPlanV1Schema>): Promise<string | null> => {
    const active = await resolveActiveWu({ cwd });
    if (active.status !== "resolved" || active.name !== plan.workUnitId || active.branch === null) return null;
    return `refs/heads/${active.branch}`;
  };
  const resolveCurrentLifecyclePaths = async (
    plan: z.infer<typeof DeliveryPlanV1Schema>,
    protectedBaseRef: string,
    topRef: string,
  ): Promise<readonly string[] | null> => {
    const active = await resolveActiveWu({ cwd });
    if (active.status !== "resolved" || active.name !== plan.workUnitId) return null;
    try {
      const paths = await new CurrentDeliveryLifecycleContributionPathSource({
        readDirectory: (path) => readdir(resolve(cwd, path)),
        readArtifactsAtRef: (ref, workUnitId) => readGitDeliveryLifecycleArtifactsAtRef(exec, ref, workUnitId),
      }).resolve({
        workUnitId: plan.workUnitId,
        activeMetaPath: validateManagedPath(active.path),
        protectedBaseRef,
        topRef,
      });
      return paths.paths;
    } catch {
      return null;
    }
  };
  const observePosition = async (
    plan: z.infer<typeof DeliveryPlanV1Schema>,
    current: { readonly revision: number; readonly value: z.infer<typeof DeliveryStateV1Schema> },
    repository: string,
    remote: string,
    mode: "exact" | "terminal-remedy" | "review-fix" | "review-fix-local" | "refresh-adopt"
      | "review-fix-adopt" | "review-fix-local-adopt" = "exact",
  ) => {
    const host = new GhDeliveryHostPort(hostedGhRunner);
    const localOnlyExec: GitExec = (commandName, args, options) => exec(commandName, args, {
      ...options,
      cwd,
      objectAccess: "local-only",
    });
    const refs = new Set<string>();
    const retainedCoordinates = new Map<string, Map<string, string>>();
    const retain = (member: z.infer<typeof DeliveryOperationSnapshotV1Schema>["members"][number]): void => {
      if (member.ref === null || member.coordinates === null) return;
      refs.add(member.ref);
      const coordinates = retainedCoordinates.get(member.ref) ?? new Map<string, string>();
      coordinates.set(member.coordinates.head, member.coordinates.tree);
      retainedCoordinates.set(member.ref, coordinates);
    };
    for (const member of current.value.members) retain(member);
    const operation = current.value.activeOperation;
    for (const member of [...(operation?.before.members ?? []), ...(operation?.requested.members ?? [])]) {
      retain(member);
    }
    const remoteHeads: Record<string, string> = {};
    const localCommits: Record<string, boolean> = {};
    for (const ref of refs) {
      const observed = await observeDeliveryRemoteRef(exec, remote, ref);
      if (observed.status === "refused") return { status: "refused" as const };
      if (observed.status === "absent") {
        const localOnlyExec: GitExec = (command, args, options) => exec(command, args, {
          ...options,
          cwd,
          objectAccess: "local-only",
        });
        for (const [head, tree] of retainedCoordinates.get(ref) ?? []) {
          const coordinates = await observeDeliveryEligibilityRef(localOnlyExec, head);
          localCommits[head] = coordinates !== null
            && coordinates.head === head && coordinates.tree === tree;
        }
        continue;
      }
      const branch = ref.replace(/^refs\/heads\//u, "");
      remoteHeads[branch] = observed.head;
      try {
        await exec("git", ["fetch", "--no-write-fetch-head", remote, observed.head]);
        localCommits[observed.head] = true;
      } catch {
        localCommits[observed.head] = false;
      }
    }
    const localHeads: Record<string, string> = {};
    if (mode === "review-fix-local" || mode === "review-fix-local-adopt") {
      const terminal = current.value.members.at(-1);
      const prefix = "refs/heads/";
      if (terminal?.ref !== null && terminal?.ref !== undefined && terminal.ref.startsWith(prefix)) {
        try {
          const checkedOut = (await exec("git", ["symbolic-ref", "-q", "HEAD"], {
            cwd,
            objectAccess: "local-only",
          })).stdout.trim();
          if (checkedOut === terminal.ref) {
            const coordinates = await observeDeliveryEligibilityRef(localOnlyExec, "HEAD");
            if (coordinates !== null) {
              localHeads[terminal.ref.slice(prefix.length)] = coordinates.head;
              localCommits[coordinates.head] = true;
            }
          }
        } catch {
          // A non-authoring checkout supplies no local terminal authority.
        }
      }
    }
    const observed = await observeRepositoryDeliveryPosition(plan, current.value, current.revision, {
      exec,
      cwd,
      host,
      repository,
      remoteHeads,
      localCommits,
      localHeads,
      materializeTarget: async (coordinates) => {
        try {
          await exec("git", ["fetch", "--no-write-fetch-head", remote, coordinates.head]);
        } catch {
          return false;
        }
        const localOnlyExec: GitExec = (command, args, options) => exec(command, args, {
          ...options,
          cwd,
          objectAccess: "local-only",
        });
        const local = await observeDeliveryEligibilityRef(localOnlyExec, coordinates.head);
        return local?.head === coordinates.head && local.tree === coordinates.tree;
      },
      observeLandedResult: ({ mergeCommitSha, strategy, beforeMember }) => (
        observeGitDeliveryLandingResult({
          exec, cwd, remote, resultHead: mergeCommitSha, strategy, beforeMember,
        })
      ),
      proveContribution: (endpoints) => proveGitDeliveryContribution({
        exec: createRawGitExec(cwd),
        ...projectDeliveryContributionEndpoints(endpoints),
      }),
    }, {
      ...(mode === "terminal-remedy"
        ? { terminalAuthoringMovement: "allow-append-only-frozen-request" as const }
        : mode === "review-fix" || mode === "review-fix-local"
          || mode === "review-fix-adopt" || mode === "review-fix-local-adopt"
        ? { terminalAuthoringMovement: "allow-append-only" as const }
        : {}),
      ...(mode === "refresh-adopt" || mode === "review-fix-adopt" || mode === "review-fix-local-adopt"
        ? { unlandedSuffixMovement: "allow-external" as const }
        : {}),
    });
    if (observed.status !== "observed") return observed;
    const retryingInitialTarget = operation?.kind === "materialize"
      && operation.before.target === null
      && observed.projectedState.target === null
      && observed.operationObservation !== null
      && canonicalize(observed.operationObservation) === canonicalize(operation.before);
    for (const deliverableId of operation?.affectedDeliverableIds ?? []) {
      const index = observed.facts.members.findIndex((member) => member.deliverableId === deliverableId);
      const member = observed.facts.members[index];
      if (member === undefined || member.coordinates === null) continue;
      const predecessor = resolveDeliveryPredecessorHead(observed.facts, index);
      if (retryingInitialTarget && index === 0 && predecessor === null) continue;
      if (predecessor === null || member.coordinates.base !== predecessor) return { status: "refused" as const };
    }
    return observed;
  };

  const localOnlyExec: GitExec = (commandName, args, options) => exec(commandName, args, {
    ...options,
    cwd,
    objectAccess: "local-only",
  });
  const readTargetAncestry = async (ancestor: string, descendant: string) => {
    const result = await readAncestry(localOnlyExec, ancestor, descendant);
    return result === "ancestor" || result === "not-ancestor" ? result : null;
  };
  const observeRefreshCoordinates = async (head: string) => {
    const coordinates = await observeDeliveryEligibilityRef(localOnlyExec, head);
    return coordinates?.head === head ? coordinates : null;
  };
  const observeProviderRefresh = async (
    subject: DeliveryProviderRefreshSubject,
    repository: string,
    remote: string,
  ) => {
    const host = new GhDeliveryHostPort(hostedGhRunner);
    return observeDeliveryProviderRefresh({ subject, repository }, {
      observeRequest: (observedRepository, binding) => host.readRequest(observedRepository, binding),
      observeTarget: async (observedRepository, ref) => {
        const observed = await host.observeTarget(observedRepository, ref);
        if (observed.status !== "observed") return { status: "refused" as const };
        try {
          await exec("git", ["fetch", "--no-write-fetch-head", remote, observed.coordinates.head]);
        } catch {
          return { status: "refused" as const };
        }
        const coordinates = await observeRefreshCoordinates(observed.coordinates.head);
        return coordinates !== null && canonicalize(coordinates) === canonicalize(observed.coordinates)
          ? { status: "observed" as const, coordinates }
          : { status: "refused" as const };
      },
      observeRef: async (ref) => {
        const observed = await observeDeliveryRemoteRef(exec, remote, ref);
        if (observed.status !== "observed") return null;
        try {
          await exec("git", ["fetch", "--no-write-fetch-head", remote, observed.head]);
        } catch {
          return null;
        }
        return observeRefreshCoordinates(observed.head);
      },
      readAncestry: readTargetAncestry,
    });
  };
  const proveProviderRefreshMovement = async (movement: DeliveryProviderRefreshMovement) => {
    const beforeMember = movement.before.coordinates;
    const afterMember = movement.after.coordinates;
    if (beforeMember === null || afterMember === null) {
      return { status: "refused" as const, reason: "contribution-endpoints-unverified" as const };
    }
    const [beforePredecessor, afterPredecessor] = await Promise.all([
      observeRefreshCoordinates(beforeMember.base),
      observeRefreshCoordinates(afterMember.base),
    ]);
    if (beforePredecessor === null || afterPredecessor === null) {
      return { status: "refused" as const, reason: "contribution-endpoints-unverified" as const };
    }
    return proveGitDeliveryProviderRefreshContribution({
      exec: createRawGitExec(cwd),
      before: {
        predecessor: beforePredecessor,
        member: { head: beforeMember.head, tree: beforeMember.tree },
      },
      after: {
        predecessor: afterPredecessor,
        member: { head: afterMember.head, tree: afterMember.tree },
      },
    });
  };
  const reservedRefreshSubject = (
    plan: z.infer<typeof DeliveryPlanV1Schema>,
    state: z.infer<typeof DeliveryStateV1Schema>,
    mode: "provider-adoption" | "provider-refresh",
  ): DeliveryProviderRefreshSubject | null => {
    const operation = state.activeOperation;
    if (operation?.kind !== "rewrite" || operation.mode !== mode) return null;
    const start = plan.members.findIndex(
      ({ deliverableId }) => deliverableId === operation.affectedDeliverableIds[0],
    );
    const plannedSuffix = start < 0
      ? []
      : plan.members.slice(start, -1).map(({ deliverableId }) => deliverableId);
    const beforeIds = operation.before.members.map(({ deliverableId }) => deliverableId);
    if (canonicalize(plannedSuffix) !== canonicalize(operation.affectedDeliverableIds)
      || canonicalize(beforeIds) !== canonicalize(operation.affectedDeliverableIds)) return null;
    return {
      landedPrefix: plan.members.slice(0, start).map(({ deliverableId }) => deliverableId),
      affectedDeliverableIds: operation.affectedDeliverableIds,
      before: operation.before,
    };
  };

  const observeReviewFixAuthority = async (
    plan: z.infer<typeof DeliveryPlanV1Schema>,
    current: { readonly revision: number; readonly value: DeliveryStateV1 },
    repository: string,
    remote: string,
    selectedDeliverableId: string,
    localTerminalAuthoring = false,
  ) => {
    if (current.value.activeOperation !== null) {
      return { status: "refused" as const, reason: "operation-active" as const };
    }
    const positioned = await observePosition(
      plan,
      current,
      repository,
      remote,
      localTerminalAuthoring ? "review-fix-local" : "review-fix",
    );
    if (positioned.status !== "observed") {
      return { status: "refused" as const, reason: "position-mismatch" as const };
    }
    if (plan.members.at(-1)?.deliverableId === selectedDeliverableId) {
      return { status: "observed" as const, facts: positioned.facts, observation: null };
    }
    const state = positioned.projectedState;
    const subject = deriveDeliveryProviderRefreshSubject({ plan, state, facts: positioned.facts });
    const target = deriveDeliveryNativeTarget(state);
    const firstDeliverableId = subject.status === "derived"
      ? subject.subject.affectedDeliverableIds[0]
      : undefined;
    if (subject.status === "refused" || target.status !== "resolved" || firstDeliverableId === undefined) {
      return { status: "refused" as const, reason: "position-mismatch" as const };
    }
    const expectedChain = deriveNativeDeliveryRegisteredRemainder({
      plan,
      state,
      firstDeliverableId,
      repository,
      baseRef: target.baseRef,
    });
    if (expectedChain.status === "refused") return expectedChain;
    const observation = await observeDeliveryNativeStack(
      { repository, members: expectedChain.members },
      new GhDeliveryHostPort(hostedGhRunner),
    );
    if (observation.status === "refused") {
      return { status: "refused" as const, reason: "position-mismatch" as const };
    }
    return { status: "observed" as const, facts: positioned.facts, observation };
  };

  if (command === "review-fix-plan" || command === "review-fix-publish") {
    const parsed = (command === "review-fix-plan" ? ReviewFixPlanSchema : ReviewFixPublishSchema).parse(request);
    const [planRead, stateRead] = await Promise.all([
      planStore.readCurrent(parsed.planId),
      stateStore.read(parsed.planId),
    ]);
    if (planRead.status !== "ok" || planRead.value === null
      || stateRead.status !== "ok" || stateRead.value === null) {
      return {
        status: "refused",
        reason: "delivery-unavailable",
        recommendedActionText: "Restore canonical delivery plan and state before routing the review fix.",
      };
    }
    const plan = planRead.value;
    const current = stateRead.value;
    const authority = await observeReviewFixAuthority(
      plan,
      current,
      parsed.repository,
      parsed.remote,
      parsed.selectedDeliverableId,
      command === "review-fix-plan"
        && plan.members.at(-1)?.deliverableId === parsed.selectedDeliverableId,
    );
    if (authority.status === "refused") {
      return {
        ...authority,
        recommendedActionText: "Restore the exact canonical remaining chain before routing the review fix.",
      };
    }
    if (command === "review-fix-plan") {
      const planRequest = ReviewFixPlanSchema.parse(parsed);
      const routeInput = {
        plan,
        state: current.value,
        facts: authority.facts,
        selectedDeliverableId: planRequest.selectedDeliverableId,
        observation: authority.observation,
      };
      return planRequest.entryMode === "integrating"
        ? planDeliveryReviewFixRoute({
            ...routeInput,
            entryMode: "integrating",
            repository: planRequest.repository,
            remote: planRequest.remote,
          })
        : planDeliveryReviewFixRoute({ ...routeInput, entryMode: "execution" });
    }

    const publish = ReviewFixPublishSchema.parse(parsed);
    if (authority.observation === null) {
      return {
        status: "refused",
        reason: "terminal-authoring-only",
        recommendedActionText: "Author terminal corrections on the work-unit branch; do not publish a member ref.",
      };
    }
    const [gitCommonDir, active] = await Promise.all([
      resolveGitCommonDir(exec, cwd),
      resolveActiveWu({ cwd }),
    ]);
    const locatorResult = deriveDeliveryResidueLocators(plan, gitCommonDir);
    const locator = locatorResult.status === "derived"
      ? locatorResult.locators.find(({ deliverableId }) => deliverableId === publish.selectedDeliverableId)
      : undefined;
    const protectedBaseRef = current.value.target?.ref;
    if (locator === undefined || active.status !== "resolved" || active.name !== plan.workUnitId
      || active.branch === null || protectedBaseRef === undefined) {
      return { status: "refused", reason: "position-mismatch" };
    }
    const topRef = `refs/heads/${active.branch}`;
    let lifecyclePaths: readonly string[];
    try {
      const resolvedPaths = await new CurrentDeliveryLifecycleContributionPathSource({
        readDirectory: (path) => readdir(resolve(cwd, path)),
        readArtifactsAtRef: (ref, workUnitId) => readGitDeliveryLifecycleArtifactsAtRef(exec, ref, workUnitId),
      }).resolve({
        workUnitId: plan.workUnitId,
        activeMetaPath: validateManagedPath(active.path),
        protectedBaseRef,
        topRef,
      });
      lifecyclePaths = resolvedPaths.paths;
    } catch {
      return { status: "refused", reason: "evidence-unavailable" };
    }
    return publishSelectedDeliveryReviewFix({
      plan,
      current,
      facts: authority.facts,
      selectedDeliverableId: publish.selectedDeliverableId,
      candidateRef: locator.candidateRef,
      expectedCandidateRef: locator.candidateRef,
      observation: authority.observation,
    }, {
      inspectCandidate: () => inspectDeliveryCandidateCheckout(exec, locator.gatePath),
      observeCandidateRef: () => observeDeliveryEligibilityRef(exec, locator.candidateRef),
      readAncestry: (ancestor, descendant) => readAncestry(exec, ancestor, descendant),
      revalidateLifecycle: async () => {
        const checked = await revalidateDeliveryLifecycleContribution({
          exec,
          protectedBaseRef,
          chainBaseRef: protectedBaseRef,
          candidateRef: locator.candidateRef,
          paths: lifecyclePaths,
          regenerablePaths: [],
        });
        return checked;
      },
      reobserveAuthority: async () => {
        const reobserved = await observeReviewFixAuthority(
          plan,
          current,
          publish.repository,
          publish.remote,
          publish.selectedDeliverableId,
        );
        return reobserved.status === "observed" && reobserved.observation !== null
          ? reobserved
          : { status: "refused" as const };
      },
      rewriteRef: (input) => rewriteDeliveryMemberRef({ exec, remote: publish.remote, ...input }),
      observePublishedMember: async ({ ref, head }) => {
        const observed = await observeDeliveryRemoteRef(exec, publish.remote, ref);
        return observed.status === "observed" && observed.head === head;
      },
      stateStore,
    });
  }

  if (command === "refresh-plan" || command === "refresh-execute" || command === "refresh-adopt") {
    const parsed = command === "refresh-plan"
      ? RefreshPlanSchema.parse(request)
      : command === "refresh-execute"
        ? RefreshExecuteSchema.parse(request)
        : RefreshAdoptSchema.parse(request);
    const [planRead, stateRead] = await Promise.all([
      planStore.readCurrent(parsed.planId),
      stateStore.read(parsed.planId),
    ]);
    if (planRead.status !== "ok" || planRead.value === null
      || stateRead.status !== "ok" || stateRead.value === null) {
      return {
        status: "refused",
        reason: "delivery-unavailable",
        recommendedActionText: "Restore canonical delivery plan and state before refreshing.",
      };
    }
    const plan = planRead.value;
    const current = stateRead.value;
    const deriveIdleRefreshSubject = async (
      observationMode: "exact" | "review-fix" | "review-fix-local" | "refresh-adopt"
        | "review-fix-adopt" | "review-fix-local-adopt" = "exact",
    ) => {
      if (current.value.activeOperation !== null) {
        return { status: "refused" as const, reason: "position-mismatch" as const };
      }
      const positioned = await observePosition(
        plan,
        current,
        parsed.repository,
        parsed.remote,
        observationMode,
      );
      if (positioned.status !== "observed") {
        return { status: "refused" as const, reason: "position-mismatch" as const };
      }
      const derived = deriveDeliveryProviderRefreshSubject({
        plan,
        state: positioned.projectedState,
        facts: positioned.facts,
      });
      return derived.status === "derived"
        ? { ...derived, facts: positioned.facts }
        : derived;
    };
    const apparentPending = current.value.activeOperation === null
      ? findExactPendingSelectedRefresh(current.value)
      : null;
    const selectionSubject = apparentPending === null
      ? null
      : await deriveIdleRefreshSubject(
          command === "refresh-adopt" ? "review-fix-local-adopt" : "review-fix-local",
        );
    if (apparentPending !== null && selectionSubject?.status !== "derived") {
      return {
        status: "refused",
        reason: "position-mismatch",
        recommendedActionText: "Restore fresh delivery position before selecting a pending refresh.",
      };
    }
    if (selectionSubject?.status === "derived") {
      const pendingSelectedDeliverableId = findExactPendingSelectedRefresh(
        current.value,
        selectionSubject.subject.landedPrefix,
      );
      if ((parsed.scope?.kind === "dependent-suffix"
        && pendingSelectedDeliverableId !== parsed.scope.selectedDeliverableId)
        || (parsed.scope?.kind !== "dependent-suffix" && pendingSelectedDeliverableId !== null)) {
        return {
          status: "refused",
          reason: "selected-member-invalid",
          recommendedActionText: "Use the exact selected member whose published correction awaits refresh.",
        };
      }
    }
    const idleSubject = current.value.activeOperation === null
      ? await deriveIdleRefreshSubject(
          command === "refresh-adopt"
            ? parsed.scope?.kind === "dependent-suffix" ? "review-fix-local-adopt" : "refresh-adopt"
            : parsed.scope?.kind === "dependent-suffix" ? "review-fix-local" : "exact",
        )
      : null;
    if (command === "refresh-plan") {
      const planRequest = RefreshPlanSchema.parse(parsed);
      const derived = idleSubject ?? { status: "refused" as const, reason: "position-mismatch" as const };
      if (derived.status === "refused") {
        return {
          ...derived,
          recommendedActionText: "Restore one exact bound non-terminal suffix before planning refresh.",
        };
      }
      const selectedIndex = planRequest.scope?.kind === "dependent-suffix"
        ? derived.subject.affectedDeliverableIds.indexOf(planRequest.scope.selectedDeliverableId)
        : -1;
      if (planRequest.scope?.kind === "dependent-suffix" && selectedIndex < 0) {
        return {
          status: "refused",
          reason: "selected-member-invalid",
          recommendedActionText: "Select one currently bound non-terminal delivery member.",
        };
      }
      const landedPrefix = selectedIndex < 0
        ? derived.subject.landedPrefix
        : [
            ...derived.subject.landedPrefix,
            ...derived.subject.affectedDeliverableIds.slice(0, selectedIndex + 1),
          ];
      const observed = await observeProviderRefresh(derived.subject, planRequest.repository, planRequest.remote);
      if (observed.status === "refused") {
        return planDeliverySuffixRefresh({
          plan,
          landedPrefix,
          trigger: { ...planRequest.trigger, mechanics: "operator-initiated" },
          providerMovement: observed.reason === "target-rewritten" ? "target-rewritten" : "ambiguous",
        });
      }
      const stable = derived.subject.before.members.every((member, index) => {
        const after = observed.observation.snapshot.members[index];
        return after !== undefined && after.deliverableId === member.deliverableId
          && after.coordinates?.head === member.coordinates?.head
          && after.coordinates?.tree === member.coordinates?.tree;
      });
      const refreshSelectedDeliverableId = planRequest.scope?.kind === "dependent-suffix"
        ? planRequest.scope.selectedDeliverableId
        : derived.subject.affectedDeliverableIds[0];
      const reviewFixAuthority = planRequest.mechanics === undefined
        && refreshSelectedDeliverableId !== undefined
        ? await observeReviewFixAuthority(
            plan,
            current,
            planRequest.repository,
            planRequest.remote,
            refreshSelectedDeliverableId,
          )
        : null;
      return planDeliverySuffixRefresh({
        plan,
        landedPrefix,
        trigger: {
          ...planRequest.trigger,
          mechanics: planRequest.mechanics
            ?? (reviewFixAuthority?.status === "observed"
              && reviewFixAuthority.observation !== null
              && reviewFixAuthority.observation.status === "registered"
              ? "provider-invoked"
              : "operator-initiated"),
        },
        providerMovement: stable ? "stable" : "ambiguous",
      });
    }

    if (command === "refresh-execute") {
      const executeRequest = RefreshExecuteSchema.parse(parsed);
      const subject = idleSubject ?? (
        current.value.activeOperation === null
          ? { status: "refused" as const, reason: "position-mismatch" as const }
        : {
            status: "derived" as const,
            subject: reservedRefreshSubject(plan, current.value, "provider-refresh"),
          }
      );
      if (subject.status === "refused" || subject.subject === null) {
        return {
          status: "refused",
          reason: subject.status === "refused" ? subject.reason : "operation-mismatch",
          recommendedActionText:
            "Restore the exact provider-refresh subject or use the recovery selector returned by delivery reconcile.",
        };
      }
      const refreshSubject = subject.subject;
      const host = new GhDeliveryHostPort(hostedGhRunner);
      const preparation = new GhDeliveryProviderRefreshPort({
        git: exec,
        gh: deliveryProviderGhRunner,
        nativeStack: host,
        checkoutPath: cwd,
        remote: executeRequest.remote,
      });
      return executeDeliveryProviderRefresh({
        plan,
        current,
        repository: executeRequest.repository,
        ...(executeRequest.scope === undefined
          ? {}
          : { scope: executeRequest.scope }),
        ...(executeRequest.operationId === undefined ? {} : { operationId: executeRequest.operationId }),
        ...(idleSubject?.status === "derived" ? { facts: idleSubject.facts } : {}),
      }, {
        preparation,
        preflightTop: (input) => preflightGitDeliveryChainAbsorption({
          exec: createRawGitExec(cwd),
          ...input,
        }),
        observeMemberRefCheckouts: (refs) => observeDeliveryMemberRefCheckouts(exec, refs),
        observePublishedHeads: async (snapshot) => {
          const observed: DeliveryProviderRefreshPublishedHead[] = [];
          for (const member of snapshot.members) {
            if (member.ref === null) throw new Error("refresh member ref is unavailable");
            const result = await observeDeliveryRemoteRef(exec, executeRequest.remote, member.ref);
            if (result.status === "refused") throw new Error(`refresh ref observation ${result.reason}`);
            observed.push({
              deliverableId: member.deliverableId,
              head: result.status === "observed" ? result.head : null,
            });
          }
          return observed;
        },
        rewriteMemberRef: (input) => rewriteDeliveryMemberRef({
          exec,
          remote: executeRequest.remote,
          ...input,
        }),
        observeResult: () => observeProviderRefresh(
          refreshSubject,
          executeRequest.repository,
          executeRequest.remote,
        ),
        readTargetAncestry,
        proveContribution: proveProviderRefreshMovement,
        absorbTop: (input) => absorbGitDeliveryChain({ exec: createRawGitExec(cwd), ...input }),
        publishTop: (input) => publishDeliveryTopRef({
          exec,
          remote: executeRequest.remote,
          ...input,
        }),
        rewriteLocalRef: (input) => rewriteDeliveryLocalRef({ exec, ...input }),
        cleanupPreparedCandidates: (candidates) => preparation.cleanup(candidates),
        stateStore,
      });
    }

    const adopt = RefreshAdoptSchema.parse(parsed);
    const providerAdoptionResult = <Result extends {
      readonly status: string;
      readonly reason?: string;
      readonly paths?: readonly string[];
    }>(result: Result) => {
      if (result.status !== "blocked") return result;
      if (result.paths !== undefined) {
        return {
          ...result,
          reason: result.reason === "content-conflict" ? "contribution-conflicted" : result.reason,
          guidance: "Resolve the listed paths, then rerun refresh adoption with the reservation retained.",
        };
      }
      return {
        ...result,
        guidance: "Restore exact provider and terminal-top state, then rerun refresh adoption.",
      };
    };
    const refreshSettlementDependencies = (subject: DeliveryProviderRefreshSubject) => ({
      observeResult: () => observeProviderRefresh(subject, adopt.repository, adopt.remote),
      readTargetAncestry,
      proveContribution: proveProviderRefreshMovement,
      preflightTop: (input: {
        topRef: string;
        top: { head: string; tree: string };
      }) => preflightGitDeliveryChainAbsorption({ exec: createRawGitExec(cwd), ...input }),
      absorbTop: (input: {
        topRef: string;
        top: { head: string; tree: string };
        previousHighestMember: { head: string; tree?: string };
        highestMember: { head: string; tree: string };
      }) => absorbGitDeliveryChain({ exec: createRawGitExec(cwd), ...input }),
      publishTop: (input: { ref: string; beforeHead: string; requestedHead: string }) => (
        publishDeliveryTopRef({ exec, remote: adopt.remote, ...input })
      ),
      rewriteLocalRef: (input: { ref: string; beforeHead: string; requestedHead: string }) => (
        rewriteDeliveryLocalRef({ exec, ...input })
      ),
      stateStore,
    });
    const active = current.value.activeOperation;
    if (active !== null) {
      if (active.kind !== "rewrite" || active.mode !== "provider-adoption"
        || adopt.operationId !== active.operationId) {
        return {
          status: "refused",
          reason: "operation-mismatch",
          recommendedActionText: "Use the exact provider-adoption recovery selector from delivery reconcile.",
        };
      }
      const subject = reservedRefreshSubject(plan, current.value, "provider-adoption");
      if (subject === null) {
        return {
          status: "refused",
          reason: "position-mismatch",
          recommendedActionText: "Restore the reserved suffix subject before provider adoption.",
        };
      }
      const reconciled = await settleReservedDeliverySuffixRefresh({
        plan,
        current,
        ...refreshSettlementDependencies(subject),
      });
      return providerAdoptionResult(reconciled);
    }
    if (adopt.operationId !== undefined) {
      return {
        status: "refused",
        reason: "operation-mismatch",
        recommendedActionText: "Omit operationId when adopting an externally initiated refresh.",
      };
    }
    const derived = idleSubject ?? { status: "refused" as const, reason: "position-mismatch" as const };
    if (derived.status === "refused") {
      return {
        ...derived,
        recommendedActionText: "Restore one exact bound non-terminal suffix before refresh adoption.",
      };
    }
    const selectedDeliverableId = adopt.scope?.kind === "dependent-suffix"
      ? adopt.scope.selectedDeliverableId
      : undefined;
    if (selectedDeliverableId !== undefined
      && !derived.subject.affectedDeliverableIds.includes(selectedDeliverableId)) {
      return {
        status: "refused",
        reason: "selected-member-invalid",
        recommendedActionText: "Select one currently bound non-terminal delivery member.",
      };
    }
    const adopted = await adoptExternalDeliverySuffixRefresh({
      plan,
      current,
      affectedDeliverableIds: derived.subject.affectedDeliverableIds,
      landedDeliverableIds: derived.facts.landedDeliverableIds,
      ...(selectedDeliverableId === undefined ? {} : { selectedDeliverableId }),
      ...(adopt.conflictResolution === undefined
        ? {}
        : { conflictResolution: adopt.conflictResolution }),
      ...(derived.facts.terminalAuthoringMovement === undefined
        ? {}
        : { terminalAuthoringMovement: derived.facts.terminalAuthoringMovement }),
      ...refreshSettlementDependencies(derived.subject),
    });
    return providerAdoptionResult(adopted);
  }

  if (command === "native-observe") {
    return observeDeliveryNativeStack(
      NativeObserveSchema.parse(request),
      new GhDeliveryHostPort(hostedGhRunner),
    );
  }
  if (command === "native-unlink") {
    const parsed = NativeUnlinkSchema.parse(request);
    const [planRead, stateRead] = await Promise.all([
      planStore.readCurrent(parsed.planId),
      stateStore.read(parsed.planId),
    ]);
    if (planRead.status !== "ok" || planRead.value === null
      || stateRead.status !== "ok" || stateRead.value === null) {
      return {
        status: "blocked",
        reason: "delivery-unavailable",
        recommendedActionText: "Restore canonical delivery state before changing native presentation.",
      };
    }
    return degradePlannedDeliveryNativeStack({
      plan: planRead.value,
      state: stateRead.value.value,
      repository: parsed.repository,
      members: parsed.members,
    }, new GhDeliveryHostPort(hostedGhRunner));
  }
  if (command === "native-link") {
    const parsed = NativeLinkSchema.parse(request);
    const [planRead, stateRead] = await Promise.all([
      planStore.readCurrent(parsed.planId),
      stateStore.read(parsed.planId),
    ]);
    if (planRead.status !== "ok" || planRead.value === null
      || stateRead.status !== "ok" || stateRead.value === null) {
      return {
        status: "refused",
        reason: "delivery-unavailable",
        recommendedActionText: "Restore canonical delivery state before native registration.",
      };
    }
    return linkPlannedDeliveryNativeStack({
      plan: planRead.value,
      state: stateRead.value.value,
      repository: parsed.repository,
      baseRef: parsed.protectedBaseRef,
      members: parsed.members,
      ...(parsed.optIn === undefined ? {} : { optIn: parsed.optIn }),
    }, new GhDeliveryHostPort(hostedGhRunner));
  }
  if (command === "native-land-select") {
    const parsed = NativeSelectSchema.parse(request);
    const [planRead, stateRead] = await Promise.all([planStore.readCurrent(parsed.planId), stateStore.read(parsed.planId)]);
    if (planRead.status !== "ok" || planRead.value === null || stateRead.status !== "ok" || stateRead.value === null) {
      return { status: "blocked", reason: "delivery-unavailable", recommendedActionText: "Restore canonical delivery state before selecting a landing arm." };
    }
    const observed = await observePosition(planRead.value, stateRead.value, parsed.repository, parsed.remote);
    if (observed.status !== "observed") {
      return {
        status: "blocked",
        reason: "position-unavailable",
        recommendedActionText: "Restore fresh delivery position before selecting a landing arm.",
      };
    }
    const position = deriveDeliveryPosition(planRead.value, stateRead.value.value, observed.facts);
    if (position.status !== "derived") {
      return { status: "blocked", reason: position.reason, recommendedActionText: "Refresh exact delivery position before selecting a landing arm." };
    }
    const target = deriveDeliveryNativeTarget(stateRead.value.value);
    const firstRemaining = planRead.value.members[position.position.landedPrefix.length];
    if (position.position.landedPrefix.length >= planRead.value.members.length - 1) {
      return {
        status: "blocked",
        reason: "no-nonterminal-remainder",
        recommendedActionText: "Continue ordinary terminal integration; no non-terminal native member remains.",
      };
    }
    if (target.status !== "resolved" || firstRemaining === undefined) {
      return {
        status: "blocked",
        reason: "protected-target-mismatch",
        recommendedActionText: "Use the exact protected target bound in current delivery state.",
      };
    }
    const expectedChain = deriveNativeDeliveryRegisteredRemainder({
      plan: planRead.value,
      state: stateRead.value.value,
      firstDeliverableId: firstRemaining.deliverableId,
      repository: parsed.repository,
      baseRef: target.baseRef,
    });
    if (expectedChain.status === "refused") {
      return {
        status: "blocked",
        reason: expectedChain.reason,
        recommendedActionText: "Restore the exact canonical non-terminal remainder before selecting an arm.",
      };
    }
    const host = new GhDeliveryHostPort(hostedGhRunner);
    const observation = await observeDeliveryNativeStack({
      repository: parsed.repository,
      members: expectedChain.members,
    }, host);
    if (observation.status === "refused") {
      return { status: "blocked", reason: observation.reason, recommendedActionText: "Repair the exact native-stack input before selecting a landing arm." };
    }
    const mergePolicy = observation.status === "registered"
      ? await resolveIntermediateDeliveryMergePolicy(cwd, parsed.repository)
      : null;
    if (observation.status === "registered" && mergePolicy === null) {
      return {
        status: "blocked",
        reason: "merge-policy-unavailable",
        recommendedActionText: "Restore readable repository merge policy before selecting a native landing arm.",
      };
    }
    return selectNativeDeliveryLandingArm({
      plan: planRead.value,
      landedPrefix: position.position.landedPrefix,
      observation,
      mergeStrategy: mergePolicy?.method ?? "merge",
      mergeAction: parsed.mergeAction,
      explicitAtomic: parsed.explicitAtomic,
      members: expectedChain.members.map(({ deliverableId, changeRequestId, headSha }) => ({
        deliverableId,
        changeRequestId,
        headSha,
      })),
    });
  }
  if (command === "native-land-prepare" || command === "native-land-submit" || command === "native-land-status") {
    const parsed = (command === "native-land-prepare" ? NativePrepareSchema
      : command === "native-land-submit" ? NativeSubmitSchema : NativeStatusSchema).parse(request);
    const [planRead, stateRead] = await Promise.all([planStore.readCurrent(parsed.planId), stateStore.read(parsed.planId)]);
    if (planRead.status !== "ok" || planRead.value === null || stateRead.status !== "ok" || stateRead.value === null) {
      return { status: "blocked", reason: "delivery-unavailable", recommendedActionText: "Restore canonical delivery state before continuing." };
    }
    const plan = planRead.value;
    const current = stateRead.value;
    const host = new GhDeliveryHostPort(hostedGhRunner);
    if (command === "native-land-prepare") {
      const reviewStatus = createReviewStatusPort({ cwd, exec });
      const prepare = NativePrepareSchema.parse(parsed);
      const expectedChain = deriveNativeDeliveryMemberChain({
        state: current.value,
        selectedMembers: prepare.selection.members,
        repository: prepare.repository,
        baseRef: prepare.baseRef,
      });
      if (expectedChain.status === "refused") {
        return {
          status: "blocked",
          reason: expectedChain.reason,
          recommendedActionText: "Refresh the exact plan-ordered member bindings before preparing again.",
        };
      }
      const mergePolicy = await resolveIntermediateDeliveryMergePolicy(cwd, prepare.repository);
      if (mergePolicy === null) {
        return {
          status: "blocked",
          reason: "merge-policy-unavailable",
          recommendedActionText: "Restore readable repository merge policy before preparing a native landing.",
        };
      }
      const observed = await observePosition(plan, current, prepare.repository, prepare.remote);
      if (observed.status !== "observed") {
        return {
          status: "blocked",
          reason: "position-unavailable",
          recommendedActionText: "Restore fresh delivery position before preparing a native landing.",
        };
      }
      const anchor = expectedChain.members[0];
      if (anchor === undefined) {
        return {
          status: "blocked",
          reason: "member-set-mismatch",
          recommendedActionText: "Refresh the exact plan-ordered member bindings before preparing again.",
        };
      }
      const reviewReadiness = createDeliveryLandingSetReviewReadiness({
        repository: prepare.repository,
        headRef: anchor.headRef,
        headSha: anchor.headSha,
      }, reviewStatus, (target, routedObligation) => {
        const expected = expectedChain.members.find((candidate) => candidate.headRef === target.headRef
          && candidate.headSha === target.headSha);
        if (expected === undefined) throw new Error("selected native landing member is unavailable");
        return createReviewStatusPort({ cwd, exec }, {
          target,
          pullRequest: Number(expected.changeRequestId),
          routedObligation,
          deliveryLookupHeadSha: expected.headSha,
        });
      });
      return reserveNativeDeliveryLanding({
        plan, current, operationId: prepare.operationId, facts: observed.facts,
        selection: prepare.selection, repository: prepare.repository, baseRef: prepare.baseRef,
        targetRef: prepare.targetRef, mergePolicy,
      }, {
        readiness: async (member) => {
          const bound = current.value.members.find((candidate) => candidate.deliverableId === member.deliverableId);
          const expected = expectedChain.members.find((candidate) => candidate.deliverableId === member.deliverableId);
          if (bound?.ref === null || bound?.ref === undefined || bound.coordinates === null
            || bound.changeRequest === null || expected === undefined) {
            return { status: "refused" as const };
          }
          const observed = await host.readRequest(prepare.repository, bound.changeRequest);
          if (observed.status !== "observed" || observed.request.state !== "open"
            || observed.request.repository !== prepare.repository || observed.request.headRepository !== prepare.repository
            || observed.request.headRef !== expected.headRef
            || observed.request.headSha !== expected.headSha
            || observed.request.baseRef !== expected.baseRef) {
            return { status: "refused" as const };
          }
          return reviewReadiness({
            repository: prepare.repository,
            headRef: expected.headRef,
            headSha: expected.headSha,
          });
        }, stateStore,
      });
    }
    if (command === "native-land-submit") {
      const submit = NativeSubmitSchema.parse(parsed);
      const operation = current.value.activeOperation;
      const reviewStatusInput = {
        cwd,
        exec,
        preparedNativeLanding: {
          planId: submit.planId,
          operationId: submit.operationId,
        },
      };
      const reviewStatus = createReviewStatusPort(reviewStatusInput);
      const nativeResult = await submitReservedNativeDeliveryMerge({
        planId: submit.planId,
        current,
        operationId: submit.operationId,
        request: submit.request,
      }, {
        host, stateStore,
        reobserveSelection: async () => {
          if (operation?.kind !== "land" || operation.mode !== "native") {
            return { status: "refused" as const };
          }
          const firstDeliverableId = operation.affectedDeliverableIds[0];
          if (firstDeliverableId === undefined) return { status: "refused" as const };
          const expectedChain = deriveNativeDeliveryRegisteredRemainder({
            plan,
            state: current.value,
            firstDeliverableId,
            repository: submit.request.repository,
            baseRef: operation.effect.baseRef,
          });
          if (expectedChain.status === "refused") return { status: "refused" as const };
          const observation = await observeDeliveryNativeStack({
            repository: submit.request.repository,
            members: expectedChain.members,
          }, host);
          return { status: observation.status === "registered" ? "exact" as const : "refused" as const };
        },
        revalidateSet: async (members) => {
          const anchor = members[0];
          if (anchor?.ref === null || anchor === undefined || anchor.changeRequest === null
            || anchor.coordinates === null) return { status: "refused" as const };
          const reviewReadiness = createDeliveryLandingSetReviewReadiness({
            repository: submit.request.repository,
            headRef: anchor.ref.replace(/^refs\/heads\//u, ""),
            headSha: anchor.coordinates.head,
          }, reviewStatus, (target, routedObligation) => {
            const expected = members.find((candidate) => candidate.ref !== null
              && candidate.coordinates !== null
              && candidate.ref.replace(/^refs\/heads\//u, "") === target.headRef
              && candidate.coordinates.head === target.headSha);
            const pullRequest = Number(expected?.changeRequest?.changeRequestId);
            if (expected === undefined || !Number.isSafeInteger(pullRequest) || pullRequest <= 0) {
              throw new Error("reserved native landing member is unavailable");
            }
            return createReviewStatusPort(reviewStatusInput, {
              target,
              pullRequest,
              routedObligation,
              deliveryLookupHeadSha: target.headSha,
            });
          });
          const revalidated = await Promise.all(members.map(async (member) => {
            if (member.ref === null || member.changeRequest === null || member.coordinates === null) {
              return { status: "refused" as const };
            }
            const observed = await host.readRequest(submit.request.repository, member.changeRequest);
            if (observed.status !== "observed" || observed.request.state !== "open"
              || observed.request.repository !== submit.request.repository
              || observed.request.headRepository !== submit.request.repository
              || observed.request.binding.providerId !== member.changeRequest.providerId
              || observed.request.binding.changeRequestId !== member.changeRequest.changeRequestId
              || observed.request.headRef !== member.ref.replace(/^refs\/heads\//u, "")
              || observed.request.headSha !== member.coordinates.head) return { status: "refused" as const };
            return reviewReadiness({
              repository: submit.request.repository,
              headRef: observed.request.headRef,
              headSha: member.coordinates.head,
            });
          }));
          return revalidated.every(({ status }) => status === "ready")
            ? { status: "ready" as const }
            : { status: "refused" as const };
        },
        releaseLock: async (deliverableId) => {
          const member = current.value.members.find((candidate) => candidate.deliverableId === deliverableId);
          const changeRequestId = Number(member?.changeRequest?.changeRequestId);
          if (!Number.isSafeInteger(changeRequestId) || changeRequestId <= 0) return { status: "refused" as const };
          const released = await releaseMergeLock({
            schemaVersion: 1, treeRoot: submit.treeRoot,
            target: { repository: submit.request.repository, pullRequest: changeRequestId, headSha: member?.coordinates?.head ?? "" },
            vehicle: { kind: "delivery-member", planId: plan.planId, deliverableId, workUnitSlug: plan.workUnitId },
          }, defaultMergeLockPort(cwd));
          return { status: released.state === "blocked" ? "refused" as const : released.state === "released" ? "released" as const : "not-configured" as const };
        },
        revalidateMergePolicy: (binding) => revalidateIntermediateDeliveryMergePolicy(cwd, binding),
        observeEffect: async () => operation?.kind === "land" && operation.mode === "native"
          ? observeNativeDeliveryEffect(
              host, current.value, submit.request.repository, operation, exec, cwd, submit.remote,
            )
          : { outcome: "ambiguous" as const },
      });
      if (nativeResult.status !== "applied") return nativeResult;
      if (operation === null || operation.kind !== "land" || operation.mode !== "native") {
        return {
          status: "blocked",
          reason: "reservation-mismatch",
          recommendedActionText: "Restore the exact native landing reservation before suffix reconciliation.",
        };
      }
      return settleAppliedNativeLanding(
        plan,
        nativeResult.before,
        { revision: nativeResult.before.revision, value: nativeResult.projected },
        submit.request.repository,
        operation.effect.targetRef,
        submit.remote,
      );
    }
    const status = NativeStatusSchema.parse(parsed);
    const operation = current.value.activeOperation;
    if (operation === null || operation.kind !== "land" || operation.mode !== "native") {
      return { status: "blocked", reason: "effect-identity-missing", recommendedActionText: "Restore the persisted native land reservation before polling." };
    }
    const nativeResult = await reconcileReservedNativeDeliveryMerge({
      planId: status.planId,
      current,
      request: status.request,
      treeRoot: cwd,
      remote: status.remote,
    }, {
      host, stateStore,
      observeEffect: () => observeNativeDeliveryEffect(
        host, current.value, status.request.repository, operation, exec, cwd, status.remote,
      ),
    });
    if (nativeResult.status !== "applied") return nativeResult;
    return settleAppliedNativeLanding(
      plan,
      nativeResult.before,
      { revision: nativeResult.before.revision, value: nativeResult.projected },
      status.request.repository,
      operation.effect.targetRef,
      status.remote,
    );
  }

  if (command === "eligibility-prepare") {
    const parsed = PrepareSchema.parse(request);
    const lifecyclePaths = await resolveCurrentLifecyclePaths(
      parsed.plan,
      parsed.protectedBaseRef,
      parsed.topRef,
    );
    if (lifecyclePaths === null) return { status: "refused", reason: "evidence-unavailable" };
    const requestedPaths = sortByCanonicalBytes([...new Set(parsed.lifecyclePaths)]);
    const currentPaths = sortByCanonicalBytes([...new Set(lifecyclePaths)]);
    if (canonicalize(requestedPaths) !== canonicalize(currentPaths)) {
      return { status: "refused", reason: "lifecycle-paths-moved" };
    }
    return prepareDeliveryEligibility({ ...parsed, lifecyclePaths: currentPaths }, eligibilityDeps);
  }
  if (command === "eligibility-close") {
    const parsed = CloseSchema.parse(request);
    return closeDeliveryEligibilityForPublication(parsed, {
      ...eligibilityDeps,
      resolveMember: resolveMemberReadOnly,
      resolveLifecyclePaths: async ({ plan }) => {
        const [topRef, config] = await Promise.all([
          resolveOriginatingTopRef(plan),
          readConfigSettings(cwd),
        ]);
        if (topRef === null) return null;
        return resolveCurrentLifecyclePaths(
          plan,
          `refs/heads/${config.settings["branch.base"]}`,
          topRef,
        );
      },
    });
  }
  if (command === "publish") {
    const parsed = PublishSchema.parse(request);
    return executeWithFreshDeliveryEligibility(parsed, {
      ...eligibilityDeps,
      resolveOriginatingTopRef,
      resolveLifecyclePaths: (plan) => resolveCurrentLifecyclePaths(
        plan,
        parsed.protectedBaseRef,
        parsed.topRef,
      ),
      prepareMutation: ({ plan, snapshot }): Promise<
        | {
            readonly status: "prepared";
            readonly value: {
              readonly materialization: DeliveryMaterializationPlan;
              readonly presentations: DeliveryPublicationPresentations;
            };
          }
        | { readonly status: "refused"; readonly reason: "snapshot-mismatch" | "presentation-mismatch" }
      > => {
        const derived = deriveDeliveryMaterialization(plan, snapshot);
        if (derived.status !== "derived") return Promise.resolve(derived);
        const presentations = resolveDeliveryPublicationPresentations(
          plan,
          parsed.presentations,
          parsed.terminalPresentation,
        );
        return Promise.resolve(presentations.status === "resolved"
          ? {
              status: "prepared" as const,
              value: { materialization: derived.value, presentations: presentations.value },
            }
          : presentations);
      },
      mutate: async ({ plan, snapshot, prepared }) => {
        const derived = { status: "derived" as const, value: prepared.materialization };
        const refs = {
          observe: async (ref: string) => observeDeliveryRemoteRef(exec, parsed.remote, ref),
          publish: async (ref: string, head: string) => {
            const outcome = await publishDeliveryMemberRef({ exec, remote: parsed.remote, ref, head });
            return outcome.status === "refused" ? { status: "refused" as const } : outcome;
          },
        };
        const initial = await stateStore.read(plan.planId);
        if (initial.status !== "ok") return { status: "refused" as const, reason: "state-unavailable" };
        const nonTerminalMembers = derived.value.members.filter((member) => member.kind === "member");
        if (initial.value === null && nonTerminalMembers.length > 0) {
          const recovered = await bindInitialDeliveryRequest({
            plan,
            materialization: derived.value,
            stateStore,
            host: new GhDeliveryHostPort(hostedGhRunner),
            providerId: "github",
            repository: parsed.repository,
            draft: parsed.draft,
          });
          if (recovered.status === "refused") {
            return { status: "refused" as const, reason: "initial-request-refused" };
          }
          if (recovered.status === "absent") {
            const bound = await bindInitialDeliveryRef({ plan, materialization: derived.value, stateStore, refs });
            if (bound.status !== "bound") return { status: "refused" as const, reason: bound.reason };
          }
        }
        let materialized = null;
        let adoptedMaterialization = derived.value;
        const highestMember = nonTerminalMembers.at(-1);
        if (highestMember !== undefined) {
          const finalCandidate = snapshot.members.at(-1);
          if (finalCandidate === undefined) return { status: "refused" as const, reason: "projection-invalid" };
          materialized = await materializeBoundDeliveryChain({
            plan, materialization: derived.value, stateStore, refs,
          });
          if (materialized.status !== "materialized") return materialized;
          const adoption = await adoptGitDeliveryChain({
            exec: createRawGitExec(cwd),
            topRef: parsed.topRef,
            commonBase: snapshot.chainBase,
            highestMember: { head: highestMember.head, tree: highestMember.tree },
            finalCandidate,
            lifecyclePaths: snapshot.lifecyclePaths,
            top: snapshot.top,
          });
          if (adoption.status !== "adopted") return adoption;
          adoptedMaterialization = {
            ...derived.value,
            members: derived.value.members.map((member) => member.kind === "terminal"
              ? {
                  ...member,
                  ref: parsed.topRef,
                  head: adoption.head,
                  tree: adoption.tree,
                  coordinates: { ...member.coordinates, head: adoption.head, tree: adoption.tree },
                }
              : member),
          };
        }
        const terminal = adoptedMaterialization.members.at(-1);
        if (terminal?.kind !== "terminal" || terminal.ref === null) {
          return { status: "refused" as const, reason: "projection-invalid" };
        }
        const terminalRef = terminal.ref;
        const publishTop = () => publishDeliveryTopRef({
          exec,
          remote: parsed.remote,
          ref: terminalRef,
          beforeHead: snapshot.top.head,
          requestedHead: terminal.head,
        });
        const topPublication = await publishTop();
        if (topPublication.status === "refused") return topPublication;
        if (nonTerminalMembers.length === 0 && initial.value === null) {
          const topRefs = {
            observe: (ref: string) => observeDeliveryRemoteRef(exec, parsed.remote, ref),
            publish: async () => {
              const outcome = await publishTop();
              return outcome.status === "refused" ? { status: "refused" as const } : outcome;
            },
          };
          const bound = await bindInitialDeliveryRef({
            plan, materialization: adoptedMaterialization, stateStore, refs: topRefs,
          });
          if (bound.status !== "bound") return { status: "refused" as const, reason: bound.reason };
        }
        if (materialized === null) {
          materialized = await materializeBoundDeliveryChain({
            plan, materialization: adoptedMaterialization, stateStore, refs,
          });
          if (materialized.status !== "materialized") return materialized;
        }
        return publishDeliveryRequests({
          plan,
          materialization: adoptedMaterialization,
          stateStore,
          host: new GhDeliveryHostPort(hostedGhRunner),
          providerId: "github",
          repository: parsed.repository,
          draft: parsed.draft,
          terminalPresentation: prepared.presentations.terminal,
          memberPresentation: (member) => {
            const presentation = prepared.presentations.members.get(member.deliverableId);
            if (presentation === undefined) throw new Error("validated delivery presentation coverage was lost");
            return presentation;
          },
        });
      },
    });
  }
  if (command === "position") {
    const parsed = PositionSchema.parse(request);
    const [plan, state] = await Promise.all([planStore.readCurrent(parsed.planId), stateStore.read(parsed.planId)]);
    if (plan.status !== "ok" || plan.value === null || state.status !== "ok" || state.value === null) {
      return { status: "refused", reason: "delivery-unavailable" };
    }
    if (state.value.value.activeOperation !== null) {
      return deriveDeliveryPosition(plan.value, state.value.value, undefined);
    }
    const observed = await observePosition(plan.value, state.value, parsed.repository, parsed.remote, "review-fix");
    if (observed.status !== "observed") return { status: "refused", reason: "position-unavailable" };
    if (observed.facts.terminalAuthoringMovement !== undefined) {
      return {
        status: "refused",
        reason: "review-fix-routing-required",
        nextAction: "plan-review-fix",
        entryMode: "integrating",
        recommendedActionText: REVIEW_FIX_ROUTING_REQUIRED_TEXT,
      };
    }
    return routeDeliveryPosition(plan.value, state.value.value, observed.facts);
  }
  if (command === "land-prepare" || command === "land-apply") {
    const parsed = (command === "land-prepare" ? LandPrepareSchema : LandApplySchema).parse(request);
    const planId = parsed.planId;
    const [planRead, stateRead] = await Promise.all([planStore.readCurrent(planId), stateStore.read(planId)]);
    if (planRead.status !== "ok" || planRead.value === null || stateRead.status !== "ok" || stateRead.value === null) {
      return { status: "refused", reason: "delivery-unavailable" };
    }
    const plan = planRead.value;
    const host = new GhDeliveryHostPort(hostedGhRunner);
    const treeRoot = parsed.treeRoot;
    const memberLookup = new RepositoryDeliveryMemberLookup({ exec, cwd });
    const reviewStatus = createReviewStatusPort({ cwd, exec });
    const readiness = {
      assess: async (input: {
        planId: string; deliverableId: string; workUnitId: string; repository: string;
        changeRequestId: string; head: string;
      }) => {
        const observed = await host.readRequest(input.repository, {
          providerId: "github", changeRequestId: input.changeRequestId,
        });
        const pullRequest = Number(input.changeRequestId);
        if (observed.status !== "observed") {
          return {
            status: "refused" as const,
            reason: observed.status === "absent" ? "request-absent" as const : `request-${observed.reason}` as const,
          };
        }
        if (!Number.isSafeInteger(pullRequest) || pullRequest <= 0) {
          return { status: "refused" as const, reason: "request-malformed" as const };
        }
        const checked = await evaluateReviewReadiness({
          schemaVersion: 1,
          treeRoot,
          target: { repository: input.repository, pullRequest, headSha: input.head },
          pullRequest: {
            repository: input.repository,
            number: pullRequest,
            state: observed.request.state === "open" ? "open" : "closed",
            headBranch: observed.request.headRef,
            headSha: observed.request.headSha,
          },
          vehicle: {
            kind: "delivery-member",
            planId: input.planId,
            deliverableId: input.deliverableId,
            workUnitSlug: input.workUnitId,
          },
        }, { deliveryMemberLookup: memberLookup });
        if (checked.state !== "ready") {
          return { status: "refused" as const, reason: "review-readiness-invalid" as const };
        }
        const reviewed = await assessDeliveryLandingReviewReadiness({
          repository: input.repository,
          headRef: observed.request.headRef,
          headSha: input.head,
        }, reviewStatus);
        return reviewed.status === "ready"
          ? { status: "ready" as const, settledReviewState: "settled" }
          : reviewed;
      },
    };
    if (command === "land-prepare") {
      const prepare = LandPrepareSchema.parse(parsed);
      const mergePolicy = await resolveIntermediateDeliveryMergePolicy(cwd, prepare.repository);
      if (mergePolicy === null) {
        return { status: "refused", reason: "merge-policy-unavailable" };
      }
      const observed = await observePosition(plan, stateRead.value, prepare.repository, prepare.remote);
      if (observed.status !== "observed") {
        return { status: "refused", reason: "position-unavailable" };
      }
      return prepareDeliveryLanding({
        plan,
        current: stateRead.value,
        facts: observed.facts,
        selectedDeliverableId: prepare.selectedDeliverableId,
        repository: prepare.repository,
        baseRef: prepare.baseRef,
        targetRef: prepare.targetRef,
        mergePolicy,
        releaseMergeLock: prepare.releaseMergeLock,
        stateStore,
        host,
        readiness,
      });
    }
    const apply = LandApplySchema.parse(parsed);
    const current = stateRead.value;
    const lock = {
      release: async (input: { repository: string; changeRequestId: string }) => {
        const pullRequest = Number(input.changeRequestId);
        if (!Number.isSafeInteger(pullRequest) || pullRequest <= 0) {
          return { status: "refused" as const, reason: "change-request-invalid" as const };
        }
        const released = await releaseMergeLock({
          schemaVersion: 1,
          treeRoot,
          target: { repository: input.repository, pullRequest, headSha: apply.approved.head },
          vehicle: {
            kind: "delivery-member",
            planId: plan.planId,
            deliverableId: apply.approved.deliverableId,
            workUnitSlug: plan.workUnitId,
          },
        }, defaultMergeLockPort(cwd));
        return released.state === "blocked"
          ? { status: "refused" as const, reason: released.payload.reason }
          : { status: released.state === "released" ? "released" as const : "not-configured" as const };
      },
    };
    return applyDeliveryLanding({
      plan,
      current,
      approved: apply.approved,
      stateStore,
      host,
      readiness,
      lock,
      observation: {
        revalidateMergePolicy: (binding) => revalidateIntermediateDeliveryMergePolicy(cwd, binding),
        observeSelection: async () => {
          const observed = await observePosition(plan, current, apply.approved.repository, apply.remote);
          const member = observed.status === "observed"
            ? observed.facts.members.find((candidate) => candidate.deliverableId === apply.approved.deliverableId)
            : undefined;
          return observed.status === "observed" && member !== undefined
            ? { status: "observed" as const, facts: observed.facts, snapshot: {
              target: observed.facts.target,
              members: [member],
            } }
            : {
                status: "refused" as const,
                reason: observed.status === "observed" ? "member-unavailable" as const : "position-unavailable" as const,
              };
        },
        observeLandedResult: ({ mergeCommitSha, strategy, beforeMember }) => (
          observeGitDeliveryLandingResult({
            exec, cwd, remote: apply.remote, resultHead: mergeCommitSha, strategy, beforeMember,
          })
        ),
        proveLandedContribution: (endpoints) => proveGitDeliveryContribution({
          exec: createRawGitExec(cwd),
          ...projectDeliveryContributionEndpoints(endpoints),
        }),
      },
    });
  }
  if (command === "reconcile") {
    const parsed = ReconcileSchema.parse(request);
    const [plan, state] = await Promise.all([planStore.readCurrent(parsed.planId), stateStore.read(parsed.planId)]);
    if (plan.status !== "ok" || plan.value === null || state.status !== "ok" || state.value === null) {
      return { status: "refused", reason: "state-unavailable" };
    }
    const currentPlan = plan.value;
    const currentState = state.value;
    if (currentState.value.activeOperation === null) {
      const terminal = currentState.value.members.at(-1);
      const baseBranch = (await readConfigSettings(cwd)).settings["branch.base"].trim();
      if (terminal?.ref === null || terminal?.ref === undefined
        || terminal.changeRequest === null || terminal.coordinates === null
        || baseBranch === "") {
        return { status: "refused", reason: "terminal-binding-missing" };
      }
      try {
        const [record, boundary] = await Promise.all([
          readCandidateRecord(cwd, currentPlan.workUnitId),
          readSubmissionBoundary(cwd, currentPlan.workUnitId),
        ]);
        if (record === null || boundary === null) {
          return await reconcileDeliveryExecution({
            planId: parsed.planId,
            current: currentState,
            stateStore,
            observation: {
              observe: () => Promise.resolve({
                status: "refused" as const,
                reason: "observation-unavailable" as const,
              }),
            },
          });
        }
        const observedTop = await new GhDeliveryHostPort(hostedGhRunner).readRequest(
          parsed.repository,
          terminal.changeRequest,
        );
        if (observedTop.status !== "observed") {
          return { status: "refused", reason: "top-request-unavailable" };
        }
        const predecessor = currentState.value.members.at(-2);
        const predecessorBranch = predecessor?.ref?.startsWith("refs/heads/") === true
          ? predecessor.ref.slice("refs/heads/".length)
          : null;
        const predecessorHead = predecessor?.coordinates?.head ?? null;
        const requestedPredecessorBase = predecessorBranch !== null
          && predecessorHead !== null
          && observedTop.request.baseRef === predecessorBranch;
        if (observedTop.request.baseRef !== baseBranch && !requestedPredecessorBase) {
          return { status: "refused", reason: "top-request-mismatch" };
        }
        const baseRevision = await resolveGitCandidateBaseRevision({ cwd, baseBranch, exec });
        const effective = await projectGitCandidateEffectiveTarget({
          cwd,
          name: currentPlan.workUnitId,
          baseBranch,
          baseRevision,
          record,
          exec,
          rawExec: createRawGitExec(cwd),
        });
        const localExec: GitExec = (commandName, args, options) => exec(commandName, args, {
          ...options,
          cwd,
          objectAccess: "local-only",
        });
        let candidate: DeliveryTerminalCandidateRebindAuthority;
        let candidateTargetRevision: string;
        if (parsed.reviewFixSelectedDeliverableId === undefined) {
          if (effective.state !== "current") {
            return { status: "refused", reason: "candidate-not-current" };
          }
          candidate = effective;
          candidateTargetRevision = effective.recognizedTarget.revision;
        } else {
          const pendingVerification = currentState.value.pendingReviewFixVerification;
          const matchingPendingVerification = pendingVerification !== null
            && pendingVerification.selectedDeliverableId === parsed.reviewFixSelectedDeliverableId;
          if ((parsed.reviewFixSelectedDeliverableId !== terminal.deliverableId
              && !matchingPendingVerification)
            || effective.state === "staged-change" || effective.state === "rerun-checkpoint") {
            return { status: "refused", reason: "candidate-not-current" };
          }
          const baseline = reduceCandidateDurableBaseline(record);
          const baselineCurrentness = projectCandidateCurrentness({ record, current: baseline.target });
          if (baselineCurrentness.status !== "current"
            || baselineCurrentness.convergenceVerification !== "satisfied") {
            return { status: "refused", reason: "candidate-baseline-unverified" };
          }
          const retainedHead = terminal.coordinates.head;
          const retainedTerminalTarget = await (async () => {
            if (baseline.target.revision === retainedHead) {
              return { revision: retainedHead, baselineRelation: "exact" as const };
            }
            if (await readAncestry(localExec, baseline.target.revision, retainedHead) !== "ancestor") return null;
            if (matchingPendingVerification) {
              return { revision: retainedHead, baselineRelation: "ancestor" as const };
            }
            const retainedTarget = await collectGitCandidateTarget({
              cwd,
              name: currentPlan.workUnitId,
              baseBranch,
              baseRevision,
              revision: retainedHead,
              exec,
            });
            return retainedTarget.subject.subjectDigest === baseline.target.subject.subjectDigest
              ? { revision: retainedHead, baselineRelation: "equivalent" as const }
              : null;
          })();
          if (retainedTerminalTarget === null) {
            return { status: "refused", reason: "candidate-not-current" };
          }
          const head = await observeDeliveryEligibilityRef(localExec, "HEAD");
          if (head === null || head.head === terminal.coordinates.head
            || await readAncestry(localExec, terminal.coordinates.head, head.head) !== "ancestor") {
            return { status: "refused", reason: "terminal-correction-not-append-only" };
          }
          const currentTarget = await collectGitCandidateTarget({
            cwd,
            name: currentPlan.workUnitId,
            baseBranch,
            baseRevision,
            revision: head.head,
            exec,
          });
          const projectedTarget = effective.state === "current"
            ? {
                revision: effective.recognizedTarget.revision,
                subjectDigest: effective.recognizedTarget.subject.subjectDigest,
              }
            : effective.state === "changed"
              ? {
                  revision: effective.currentTarget.revision,
                  subjectDigest: effective.currentTarget.subject.subjectDigest,
                }
              : effective.currentTarget;
          if (projectedTarget.revision !== currentTarget.revision
            || projectedTarget.subjectDigest !== currentTarget.subject.subjectDigest) {
            return { status: "refused", reason: "candidate-not-current" };
          }
          const memberDeliverableIds = matchingPendingVerification
            ? pendingVerification.memberDeliverableIds.includes(terminal.deliverableId)
              ? pendingVerification.memberDeliverableIds
              : [...pendingVerification.memberDeliverableIds, terminal.deliverableId]
            : [parsed.reviewFixSelectedDeliverableId];
          candidate = {
            schemaVersion: 1,
            mode: "candidate-effective-target",
            state: "review-fix",
            candidateId: baseline.candidateId,
            durableBaselineTarget: baseline.target,
            currentTarget,
            selectedDeliverableId: parsed.reviewFixSelectedDeliverableId,
            memberDeliverableIds,
            retainedTerminalTarget,
            convergenceVerification: "satisfied",
            convergenceScope: null,
          };
          candidateTargetRevision = currentTarget.revision;
        }
        const coordinates = await observeDeliveryEligibilityRef(localExec, candidateTargetRevision);
        if (coordinates === null || coordinates.head !== candidateTargetRevision) {
          return { status: "refused", reason: "candidate-coordinate-unavailable" };
        }
        const base = await resolveGitCandidateTargetBase({
          cwd,
          revision: candidateTargetRevision,
          baseBranch: requestedPredecessorBase ? predecessorBranch : baseBranch,
          baseRevision: requestedPredecessorBase ? predecessorHead : baseRevision,
          exec,
        });
        const projected = rebindDeliveryTerminalCoordinates({
          plan: currentPlan,
          state: currentState.value,
          candidate,
          publication: {
            settled: boundary.locus === "publication-pending"
              || boundary.locus === "hosted-review-pending"
              || boundary.locus === "delivery-status-required",
            candidateId: boundary.candidateId,
            candidateSubjectDigest: boundary.candidateSubjectDigest,
          },
          repository: parsed.repository,
          protectedTargetRef: `refs/heads/${baseBranch}`,
          request: observedTop.request,
          coordinates: { base, head: coordinates.head, tree: coordinates.tree },
          ...(internalContext?.settledRecordEffectHead == null
            ? {}
            : { settledRecordEffectHead: internalContext.settledRecordEffectHead }),
        });
        if (projected.status === "refused") return projected;
        const published = await stateStore.publish(
          parsed.planId,
          projected.state,
          currentState.revision,
        );
        if (published.status !== "ok") {
          return {
            status: "refused",
            reason: published.reason === "version-conflict"
              ? "state-version-conflict"
              : "state-persistence-failed",
          };
        }
        if (projected.nextAction === "verify-review-fix") {
          const continuation = projectDeliveryReviewFixVerificationContinuation({
            planId: parsed.planId,
            state: published.value,
          });
          if (continuation === null) {
            return { status: "refused", reason: "terminal-verification-continuation-missing" };
          }
          return { status: "rebound", state: published.value, ...continuation };
        }
        return {
          status: "rebound",
          state: published.value,
          nextAction: parsed.continuation === "read-position" ? "read-position" : projected.nextAction,
        };
      } catch (error) {
        if (error instanceof GitCommonStateAccessError) throw error;
        if (isGitProcessError(error)) {
          return {
            status: "refused",
            reason: "terminal-rebind-unavailable",
            cause: error.code,
            detail: `Terminal rebind against protected base \`${baseBranch}\` failed: ${error.message}`
              .slice(0, 1_000),
          };
        }
        return { status: "refused", reason: "terminal-rebind-unavailable" };
      }
    }
    const activeOperation = currentState.value.activeOperation;
    if (activeOperation.kind === "rewrite" && activeOperation.mode === "provider-adoption") {
      return {
        status: "retryable",
        transition: "preserved",
        action: "delivery-refresh-adopt",
        selector: {
          planId: parsed.planId,
          operationId: activeOperation.operationId,
          affectedDeliverableIds: activeOperation.affectedDeliverableIds,
          operationKind: "rewrite",
          mode: "provider-adoption",
        },
        recommendedActionText:
          "Rerun `arc delivery refresh adopt` with the exact provider-adoption reservation selector.",
      };
    }
    if (activeOperation.kind === "rewrite" && activeOperation.mode === "provider-refresh") {
      return {
        status: "retryable",
        transition: "preserved",
        action: "delivery-refresh-execute",
        selector: {
          planId: parsed.planId,
          operationId: activeOperation.operationId,
          affectedDeliverableIds: activeOperation.affectedDeliverableIds,
          operationKind: "rewrite",
          mode: "provider-refresh",
        },
        recommendedActionText:
          "Rerun `arc delivery refresh execute` with the exact provider-refresh reservation selector.",
      };
    }
    if (activeOperation.kind === "land" && activeOperation.mode === "native") {
      const host = new GhDeliveryHostPort(hostedGhRunner);
      const nativeRequest = {
        repository: parsed.repository,
        topChangeRequestId: activeOperation.effect.changeRequestId,
        topHeadSha: activeOperation.effect.headSha,
        mergeAction: "direct_merge" as const,
        mergeMethod: "merge" as const,
      };
      const nativeResult = await reconcileReservedNativeDeliveryMerge({
        planId: parsed.planId,
        current: currentState,
        request: nativeRequest,
        treeRoot: cwd,
        remote: parsed.remote,
      }, {
        host,
        stateStore,
        observeEffect: () => observeNativeDeliveryEffect(
          host,
          currentState.value,
          parsed.repository,
          activeOperation,
          exec,
          cwd,
          parsed.remote,
        ),
      });
      if (nativeResult.status !== "applied") return nativeResult;
      return settleAppliedNativeLanding(
        currentPlan,
        nativeResult.before,
        { revision: nativeResult.before.revision, value: nativeResult.projected },
        parsed.repository,
        activeOperation.effect.targetRef,
        parsed.remote,
      );
    }
    return reconcileDeliveryExecution({
      planId: parsed.planId,
      current: currentState,
      stateStore,
      observation: {
        observe: async () => {
          const operation = currentState.value.activeOperation;
          if (operation === null) {
            return { status: "refused" as const, reason: "observation-unavailable" as const };
          }
          if (operation.kind === "top-remedy") {
            if (parsed.repository !== operation.effect.repository) {
              return { status: "observed" as const, value: { outcome: "ambiguous" as const } };
            }
            const trigger = currentState.value.members.at(-2);
            if (!matchesDeliveryTopRemedyTrigger(operation.effect, trigger)) {
              return { status: "observed" as const, value: { outcome: "ambiguous" as const } };
            }
            const [request, triggerRef] = await Promise.all([
              new GhDeliveryHostPort(hostedGhRunner).readRequest(
                operation.effect.repository,
                {
                  providerId: operation.effect.providerId,
                  changeRequestId: operation.effect.changeRequestId,
                },
              ),
              observeDeliveryRemoteRef(exec, parsed.remote, operation.effect.triggerRef),
            ]);
            if (triggerRef.status === "refused") {
              return { status: "refused" as const, reason: "observation-unavailable" as const };
            }
            const triggerExact = triggerRef.status === "absent"
              || triggerRef.head === operation.effect.triggerHeadSha;
            return request.status === "observed" && triggerExact
              ? {
                  status: "observed" as const,
                  value: classifyDeliveryTopRemedyObservation(
                    operation.effect, request.request, operation.requested,
                  ),
                }
              : request.status === "observed"
                ? { status: "observed" as const, value: { outcome: "ambiguous" as const } }
                : { status: "refused" as const, reason: "observation-unavailable" as const };
          }
          if (operation.kind === "teardown") {
            const before = operation.before.members[0];
            if (before?.ref === null || before === undefined || before.changeRequest === null) {
              return { status: "refused" as const, reason: "observation-unavailable" as const };
            }
            const [ref, request] = await Promise.all([
              observeDeliveryRemoteRef(exec, parsed.remote, before.ref),
              new GhDeliveryHostPort(hostedGhRunner).readRequest(parsed.repository, before.changeRequest),
            ]);
            const targetRef = operation.before.target?.ref;
            if (ref.status === "refused" || request.status !== "observed" || targetRef === undefined) {
              return { status: "refused" as const, reason: "observation-unavailable" as const };
            }
            const acceptedBaseRefs = deliveryTeardownAcceptedBaseRefs({
              plan: currentPlan,
              state: currentState.value,
              deliverableId: before.deliverableId,
              protectedTargetRef: targetRef,
            });
            if (acceptedBaseRefs === null) {
              return { status: "refused" as const, reason: "observation-unavailable" as const };
            }
            const exactRequest = matchesDeliveryTeardownRequest({
                request: request.request,
                repository: parsed.repository,
                acceptedBaseRefs,
                member: before,
            });
            if (!exactRequest) {
              return { status: "observed" as const, value: { outcome: "ambiguous" as const } };
            }
            if (ref.status === "absent") {
              const highest = currentPlan.members.at(-2);
              if (highest?.deliverableId !== before.deliverableId) {
                return {
                  status: "observed" as const,
                  value: { outcome: "applied" as const, snapshot: operation.requested },
                };
              }
              const terminal = currentState.value.members.at(-1);
              if (terminal?.ref === null || terminal?.ref === undefined
                || terminal.changeRequest === null || terminal.coordinates === null) {
                return { status: "refused" as const, reason: "observation-unavailable" as const };
              }
              const observedTop = await new GhDeliveryHostPort(hostedGhRunner).readRequest(
                parsed.repository,
                terminal.changeRequest,
              );
              if (observedTop.status !== "observed"
                || observedTop.request.repository !== parsed.repository
                || observedTop.request.headRepository !== parsed.repository
                || observedTop.request.binding.providerId !== terminal.changeRequest.providerId
                || observedTop.request.binding.changeRequestId !== terminal.changeRequest.changeRequestId
                || observedTop.request.headRef !== terminal.ref.replace(/^refs\/heads\//u, "")
                || observedTop.request.headSha !== terminal.coordinates.head) {
                return { status: "refused" as const, reason: "observation-unavailable" as const };
              }
              const top = assessDeliveryTerminalTop({
                terminal: true,
                protectedBaseRef: targetRef,
                publicationHead: terminal.coordinates.head,
                request: observedTop.request,
              });
              if (top.status === "ready") {
                return {
                  status: "observed" as const,
                  value: { outcome: "applied" as const, snapshot: operation.requested },
                  continuation: { nextAction: "terminal-checkpoint" as const, top },
                };
              }
              if (top.status === "refused" && top.reason === "top-target-mismatch") {
                return {
                  status: "observed" as const,
                  value: { outcome: "applied" as const, snapshot: operation.requested },
                  continuation: { nextAction: top.remedy.nextAction, top },
                };
              }
              return { status: "refused" as const, reason: "observation-unavailable" as const };
            }
            return ref.head === before.coordinates?.head
              ? { status: "observed" as const, value: { outcome: "not-applied" as const } }
              : { status: "observed" as const, value: { outcome: "ambiguous" as const } };
          }
          if (operation.kind === "land") {
            const beforeMember = operation.before.members[0];
            if (beforeMember === undefined || beforeMember.changeRequest === null
              || beforeMember.coordinates === null) {
              return { status: "refused" as const, reason: "observation-unavailable" as const };
            }
            const host = new GhDeliveryHostPort(hostedGhRunner);
            const request = await host.readRequest(parsed.repository, beforeMember.changeRequest);
            if (request.status !== "observed"
              || request.request.repository !== operation.effect.repository
              || request.request.headRepository !== operation.effect.repository
              || request.request.binding.changeRequestId !== operation.effect.changeRequestId
              || beforeMember.ref === null
              || request.request.headRef !== beforeMember.ref.replace(/^refs\/heads\//u, "")
              || request.request.headSha !== operation.effect.headSha
              || request.request.baseRef !== operation.effect.baseRef) {
              return { status: "refused" as const, reason: "observation-unavailable" as const };
            }
            if (request.request.state === "open") {
              const before = await observePosition(currentPlan, currentState, parsed.repository, parsed.remote);
              return before.status === "observed"
                && typeof before.operationObservation === "object"
                && before.operationObservation !== null
                && (before.operationObservation as { outcome?: unknown }).outcome === "not-applied"
                ? { status: "observed" as const, value: { outcome: "not-applied" } }
                : { status: "refused" as const, reason: "observation-unavailable" as const };
            }
            if (request.request.state !== "merged") {
              return { status: "refused" as const, reason: "observation-unavailable" as const };
            }
            const beforeTarget = operation.before.target?.coordinates;
            const mergeCommitSha = request.request.mergeCommitSha;
            if (beforeTarget === null || beforeTarget === undefined || mergeCommitSha === null
              || mergeCommitSha === undefined) {
              return { status: "refused" as const, reason: "observation-unavailable" as const };
            }
            const landed = await observeGitDeliveryLandingResult({
              exec,
              cwd,
              remote: parsed.remote,
              resultHead: mergeCommitSha,
              strategy: operation.effect.strategy,
              beforeMember: beforeMember.coordinates,
            });
            if (landed === null) {
              return { status: "refused" as const, reason: "observation-unavailable" as const };
            }
            const proof = await proveGitDeliveryContribution({
              exec: createRawGitExec(cwd),
              ...projectDeliveryContributionEndpoints({
                before: { predecessor: beforeTarget, member: beforeMember.coordinates },
                after: landed,
              }),
            });
            if (proof.status !== "accepted") return proof;
            return {
              status: "observed" as const,
              value: {
                outcome: "applied",
                observation: {
                  kind: "land",
                  effect: operation.effect,
                  outcome: "applied",
                  snapshot: {
                    target: { ref: operation.effect.targetRef, coordinates: landed.member },
                    members: operation.before.members,
                  },
                },
              },
            };
          }
          const observationMode = operation.kind === "rewrite"
            && (operation.mode === "review-fix" || operation.mode === "selected-change")
            ? "review-fix"
            : "exact";
          const observed = await observePosition(
            currentPlan,
            currentState,
            parsed.repository,
            parsed.remote,
            observationMode,
          );
          if (observed.status !== "observed" || observed.operationObservation === null) {
            return { status: "refused" as const, reason: "observation-unavailable" as const };
          }
          return { status: "observed" as const, value: observed.operationObservation };
        },
      },
    });
  }
  if (command === "rematerialize") {
    const parsed = RematerializeSchema.parse(request);
    let latestSnapshot: DeliveryEligibilitySnapshot | null = null;
    let latestCandidates: readonly z.infer<typeof MutationCandidateSchema>[] | null = null;
    const gitCommonDir = await resolveGitCommonDir(exec, cwd);
    const rematerialized = await executeFreshDeliverySuffixRematerialization({
      selectedDeliverableIds: parsed.selectedDeliverableIds,
      ...(parsed.supersedePendingReviewFixVerification === undefined
        ? {}
        : { supersedePendingReviewFixVerification: parsed.supersedePendingReviewFixVerification }),
    }, {
      reobserve: async () => {
        const [planRead, stateRead] = await Promise.all([
          planStore.readCurrent(parsed.planId), stateStore.read(parsed.planId),
        ]);
        if (planRead.status !== "ok" || planRead.value === null
          || stateRead.status !== "ok" || stateRead.value === null
          || stateRead.value.value.activeOperation !== null) return { status: "refused" as const };
        const position = await observePosition(
          planRead.value,
          stateRead.value,
          parsed.repository,
          parsed.remote,
          "review-fix",
        );
        if (position.status !== "observed") return { status: "refused" as const };
        const landedCount = position.facts.landedDeliverableIds.length;
        const locatorResult = deriveDeliveryResidueLocators(planRead.value, gitCommonDir);
        if (locatorResult.status !== "derived") return { status: "refused" as const };
        const candidates = locatorResult.locators
          .slice(landedCount)
          .map((locator) => ({
            deliverableId: locator.deliverableId,
            ref: locator.candidateRef,
            checkoutPath: locator.gatePath,
          }));
        if (candidates.length !== planRead.value.members.length - landedCount) {
          return { status: "refused" as const };
        }
        latestCandidates = candidates;
        const eligible = await executeWithFreshDeliveryEligibility({
          planId: parsed.planId,
          protectedBaseRef: parsed.protectedBaseRef,
          topRef: parsed.topRef,
          memberOffset: landedCount,
          candidates,
        }, {
          ...eligibilityDeps,
          resolveOriginatingTopRef,
          resolveLifecyclePaths: async (plan) => {
            const active = await resolveActiveWu({ cwd });
            if (active.status !== "resolved" || active.name !== plan.workUnitId) return null;
            try {
              const paths = await new CurrentDeliveryLifecycleContributionPathSource({
                readDirectory: (path) => readdir(resolve(cwd, path)),
                readArtifactsAtRef: (ref, workUnitId) => readGitDeliveryLifecycleArtifactsAtRef(
                  exec,
                  ref,
                  workUnitId,
                ),
              }).resolve({
                workUnitId: plan.workUnitId,
                activeMetaPath: validateManagedPath(active.path),
                protectedBaseRef: parsed.protectedBaseRef,
                topRef: parsed.topRef,
              });
              return paths.paths;
            } catch {
              return null;
            }
          },
          prepareMutation: ({ plan, snapshot }) => Promise.resolve({
            status: "prepared" as const,
            value: { plan, snapshot },
          }),
          mutate: ({ plan, snapshot }) => Promise.resolve({ status: "observed" as const, plan, snapshot }),
        });
        if (eligible.status !== "observed") return eligible;
        const current = await stateStore.read(parsed.planId);
        if (current.status !== "ok" || current.value === null
          || current.value.revision !== stateRead.value.revision) return { status: "refused" as const };
        latestSnapshot = eligible.snapshot;
        return {
          status: "observed" as const,
          plan: eligible.plan,
          current: current.value,
          facts: position.facts,
          snapshot: eligible.snapshot,
        };
      },
      reobserveCandidate: async (rewrite) => {
        const candidate = latestCandidates?.find((entry) => entry.deliverableId === rewrite.deliverableId);
        const expected = rewrite.requested.members[0]?.coordinates;
        const observed = candidate === undefined ? null : await observeDeliveryEligibilityRef(exec, candidate.ref);
        return expected !== null && expected !== undefined && observed !== null
          && observed.head === expected.head && observed.tree === expected.tree;
      },
      resolveCoordinate: (head) => observeDeliveryEligibilityRef(exec, head),
      proveCarried: (endpoints) => proveGitDeliveryContribution({
        exec: createRawGitExec(cwd),
        ...projectDeliveryContributionEndpoints(endpoints),
      }),
      apply: async ({
        plan,
        current,
        rewrite,
        snapshot,
        supersedePendingReviewFixVerification,
      }) => {
        const member = current.value.members.find((entry) => entry.deliverableId === rewrite.deliverableId);
        const requested = rewrite.requested.members[0];
        if (member?.ref === null || member?.coordinates === null || member === undefined
          || requested?.coordinates === null || requested === undefined) {
          return { status: "refused" as const };
        }
        const memberRef = member.ref;
        const memberCoordinates = member.coordinates;
        const requestedCoordinates = requested.coordinates;
        const predecessor = await observeDeliveryEligibilityRef(exec, memberCoordinates.base);
        const snapshotIndex = snapshot.members.findIndex((entry) => entry.deliverableId === rewrite.deliverableId);
        const afterPredecessor = snapshotIndex === 0 ? snapshot.chainBase : snapshot.members[snapshotIndex - 1];
        if (predecessor === null || predecessor.head !== memberCoordinates.base || afterPredecessor === undefined) {
          return { status: "refused" as const };
        }
        const result = await executeDeliverySuffixRewrite({
          plan,
          current,
          deliverableId: rewrite.deliverableId,
          requested: rewrite.requested,
          contributionMode: rewrite.selectedChange ? "selected-change" : "prove-equivalent",
          operationMode: rewrite.selectedChange ? "selected-change" : "review-fix",
          supersedePendingReviewFixVerification,
          revalidateLifecycle: async () => {
            const lifecycleInput = deriveDeliveryMemberLifecycleRevalidation({
              snapshot,
              deliverableId: rewrite.deliverableId,
            });
            if (lifecycleInput === null) return { status: "refused" as const };
            const checked = await revalidateDeliveryLifecycleContribution({ exec, ...lifecycleInput });
            return checked;
          },
          rewriteRef: (effect) => rewriteDeliveryMemberRef({ exec, remote: parsed.remote, ...effect }),
          observeResult: async () => {
            const observed = await observeDeliveryRemoteRef(exec, parsed.remote, memberRef);
            return observed.status === "observed" && observed.head === requestedCoordinates.head
              ? rewrite.requested
              : { target: null, members: [] };
          },
          proveContribution: () => proveGitDeliveryContribution({
            exec: createRawGitExec(cwd),
            ...projectDeliveryContributionEndpoints({
              before: { predecessor, member: memberCoordinates },
              after: { predecessor: afterPredecessor, member: requestedCoordinates },
            }),
          }),
          stateStore,
        });
        if (result.status === "applied") return result;
        if (result.reason === "pending-review-fix-verification") {
          return { status: "refused" as const, reason: result.reason };
        }
        return { status: "refused" as const };
      },
    });
    if (rematerialized.status !== "rematerialized") return rematerialized;
    const snapshot = latestSnapshot as DeliveryEligibilitySnapshot | null;
    if (snapshot === null) return { status: "refused", reason: "observation-unavailable" };
    return completeDeliverySuffixMutationTail({
      rematerialized,
      commonBase: snapshot.chainBase,
      topRef: parsed.topRef,
      top: snapshot.top,
      finalCandidate: snapshot.members.at(-1),
      lifecyclePaths: snapshot.lifecyclePaths,
    }, {
      readAncestry: (ancestor, descendant) => readAncestry(localOnlyExec, ancestor, descendant),
      adoptTop: (input) => adoptGitDeliveryChain({ exec: createRawGitExec(cwd), ...input }),
      publishTop: (input) => publishDeliveryTopRef({ exec, remote: parsed.remote, ...input }),
      publishState: (planId, value, expectedRevision) => stateStore.publish(planId, value, expectedRevision),
    });
  }
  if (command === "rewrite") {
    const parsed = RewriteSchema.parse(request);
    const [planRead, stateRead] = await Promise.all([
      planStore.readCurrent(parsed.planId), stateStore.read(parsed.planId),
    ]);
    if (planRead.status !== "ok" || planRead.value === null || stateRead.status !== "ok" || stateRead.value === null) {
      return { status: "refused", reason: "delivery-unavailable" };
    }
    const plan = planRead.value;
    const current = stateRead.value.value;
    if (validateDeliveryStateAgainstPlan(current, plan).status !== "valid") {
      return { status: "refused", reason: "position-mismatch" };
    }
    const currentMember = current.members.find(({ deliverableId }) => deliverableId === parsed.deliverableId);
    const currentTarget = current.target;
    const currentCoordinates = currentMember?.coordinates;
    const currentRef = currentMember?.ref;
    const requestedMember = parsed.requested.members[0];
    if (currentTarget === null || currentTarget.coordinates === null
      || currentRef === null || currentRef === undefined || currentCoordinates === null
      || currentCoordinates === undefined || currentMember === undefined
      || requestedMember?.coordinates === null || requestedMember === undefined
      || requestedMember.coordinates.base !== currentCoordinates.base) {
      return { status: "refused", reason: "position-mismatch" };
    }
    const requestedCoordinates = requestedMember.coordinates;
    const topRef = await resolveOriginatingTopRef(plan);
    if (topRef === null) return { status: "refused", reason: "delivery-unavailable" };
    const lifecyclePaths = await resolveCurrentLifecyclePaths(plan, currentTarget.ref, topRef);
    if (lifecyclePaths === null) return { status: "refused", reason: "evidence-unavailable" };
    const [predecessor, requestedCandidate] = await Promise.all([
      observeDeliveryEligibilityRef(exec, currentCoordinates.base),
      observeDeliveryEligibilityRef(exec, requestedCoordinates.head),
    ]);
    if (predecessor === null || predecessor.head !== currentCoordinates.base
      || requestedCandidate === null || requestedCandidate.head !== requestedCoordinates.head
      || requestedCandidate.tree !== requestedCoordinates.tree) {
      return { status: "refused", reason: "contribution-endpoints-unverified" };
    }
    const rawExec = createRawGitExec(cwd);
    return executeDeliverySuffixRewrite({
      plan,
      current: stateRead.value,
      deliverableId: parsed.deliverableId,
      requested: parsed.requested,
      revalidateLifecycle: async () => {
        const lifecycleInput = deriveDeliveryRewriteLifecycleRevalidation({
          protectedBaseRef: currentTarget.ref,
          requestedPredecessorHead: currentCoordinates.base,
          candidateRef: requestedCoordinates.head,
          lifecyclePaths,
          workUnitId: plan.workUnitId,
        });
        const checked = await revalidateDeliveryLifecycleContribution({ exec, ...lifecycleInput });
        return checked;
      },
      rewriteRef: (input) => rewriteDeliveryMemberRef({ exec, remote: parsed.remote, ...input }),
      observeResult: async () => {
        const observed = await observeDeliveryRemoteRef(exec, parsed.remote, currentRef);
        return observed.status === "observed" && observed.head === requestedCoordinates.head
          ? parsed.requested
          : { target: null, members: [] };
      },
      proveContribution: () => proveGitDeliveryContribution({
        exec: rawExec,
        before: { predecessor, member: currentCoordinates },
        after: { predecessor, member: requestedCandidate },
      }),
      stateStore,
    });
  }
  requireTerminalMutationCommand(command);
  if (command === "top-remedy") {
    const parsed = TopRemedySchema.parse(request);
    const [planRead, stateRead] = await Promise.all([
      planStore.readCurrent(parsed.planId), stateStore.read(parsed.planId),
    ]);
    if (planRead.status !== "ok" || planRead.value === null
      || stateRead.status !== "ok" || stateRead.value === null) {
      return { status: "refused", reason: "delivery-unavailable" };
    }
    const observed = await observePosition(
      planRead.value,
      stateRead.value,
      parsed.repository,
      parsed.remote,
      "terminal-remedy",
    );
    if (observed.status !== "observed") return { status: "refused", reason: "position-unavailable" };
    return applyDeliveryTopRemedy({
      plan: planRead.value,
      current: stateRead.value,
      facts: observed.facts,
      action: parsed.action,
      repository: parsed.repository,
      protectedBaseRef: parsed.protectedBaseRef,
      host: new GhDeliveryHostPort(hostedGhRunner),
      observeTriggerRef: (ref) => observeDeliveryRemoteRef(exec, parsed.remote, ref),
      stateStore,
    });
  }
  const parsed = TeardownSchema.parse(request);
  const [planRead, stateRead] = await Promise.all([
    planStore.readCurrent(parsed.planId), stateStore.read(parsed.planId),
  ]);
  if (planRead.status !== "ok" || planRead.value === null || stateRead.status !== "ok" || stateRead.value === null) {
    return { status: "refused", reason: "delivery-unavailable" };
  }
  const observed = await observePosition(planRead.value, stateRead.value, parsed.repository, parsed.remote);
  if (observed.status !== "observed") return { status: "refused", reason: "position-unavailable" };
  return teardownLandedDeliveryMember({
    plan: planRead.value,
    current: stateRead.value,
    facts: observed.facts,
    deliverableId: parsed.deliverableId,
    repository: parsed.repository,
    protectedTargetRef: parsed.protectedTargetRef,
    host: new GhDeliveryHostPort(hostedGhRunner),
    deleteLocalRef: (input) => deleteDeliveryLocalRef({ exec, ...input }),
    deleteRemoteRef: (input) => deleteDeliveryRemoteRef({ exec, remote: parsed.remote, ...input }),
    stateStore,
  });
}
