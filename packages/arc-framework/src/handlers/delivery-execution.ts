/** Strict CLI composition for delivery execution services. */

import { readdir, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

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
import {
  closeDeliveryEligibility,
  executeWithFreshDeliveryEligibility,
  prepareDeliveryEligibility,
  type DeliveryEligibilitySnapshot,
} from "../lib/delivery/eligibility.js";
import {
  compareGitNormalizedDeliveryTrees,
  inspectDeliveryCandidateCheckout,
  observeDeliveryEligibilityRef,
} from "../lib/delivery/git-eligibility.js";
import {
  readGitDeliveryLifecycleArtifactsAtRef,
  revalidateDeliveryLifecycleContribution,
} from "../lib/delivery/git-lifecycle-contribution.js";
import { CurrentDeliveryLifecycleContributionPathSource } from "../lib/delivery/lifecycle-contribution.js";
import { observeRepositoryDeliveryPosition } from "../lib/session-init/delivery-position-facts.js";
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
  observeDeliveryRefreshCandidateRefs,
  observeDeliveryRemoteRef,
  publishDeliveryMemberRef,
  publishDeliveryTopRef,
  rewriteDeliveryLocalRef,
  rewriteDeliveryMemberRef,
} from "../lib/delivery/git-materialization.js";
import { closeoutCompletedDelivery } from "../lib/delivery/closeout.js";
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
  selectPendingDeliveryReviewFixAuthority,
} from
  "../lib/delivery/review-fix-continuation.js";
import {
  classifyDeliveryReviewFixReviewStatusStop,
  driveDeliveryReviewFixContinuation,
  isDeliveryReviewFixDispatchStep,
  type DeliveryReviewFixDriveDispatchAction,
  type DeliveryReviewFixDriveProgress,
  type DeliveryReviewFixDriveStep,
} from "../lib/delivery/review-fix-driver.js";
import { settleDeliveryReviewFixRecordEffects } from
  "../lib/delivery/review-fix-record-effects.js";
import { createDeliveryReviewFixReleaseEffectPorts } from
  "./delivery-review-fix-release-effects.js";
import {
  inspectDeliveryPlanLocus,
  type DeliveryEntryInspectionResult,
} from "../lib/delivery/entry-inspection.js";
import { validateDeliveryStateAgainstPlan } from "../lib/delivery/state.js";
import {
  completeDeliverySuffixMutationTail,
  executeFreshDeliverySuffixRematerialization,
} from "../lib/delivery/suffix-rematerialization.js";
import {
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
  composeDeliveryNativeStackLinkDecision,
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
import { canonicalize, SlugSchema, validateManagedPath } from "../lib/kernel/index.js";
import { resolveActiveWu } from "../lib/release/wu-resolution.js";
import { resolveTaskListCursor } from "../lib/task-list/cursor.js";
import { resolveTaskListPath } from "../commands/active/status.js";
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
  projectCandidateCurrentness,
  reduceCandidateDurableBaseline,
} from "../lib/work-unit/candidate-attestation.js";
import {
  readSubmissionBoundary,
  readSubmissionBoundaryVersioned,
  writeSubmissionBoundary,
} from "../lib/work-unit/submission-boundary-store.js";
import { createGitExec, createRawGitExec } from "../lib/io-context.js";
import { resolveGitCommonDir } from "../lib/user-sync/repo-shared-paths.js";
import type { GitExec } from "../lib/git/exec.js";
import { GhDeliveryHostPort } from "../scripts/delivery/hosts/github.js";
import { GhDeliveryProviderRefreshPort } from "../scripts/delivery/hosts/github-refresh.js";
import { deliveryProviderGhRunner } from "../scripts/delivery/provider-process.js";
import { releaseMergeLock } from "../scripts/review-gate/merge-lock.js";
import { evaluateReviewReadiness } from "../scripts/review-gate/readiness.js";
import { MergeMethodSchema, resolveMergeMethod } from "../scripts/review-gate/merge-method.js";
import { assessDeliveryLandingReviewReadiness } from
  "../scripts/review-gate/delivery-landing-readiness.js";
import { createGhMergeMethodPolicyPort } from "../scripts/review-gate/hosts/github/merge-method.js";
import { RepositoryDeliveryMemberLookup } from "../scripts/review-gate/hosts/local/delivery-member-lookup.js";
import { LocalApprovedDispositionRecordStore } from
  "../scripts/review-gate/hosts/local/disposition-record-store.js";
import { LocalReviewOperationStateStore } from
  "../scripts/review-gate/hosts/local/operation-state-store.js";
import { parseReviewSourceReference } from
  "../scripts/review-gate/core/review-source-reference.js";
import { projectGitReviewContributionApplicability } from
  "../scripts/review-gate/policy/git-review-contribution-applicability.js";
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
import { ContinueHostedReviewActionSchema, ContinuePublicationActionSchema } from
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
type DeliveryCorrectionRoutingEntry = Extract<
  DeliveryEntryInspectionResult,
  { readonly status: "correction-routing-required" }
>;
const EligibilityMemberSchema = CandidateSchema.extend(CoordinateSchema.shape);
const EligibilitySnapshotSchema = z.strictObject({
  planId: DeliveryPlanIdSchema,
  workUnitId: z.string().min(1),
  planRevision: z.number().int().positive(),
  planDigest: DeliveryCanonicalDigestSchema,
  protectedBase: CoordinateSchema.extend({ ref: RefSchema }),
  top: CoordinateSchema.extend({ ref: RefSchema }),
  members: z.array(EligibilityMemberSchema).min(1),
  lifecyclePaths: z.array(z.string().min(1)),
});

const PrepareSchema = z.strictObject({
  plan: DeliveryPlanV1Schema,
  protectedBaseRef: RefSchema,
  topRef: RefSchema,
  candidates: z.array(CandidateSchema).min(1),
  lifecyclePaths: z.array(z.string().min(1)),
});
const CloseSchema = z.strictObject({ snapshot: EligibilitySnapshotSchema });
const MutationCandidateSchema = CandidateSchema.extend({ checkoutPath: z.string().min(1) });
const MaterializeSchema = z.strictObject({
  planId: DeliveryPlanIdSchema,
  protectedBaseRef: RefSchema,
  topRef: RefSchema,
  candidates: z.array(MutationCandidateSchema).min(1),
  remote: z.string().min(1).default("origin"),
});
const PublishSchema = MaterializeSchema.extend({
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
const ContributionCoordinateSchema = z.strictObject({ head: GitObjectIdSchema, tree: GitObjectIdSchema });
const ContributionEndpointsSchema = z.strictObject({
  before: z.strictObject({ predecessor: ContributionCoordinateSchema, member: ContributionCoordinateSchema }),
  after: z.strictObject({ predecessor: ContributionCoordinateSchema, member: ContributionCoordinateSchema }),
});
const RewriteSchema = z.strictObject({
  planId: DeliveryPlanIdSchema,
  deliverableId: DeliveryCanonicalDigestSchema,
  requested: DeliveryOperationSnapshotV1Schema,
  candidateRef: RefSchema,
  protectedBaseRef: RefSchema,
  lifecyclePaths: z.array(z.string().min(1)),
  remote: z.string().min(1).default("origin"),
  contributionMode: z.enum(["prove-equivalent", "selected-change"]),
  contribution: ContributionEndpointsSchema,
});
const RematerializeSchema = z.strictObject({
  planId: DeliveryPlanIdSchema,
  protectedBaseRef: RefSchema,
  topRef: RefSchema,
  selectedDeliverableIds: z.array(DeliveryCanonicalDigestSchema).min(1),
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
const NativeUnlinkSchema = NativeObserveSchema.extend({ planId: DeliveryPlanIdSchema });
const NativeLinkSchema = NativeObserveSchema.extend({
  planId: DeliveryPlanIdSchema,
  protectedBaseRef: RefSchema,
  members: z.array(NativeMemberSchema).min(1),
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
  baseRef: z.string().min(1),
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
const ReviewFixContinueSchema = z.strictObject({
  repository: z.string().min(1),
  remote: z.string().min(1).default("origin"),
  verification: ReviewFixAcknowledgeSchema.shape.verification.optional(),
});

const RequestSchemas = {
  "authoring-locate": AuthoringLocateSchema,
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
    kind: z.literal("hosted-review"),
    action: ContinueHostedReviewActionSchema,
  }),
  z.strictObject({
    kind: z.literal("publication"),
    action: ContinuePublicationActionSchema,
  }),
]);
const ReviewFixDriveActionKindSchema = z.enum([
  "delivery-review-fix-publish",
  "delivery-rematerialize",
  "delivery-refresh-execute",
  "delivery-refresh-adopt",
  "delivery-reconcile",
  "delivery-review-fix-acknowledge",
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
    acknowledgementInput: ReviewFixAcknowledgementInputSchema,
    resumeAction: ReviewFixContinuationResumeActionSchema,
    recommendedActionText: z.string().min(1),
    ...ReviewFixDriveEffectLogField,
  }),
  z.strictObject({
    status: z.literal("authoring-required"),
    route: z.enum(["provider-refresh", "rematerialize", "terminal-authoring"]),
    selectedDeliverableId: DeliveryCanonicalDigestSchema,
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
    resumeAction: ReviewFixContinuationResumeActionSchema,
    recommendedActionText: z.string().min(1),
    ...ReviewFixDriveEffectLogField,
  }),
  z.strictObject({
    status: z.literal("authority-required"),
    authority: z.enum(["candidate-renewal", "hosted-review", "publication"]),
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
    actionKind: ReviewFixDriveProgressActionKindSchema,
    progress: ReviewFixDriveProgressSchema,
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

const ResultSchema = z.union([
  ReviewFixContinuationResultSchema,
  DeliveryRecoveryResultV1Schema,
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
    nextAction: z.literal("continue-hosted-review"),
    boundaryCarry: z.strictObject({
      path: z.string().min(1),
      candidateId: DeliveryCanonicalDigestSchema,
      stateRevision: z.number().int().positive(),
    }),
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
    nextAction: z.literal("terminal-checkpoint"),
    top: DeliveryTopReadySchema,
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
  } catch {
    emit(deps, command, { status: "refused", reason: "invalid-command-input" });
    return;
  }
  const request = RequestSchemas[command].safeParse(decoded);
  if (!request.success) {
    emit(deps, command, { status: "refused", reason: "invalid-command-input" });
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
        : { status: "refused", reason: "execution-unavailable" },
    );
    return;
  }
  const parsed = ResultSchema.safeParse(result);
  emit(deps, command, parsed.success ? parsed.data : invalidServiceResult(result));
}

function emit(deps: DeliveryExecutionHandlerDependencies, command: DeliveryExecutionCommand, result: DeliveryExecutionResult): void {
  deps.write(`${JSON.stringify({ schemaVersion: 1, command: executionPath(command), ...result })}\n`);
  if (result.status === "refused" || result.status === "blocked") deps.setExitCode(1);
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
  const merged: string[] = [];
  const landedResults: Array<NonNullable<Awaited<ReturnType<typeof observeGitDeliveryLandingResult>>>> = [];
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
      const landedResult = await observeGitDeliveryLandingResult({
        exec,
        cwd,
        remote,
        resultHead: observed.request.mergeCommitSha,
        strategy: "merge",
        beforeMember: entry.coordinates,
      });
      if (landedResult === null) return { outcome: "ambiguous" };
      const previous = landedResults.at(-1);
      if (previous !== undefined && landedResult.predecessor.head !== previous.member.head) {
        return { outcome: "ambiguous" };
      }
      merged.push(entry.deliverableId);
      landedResults.push(landedResult);
    }
  }
  if (merged.length === 0) return { outcome: "none-landed" };
  if (merged.length !== operation.before.members.length) {
    return { outcome: "partial-landed", affectedDeliverableIds: merged };
  }
  const targetBefore = operation.before.target?.coordinates;
  const firstResult = landedResults[0];
  const finalResult = landedResults.at(-1);
  if (targetBefore === null || targetBefore === undefined || firstResult === undefined || finalResult === undefined) {
    return { outcome: "ambiguous" };
  }
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
): Promise<unknown> {
  let nativeLinkRequest: z.infer<typeof NativeLinkSchema> | null = null;
  if (command === "native-link") {
    nativeLinkRequest = NativeLinkSchema.parse(request);
    if (nativeLinkRequest.optIn === undefined) return composeDeliveryNativeStackLinkDecision();
  }
  const cwd = requireArcProjectRoot();
  if (cwd === null) return { status: "refused", reason: "arc-project-root-unresolved" };
  const exec = createGitExec(interaction?.subprocess);
  const publisher = new RepositoryGitCommonStatePublisher(exec, cwd);
  const planStore = new RepositoryDeliveryPlanStore(publisher, DeliveryPlanV1Codec);
  const stateStore = new RepositoryDeliveryStateStore(publisher);
  if (command === "review-fix-continue") {
    const parsed = ReviewFixContinueSchema.parse(request);
    let projectionRequest: z.infer<typeof ReviewFixContinueSchema> = parsed;
    const project = async () => {
      let approvedDispositionSet: {
        readonly dispositionSetId: string;
        readonly authorizedFindingIds: readonly string[];
        readonly authorizedFindingLoci: readonly string[];
      } | undefined;
      let authorityPreservation: {
        readonly reviewedHead: string;
        readonly currentHead: string;
        readonly proof: "tree-equality" | "mechanical-reapply";
        readonly projectionDigest: string;
        readonly residualDigest: string;
      } | undefined;
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
        const [stateRead, active, currentPlanRead] = await Promise.all([
          stateStore.read(correctionEntry.planId),
          resolveActiveWu({ cwd }),
          planStore.readCurrent(correctionEntry.planId),
        ]);
        let authoring;
        if (stateRead.status === "ok" && stateRead.value !== null
          && active.status === "resolved" && active.branch !== null
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
              : `refs/heads/${active.branch}`;
            const checkoutPath = candidateRoute ? candidateLocator?.gatePath ?? "" : cwd;
            if (ref !== "" && checkoutPath !== "") {
              const [checkout, observedRef] = await Promise.all([
                inspectDeliveryCandidateCheckout(exec, checkoutPath),
                observeDeliveryEligibilityRef(exec, ref),
              ]);
              const observed = checkout;
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
                .filter((path): path is string => path !== null);
              const ancestry = observed === null
                ? []
                : await Promise.all(requiredAncestorHeads.map(async (ancestor: string) => ({
                    ancestor,
                    status: await readAncestry(exec, ancestor, observed.head),
                  })));
              authoring = classifyDeliveryReviewFixAuthoringReadiness({
                locus: { kind: candidateRoute ? "candidate" : "top", ref, checkoutPath },
                publishedHead: candidateRoute ? selected.coordinates.head : terminalHead,
                observed,
                refCoordinates: observedRef,
                ...(authoredPaths === undefined ? {} : { authoredPaths }),
                ...(requiredFindingPaths === undefined ? {} : { requiredFindingPaths }),
                requiredAncestorHeads,
                ancestry,
              });
            }
          }
        }
        return {
          status: "prepared" as const,
          authoring,
          result: projectDeliveryReviewFixContinuation({
            request: projectionRequest,
            entry: correctionEntry,
            route: planned.data,
            ...(stateRead.status === "ok" && stateRead.value !== null ? { state: stateRead.value } : {}),
            ...(active.status === "resolved" && active.branch !== null ? { activeBranch: active.branch } : {}),
            ...(authoring === undefined ? {} : { authoring }),
            ...(approvedDispositionSet === undefined ? {} : { approvedDispositionSet }),
          }),
        };
      };
      let entry = await inspectActiveRepositoryDeliveryEntry({ entryMode: "execution" }, interaction);
    if (entry.status === "not-applicable") {
      const active = await resolveActiveWu({ cwd });
      if (active.status !== "resolved") {
        return { status: "refused", reason: "active-work-unit-unavailable" };
      }
      const meta = parseMetaFile(await readFile(resolve(cwd, active.path), "utf8"));
      const taskListPath = meta.taskList === null || meta.taskList === "[none]"
        ? null
        : resolveTaskListPath(active.path, meta.taskList);
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
        workUnitId: active.name,
        records: dispositionRecords,
      });
      if (selection.status === "refused") return selection;
      if (selection.status === "selected") {
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
          || planRead.value.workUnitId !== active.name
          || stateRead.value.value.workUnitId !== active.name
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
          let operationReference;
          try {
            operationReference = parseReviewSourceReference(selection.attemptRef, "hosted");
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
            || attempt.hosted.vehicle.workUnitId !== active.name) {
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
          const integratingEntry = await inspectActiveRepositoryDeliveryEntry(
            { entryMode: "integrating" },
            interaction,
          );
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
            : integratingEntry.status === "continue-hosted-review";
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
            recommendedActionText:
              "Plan the approved correction for the delivery member bound by the pending review response.",
          };
        }
      } else {
        entry = await inspectActiveRepositoryDeliveryEntry({ entryMode: "integrating" }, interaction);
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
          recommendedActionText:
            "Supersede the pending verification with the newer exact correction authoring.",
        };
        const prepared = await prepareCorrection(correctionEntry);
        if (prepared.status === "prepared" && prepared.authoring?.status === "ready") {
          entry = correctionEntry;
          preparedCorrection = prepared;
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
        return projectDeliveryReviewFixContinuation({ request: projectionRequest, entry, state: stateRead.value });
      }

      if (entry.status === "correction-routing-required") {
        const prepared = preparedCorrection ?? await prepareCorrection(entry);
        return prepared.result;
      }

      const continuation = projectDeliveryReviewFixContinuation({ request: projectionRequest, entry });
      if (continuation.status !== "authority-required" || continuation.authority !== "hosted-review") {
        return continuation;
      }
      try {
        const reviewStatus = await resolveReviewStatusForWorkUnit({
          cwd,
          exec,
          workUnitId: continuation.action.action.workUnitId,
        });
        return {
          status: "review-status-required" as const,
          stopKind: classifyDeliveryReviewFixReviewStatusStop(reviewStatus.nextAction),
          nextAction: reviewStatus.nextAction,
          reviewStatus,
          ...(authorityPreservation === undefined ? {} : { authorityPreservation }),
          recommendedActionText:
            "Continue from the exact composed hosted-review status without re-deriving a member or pass.",
        };
      } catch {
        return {
          status: "refused" as const,
          reason: "review-status-unavailable",
          recommendedActionText:
            "Restore the self-contained hosted delivery-review continuation before retrying the correction.",
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
      const [stateRead, active] = await Promise.all([
        planId === null ? Promise.resolve(null) : stateStore.read(planId),
        resolveActiveWu({ cwd }),
      ]);
      const boundary = active.status === "resolved"
        ? await readSubmissionBoundaryVersioned(cwd, active.name)
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
    const commands: Readonly<Record<
      DeliveryReviewFixDriveDispatchAction["kind"],
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
      execute: async (action) => {
        const result = await executeDeliveryCommand(commands[action.kind], action.input, interaction);
        if (typeof result !== "object" || result === null || !("status" in result)
          || typeof result.status !== "string") {
          return { status: "invalid-service-result" };
        }
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
      carryBoundary: async ({ planId, stateRevision }) => {
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
        const candidateBaseline = reduceCandidateDurableBaseline(candidate.record);
        const carried = carryDeliveryReviewFixPublicBoundary({
          plan: planRead.value,
          state: stateRead.value,
          boundary: boundary.boundary,
          candidateId: candidate.record.attestation.candidateId,
          sourceCandidateSubjectDigest: boundary.boundary.candidateSubjectDigest ?? "",
          candidateSubjectDigest: candidateBaseline.target.subject.subjectDigest,
        });
        if (carried.status === "refused") return carried;
        const path = await writeSubmissionBoundary(cwd, carried.boundary, boundary.version);
        await exec("git", ["add", "--", path], { cwd });
        return {
          status: "carried" as const,
          path,
          candidateId: carried.candidateId,
          stateRevision: carried.stateRevision,
        };
      },
      settleRecordEffects: async () => {
        const active = await resolveActiveWu({ cwd });
        if (active.status !== "resolved") {
          return { status: "refused" as const, reason: "record-effect-work-unit-unavailable" };
        }
        const identity = await resolveUserIdentity(exec);
        return settleDeliveryReviewFixRecordEffects({
          workUnitId: active.name,
          context: `meta-${active.name}.md (integration)`,
          ports: createDeliveryReviewFixReleaseEffectPorts({
            cwd,
            remote: parsed.remote,
            identity,
            exec,
            ...(interaction === undefined ? {} : { interaction }),
          }),
        });
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
      const matchingResponseRecords = dispositionRecords.filter((record) => (
        record.deliveryMember?.planId === parsed.planId
        && record.deliveryMember.deliverableId === parsed.selectedDeliverableId
        && record.deliveryMember.workUnitId === workUnitId
        && record.fixAuthorization !== null
      ));
      if (matchingResponseRecords.length > 1) {
        return { status: "refused", reason: "review-fix-response-ambiguous" };
      }
      const responseRecord = matchingResponseRecords[0];
      if (responseRecord !== undefined) {
        if (responseRecord.source.kind !== "hosted") {
          return { status: "refused", reason: "review-fix-response-invalid" };
        }
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
          || canonicalize(attempt.hosted.vehicle) !== canonicalize(responseRecord.deliveryMember)
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
        const advanced = advanceDeliveryReviewFixResponse({
          record: responseRecord,
          oldTarget: attempt.hosted.reviewTarget,
          hostedTarget: attempt.hosted.target,
          currentHead: selectedMember.coordinates.head,
          currentTree: selectedMember.coordinates.tree,
          applicability: parsed.verification.applicability,
          verificationEvidenceRefs: parsed.verification.verificationEvidenceRefs,
          verifiedAt,
        });
        if (advanced.status === "refused") return advanced;
        await dispositionStore.appendDispositionRecord(advanced.record);
      }
      const settings = (await readConfigSettings(cwd)).settings;
      const [candidate, currentTarget, unstagedReviewablePaths, actor, boundarySnapshot] = await Promise.all([
        readCandidateRecordVersioned(cwd, planRead.value.workUnitId),
        collectGitCandidateTarget({
          cwd,
          name: planRead.value.workUnitId,
          baseBranch: settings["branch.base"],
          exec,
        }),
        collectUnstagedReviewablePaths({
          cwd,
          name: planRead.value.workUnitId,
          exec,
        }),
        resolveUserIdentity(exec),
        readSubmissionBoundaryVersioned(cwd, planRead.value.workUnitId),
      ]);
      if (candidate.record === null || candidate.version === null) {
        return { status: "refused", reason: "candidate-record-unavailable" };
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
        currentTarget,
        verifiedBy: actor,
        verifiedAt,
        applicability: parsed.verification.applicability,
        verificationEvidenceRefs: parsed.verification.verificationEvidenceRefs,
      });
      if (recorded.status === "refused") return recorded;
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
      if (boundarySnapshot.boundary === null) {
        return { status: "refused", reason: "public-boundary-unavailable" };
      }
      const carried = carryDeliveryReviewFixPublicBoundary({
        plan: planRead.value,
        state: acknowledged.state,
        boundary: boundarySnapshot.boundary,
        candidateId: recorded.record.attestation.candidateId,
        sourceCandidateSubjectDigest: recorded.status === "already-recorded"
          ? recorded.transition.newTarget.subject.subjectDigest
          : recorded.transition.oldTarget.subject.subjectDigest,
        candidateSubjectDigest: recorded.transition.newTarget.subject.subjectDigest,
      });
      if (carried.status === "refused") return carried;
      const boundaryPath = await writeSubmissionBoundary(
        cwd,
        carried.boundary,
        boundarySnapshot.version,
      );
      await exec("git", ["add", "--", boundaryPath], { cwd });
      return {
        ...acknowledged,
        candidate: {
          candidateId: recorded.record.attestation.candidateId,
          verificationId: recorded.transition.verificationId,
          recordPath,
        },
        nextAction: "continue-hosted-review" as const,
        boundaryCarry: {
          path: boundaryPath,
          candidateId: carried.candidateId,
          stateRevision: carried.stateRevision,
        },
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
      proveContribution: (endpoints) => proveGitDeliveryContribution({ exec: rawExec, ...endpoints }),
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
    revalidateLifecycleContribution: (input: { protectedBaseRef: string; candidateRef: string; paths: readonly string[] }) => (
      revalidateDeliveryLifecycleContribution({ exec, ...input })
    ),
    compareNormalizedCompleteness: async (input: z.infer<typeof EligibilitySnapshotSchema> extends never ? never : {
      protectedBase: { ref: string; head: string; tree: string };
      top: { ref: string; head: string; tree: string };
      finalCandidate: { deliverableId: string; ref: string; head: string; tree: string };
      lifecyclePaths: readonly string[];
    }) => {
      const compared = await compareGitNormalizedDeliveryTrees({
        exec,
        protectedBaseTree: input.protectedBase.tree,
        topTree: input.top.tree,
        finalCandidateTree: input.finalCandidate.tree,
        lifecyclePaths: input.lifecyclePaths,
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
  const observePosition = async (
    plan: z.infer<typeof DeliveryPlanV1Schema>,
    current: { readonly revision: number; readonly value: z.infer<typeof DeliveryStateV1Schema> },
    repository: string,
    remote: string,
    mode: "exact" | "review-fix" | "review-fix-local" | "refresh-adopt"
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
        ...endpoints,
      }),
    }, {
      ...(mode === "review-fix" || mode === "review-fix-local"
        || mode === "review-fix-adopt" || mode === "review-fix-local-adopt"
        ? { terminalAuthoringMovement: "allow-append-only" as const }
        : {}),
      ...(mode === "refresh-adopt" || mode === "review-fix-adopt" || mode === "review-fix-local-adopt"
        ? { unlandedSuffixMovement: "allow-external" as const }
        : {}),
    });
    if (observed.status !== "observed") return observed;
    for (const deliverableId of operation?.affectedDeliverableIds ?? []) {
      const index = observed.facts.members.findIndex((member) => member.deliverableId === deliverableId);
      const member = observed.facts.members[index];
      if (member === undefined || member.coordinates === null) continue;
      const predecessor = resolveDeliveryPredecessorHead(observed.facts, index);
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
        && ReviewFixPlanSchema.parse(parsed).entryMode === "execution",
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
      lifecyclePaths = [...resolvedPaths.workUnitArtifacts, ...resolvedPaths.sharedProjections];
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
          candidateRef: locator.candidateRef,
          paths: lifecyclePaths,
        });
        return { status: checked.status };
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
    if (current.value.activeOperation === null) {
      const pendingSelectedDeliverableId = findExactPendingSelectedRefresh(current.value);
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
    if (command === "refresh-plan") {
      const planRequest = RefreshPlanSchema.parse(parsed);
      const derived = await deriveIdleRefreshSubject(
        planRequest.scope?.kind === "dependent-suffix" ? "review-fix-local" : "exact",
      );
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
      const idleSubject = current.value.activeOperation === null
        ? await deriveIdleRefreshSubject(
            executeRequest.scope?.kind === "dependent-suffix" ? "review-fix-local" : "exact",
          )
        : null;
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
    const derived = await deriveIdleRefreshSubject(
      adopt.scope?.kind === "dependent-suffix" ? "review-fix-local-adopt" : "refresh-adopt",
    );
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
    const parsed = nativeLinkRequest ?? NativeLinkSchema.parse(request);
    if (parsed.optIn === undefined) return composeDeliveryNativeStackLinkDecision();
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
      optIn: parsed.optIn,
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
    if (target.status !== "resolved" || firstRemaining === undefined
      || position.position.landedPrefix.length >= planRead.value.members.length - 1) {
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
    const reviewStatus = createReviewStatusPort({ cwd, exec });
    if (command === "native-land-prepare") {
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
          return assessDeliveryLandingReviewReadiness({
            repository: prepare.repository,
            headRef: expected.headRef,
            headSha: expected.headSha,
          }, reviewStatus);
        }, stateStore,
      });
    }
    if (command === "native-land-submit") {
      const submit = NativeSubmitSchema.parse(parsed);
      const operation = current.value.activeOperation;
      const nativeResult = await submitReservedNativeDeliveryMerge({
        planId: submit.planId, current, operationId: submit.operationId, request: submit.request,
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
        revalidate: async (deliverableId, headSha) => {
          const member = current.value.members.find((candidate) => candidate.deliverableId === deliverableId);
          if (member?.changeRequest === null || member?.changeRequest === undefined) return { status: "refused" as const };
          const observed = await host.readRequest(submit.request.repository, member.changeRequest);
          if (observed.status !== "observed" || observed.request.state !== "open"
            || observed.request.repository !== submit.request.repository
            || observed.request.headRepository !== submit.request.repository
            || observed.request.headRef !== member.ref?.replace(/^refs\/heads\//u, "")
            || observed.request.headSha !== headSha) return { status: "refused" as const };
          return assessDeliveryLandingReviewReadiness({
            repository: submit.request.repository,
            headRef: observed.request.headRef,
            headSha,
          }, reviewStatus);
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
        current,
        { revision: current.revision, value: nativeResult.projected },
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
    const nativeResult = await reconcileReservedNativeDeliveryMerge({ planId: status.planId, current, request: status.request }, {
      host, stateStore,
      observeEffect: () => observeNativeDeliveryEffect(
        host, current.value, status.request.repository, operation, exec, cwd, status.remote,
      ),
    });
    if (nativeResult.status !== "applied") return nativeResult;
    return settleAppliedNativeLanding(
      plan,
      current,
      { revision: current.revision, value: nativeResult.projected },
      status.request.repository,
      operation.effect.targetRef,
      status.remote,
    );
  }

  if (command === "eligibility-prepare") {
    return prepareDeliveryEligibility(PrepareSchema.parse(request), eligibilityDeps);
  }
  if (command === "eligibility-close") {
    return closeDeliveryEligibility(CloseSchema.parse(request).snapshot, {
      ...eligibilityDeps,
      resolveMember: resolveMemberReadOnly,
    });
  }
  if (command === "publish") {
    const parsed = PublishSchema.parse(request);
    return executeWithFreshDeliveryEligibility(parsed, {
      ...eligibilityDeps,
      resolveOriginatingTopRef,
      resolveLifecyclePaths: async (plan) => {
        const active = await resolveActiveWu({ cwd });
        if (active.status !== "resolved" || active.name !== plan.workUnitId) return null;
        try {
          const paths = await new CurrentDeliveryLifecycleContributionPathSource({
            readDirectory: (path) => readdir(resolve(cwd, path)),
            readArtifactsAtRef: (ref, workUnitId) => readGitDeliveryLifecycleArtifactsAtRef(exec, ref, workUnitId),
          }).resolve({
            workUnitId: plan.workUnitId,
            activeMetaPath: validateManagedPath(active.path),
            protectedBaseRef: parsed.protectedBaseRef,
            topRef: parsed.topRef,
          });
          return [...paths.workUnitArtifacts, ...paths.sharedProjections];
        } catch {
          return null;
        }
      },
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
            commonBase: snapshot.protectedBase,
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
        if (observed.status !== "observed" || !Number.isSafeInteger(pullRequest) || pullRequest <= 0) {
          return { status: "refused" as const };
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
        if (checked.state !== "ready") return { status: "refused" as const };
        const reviewed = await assessDeliveryLandingReviewReadiness({
          repository: input.repository,
          headRef: observed.request.headRef,
          headSha: input.head,
        }, reviewStatus);
        return reviewed.status === "ready"
          ? { status: "ready" as const, settledReviewState: "settled" }
          : { status: "refused" as const };
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
        if (!Number.isSafeInteger(pullRequest) || pullRequest <= 0) return { status: "refused" as const };
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
          ? { status: "refused" as const }
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
            : { status: "refused" as const };
        },
        observeLandedResult: ({ mergeCommitSha, strategy, beforeMember }) => (
          observeGitDeliveryLandingResult({
            exec, cwd, remote: apply.remote, resultHead: mergeCommitSha, strategy, beforeMember,
          })
        ),
        proveLandedContribution: (endpoints) => proveGitDeliveryContribution({
          exec: createRawGitExec(cwd),
          ...endpoints,
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
      const targetRef = currentState.value.target?.ref;
      const baseBranch = targetRef?.startsWith("refs/heads/") === true
        ? targetRef.slice("refs/heads/".length)
        : null;
      if (terminal?.ref === null || terminal?.ref === undefined
        || terminal.changeRequest === null || terminal.coordinates === null
        || baseBranch === null || baseBranch === "") {
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
          if (parsed.reviewFixSelectedDeliverableId !== terminal.deliverableId
            || effective.state === "staged-change" || effective.state === "rerun-checkpoint") {
            return { status: "refused", reason: "candidate-not-current" };
          }
          const baseline = reduceCandidateDurableBaseline(record);
          const baselineCurrentness = projectCandidateCurrentness({ record, current: baseline.target });
          if (baselineCurrentness.status !== "current"
            || baselineCurrentness.convergenceVerification !== "satisfied") {
            return { status: "refused", reason: "candidate-baseline-unverified" };
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
          candidate = {
            schemaVersion: 1,
            mode: "candidate-effective-target",
            state: "review-fix",
            candidateId: baseline.candidateId,
            durableBaselineTarget: baseline.target,
            currentTarget,
            selectedDeliverableId: parsed.reviewFixSelectedDeliverableId,
            convergenceVerification: "satisfied",
          };
          candidateTargetRevision = currentTarget.revision;
        }
        const [coordinates, observedTop] = await Promise.all([
          observeDeliveryEligibilityRef(localExec, candidateTargetRevision),
          new GhDeliveryHostPort(hostedGhRunner).readRequest(parsed.repository, terminal.changeRequest),
        ]);
        if (coordinates === null || coordinates.head !== candidateTargetRevision) {
          return { status: "refused", reason: "candidate-coordinate-unavailable" };
        }
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
              || boundary.locus === "hosted-review-pending",
            candidateId: boundary.candidateId,
            candidateSubjectDigest: boundary.candidateSubjectDigest,
          },
          repository: parsed.repository,
          request: observedTop.request,
          coordinates: { base, head: coordinates.head, tree: coordinates.tree },
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
        currentState,
        { revision: currentState.revision, value: nativeResult.projected },
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
            return request.status === "observed" && triggerRef.status === "absent"
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
            const exactRequest = matchesDeliveryTeardownRequest({
                request: request.request,
                repository: parsed.repository,
                protectedTargetRef: targetRef,
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
              before: { predecessor: beforeTarget, member: beforeMember.coordinates },
              after: landed,
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
              return [...paths.workUnitArtifacts, ...paths.sharedProjections];
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
      proveCarried: (endpoints) => proveGitDeliveryContribution({ exec: createRawGitExec(cwd), ...endpoints }),
      apply: async ({ plan, current, rewrite }) => {
        const member = current.value.members.find((entry) => entry.deliverableId === rewrite.deliverableId);
        const requested = rewrite.requested.members[0];
        const snapshot = latestSnapshot;
        if (member?.ref === null || member?.coordinates === null || member === undefined
          || requested?.coordinates === null || requested === undefined || snapshot === null) {
          return { status: "refused" as const };
        }
        const memberRef = member.ref;
        const memberCoordinates = member.coordinates;
        const requestedCoordinates = requested.coordinates;
        const predecessor = await observeDeliveryEligibilityRef(exec, memberCoordinates.base);
        const snapshotIndex = snapshot.members.findIndex((entry) => entry.deliverableId === rewrite.deliverableId);
        const afterPredecessor = snapshotIndex === 0 ? snapshot.protectedBase : snapshot.members[snapshotIndex - 1];
        if (predecessor === null || predecessor.head !== memberCoordinates.base || afterPredecessor === undefined) {
          return { status: "refused" as const };
        }
        const result = await executeDeliverySuffixRewrite({
          plan,
          current,
          deliverableId: rewrite.deliverableId,
          requested: rewrite.requested,
          contributionMode: rewrite.selectedChange ? "selected-change" : "prove-equivalent",
          revalidateLifecycle: async () => {
            const candidate = latestCandidates?.find((entry) => entry.deliverableId === rewrite.deliverableId);
            if (candidate === undefined) return { status: "refused" as const };
            const checked = await revalidateDeliveryLifecycleContribution({
              exec,
              protectedBaseRef: parsed.protectedBaseRef,
              candidateRef: candidate.ref,
              paths: snapshot.lifecyclePaths,
            });
            return { status: checked.status };
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
            before: { predecessor, member: memberCoordinates },
            after: { predecessor: afterPredecessor, member: requestedCoordinates },
          }),
          stateStore,
        });
        return result.status === "applied" ? result : { status: "refused" as const };
      },
    });
    if (rematerialized.status !== "rematerialized") return rematerialized;
    const snapshot = latestSnapshot as DeliveryEligibilitySnapshot | null;
    if (snapshot === null) return { status: "refused", reason: "observation-unavailable" };
    return completeDeliverySuffixMutationTail({
      rematerialized,
      commonBase: snapshot.protectedBase,
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
    const rawExec = createRawGitExec(cwd);
    return executeDeliverySuffixRewrite({
      plan: planRead.value,
      current: stateRead.value,
      deliverableId: parsed.deliverableId,
      requested: parsed.requested,
      contributionMode: parsed.contributionMode,
      revalidateLifecycle: async () => {
        const checked = await revalidateDeliveryLifecycleContribution({
          exec,
          protectedBaseRef: parsed.protectedBaseRef,
          candidateRef: parsed.candidateRef,
          paths: parsed.lifecyclePaths,
        });
        return { status: checked.status };
      },
      rewriteRef: (input) => rewriteDeliveryMemberRef({ exec, remote: parsed.remote, ...input }),
      observeResult: async () => {
        const member = parsed.requested.members[0];
        const observed = await observeDeliveryEligibilityRef(exec, parsed.candidateRef);
        return member?.coordinates !== null && member !== undefined && observed !== null
          && observed.head === member.coordinates.head && observed.tree === member.coordinates.tree
          ? parsed.requested
          : { target: null, members: [] };
      },
      proveContribution: () => proveGitDeliveryContribution({ exec: rawExec, ...parsed.contribution }),
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
    const observed = await observePosition(planRead.value, stateRead.value, parsed.repository, parsed.remote);
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
