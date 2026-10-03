/** Source-authoritative orchestration for `arc review respond`. */

import { z } from "zod";
import { CanonicalDigestSchema } from "../../../lib/kernel/schema/vocabulary.js";

import { canonicalize, type CanonicalDigest } from "../../../lib/kernel/index.js";
import {
  CandidateManagedRecordV1Schema,
  CandidateVerificationApplicabilitySchema,
  candidateReviewResponses,
  type CandidateLineageTarget,
  type CandidateManagedRecordV1,
  type CandidateReviewResponseEvidenceV1,
} from "../../../lib/work-unit/candidate-attestation.js";
import {
  projectEffectiveCandidateCurrentness,
  type CandidateEffectiveCurrentProjection,
  type CandidateEffectiveTargetProjection,
} from "../../../lib/work-unit/candidate-effective-target.js";
import {
  ApprovedDispositionRecordSchema,
  DeliveryMemberReviewFixResponseSchema,
  ErrandReviewFixResponseSchema,
  currentApprovedDispositionNode,
  isExactDeliveryMemberBindingAdvance,
  type ApprovedDispositionRecord,
  type ErrandReviewBinding,
} from "../core/advisory-records.js";
import {
  DispositionIssueSchema,
  DispositionTitleSchema,
  type DispositionSourceContext,
  type ProposedDispositionSet,
  type ApprovedDispositionSet,
} from "../core/disposition-records.js";
import {
  createDispositionSet,
  proposeDispositionSet,
  validateDispositionState,
} from "../core/dispositions.js";
import { renderDispositionReport } from "../core/disposition-report.js";
import { FIX_NOT_PERFORMED_INTERACTION_TEXT } from "../core/fix-not-performed-envelope.js";
import { ReviewFindingIdentitySchema } from "../core/finding-records.js";
import { ReviewSeveritySchema } from "../core/review-primitives.js";
import { fixesMaterialFinding } from "../core/review-convergence.js";
import { SeverityGatingPolicySchema } from "../core/severity-gating-policy.js";
import type { LaneSubjectLineage } from "../core/lane-admission.js";
import {
  computeConditionalPassAuthorizationId,
  type LaneResponsePerformance,
} from "../core/operation-state-schema.js";
import {
  ReviewTargetSchema,
  type ReviewTarget,
} from "../core/gate-contract-v2-schema.js";
import type {
  ApprovedDispositionRecordStore,
  ReviewResultReader,
} from "../core/ports.js";
import type { ReviewResult } from "../core/review-result.js";
import {
  dispositionSourceContextForResult,
  validateApprovedDispositionRecordForResult,
  validateApprovedDispositionSetForResult,
} from "../core/review-result-disposition.js";
import {
  frontlineResponseBindingMatchesTarget,
  type BoundFrontlineResponseBinding,
} from "../core/frontline-response-binding.js";
import {
  RespondEnvelopeSchema,
  type CandidateBoundMemberFixAuthoring,
} from "../core/review-command-envelope.js";
import { ProvisionalPassAssessmentSchema } from "../core/provisional-pass-assessment.js";
import {
  parseReviewSourceReference,
} from "../core/review-source-reference.js";
import { consumeFixAuthorization, createFixAuthorization } from "../core/fix-authorization.js";
import { projectReviewResponse } from "../core/response-plan.js";
import {
  ReviewResponseSettlementRequestSchema,
  ReviewResponseSettlementSourceSchema,
  type ReviewResponseInput,
} from "../core/response-plan-schema.js";
import type {
  LocalCorrectionTargetConfirmation,
  LocalTargetConfirmation,
} from "../hosts/local/repository-target.js";
import type { HostedTarget } from "../hosted/request.js";
import { laneContinuationOperationId } from "../lane-progress.js";
import {
  projectCandidateDeltaVerification,
  recordCandidateVerifiedResponse,
} from "../policy/pre-publication-procedure.js";
import {
  projectFrontlineResponse,
} from "../policy/frontline-response.js";
import {
  projectFrontlineFollowUpAdvice,
} from "../policy/frontline-follow-up.js";
import type { FrontlineExecutionOutcome } from "../policy/frontline-outcome.js";
import type { DeliveryLocalReviewAdmission } from
  "../policy/delivery-local-review-admission.js";
import {
  ReviewPolicyCommandRequestSchema,
  type ReviewPolicyCommandRequest,
  type ReviewResolveEnvelope,
} from "../policy/review-policy-driver.js";
import type { LanePolicyConfig } from "../policy/lane-policy-config.js";

const AuthorDispositionFieldsSchema = z.strictObject({
  findingId: ReviewFindingIdentitySchema,
  verificationRefs: z.array(z.string().trim().min(1)).min(1),
  title: DispositionTitleSchema,
  issue: DispositionIssueSchema,
  rationale: z.string().trim().min(1).max(4096),
  recommendation: z.string().trim().min(1).max(4096),
  openQuestions: z.array(z.string().trim().min(1).max(4096)),
});
const AuthorDispositionSchema = z.union([
  AuthorDispositionFieldsSchema.extend({
    sourceVerification: z.literal("verified"),
    verifiedSeverity: ReviewSeveritySchema,
    verifiedNit: z.literal(true).optional(),
    disposition: z.enum(["fix", "defer", "reject"]),
  }),
  AuthorDispositionFieldsSchema.extend({
    sourceVerification: z.literal("not-supported"),
    verifiedSeverity: z.null(),
    disposition: z.literal("reject"),
  }),
]);

const ExpectedFixPathSchema = z.string().trim().min(1).refine((path) => (
  !path.startsWith("/")
  && !path.includes("\\")
  && path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..")
), { message: "expected fix path must be repository-relative and normalized" });
const RespondSupersessionSchema = z.strictObject({
  predecessorDispositionSetId: CanonicalDigestSchema,
  expectedFixPaths: z.array(ExpectedFixPathSchema).refine((paths) => (
    paths.length === new Set(paths).size
  ), { message: "expected fix paths must be unique" }),
});

const RespondProposalRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  source: ReviewResponseSettlementSourceSchema,
  supersedes: RespondSupersessionSchema.optional(),
  proposal: z.strictObject({
    proposedVerification: CandidateVerificationApplicabilitySchema,
    severityGatingPolicy: SeverityGatingPolicySchema,
    findings: z.array(AuthorDispositionSchema).min(1),
  }),
});

/**
 * Confirmation of the verification performed for an approved fix.
 *
 * Its presence distinguishes the post-fix settlement pass from the approval pass. The approved
 * disposition set supplies the minimum scope; this record supplies the actual scope and its evidence.
 */
export const RespondVerifiedFixSchema = z.strictObject({
  applicability: CandidateVerificationApplicabilitySchema,
  verificationEvidenceRefs: z.array(z.string().trim().min(1)).min(1),
});

const VerificationApplicabilityRank = {
  targeted: 0,
  focused: 1,
  full: 2,
} as const;

/**
 * The head an approved set's fixes settled at, supplied when the checkpoint's plan replays it.
 *
 * A settlement replay carries no new judgment — the fix landed and was verified at approval time —
 * so it names the target that must still be current instead of the applicability a fix pass owns.
 */
const RespondSettledFixTargetSchema = ReviewTargetSchema;
const RespondConditionalNextPassAuthorizationSchema = z.strictObject({
  authorizedBy: z.string().trim().min(1),
  exhaustedPassCount: z.number().int().nonnegative(),
  nextPass: z.number().int().positive(),
});
const RespondConditionalNextPassWithdrawalRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  source: ReviewResponseSettlementSourceSchema,
  conditionalNextPassWithdrawal: z.strictObject({
    conditionalPassAuthorizationId: CanonicalDigestSchema,
    dispositionSetId: CanonicalDigestSchema,
    withdrawnBy: z.string().trim().min(1),
  }),
});

const RespondApprovedRequestSchema = ReviewResponseSettlementRequestSchema.extend({
  policyRequest: ReviewPolicyCommandRequestSchema,
  supersedes: RespondSupersessionSchema.optional(),
  conditionalNextPassAuthorization: RespondConditionalNextPassAuthorizationSchema.optional(),
  verifiedFix: RespondVerifiedFixSchema.optional(),
  settledFixTarget: RespondSettledFixTargetSchema.optional(),
}).superRefine((request, context) => {
  if (request.verifiedFix !== undefined && request.settledFixTarget !== undefined) {
    context.addIssue({
      code: "custom",
      path: ["settledFixTarget"],
      message: "a settlement replay cannot also submit a verified fix",
    });
  }
  if (request.verifiedFix !== undefined
    && VerificationApplicabilityRank[request.verifiedFix.applicability]
      < VerificationApplicabilityRank[request.dispositions.dispositionSet.proposedVerification]) {
    context.addIssue({
      code: "custom",
      path: ["verifiedFix", "applicability"],
      message: "verified fix applicability is narrower than the approved scope",
    });
  }
  const ceilingOverride = request.policyRequest.ceilingOverride;
  const conditional = request.conditionalNextPassAuthorization;
  if (request.settledFixTarget === undefined
    && (ceilingOverride === undefined) !== (conditional === undefined)) {
    context.addIssue({
      code: "custom",
      path: ["conditionalNextPassAuthorization"],
      message: "a ceiling override on an approved response requires explicit conditional next-pass authorization",
    });
  } else if (ceilingOverride !== undefined && conditional !== undefined
    && (ceilingOverride.exhaustedPassCount !== conditional.exhaustedPassCount
      || ceilingOverride.nextPass !== conditional.nextPass)) {
    context.addIssue({
      code: "custom",
      path: ["conditionalNextPassAuthorization"],
      message: "conditional next-pass authorization does not match the carried ceiling override",
    });
  }
  if (request.verifiedFix !== undefined
    && conditional !== undefined
    && ceilingOverride?.conditionalPassAuthorizationId === undefined) {
    context.addIssue({
      code: "custom",
      path: ["policyRequest", "ceilingOverride", "conditionalPassAuthorizationId"],
      message: "verified fix continuation must carry its captured conditional pass authorization",
    });
  }
});

export const RespondRequestSchema = z.union([
  RespondProposalRequestSchema,
  RespondApprovedRequestSchema,
  RespondConditionalNextPassWithdrawalRequestSchema,
]);

interface ResponseActors {
  approverIdentity: string;
  proposerIdentity: string;
}

/** One repository's Candidate lineage and the subject its current index carries. */
export interface CandidateLineageBinding {
  workUnit: string;
  record: CandidateManagedRecordV1;
  recordVersion: string;
  /** Effective projection of the exact review target that authorizes this response. */
  reviewed: CandidateEffectiveCurrentProjection;
  /** Effective projection of the repository's current committed target. */
  effective: CandidateEffectiveTargetProjection;
  current: CandidateLineageTarget;
  /** Exact current Candidate target retaining the reviewed target's kind and diff base. */
  candidateFixTarget: ReviewTarget;
  /**
   * Reviewable paths the index does not carry, read alongside the subject it does.
   *
   * A lineage advance records the current subject as the approved head, so an unstaged fix would
   * either be explained away as already-current or land a head that omits it.
   */
  unstagedReviewablePaths: readonly string[];
}

interface HostedDispositionFindingBinding {
  readonly findingId: string;
  readonly disposition: "fix" | "defer" | "reject";
  readonly channelAction: "record-only" | "reply-and-resolve";
}

export interface RespondCommandDependencies {
  withOperationLock<T>(operationId: string, action: () => Promise<T>): Promise<T>;
  resultReader: ReviewResultReader;
  dispositionStore: ApprovedDispositionRecordStore;
  confirmTarget(target: ReviewTarget): Promise<LocalTargetConfirmation>;
  confirmCorrectionTarget(
    target: ReviewTarget,
    expectedFixPaths: readonly string[],
  ): Promise<LocalCorrectionTargetConfirmation>;
  /** Re-observe the immutable planned member without requiring its checkout to be current. */
  confirmPinnedDeliveryMemberTarget(result: ReviewResult): Promise<ReviewTarget | null>;
  resolveLocalActors(
    evaluatorIdentity: string,
    admittedAuthorIdentity?: string,
  ): Promise<ResponseActors>;
  resolveFrontlineActors(): Promise<ResponseActors>;
  /** Exact ordinary Errand occupying the current branch, or null outside an Errand. */
  resolveActiveErrand(): Promise<ErrandReviewBinding | null>;
  /** Current exact coordinates for the originating hosted delivery member, or null when unavailable. */
  resolveDeliveryMemberFixTarget(input: {
    vehicle: NonNullable<ApprovedDispositionRecord["deliveryMember"]>;
    originatingTarget: ReviewTarget;
    hostedTarget: HostedTarget;
  }): Promise<{ currentTarget: ReviewTarget; hostedFixTarget: HostedTarget } | null>;
  /** Active work-unit checkout where a Candidate-bound private-member fix must be authored. */
  resolveCandidateFixAuthoring(input: {
    workUnit: string;
    expectedHead: string;
  }): Promise<CandidateBoundMemberFixAuthoring | null>;
  now(): string;
  /** Null when the response target identifies no active or archived Candidate lineage. */
  readCandidateLineage(target: ReviewTarget): Promise<CandidateLineageBinding | null>;
  appendCandidateResponse(input: {
    workUnit: string;
    record: CandidateManagedRecordV1;
    expectedRecordVersion: string;
  }): Promise<{ recordPath: string }>;
  stageCandidateResponse(workUnit: string): Promise<{ recordPath: string }>;
  rebindSingletonPublicationResponse(input: {
    workUnit: string;
    response: CandidateReviewResponseEvidenceV1;
    requirePublished: boolean;
  }): Promise<void>;
  settleLaneFindings(input: {
    lane: "frontline" | "standard";
    repositoryId: string;
    headSha: string;
    lineage?: LaneSubjectLineage;
    attemptId: string;
    dispositionSetId: CanonicalDigest;
    predecessorDispositionSetId?: CanonicalDigest;
    producedHeadSha: string;
  }): Promise<void>;
  recordResponsePerformance(input: {
    lane: "frontline" | "standard";
    repositoryId: string;
    headSha: string;
    lineage: LaneSubjectLineage;
    attemptId: string;
    dispositionSetId: CanonicalDigest;
    predecessorDispositionSetId?: CanonicalDigest;
    producedHeadSha: string;
  }): Promise<void>;
  readResponsePerformance(result: ReviewResult): Promise<LaneResponsePerformance | null>;
  bindHostedDisposition(input: {
    operationId: string;
    attemptId: string;
    dispositionSetId: CanonicalDigest;
    findingDispositions: readonly HostedDispositionFindingBinding[];
  }): Promise<void>;
  resolvePolicy(
    request: ReviewPolicyCommandRequest,
    confirmedProducerTarget: ReviewTarget,
  ): Promise<ReviewResolveEnvelope>;
  /** Read the lane's effective current config without resolving or spending review policy. */
  readConfiguredLanePolicy(lane: "frontline" | "standard"): Promise<LanePolicyConfig>;
  captureConditionalNextPass(input: {
    lane: "frontline" | "standard";
    repositoryId: string;
    headSha: string;
    lineage: LaneSubjectLineage;
    producerId: string;
    dispositionSetId: CanonicalDigest;
    authorizedBy: string;
    exhaustedPassCount: number;
    nextPass: number;
  }): Promise<{ authorizationId: CanonicalDigest }>;
  withdrawConditionalNextPass(input: {
    authorizationId: CanonicalDigest;
    lane: "frontline" | "standard";
    repositoryId: string;
    headSha: string;
    lineage: LaneSubjectLineage;
    producerId: string;
    dispositionSetId: CanonicalDigest;
    withdrawnBy: string;
  }): Promise<
    | {
        state: "withdrawn" | "already-withdrawn";
        authorizationId: CanonicalDigest;
        dispositionSetId: CanonicalDigest;
      }
    | {
        state: "refused";
        reason: "consumed" | "superseded" | "stale-current-set" | "foreign-authority";
        detail: string;
      }
  >;
  invalidateConditionalNextPass(input: {
    lane: "frontline" | "standard";
    repositoryId: string;
    headSha: string;
    lineage: LaneSubjectLineage;
    producerId: string;
    dispositionSetId: CanonicalDigest;
    successorDispositionSetId: CanonicalDigest;
  }): Promise<void>;
  preflightConditionalNextPassInvalidation(input: {
    lane: "frontline" | "standard";
    repositoryId: string;
    headSha: string;
    lineage: LaneSubjectLineage;
    producerId: string;
    dispositionSetId: CanonicalDigest;
    successorDispositionSetId: CanonicalDigest;
  }): Promise<
    | { state: "ready" }
    | { state: "refused"; reason: "fix-consumed"; detail: string }
  >;
  preflightHostedDisposition(input: {
    operationId: string;
    attemptId: string;
    predecessorDispositionSetId: CanonicalDigest;
    successorDispositionSetId: CanonicalDigest;
    findingDispositions: readonly HostedDispositionFindingBinding[];
  }): Promise<
    | { state: "ready" }
    | { state: "refused"; reason: "hosted-settlement-conflict"; detail: string }
  >;
  supersedeHostedDisposition(input: {
    operationId: string;
    attemptId: string;
    predecessorDispositionSetId: CanonicalDigest;
    successorDispositionSetId: CanonicalDigest;
    findingDispositions: readonly HostedDispositionFindingBinding[];
  }): Promise<
    | {
        state: "advanced";
        carriedFindingIds: readonly string[];
        reopenedFindingIds: readonly string[];
      }
    | { state: "refused"; reason: "hosted-settlement-conflict"; detail: string }
  >;
}

/** Stable durable-authority failure for response source or replay mismatches. */
export class RespondCommandError extends Error {
  constructor(
    readonly code: "invalid-input" | "corrupt-state",
    message: string,
  ) {
    super(message);
    this.name = "RespondCommandError";
  }
}

/** A verified fix submitted while its exact target still reads as the reviewed one. */
export class UnchangedVerifiedFixTargetError extends RespondCommandError {
  constructor() {
    super("invalid-input", "a verified fix requires a changed exact target");
    this.name = "UnchangedVerifiedFixTargetError";
  }
}

interface ResolvedResponseSource {
  result: ReviewResult;
  operationId: string;
  repositoryId: string;
  target: ReviewTarget;
  findings: FrontlineExecutionOutcome["findings"];
  sourceIdentity: string;
  source: ApprovedDispositionRecord["source"];
  dispositionContext: DispositionSourceContext;
  actors: ResponseActors;
  laneLineage?: LaneSubjectLineage;
  deliveryAdmission?: DeliveryLocalReviewAdmission;
  responseBinding?: BoundFrontlineResponseBinding;
  frontlineOutcome?: FrontlineExecutionOutcome;
  hostedAttempt?: {
    operationId: string;
    attemptId: string;
    actorIdentity: string;
    vehicle?: NonNullable<ApprovedDispositionRecord["deliveryMember"]>;
    target: {
      repository: string;
      pullRequest: number;
      headSha: string;
    };
    noHostSettlementFindingIds: readonly string[];
    hostSettlementFindingIds: readonly string[];
    settled: boolean;
  };
}

function approvedPolicyVehicleMatches(
  request: ReviewPolicyCommandRequest,
  source: ResolvedResponseSource,
): boolean {
  if (source.result.kind === "hosted") {
    return request.target.pullRequest === source.result.hostedTarget.pullRequest
      && request.target.repository.toLowerCase()
        === source.result.hostedTarget.repository.toLowerCase();
  }
  if (source.result.kind === "attested-local" && source.result.deliveryAdmission !== undefined) {
    return request.target.pullRequest === source.result.deliveryAdmission.target.pullRequest
      && request.target.repository.toLowerCase()
        === source.result.deliveryAdmission.target.repository.toLowerCase();
  }
  return request.target.pullRequest === null;
}

function approvedPolicyTargetMatches(
  request: ReviewPolicyCommandRequest,
  source: ResolvedResponseSource,
): boolean {
  const expectedLane = source.result.kind === "frontline" ? "frontline" : "standard";
  return request.lane === expectedLane
    && request.target.headSha === source.target.headSha
    && approvedPolicyVehicleMatches(request, source)
    && (request.scopeSelection?.mode ?? "whole-target") === source.result.admission.scopeMode
    && (request.scopeSelection === undefined
      || canonicalize(request.scopeSelection.target) === canonicalize(request.target));
}

function validateApprovedResponsePolicyBinding(
  request: ReviewPolicyCommandRequest,
  source: ResolvedResponseSource,
): void {
  const terminal = request.attempts.at(-1);
  if (!approvedPolicyTargetMatches(request, source)
    || request.completedPasses !== source.result.admission.logicalPass
    || terminal?.outcome !== "findings"
    || terminal.reviewOperationId !== source.operationId) {
    throw new RespondCommandError(
      "invalid-input",
      "approved response policy request must name the exact findings producer, lane, pass, scope, and target; correct the request and retry the same approval",
    );
  }
}

interface PerformedResponseContinuation {
  policyRequest: ReviewPolicyCommandRequest;
  conditionalPassAuthorizationId?: CanonicalDigest;
}

type RespondSource = z.infer<typeof ReviewResponseSettlementSourceSchema>;

function parseSourceReference(
  reference: string,
  kind: "attested-local" | "frontline" | "hosted",
) {
  try {
    return parseReviewSourceReference(reference, kind);
  } catch (error) {
    throw new RespondCommandError(
      "invalid-input",
      error instanceof Error ? error.message : "malformed review source reference",
    );
  }
}

function actorMismatch(
  dispositions: ApprovedDispositionSet,
  actors: ResponseActors,
): "approver" | "proposer" | null {
  if (dispositions.approval.approvedBy !== actors.approverIdentity) return "approver";
  if (dispositions.dispositionSet.proposedBy !== actors.proposerIdentity) return "proposer";
  return null;
}

function validateActors(dispositions: ApprovedDispositionSet, actors: ResponseActors): void {
  const mismatch = actorMismatch(dispositions, actors);
  if (mismatch === "approver") {
    throw new RespondCommandError("invalid-input", "disposition approver is not the active local identity");
  }
  if (mismatch === "proposer") {
    throw new RespondCommandError("invalid-input", "disposition proposer is not the composing runtime");
  }
}

function validateFindings(
  dispositions: ApprovedDispositionSet,
  source: ResolvedResponseSource,
): void {
  try {
    validateApprovedDispositionSetForResult(dispositions, source.result);
  } catch {
    throw new RespondCommandError("invalid-input", "approved dispositions do not match the selected review source");
  }
}

function prepareDispositionProposal(
  request: z.infer<typeof RespondProposalRequestSchema>,
  source: ResolvedResponseSource,
): ProposedDispositionSet {
  if (request.proposal.findings.length !== source.findings.length) {
    throw new RespondCommandError("invalid-input", "proposal must disposition every selected-source finding");
  }
  const decisions = new Map(request.proposal.findings.map((finding) => [finding.findingId, finding]));
  if (decisions.size !== request.proposal.findings.length) {
    throw new RespondCommandError("invalid-input", "proposal contains duplicate finding identities");
  }
  const findings = source.findings.map((finding) => {
    const decision = decisions.get(finding.findingId);
    if (decision === undefined) {
      throw new RespondCommandError("invalid-input", "proposal must disposition every selected-source finding");
    }
    return {
      ...decision,
      sourceIdentity: source.sourceIdentity,
      locus: finding.locus,
      reportedSeverity: finding.severity,
      ...(finding.nit === true ? { reportedNit: true as const } : {}),
    };
  });
  const dispositionContext = source.dispositionContext.kind === "rubric"
    ? {
        producerId: source.dispositionContext.producerId,
        resultDigest: source.dispositionContext.resultDigest,
        policyVersion: source.dispositionContext.policyVersion,
        rubricVersion: source.dispositionContext.rubricVersion,
        rubricDigest: source.dispositionContext.rubricDigest,
      }
    : {
        producerId: source.dispositionContext.producerId,
        resultDigest: source.dispositionContext.resultDigest,
        policyVersion: source.dispositionContext.policyVersion,
        frontlineBinding: source.dispositionContext.frontlineBinding,
      };
  try {
    return proposeDispositionSet(createDispositionSet({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      targetId: source.target.targetId,
      ...dispositionContext,
      proposedBy: source.actors.proposerIdentity,
      proposedVerification: request.proposal.proposedVerification,
      findings,
    }, request.proposal.severityGatingPolicy));
  } catch (error) {
    throw new RespondCommandError(
      "invalid-input",
      error instanceof Error ? error.message : "invalid disposition proposal",
    );
  }
}

async function resolveLocalSource(
  request: RespondSource & { kind: "attested-local" },
  dependencies: RespondCommandDependencies,
): Promise<ResolvedResponseSource> {
  const reference = parseSourceReference(request.receiptRef, "attested-local");
  const result = await dependencies.resultReader.readResult(reference.operationId);
  if (result.kind !== "attested-local" || result.receiptRef !== reference.durableRef) {
    throw new RespondCommandError("corrupt-state", "local response source snapshot mismatch");
  }
  if (result.vehicle.kind === "errand") {
    const activeErrand = await dependencies.resolveActiveErrand();
    if (activeErrand === null || activeErrand.key !== result.vehicle.identity
      || activeErrand.claimId !== result.vehicle.claimId) {
      throw new RespondCommandError("invalid-input", "local review Errand claim does not match the active Errand");
    }
  }
  if (result.originalOutcome !== "findings") {
    throw new RespondCommandError("invalid-input", "local response requires a findings receipt");
  }
  return {
    result,
    operationId: result.producerId,
    repositoryId: result.repositoryId,
    target: result.target,
    findings: [...result.findings],
    sourceIdentity: result.sourceIdentity,
    source: {
      kind: "attested-local",
      receiptRef: request.receiptRef,
      localSourceRef: result.localSourceRef,
    },
    dispositionContext: dispositionSourceContextForResult(result),
    actors: await dependencies.resolveLocalActors(result.request.evaluatorIdentity, result.request.authorIdentity),
    laneLineage: result.admission.lineage,
    ...(result.deliveryAdmission === undefined ? {} : { deliveryAdmission: result.deliveryAdmission }),
  };
}

async function resolveFrontlineSource(
  request: RespondSource & { kind: "frontline" },
  dependencies: RespondCommandDependencies,
): Promise<ResolvedResponseSource> {
  const reference = parseSourceReference(request.outcomeRef, "frontline");
  const result = await dependencies.resultReader.readResult(reference.operationId);
  if (result.kind !== "frontline" || result.outcomeRef !== reference.durableRef) {
    throw new RespondCommandError("corrupt-state", "frontline response source snapshot mismatch");
  }
  const responseBinding = (result as typeof result & {
    responseBinding?: BoundFrontlineResponseBinding;
  }).responseBinding;
  if (responseBinding !== undefined
    && !frontlineResponseBindingMatchesTarget(result.target, responseBinding)) {
    throw new RespondCommandError("corrupt-state", "Frontline response binding does not match its exact targets");
  }
  if (result.originalOutcome !== "findings") {
    throw new RespondCommandError("invalid-input", "frontline response requires a findings outcome");
  }
  return {
    result,
    operationId: result.producerId,
    repositoryId: result.repositoryId,
    target: result.target,
    findings: [...result.findings],
    sourceIdentity: result.sourceIdentity,
    source: { kind: "frontline", outcomeRef: request.outcomeRef },
    dispositionContext: dispositionSourceContextForResult(result),
    actors: await dependencies.resolveFrontlineActors(),
    frontlineOutcome: result.outcome,
    laneLineage: result.admission.lineage,
    ...(responseBinding === undefined ? {} : { responseBinding }),
  };
}

async function resolveHostedSource(
  request: RespondSource & { kind: "hosted" },
  dependencies: RespondCommandDependencies,
): Promise<ResolvedResponseSource> {
  const reference = parseSourceReference(request.attemptRef, "hosted");
  const result = await dependencies.resultReader.readResult(reference.durableRef);
  if (result.kind !== "hosted" || result.laneOperationId !== reference.operationId) {
    throw new RespondCommandError("corrupt-state", "hosted response source snapshot mismatch");
  }
  if (result.originalOutcome !== "findings") {
    throw new RespondCommandError("invalid-input", "hosted response requires a findings attempt");
  }
  return {
    result,
    operationId: result.producerId,
    repositoryId: result.repositoryId,
    target: result.target,
    findings: [...result.findings],
    sourceIdentity: result.sourceIdentity,
    source: { kind: "hosted", attemptRef: request.attemptRef, hostedResultId: result.resultDigest },
    dispositionContext: dispositionSourceContextForResult(result),
    actors: await dependencies.resolveFrontlineActors(),
    hostedAttempt: {
      operationId: result.laneOperationId,
      attemptId: result.producerId,
      actorIdentity: result.actorIdentity,
      ...(result.vehicle === undefined ? {} : { vehicle: result.vehicle }),
      target: result.hostedTarget,
      noHostSettlementFindingIds: result.noHostSettlementFindingIds,
      hostSettlementFindingIds: result.hostSettlementFindingIds,
      settled: result.settled,
    },
  };
}

function projectHostedSettlementPlan(
  source: ResolvedResponseSource,
  dispositions: ApprovedDispositionSet,
  carriedFindingIds: readonly string[] = [],
) {
  if (source.hostedAttempt === undefined) return undefined;
  const hostSettlementFindingIds = new Set(source.hostedAttempt.hostSettlementFindingIds);
  const carried = new Set(carriedFindingIds);
  const findings = dispositions.dispositionSet.findings.filter(({ findingId }) =>
    hostSettlementFindingIds.has(findingId) && !carried.has(findingId));
  const plan = {
    actorIdentity: source.hostedAttempt.actorIdentity,
    beforeFixFindingIds: findings
      .filter(({ disposition }) => disposition !== "fix")
      .map(({ findingId }) => findingId),
    afterFixFindingIds: findings
      .filter(({ disposition }) => disposition === "fix")
      .map(({ findingId }) => findingId),
  };
  return plan.beforeFixFindingIds.length === 0 && plan.afterFixFindingIds.length === 0
    ? undefined
    : plan;
}

function projectHostedDispositionBindings(
  source: ResolvedResponseSource,
  dispositions: ApprovedDispositionSet,
): readonly HostedDispositionFindingBinding[] {
  const hostSettlementFindingIds = new Set(source.hostedAttempt?.hostSettlementFindingIds ?? []);
  return dispositions.dispositionSet.findings.map(({ findingId, disposition }) => ({
    findingId,
    disposition,
    channelAction: hostSettlementFindingIds.has(findingId)
      ? "reply-and-resolve" as const
      : "record-only" as const,
  }));
}

function projectApprovedResponse(
  source: ResolvedResponseSource,
  dispositions: ApprovedDispositionSet,
  verified?: { candidateTarget: ReviewTarget; verificationEvidenceRefs: readonly string[] },
) {
  const response: Omit<
    ReviewResponseInput,
    "currentTarget" | "findings"
  > = {
    routing: {
      schemaVersion: 1,
      authorSelfReview: "required",
      frontlineAction: "attempt",
      standardReview: "required",
      retrigger: "full-final",
      assuranceMode: "terminal-aggregate",
      reasons: ["sensitive-change-set"],
    },
    dispositionState: dispositions,
    candidateTarget: verified?.candidateTarget ?? null,
    persistedTargetId: null,
    verificationPassed: verified !== undefined,
    verificationRefs: [...verified?.verificationEvidenceRefs ?? []],
    capabilities: {
      approve: false,
      fix: true,
      persist: verified !== undefined,
      close: true,
      reroute: false,
    },
  };
  return source.frontlineOutcome === undefined
    ? projectReviewResponse({
        ...response,
        currentTarget: source.target,
        findings: source.findings,
      })
    : projectFrontlineResponse({
        ...response,
        outcome: source.frontlineOutcome,
      });
}

async function recordPerformedResponse(
  source: ResolvedResponseSource,
  dispositions: ApprovedDispositionSet,
  producedHeadSha: string,
  predecessorDispositionSetId: CanonicalDigest | null,
  dependencies: RespondCommandDependencies,
): Promise<void> {
  await dependencies.recordResponsePerformance({
    lane: source.frontlineOutcome === undefined ? "standard" : "frontline",
    repositoryId: source.repositoryId,
    headSha: source.target.headSha,
    lineage: source.result.admission.lineage,
    attemptId: source.hostedAttempt?.attemptId ?? source.operationId,
    dispositionSetId: dispositions.dispositionSet.dispositionSetId,
    ...(predecessorDispositionSetId === null
      ? {}
      : { predecessorDispositionSetId }),
    producedHeadSha,
  });
}

/**
 * Append one approved fix's delta-verification evidence to the managed Candidate record.
 *
 * The lineage targets are the repository's own — the recognized head reduced from prior responses and
 * the subject the index currently carries — so the caller supplies only the applicability it selected
 * and the evidence that supports it. An already-explained subject appends nothing, which is what makes
 * a repeated settlement pass a no-op rather than a second empty response.
 */
async function replayCandidateResponse(
  source: ResolvedResponseSource,
  dispositions: ApprovedDispositionSet,
  verifiedFix: z.infer<typeof RespondVerifiedFixSchema>,
  dispositionReportText: string,
  continuation: PerformedResponseContinuation,
  lineage: CandidateLineageBinding,
  candidateTarget: ReviewTarget,
  current: ReturnType<typeof currentApprovedDispositionNode>,
  dependencies: RespondCommandDependencies,
): Promise<z.infer<typeof RespondEnvelopeSchema>> {
  const header = { schemaVersion: 1, mode: "review-respond", diagnostics: [] } as const;
  const currentness = projectEffectiveCandidateCurrentness(lineage.effective);
  const recordedResponses = candidateReviewResponses(lineage.record);
  const matchingResponses = recordedResponses.filter((response) =>
    response.dispositionId === dispositions.dispositionSet.dispositionSetId);
    if (matchingResponses.length !== 1) {
      throw new RespondCommandError("corrupt-state", "disposition response appears more than once");
    }
    if (!("status" in currentness) || currentness.status !== "current") {
      throw new RespondCommandError("invalid-input", "Candidate changed after the recorded disposition response");
    }
    const matching = matchingResponses[0];
    if (matching === undefined
      || matching.candidateId !== lineage.record.attestation.candidateId
      || matching.oldTarget.revision !== candidateTarget.headSha
      || matching.newTarget.revision !== recordedResponses.at(-1)?.newTarget.revision
      || matching.approvedBy !== dispositions.approval.approvedBy
      || matching.appliedBy !== dispositions.dispositionSet.proposedBy
      || matching.applicability !== verifiedFix.applicability
      || canonicalize(matching.verificationEvidenceRefs)
        !== canonicalize(verifiedFix.verificationEvidenceRefs)) {
      throw new RespondCommandError("invalid-input", "Candidate response replay conflicts with the recorded response");
    }
    const { recordPath } = await dependencies.stageCandidateResponse(lineage.workUnit);
    await dependencies.rebindSingletonPublicationResponse({
      workUnit: lineage.workUnit,
      response: matching,
      requirePublished: source.result.kind === "hosted" && source.responseBinding?.deliveryMember === undefined,
    });
    await recordPerformedResponse(
      source,
      dispositions,
      matching.newTarget.revision,
      current.predecessorDispositionSetId,
      dependencies,
    );
    return RespondEnvelopeSchema.parse({
      ...header,
      state: "candidate-current",
      nextAction: "continue-review",
      payload: {
        operationId: source.operationId,
        candidateId: currentness.candidateId,
        recordPath,
        implementationChanged: currentness.implementationChanged,
        dispositionReportText,
        ...continuation,
      },
    });
}

function candidateAuthorityBindingMatches(
  existing: ApprovedDispositionRecord | null,
  source: ResolvedResponseSource,
  lineage: CandidateLineageBinding,
): boolean {
  if (existing === null || existing.candidate === null || existing.errand !== null) return false;
  const candidateMatches = existing.candidate.workUnit === lineage.workUnit
    && existing.candidate.candidateId === lineage.record.attestation.candidateId;
  const memberMatches = source.responseBinding === undefined
    ? existing.deliveryMember === null
    : existing.deliveryMember !== null
      && canonicalize(existing.deliveryMember) === canonicalize(source.responseBinding.deliveryMember);
  return candidateMatches && memberMatches;
}

function candidateAuthorityApprovalMatches(
  existing: ApprovedDispositionRecord | null,
  current: ReturnType<typeof currentApprovedDispositionNode> | null,
  source: ResolvedResponseSource,
  dispositions: ApprovedDispositionSet,
  expectedAuthorization: ReturnType<typeof createFixAuthorization> | null,
): boolean {
  return existing !== null && current !== null && expectedAuthorization !== null
    && canonicalize(current.approvedDisposition) === canonicalize(dispositions)
    && canonicalize(existing.source) === canonicalize(source.source)
    && canonicalize(current.fixAuthorization) === canonicalize(expectedAuthorization);
}

async function assertCandidateResponseAuthority(
  source: ResolvedResponseSource,
  dispositions: ApprovedDispositionSet,
  lineage: CandidateLineageBinding,
  dependencies: RespondCommandDependencies,
): Promise<ReturnType<typeof currentApprovedDispositionNode>> {
  const existing = await dependencies.dispositionStore.readDispositionRecord(source.operationId);
  const current = existing === null ? null : currentApprovedDispositionNode(existing);
  let expectedAuthorization;
  try {
    expectedAuthorization = createFixAuthorization({
      dispositionState: dispositions,
      oldTarget: source.target,
    });
  } catch {
    expectedAuthorization = null;
  }
  if (!candidateAuthorityBindingMatches(existing, source, lineage)
    || !candidateAuthorityApprovalMatches(existing, current, source, dispositions, expectedAuthorization)) {
    throw new RespondCommandError(
      "invalid-input",
      "a verified Candidate fix requires its exact approved response record and fix authorization",
    );
  }
  if (current === null) {
    throw new RespondCommandError("corrupt-state", "Candidate response approval node is unavailable");
  }
  return current;
}

async function persistCandidateResponse(
  source: ResolvedResponseSource,
  dispositions: ApprovedDispositionSet,
  verifiedFix: z.infer<typeof RespondVerifiedFixSchema>,
  dispositionReportText: string,
  continuation: PerformedResponseContinuation,
  dependencies: RespondCommandDependencies,
): Promise<z.infer<typeof RespondEnvelopeSchema>> {
  const candidateTarget = source.responseBinding?.candidate.target ?? source.target;
  const lineage = await dependencies.readCandidateLineage(candidateTarget);
  if (lineage === null) {
    throw new RespondCommandError(
      "invalid-input",
      "a verified fix requires a work unit carrying the reviewed managed Candidate record",
    );
  }
  const current = await assertCandidateResponseAuthority(source, dispositions, lineage, dependencies);
  if (lineage.unstagedReviewablePaths.length > 0) {
    throw new RespondCommandError(
      "invalid-input",
      "a verified fix must be staged before it can advance the Candidate lineage; the index does not "
        + `carry ${lineage.unstagedReviewablePaths.length} reviewable path(s): `
        + lineage.unstagedReviewablePaths.join(", "),
    );
  }
  const header = { schemaVersion: 1, mode: "review-respond", diagnostics: [] } as const;
  const matchingResponses = candidateReviewResponses(lineage.record).filter((response) =>
    response.dispositionId === dispositions.dispositionSet.dispositionSetId);
  if (matchingResponses.length > 0) {
    return replayCandidateResponse(
      source, dispositions, verifiedFix, dispositionReportText, continuation,
      lineage, candidateTarget, current, dependencies,
    );
  }
  if (lineage.reviewed.recognizedTarget.revision !== candidateTarget.headSha) {
    throw new RespondCommandError("invalid-input", "Candidate review authority belongs to a different exact target");
  }
  const projection = projectCandidateDeltaVerification({
    record: lineage.record,
    oldTarget: lineage.reviewed.recognizedTarget,
    current: lineage.current,
  });
  const response = recordCandidateVerifiedResponse({
    projection: {
      ...projection,
      // The prior Candidate subject may have survived ceremony commits after its attestation.
      // Preserve the exact reviewed revision so lineage-wide review authority can find the pass
      // record that belongs to the approved response.
      oldTarget: { ...projection.oldTarget, revision: candidateTarget.headSha },
    },
    dispositionId: dispositions.dispositionSet.dispositionSetId,
    approvedBy: dispositions.approval.approvedBy,
    appliedBy: dispositions.dispositionSet.proposedBy,
    approvedVerification: dispositions.dispositionSet.proposedVerification,
    applicability: verifiedFix.applicability,
    verificationEvidenceRefs: verifiedFix.verificationEvidenceRefs,
  });
  const { recordPath } = await dependencies.appendCandidateResponse({
    workUnit: lineage.workUnit,
    expectedRecordVersion: lineage.recordVersion,
    record: CandidateManagedRecordV1Schema.parse({
      ...lineage.record,
      transitions: [...lineage.record.transitions, response],
    }),
  });
  await dependencies.rebindSingletonPublicationResponse({
    workUnit: lineage.workUnit,
    response,
    requirePublished: source.result.kind === "hosted" && source.responseBinding?.deliveryMember === undefined,
  });
  await recordPerformedResponse(
    source,
    dispositions,
    response.newTarget.revision,
    current.predecessorDispositionSetId,
    dependencies,
  );
  return RespondEnvelopeSchema.parse({
    ...header,
    state: "candidate-advanced",
    nextAction: "continue-review",
    payload: {
      operationId: source.operationId,
      candidateId: response.candidateId,
      responseId: response.responseId,
      recordPath,
      implementationChanged: response.implementationChanged,
      dispositionReportText,
      ...continuation,
    },
  });
}

function errandResponseMatches(
  existing: z.infer<typeof ErrandReviewFixResponseSchema>,
  input: {
    source: ResolvedResponseSource;
    dispositions: ApprovedDispositionSet;
    newTarget: ReviewTarget;
    verifiedFix: z.infer<typeof RespondVerifiedFixSchema>;
  },
): boolean {
  const hostedTarget = input.source.hostedAttempt?.target ?? null;
  return existing.oldTarget.targetId === input.source.target.targetId
    && existing.newTarget.targetId === input.newTarget.targetId
    && existing.applicability === input.verifiedFix.applicability
    && canonicalize(existing.fixConsumption.verificationRefs)
      === canonicalize(input.verifiedFix.verificationEvidenceRefs)
    && existing.fixConsumption.appliedBy === input.dispositions.dispositionSet.proposedBy
    && canonicalize(existing.hostedTarget) === canonicalize(hostedTarget);
}

/** Persist one verified fix against an exact active Errand instead of a Work Unit Candidate. */
async function replayErrandResponse(
  source: ResolvedResponseSource,
  dispositions: ApprovedDispositionSet,
  newTarget: ReviewTarget,
  verifiedFix: z.infer<typeof RespondVerifiedFixSchema>,
  dispositionReportText: string,
  continuation: PerformedResponseContinuation,
  existing: ApprovedDispositionRecord,
  current: ReturnType<typeof currentApprovedDispositionNode>,
  dependencies: RespondCommandDependencies,
): Promise<z.infer<typeof RespondEnvelopeSchema>> {
  const header = { schemaVersion: 1, mode: "review-respond", diagnostics: [] } as const;
  if (current.errandFixResponse === null || current.fixAuthorization === null) {
    throw new RespondCommandError("corrupt-state", "Errand response replay lacks its recorded authorization");
  }
    if (!errandResponseMatches(current.errandFixResponse, {
      source,
      dispositions,
      newTarget,
      verifiedFix,
    })) {
      throw new RespondCommandError("invalid-input", "Errand response replay conflicts with the recorded response");
    }
    const { dispositionRecordRef } = await dependencies.dispositionStore.appendDispositionRecord(existing);
    await recordPerformedResponse(
      source,
      dispositions,
      newTarget.headSha,
      current.predecessorDispositionSetId,
      dependencies,
    );
    return RespondEnvelopeSchema.parse({
      ...header,
      state: "errand-current",
      nextAction: "continue-review",
      payload: {
        operationId: source.operationId,
        dispositionRecordRef,
        fixAuthorizationId: current.fixAuthorization.fixAuthorizationId,
        dispositionReportText,
        ...continuation,
      },
    });
}

async function persistErrandResponse(
  source: ResolvedResponseSource,
  dispositions: ApprovedDispositionSet,
  newTarget: ReviewTarget,
  verifiedFix: z.infer<typeof RespondVerifiedFixSchema>,
  dispositionReportText: string,
  continuation: PerformedResponseContinuation,
  dependencies: RespondCommandDependencies,
): Promise<z.infer<typeof RespondEnvelopeSchema>> {
  const [existing, activeErrand] = await Promise.all([
    dependencies.dispositionStore.readDispositionRecord(source.operationId),
    dependencies.resolveActiveErrand(),
  ]);
  const current = existing === null ? null : currentApprovedDispositionNode(existing);
  if (existing === null
    || current === null
    || existing.candidate !== null
    || existing.errand === null
    || activeErrand === null
    || canonicalize(existing.errand) !== canonicalize(activeErrand)
    || canonicalize(current.approvedDisposition) !== canonicalize(dispositions)
    || canonicalize(existing.source) !== canonicalize(source.source)
    || current.fixAuthorization === null) {
    throw new RespondCommandError(
      "invalid-input",
      "a verified fix without Candidate lineage requires the exact approved active Errand response record",
    );
  }
  const header = { schemaVersion: 1, mode: "review-respond", diagnostics: [] } as const;
  if (current.errandFixResponse !== null) {
    return replayErrandResponse(
      source, dispositions, newTarget, verifiedFix, dispositionReportText,
      continuation, existing, current, dependencies,
    );
  }
  const fixConsumption = consumeFixAuthorization({
    authorization: current.fixAuthorization,
    oldTarget: source.target,
    newTarget,
    appliedBy: dispositions.dispositionSet.proposedBy,
    consumedAt: dependencies.now(),
    verificationRefs: verifiedFix.verificationEvidenceRefs,
    priorConsumptions: [],
  });
  const record = validateApprovedDispositionRecordForResult(ApprovedDispositionRecordSchema.parse({
    ...existing,
    approvedDispositionLineage: existing.approvedDispositionLineage.map((node) => (
      node.approvedDisposition.dispositionSet.dispositionSetId === existing.currentDispositionSetId
        ? {
            ...node,
            errandFixResponse: {
              oldTarget: source.target,
              newTarget,
              applicability: verifiedFix.applicability,
              fixConsumption,
              hostedTarget: source.hostedAttempt?.target ?? null,
            },
          }
        : node
    )),
  }), source.result);
  const { dispositionRecordRef } = await dependencies.dispositionStore.appendDispositionRecord(record);
  await recordPerformedResponse(
    source,
    dispositions,
    newTarget.headSha,
    current.predecessorDispositionSetId,
    dependencies,
  );
  return RespondEnvelopeSchema.parse({
    ...header,
    state: "errand-advanced",
    nextAction: "continue-review",
    payload: {
      operationId: source.operationId,
      dispositionRecordRef,
      fixAuthorizationId: fixConsumption.fixAuthorizationId,
      dispositionReportText,
      ...continuation,
    },
  });
}

function deliveryMemberResponseMatches(
  existing: z.infer<typeof DeliveryMemberReviewFixResponseSchema>,
  input: {
    source: ResolvedResponseSource;
    currentTarget: ReviewTarget;
    hostedFixTarget: HostedTarget;
    dispositions: ApprovedDispositionSet;
    verifiedFix: z.infer<typeof RespondVerifiedFixSchema>;
  },
): boolean {
  const hosted = input.source.result.kind === "hosted";
  return existing.oldTarget.targetId === input.source.target.targetId
    && existing.newTarget.targetId === input.currentTarget.targetId
    && existing.applicability === input.verifiedFix.applicability
    && canonicalize(existing.fixConsumption.verificationRefs)
      === canonicalize(input.verifiedFix.verificationEvidenceRefs)
    && existing.fixConsumption.appliedBy === input.dispositions.dispositionSet.proposedBy
    && canonicalize(existing.hostedTarget)
      === canonicalize(hosted ? input.source.hostedAttempt?.target : null)
    && canonicalize(existing.hostedFixTarget)
      === canonicalize(hosted ? input.hostedFixTarget : null);
}

/** Replay one verified fix against the current coordinates of its exact delivery member. */
async function replayDeliveryMemberResponse(
  source: ResolvedResponseSource,
  dispositions: ApprovedDispositionSet,
  currentTarget: ReviewTarget,
  hostedFixTarget: HostedTarget,
  verifiedFix: z.infer<typeof RespondVerifiedFixSchema>,
  dispositionReportText: string,
  continuation: PerformedResponseContinuation,
  existing: ApprovedDispositionRecord,
  current: ReturnType<typeof currentApprovedDispositionNode>,
  hostedAttempt: ResolvedResponseSource["hostedAttempt"],
  dependencies: RespondCommandDependencies,
): Promise<z.infer<typeof RespondEnvelopeSchema>> {
  const header = { schemaVersion: 1, mode: "review-respond", diagnostics: [] } as const;
  const hostedSettlementPlan = projectHostedSettlementPlan(source, dispositions);
  if (current.deliveryMemberFixResponse === null || current.fixAuthorization === null) {
    throw new RespondCommandError("corrupt-state", "delivery-member replay lacks its recorded authorization");
  }
    if (!deliveryMemberResponseMatches(current.deliveryMemberFixResponse, {
      source,
      currentTarget,
      hostedFixTarget,
      dispositions,
      verifiedFix,
    })) {
      throw new RespondCommandError(
        "invalid-input",
        "delivery-member response replay conflicts with the recorded response",
      );
    }
    const { dispositionRecordRef } = await dependencies.dispositionStore.appendDispositionRecord(existing);
    await recordPerformedResponse(
      source,
      dispositions,
      currentTarget.headSha,
      current.predecessorDispositionSetId,
      dependencies,
    );
    if (hostedAttempt !== undefined && !hostedAttempt.settled) {
      await dependencies.bindHostedDisposition({
        operationId: hostedAttempt.operationId,
        attemptId: hostedAttempt.attemptId,
        dispositionSetId: dispositions.dispositionSet.dispositionSetId,
        findingDispositions: projectHostedDispositionBindings(source, dispositions),
      });
    }
    return RespondEnvelopeSchema.parse({
      ...header,
      state: "delivery-member-current",
      nextAction: "continue-review",
      payload: {
        operationId: source.operationId,
        dispositionRecordRef,
        fixAuthorizationId: current.fixAuthorization.fixAuthorizationId,
        currentTarget,
        hostedFixTarget,
        dispositionReportText,
        ...continuation,
        ...(hostedSettlementPlan === undefined ? {} : { hostedSettlementPlan }),
      },
    });
}

function approvedMemberFixRecordMatches(
  existing: ApprovedDispositionRecord,
  source: ResolvedResponseSource,
  dispositions: ApprovedDispositionSet,
  vehicle: NonNullable<ApprovedDispositionRecord["deliveryMember"]>,
): boolean {
  const current = currentApprovedDispositionNode(existing);
  return existing.candidate === null
    && existing.errand === null
    && existing.deliveryMember !== null
    && canonicalize(existing.deliveryMember) === canonicalize(vehicle)
    && canonicalize(current.approvedDisposition) === canonicalize(dispositions)
    && canonicalize(existing.source) === canonicalize(source.source)
    && current.fixAuthorization !== null;
}

async function persistDeliveryMemberResponse(
  source: ResolvedResponseSource,
  dispositions: ApprovedDispositionSet,
  currentTarget: ReviewTarget,
  hostedFixTarget: HostedTarget,
  verifiedFix: z.infer<typeof RespondVerifiedFixSchema>,
  dispositionReportText: string,
  continuation: PerformedResponseContinuation,
  dependencies: RespondCommandDependencies,
): Promise<z.infer<typeof RespondEnvelopeSchema>> {
  const existing = await dependencies.dispositionStore.readDispositionRecord(source.operationId);
  const hostedAttempt = source.hostedAttempt;
  const vehicle = hostedAttempt?.vehicle ?? source.deliveryAdmission?.vehicle;
  const hostedTarget = hostedAttempt?.target ?? source.deliveryAdmission?.target;
  if (vehicle === undefined || hostedTarget === undefined) {
    throw new RespondCommandError(
      "invalid-input",
      "a verified delivery-member fix requires its exact approved response record",
    );
  }
  if (existing === null || !approvedMemberFixRecordMatches(existing, source, dispositions, vehicle)) {
    throw new RespondCommandError(
      "invalid-input",
      "a verified delivery-member fix requires its exact approved response record",
    );
  }
  const current = currentApprovedDispositionNode(existing);
  if (current.fixAuthorization === null) throw new Error("approved member fix authorization disappeared");
  const header = { schemaVersion: 1, mode: "review-respond", diagnostics: [] } as const;
  const hostedSettlementPlan = projectHostedSettlementPlan(source, dispositions);
  if (current.deliveryMemberFixResponse !== null) {
    return replayDeliveryMemberResponse(
      source, dispositions, currentTarget, hostedFixTarget, verifiedFix,
      dispositionReportText, continuation, existing, current, hostedAttempt, dependencies,
    );
  }
  const fixConsumption = consumeFixAuthorization({
    authorization: current.fixAuthorization,
    oldTarget: source.target,
    newTarget: currentTarget,
    appliedBy: dispositions.dispositionSet.proposedBy,
    consumedAt: dependencies.now(),
    verificationRefs: verifiedFix.verificationEvidenceRefs,
    priorConsumptions: [],
  });
  const record = ApprovedDispositionRecordSchema.parse({
    ...existing,
    approvedDispositionLineage: existing.approvedDispositionLineage.map((node) => (
      node.approvedDisposition.dispositionSet.dispositionSetId === existing.currentDispositionSetId
        ? {
            ...node,
            deliveryMemberFixResponse: {
              oldTarget: source.target,
              newTarget: currentTarget,
              applicability: verifiedFix.applicability,
              fixConsumption,
              hostedTarget: source.result.kind === "hosted" ? hostedTarget : null,
              hostedFixTarget: source.result.kind === "hosted" ? hostedFixTarget : null,
            },
          }
        : node
    )),
  });
  const { dispositionRecordRef } = await dependencies.dispositionStore.appendDispositionRecord(record);
  await recordPerformedResponse(
    source,
    dispositions,
    currentTarget.headSha,
    current.predecessorDispositionSetId,
    dependencies,
  );
  return RespondEnvelopeSchema.parse({
    ...header,
    state: "delivery-member-advanced",
    nextAction: "continue-review",
    payload: {
      operationId: source.operationId,
      dispositionRecordRef,
      fixAuthorizationId: fixConsumption.fixAuthorizationId,
      currentTarget,
      hostedFixTarget,
      dispositionReportText,
      ...continuation,
      ...(hostedSettlementPlan === undefined ? {} : { hostedSettlementPlan }),
    },
  });
}

function staleTargetEnvelope(
  operationId: string,
  attemptedTarget: ReviewTarget,
  currentTarget: ReviewTarget,
): z.infer<typeof RespondEnvelopeSchema> {
  return RespondEnvelopeSchema.parse({
    schemaVersion: 1,
    mode: "review-respond",
    diagnostics: [],
    state: "stale-target",
    nextAction: "prepare-current-target",
    payload: { operationId, attemptedTarget, currentTarget },
  });
}

function supersessionRefusalEnvelope(input: {
  operationId: string;
  predecessorDispositionSetId: CanonicalDigest;
  reason:
    | "head-moved"
    | "unexpected-dirty-paths"
    | "predecessor-unavailable"
    | "predecessor-not-current"
    | "fix-consumed"
    | "dirty-paths-without-fix-authorization"
    | "successor-conflict"
    | "hosted-settlement-conflict";
  detail: string;
  attemptedTarget?: ReviewTarget;
  currentHeadSha?: string;
  unexpectedPaths?: readonly string[];
  currentDispositionSetId?: string;
}): z.infer<typeof RespondEnvelopeSchema> {
  return RespondEnvelopeSchema.parse({
    schemaVersion: 1,
    mode: "review-respond",
    diagnostics: [],
    state: "supersession-refused",
    nextAction: "stop",
    payload: input,
  });
}

async function candidatePerformedFixHead(
  source: ResolvedResponseSource,
  existing: ApprovedDispositionRecord,
  dispositions: ApprovedDispositionSet,
  dependencies: RespondCommandDependencies,
): Promise<string | null> {
  if (existing.candidate === null) return null;
  const lineage = await dependencies.readCandidateLineage(
    source.responseBinding?.candidate.target ?? source.target,
  );
  const responses = lineage === null ? [] : candidateReviewResponses(lineage.record).filter((response) =>
    response.dispositionId === dispositions.dispositionSet.dispositionSetId
    && response.candidateId === existing.candidate?.candidateId
    && response.approvedBy === dispositions.approval.approvedBy
    && response.appliedBy === dispositions.dispositionSet.proposedBy);
  return responses.length === 1 ? responses[0]?.newTarget.revision ?? null : null;
}

function recordedNonCandidateFixHead(
  source: ResolvedResponseSource,
  existing: ApprovedDispositionRecord,
  dispositions: ApprovedDispositionSet,
): string | null {
  const current = currentApprovedDispositionNode(existing);
  const response = current.deliveryMemberFixResponse ?? current.errandFixResponse;
  if (current.fixAuthorization === null || response === null
    || response.oldTarget.targetId !== source.target.targetId
    || response.fixConsumption.fixAuthorizationId !== current.fixAuthorization.fixAuthorizationId
    || response.fixConsumption.dispositionSetId !== dispositions.dispositionSet.dispositionSetId) {
    return null;
  }
  return response.newTarget.headSha;
}

async function approvedFixPerformedForReplay(
  source: ResolvedResponseSource,
  existing: ApprovedDispositionRecord,
  dispositions: ApprovedDispositionSet,
  dependencies: RespondCommandDependencies,
): Promise<boolean> {
  if (currentApprovedDispositionNode(existing).fixAuthorization === null) return false;
  const performedHead = existing.candidate === null
    ? recordedNonCandidateFixHead(source, existing, dispositions)
    : await candidatePerformedFixHead(source, existing, dispositions, dependencies);
  if (performedHead === null) return false;
  const performance = await dependencies.readResponsePerformance(source.result);
  return performance !== null
    && performance.producerId === source.result.producerId
    && performance.dispositionSetId === dispositions.dispositionSet.dispositionSetId
    && performance.originatingHeadSha === source.target.headSha
    && performance.producedHeadSha === performedHead;
}

/**
 * A local or frontline review leaves a durable operation to reduce once its response settles; a hosted attempt
 * leaves none, so its lane continues through the policy continuation or the change request's review status.
 */
function settledNextAction(source: ResolvedResponseSource): "reduce" | "continue-review" {
  return source.hostedAttempt === undefined ? "reduce" : "continue-review";
}

/** Replay only a durable, already performed approved response. */
async function settleApprovedReplay(
  source: ResolvedResponseSource,
  dispositions: ApprovedDispositionSet,
  dispositionReportText: string,
  dependencies: RespondCommandDependencies,
): Promise<z.infer<typeof RespondEnvelopeSchema>> {
  const existing = await dependencies.dispositionStore.readDispositionRecord(source.operationId);
  if (existing === null) {
    return RespondEnvelopeSchema.parse({
      schemaVersion: 1,
      mode: "review-respond",
      diagnostics: [],
      state: "missing-record",
      nextAction: "respond-again",
      payload: { operationId: source.operationId },
    });
  }
  if (canonicalize(currentApprovedDispositionNode(existing).approvedDisposition)
    !== canonicalize(dispositions)) {
    throw new RespondCommandError("corrupt-state", "conflicting approved disposition record");
  }
  if (dispositions.dispositionSet.findings.some(({ disposition }) => disposition === "fix")) {
    if (!await approvedFixPerformedForReplay(source, existing, dispositions, dependencies)) {
      return RespondEnvelopeSchema.parse({
        schemaVersion: 1,
        mode: "review-respond",
        diagnostics: [],
        state: "fix-not-performed",
        nextAction: "complete-verified-fix",
        payload: {
          operationId: source.operationId,
          dispositionSetId: dispositions.dispositionSet.dispositionSetId,
          approvedVerification: dispositions.dispositionSet.proposedVerification,
          interactionText: FIX_NOT_PERFORMED_INTERACTION_TEXT,
        },
      });
    }
  }
  const appended = await dependencies.dispositionStore.appendDispositionRecord(existing);
  return RespondEnvelopeSchema.parse({
    schemaVersion: 1,
    mode: "review-respond",
    diagnostics: [],
    state: "already-settled",
    nextAction: settledNextAction(source),
    payload: {
      operationId: source.operationId,
      dispositionRecordRef: appended.dispositionRecordRef,
      dispositionReportText,
    },
  });
}

/**
 * Validate one approved set, append its advisory record, and compose the response-first continuation.
 *
 * @param requestInput - Untrusted public response request.
 * @param dependencies - Durable source, policy, lane-progress, and response boundaries.
 * @returns The typed proposal, response, correction, or refusal envelope.
 */
export async function respondToReviewCommand(
  requestInput: unknown,
  dependencies: RespondCommandDependencies,
): Promise<z.infer<typeof RespondEnvelopeSchema>> {
  const request = RespondRequestSchema.parse(requestInput);
  let source: ResolvedResponseSource;
  try {
    source = request.source.kind === "attested-local"
      ? await resolveLocalSource(request.source, dependencies)
      : request.source.kind === "frontline"
        ? await resolveFrontlineSource(request.source, dependencies)
        : await resolveHostedSource(request.source, dependencies);
  } catch (error) {
    if (error instanceof RespondCommandError
      || (typeof error === "object" && error !== null && "code" in error
        && (error.code === "invalid-input" || error.code === "corrupt-state"))) {
      throw error;
    }
    throw new RespondCommandError(
      "corrupt-state",
      error instanceof Error ? error.message : "review response source cannot be validated",
    );
  }
  return dependencies.withOperationLock(
    laneContinuationOperationId({
      lane: source.result.kind === "frontline" ? "frontline" : "standard",
      repositoryId: source.repositoryId,
      headSha: source.target.headSha,
      lineage: source.result.admission.lineage,
    }),
    () => respondToResolvedReviewCommand(request, source, dependencies),
  );
}

async function withdrawConditionalResponseAuthority(
  withdrawal: {
    withdrawnBy: string;
    conditionalPassAuthorizationId: CanonicalDigest;
    dispositionSetId: CanonicalDigest;
  },
  source: ResolvedResponseSource,
  dependencies: RespondCommandDependencies,
): Promise<z.infer<typeof RespondEnvelopeSchema>> {
    if (withdrawal.withdrawnBy !== source.actors.approverIdentity) {
      return RespondEnvelopeSchema.parse({
        schemaVersion: 1,
        mode: "review-respond",
        diagnostics: [],
        state: "conditional-authority-withdrawal-refused",
        nextAction: "stop",
        payload: {
          operationId: source.operationId,
          authorizationId: withdrawal.conditionalPassAuthorizationId,
          dispositionSetId: withdrawal.dispositionSetId,
          reason: "foreign-authority",
          detail: "conditional pass withdrawal actor is not the active approval authority",
        },
      });
    }
    const result = await dependencies.withdrawConditionalNextPass({
      authorizationId: withdrawal.conditionalPassAuthorizationId,
      lane: source.result.kind === "frontline" ? "frontline" : "standard",
      repositoryId: source.repositoryId,
      headSha: source.target.headSha,
      lineage: source.result.admission.lineage,
      producerId: source.operationId,
      dispositionSetId: withdrawal.dispositionSetId,
      withdrawnBy: withdrawal.withdrawnBy,
    });
    if (result.state === "refused") {
      return RespondEnvelopeSchema.parse({
        schemaVersion: 1,
        mode: "review-respond",
        diagnostics: [],
        state: "conditional-authority-withdrawal-refused",
        nextAction: "stop",
        payload: {
          operationId: source.operationId,
          authorizationId: withdrawal.conditionalPassAuthorizationId,
          dispositionSetId: withdrawal.dispositionSetId,
          reason: result.reason,
          detail: result.detail,
        },
      });
    }
    return RespondEnvelopeSchema.parse({
      schemaVersion: 1,
      mode: "review-respond",
      diagnostics: [],
      state: "conditional-authority-withdrawn",
      nextAction: "stop",
      payload: {
        operationId: source.operationId,
        authorizationId: result.authorizationId,
        dispositionSetId: result.dispositionSetId,
        replayed: result.state === "already-withdrawn",
      },
    });
}

function projectProvisionalPassAssessment(input: {
  proposal: ProposedDispositionSet;
  lane: "frontline" | "standard";
  admittedLogicalPass: number;
  configuredMaxPasses: number;
}): z.infer<typeof ProvisionalPassAssessmentSchema> {
  const severityRank = { minor: 1, major: 2, critical: 3 } as const;
  let confirmedFindingCount = 0;
  let maxConfirmedSeverity: z.infer<typeof ReviewSeveritySchema> | null = null;
  for (const finding of input.proposal.dispositionSet.findings) {
    if (finding.sourceVerification !== "verified") continue;
    confirmedFindingCount += 1;
    if (maxConfirmedSeverity === null
      || severityRank[finding.verifiedSeverity] > severityRank[maxConfirmedSeverity]) {
      maxConfirmedSeverity = finding.verifiedSeverity;
    }
  }
  const capPosition = input.admittedLogicalPass < input.configuredMaxPasses
    ? "below-ceiling" as const
    : input.admittedLogicalPass === input.configuredMaxPasses
      ? "at-ceiling" as const
      : "above-ceiling" as const;
  const materialFix = fixesMaterialFinding(input.proposal.dispositionSet.findings);
  const potentialStopReason = materialFix && capPosition !== "below-ceiling"
    ? "cap-exhausted" as const
    : null;
  const proposedSignal = { confirmedFindingCount, maxConfirmedSeverity, materialFix };
  const severitySymbol = { minor: "🟡", major: "🟠", critical: "🔴" } as const;
  const signalText = maxConfirmedSeverity === null
    ? "No confirmed findings."
    : `${confirmedFindingCount} confirmed finding${confirmedFindingCount === 1 ? "" : "s"}, `
      + `highest ${severitySymbol[maxConfirmedSeverity]} ${maxConfirmedSeverity}.`;
  const positionText = { "below-ceiling": "", "at-ceiling": " (limit reached)", "above-ceiling": " (over the limit)" }[
    capPosition
  ];
  const stopText = potentialStopReason === null ? "" : " Another pass needs a ceiling decision.";
  const laneText = input.lane === "standard" ? "Standard" : "Frontline";
  return ProvisionalPassAssessmentSchema.parse({
    status: "provisional",
    lane: input.lane,
    admittedLogicalPass: input.admittedLogicalPass,
    configuredMaxPasses: input.configuredMaxPasses,
    proposedSignal,
    capPosition,
    potentialStopReason,
    nextPassAuthority: "none",
    summaryText: `${laneText} pass ${input.admittedLogicalPass} of ${input.configuredMaxPasses}${positionText}. `
      + `${signalText}${stopText}`,
  });
}

async function prepareResponseProposal(
  request: z.infer<typeof RespondProposalRequestSchema>,
  source: ResolvedResponseSource,
  supersession: z.infer<typeof RespondSupersessionSchema> | undefined,
  dependencies: RespondCommandDependencies,
): Promise<z.infer<typeof RespondEnvelopeSchema>> {
    if (supersession !== undefined) {
      const existing = await dependencies.dispositionStore.readDispositionRecord(source.operationId);
      if (existing === null) {
        return supersessionRefusalEnvelope({
          operationId: source.operationId,
          predecessorDispositionSetId: supersession.predecessorDispositionSetId,
          reason: "predecessor-unavailable",
          detail: "disposition successor predecessor is unavailable",
        });
      }
      validateApprovedDispositionRecordForResult(existing, source.result);
      const current = currentApprovedDispositionNode(existing);
      if (existing.currentDispositionSetId !== supersession.predecessorDispositionSetId) {
        return supersessionRefusalEnvelope({
          operationId: source.operationId,
          predecessorDispositionSetId: supersession.predecessorDispositionSetId,
          reason: "predecessor-not-current",
          detail: "disposition successor predecessor is not current",
          currentDispositionSetId: existing.currentDispositionSetId,
        });
      }
      if (current.errandFixResponse !== null || current.deliveryMemberFixResponse !== null) {
        return supersessionRefusalEnvelope({
          operationId: source.operationId,
          predecessorDispositionSetId: supersession.predecessorDispositionSetId,
          reason: "fix-consumed",
          detail: "disposition successor predecessor fix was already consumed",
        });
      }
      const lineage = await dependencies.readCandidateLineage(source.target);
      if (lineage !== null && candidateReviewResponses(lineage.record).some((response) =>
        response.dispositionId === supersession.predecessorDispositionSetId)) {
        return supersessionRefusalEnvelope({
          operationId: source.operationId,
          predecessorDispositionSetId: supersession.predecessorDispositionSetId,
          reason: "fix-consumed",
          detail: "disposition successor predecessor fix was already consumed",
        });
      }
      if (supersession.expectedFixPaths.length > 0 && current.fixAuthorization === null) {
        return supersessionRefusalEnvelope({
          operationId: source.operationId,
          predecessorDispositionSetId: supersession.predecessorDispositionSetId,
          reason: "dirty-paths-without-fix-authorization",
          detail: "record-only predecessor cannot authorize dirty fix paths",
        });
      }
    }
    const proposal = prepareDispositionProposal(request, source);
    const lane = source.result.kind === "frontline" ? "frontline" : "standard";
    const configured = await dependencies.readConfiguredLanePolicy(lane);
    const provisionalPassAssessment = projectProvisionalPassAssessment({
      proposal,
      lane,
      admittedLogicalPass: source.result.admission.logicalPass,
      configuredMaxPasses: configured.maxPasses,
    });
    return RespondEnvelopeSchema.parse({
      schemaVersion: 1,
      mode: "review-respond",
      diagnostics: [],
      state: "awaiting-approval",
      nextAction: "obtain-approval",
      payload: {
        operationId: source.operationId,
        proposal,
        ...(supersession === undefined ? {} : { supersession }),
        dispositionReportText: renderDispositionReport({
          dispositionSet: proposal.dispositionSet,
          producerFindings: source.findings,
        }),
        provisionalPassAssessment,
      },
    });
}

async function persistVerifiedReviewFix(
  source: ResolvedResponseSource,
  dispositions: ApprovedDispositionSet,
  verifiedFix: z.infer<typeof RespondVerifiedFixSchema>,
  changedTarget: ReviewTarget,
  deliveryMemberFixTarget: { currentTarget: ReviewTarget; hostedFixTarget: HostedTarget } | null,
  recordedFix: ApprovedDispositionRecord | null,
  dispositionReportText: string,
  dependencies: RespondCommandDependencies,
): Promise<z.infer<typeof RespondEnvelopeSchema>> {
    if (recordedFix === null) {
      throw new RespondCommandError("invalid-input", "a verified fix requires its exact approved response record");
    }
    const approvedNode = currentApprovedDispositionNode(recordedFix);
    if (canonicalize(approvedNode.approvedDisposition) !== canonicalize(dispositions)) {
      throw new RespondCommandError("invalid-input", "a verified fix requires its exact approved response record");
    }
    if (approvedNode.policyProjectionPending === true) {
      throw new RespondCommandError(
        "invalid-input",
        "approved response policy projection is pending; replay the approved response before submitting its verified fix",
      );
    }
    const policyRequest = approvedNode.responsePolicyRequest;
    const conditionalPassAuthorizationId = policyRequest.ceilingOverride
      ?.conditionalPassAuthorizationId;
    const performedResponseContinuation: PerformedResponseContinuation = {
      policyRequest,
      ...(conditionalPassAuthorizationId === undefined
        ? {}
        : { conditionalPassAuthorizationId }),
    };
    const settlement = projectApprovedResponse(source, dispositions, {
      candidateTarget: changedTarget,
      verificationEvidenceRefs: verifiedFix.verificationEvidenceRefs,
    });
    if (settlement.state !== "ready-to-persist") {
      throw new RespondCommandError(
        "invalid-input",
        `a verified fix produced unsupported state '${settlement.state}'`,
      );
    }
    if (deliveryMemberFixTarget !== null) {
      return persistDeliveryMemberResponse(
        source,
        dispositions,
        deliveryMemberFixTarget.currentTarget,
        deliveryMemberFixTarget.hostedFixTarget,
        verifiedFix,
        dispositionReportText,
        performedResponseContinuation,
        dependencies,
      );
    }
    if (recordedFix.candidate === null) {
      return persistErrandResponse(
        source,
        dispositions,
        changedTarget,
        verifiedFix,
        dispositionReportText,
        performedResponseContinuation,
        dependencies,
      );
    }
    return persistCandidateResponse(
      source,
      dispositions,
      verifiedFix,
      dispositionReportText,
      performedResponseContinuation,
      dependencies,
    );
}

async function confirmResponseTarget(
  source: ResolvedResponseSource,
  supersession: z.infer<typeof RespondSupersessionSchema> | undefined,
  dependencies: RespondCommandDependencies,
): Promise<
  | { kind: "confirmed"; confirmation: LocalTargetConfirmation }
  | { kind: "refused"; envelope: z.infer<typeof RespondEnvelopeSchema> }
> {
  if (supersession === undefined) {
    return { kind: "confirmed" as const, confirmation: await dependencies.confirmTarget(source.target) };
  } else {
    if (source.target.kind === "delivery-member" && supersession.expectedFixPaths.length === 0) {
      const pinned = await dependencies.confirmPinnedDeliveryMemberTarget(source.result);
      if (pinned === null || pinned.targetId !== source.target.targetId) {
        return { kind: "refused" as const, envelope: supersessionRefusalEnvelope({
          operationId: source.operationId,
          predecessorDispositionSetId: supersession.predecessorDispositionSetId,
          reason: "head-moved",
          detail: "disposition successor requires the exact planned delivery-member target",
          attemptedTarget: source.target,
          currentHeadSha: pinned?.headSha ?? source.target.headSha,
        }) };
      }
      return { kind: "confirmed" as const, confirmation: { state: "current", target: pinned } };
    }
    const correctionConfirmation = await dependencies.confirmCorrectionTarget(
      source.target,
      supersession.expectedFixPaths,
    );
    if (correctionConfirmation.state === "stale-head") {
      return { kind: "refused" as const, envelope: supersessionRefusalEnvelope({
        operationId: source.operationId,
        predecessorDispositionSetId: supersession.predecessorDispositionSetId,
        reason: "head-moved",
        detail: "disposition successor requires the unchanged reviewed head",
        attemptedTarget: correctionConfirmation.attemptedTarget,
        currentHeadSha: correctionConfirmation.currentHeadSha,
      }) };
    }
    if (correctionConfirmation.state === "unexpected-dirty-paths") {
      return { kind: "refused" as const, envelope: supersessionRefusalEnvelope({
        operationId: source.operationId,
        predecessorDispositionSetId: supersession.predecessorDispositionSetId,
        reason: "unexpected-dirty-paths",
        detail: `disposition successor found unrelated dirty paths: ${correctionConfirmation.unexpectedPaths.join(", ")}`,
        unexpectedPaths: correctionConfirmation.unexpectedPaths,
      }) };
    }
    return { kind: "confirmed" as const, confirmation: { state: "current" as const, target: correctionConfirmation.target } };
  }
}

async function resolveBoundMemberFixTarget(
  source: ResolvedResponseSource,
  dependencies: RespondCommandDependencies,
): Promise<{ currentTarget: ReviewTarget; hostedFixTarget: HostedTarget } | null> {
  const vehicle = source.hostedAttempt?.vehicle ?? source.deliveryAdmission?.vehicle;
  const hostedTarget = source.hostedAttempt?.target ?? source.deliveryAdmission?.target;
  if (vehicle === undefined || hostedTarget === undefined) return null;
  const target = await dependencies.resolveDeliveryMemberFixTarget({
    vehicle,
    originatingTarget: source.target,
    hostedTarget,
  });
  if (target === null) {
    throw new RespondCommandError(
      "invalid-input",
      "the authoritative current delivery-member target is unavailable or no longer matches the hosted request",
    );
  }
  return target;
}

async function resolveCandidateBoundFix(
  source: ResolvedResponseSource,
  recordedFix: ApprovedDispositionRecord | null,
  verifiedFix: z.infer<typeof RespondVerifiedFixSchema> | undefined,
  dependencies: RespondCommandDependencies,
): Promise<CandidateLineageBinding | null> {
  if (verifiedFix === undefined || recordedFix?.candidate === null || recordedFix?.candidate === undefined
    || source.hostedAttempt?.vehicle !== undefined || source.deliveryAdmission?.vehicle !== undefined) return null;
  return dependencies.readCandidateLineage(source.responseBinding?.candidate.target ?? source.target);
}

async function resolveVerifiedFixTarget(
  source: ResolvedResponseSource,
  confirmation: LocalTargetConfirmation,
  verifiedFix: z.infer<typeof RespondVerifiedFixSchema> | undefined,
  dependencies: RespondCommandDependencies,
): Promise<{
  recordedFix: ApprovedDispositionRecord | null;
  currentTarget: ReviewTarget;
  changedTarget: ReviewTarget | null;
  deliveryMemberFixTarget: { currentTarget: ReviewTarget; hostedFixTarget: HostedTarget } | null;
}> {
  const recordedFix = verifiedFix === undefined
    ? null
    : await dependencies.dispositionStore.readDispositionRecord(source.operationId);
  if (verifiedFix !== undefined && recordedFix === null) {
    throw new RespondCommandError(
      "invalid-input",
      "a verified fix requires its exact approved response record",
    );
  }
  const currentTarget = confirmation.state === "stale-target"
    ? confirmation.currentTarget
    : confirmation.target;
  // A landed fix moves the head, so the settlement pass expects the stale reading its approval pass
  // treats as a dead end. An unchanged head means no fix landed and there is nothing to attest.
  let changedTarget = confirmation.state === "stale-target" ? confirmation.currentTarget : null;
  const deliveryMemberFixTarget = verifiedFix === undefined
    ? null
    : await resolveBoundMemberFixTarget(source, dependencies);
  if (deliveryMemberFixTarget !== null) {
    changedTarget = deliveryMemberFixTarget.currentTarget.targetId === source.target.targetId
      ? null : deliveryMemberFixTarget.currentTarget;
  }
  const candidateBoundFix = await resolveCandidateBoundFix(source, recordedFix, verifiedFix, dependencies);
  if (candidateBoundFix !== null) {
    const reviewedCandidateTarget = source.responseBinding?.candidate.target ?? source.target;
    changedTarget = candidateBoundFix.candidateFixTarget.targetId === reviewedCandidateTarget.targetId
      ? null : candidateBoundFix.candidateFixTarget;
  }
  if (verifiedFix !== undefined && changedTarget === null) throw new UnchangedVerifiedFixTargetError();
  return { recordedFix, currentTarget, changedTarget, deliveryMemberFixTarget };
}

async function resolveResponsePosition(
  source: ResolvedResponseSource,
  confirmation: LocalTargetConfirmation,
  verifiedFix: z.infer<typeof RespondVerifiedFixSchema> | undefined,
  settledFixTarget: ReviewTarget | undefined,
  dependencies: RespondCommandDependencies,
): Promise<
  | { kind: "refused"; envelope: z.infer<typeof RespondEnvelopeSchema> }
  | {
      kind: "resolved";
      recordedFix: ApprovedDispositionRecord | null;
      changedTarget: ReviewTarget | null;
      deliveryMemberFixTarget: { currentTarget: ReviewTarget; hostedFixTarget: HostedTarget } | null;
      unchangedCandidateLineage: CandidateLineageBinding | null;
    }
> {
  const { recordedFix, currentTarget, changedTarget, deliveryMemberFixTarget } = await resolveVerifiedFixTarget(
    source, confirmation, verifiedFix, dependencies,
  );
  let unchangedCandidateLineage: CandidateLineageBinding | null = null;
  // A replay pins the head the response settled at, not the originating review target, which later
  // ceremony writes may have left stale even when the response authorized no fix.
  if (settledFixTarget !== undefined && currentTarget.targetId !== settledFixTarget.targetId) {
    return { kind: "refused" as const, envelope: staleTargetEnvelope(source.operationId, settledFixTarget, currentTarget) };
  }
  if (confirmation.state === "stale-target" && verifiedFix === undefined && settledFixTarget === undefined) {
    const lineage = await dependencies.readCandidateLineage(
      source.responseBinding?.candidate.target ?? source.target,
    );
    const currentness = lineage === null
      ? null
      : projectEffectiveCandidateCurrentness(lineage.effective);
    if (currentness === null || !("status" in currentness) || currentness.status !== "current") {
      return { kind: "refused" as const, envelope: staleTargetEnvelope(source.operationId, confirmation.attemptedTarget, confirmation.currentTarget) };
    }
    // Lifecycle ceremony may commit around an unchanged Candidate after its review target was minted.
    // The managed Candidate subject, not the stale whole-repository target, is authoritative for whether
    // that operational-only head move invalidates the approved response.
    unchangedCandidateLineage = lineage;
  }
  return { kind: "resolved", recordedFix, changedTarget, deliveryMemberFixTarget, unchangedCandidateLineage };
}

async function resolveCandidateMemberAuthoring(
  source: ResolvedResponseSource,
  lineage: CandidateLineageBinding | null,
  plan: ReturnType<typeof projectApprovedResponse>,
  dependencies: RespondCommandDependencies,
): Promise<
  | { kind: "ready"; authoring: CandidateBoundMemberFixAuthoring | null }
  | { kind: "refused"; envelope: z.infer<typeof RespondEnvelopeSchema> }
> {
  const requiresCandidateMemberAuthoring = plan.state === "ready-to-fix"
    && source.responseBinding !== undefined;
  let candidateMemberAuthoring: CandidateBoundMemberFixAuthoring | null = null;
  if (requiresCandidateMemberAuthoring && lineage === null) {
    throw new RespondCommandError(
      "corrupt-state",
      "Candidate-bound delivery-member fix authoring requires the active work-unit checkout.",
    );
  }
  if (requiresCandidateMemberAuthoring && lineage !== null) {
    const binding = source.responseBinding?.candidate;
    if (binding === undefined
      || binding.workUnit !== lineage.workUnit
      || binding.candidateId !== lineage.record.attestation.candidateId
      || binding.target.headSha !== lineage.reviewed.recognizedTarget.revision) {
      throw new RespondCommandError(
        "corrupt-state",
        "Candidate-bound delivery-member fix authoring does not match its managed Candidate lineage.",
      );
    }
    const currentness = projectEffectiveCandidateCurrentness(lineage.effective);
    if (!("status" in currentness) || currentness.status !== "current") {
      return { kind: "refused" as const, envelope: staleTargetEnvelope(source.operationId, binding.target, lineage.candidateFixTarget) };
    }
    if (currentness.recognizedRevision !== lineage.candidateFixTarget.headSha) {
      throw new RespondCommandError(
        "corrupt-state",
        "Candidate-bound delivery-member fix authoring resolved inconsistent current Candidate heads.",
      );
    }
    if (lineage.unstagedReviewablePaths.length > 0) {
      throw new RespondCommandError(
        "invalid-input",
        "Candidate-bound delivery-member fix authoring requires no unstaged reviewable paths; found: "
          + lineage.unstagedReviewablePaths.join(", "),
      );
    }
    candidateMemberAuthoring = await dependencies.resolveCandidateFixAuthoring({
      workUnit: lineage.workUnit,
      expectedHead: currentness.recognizedRevision,
    });
  }
  if (requiresCandidateMemberAuthoring && candidateMemberAuthoring === null) {
    throw new RespondCommandError(
      "corrupt-state",
      "Candidate-bound delivery-member fix authoring requires the active work-unit checkout.",
    );
  }
  return { kind: "ready", authoring: candidateMemberAuthoring };
}

async function appendAndResolveApprovedPolicy(
  record: ApprovedDispositionRecord,
  policyRequestToResolve: ReviewPolicyCommandRequest,
  recordedPolicyRequest: ReviewPolicyCommandRequest,
  target: ReviewTarget,
  dependencies: Pick<RespondCommandDependencies, "dispositionStore" | "resolvePolicy">,
) {
  let appended = await dependencies.dispositionStore.appendDispositionRecord(record);
  const policy = await dependencies.resolvePolicy(policyRequestToResolve, target);
  if (currentApprovedDispositionNode(record).policyProjectionPending === true) {
    const resolved = ApprovedDispositionRecordSchema.parse({
      ...record,
      approvedDispositionLineage: record.approvedDispositionLineage.map((node) => {
        if (node.approvedDisposition.dispositionSet.dispositionSetId
          !== record.currentDispositionSetId) return node;
        const settled = { ...node, responsePolicyRequest: recordedPolicyRequest };
        delete settled.policyProjectionPending;
        return settled;
      }),
    });
    appended = await dependencies.dispositionStore.appendDispositionRecord(resolved);
  }
  return { appended, policy };
}

async function settleNewApprovedResponse(
  request: z.infer<typeof RespondApprovedRequestSchema>,
  source: ResolvedResponseSource,
  dispositions: ApprovedDispositionSet,
  dispositionReportText: string,
  unchangedCandidateLineage: CandidateLineageBinding | null,
  dependencies: RespondCommandDependencies,
): Promise<z.infer<typeof RespondEnvelopeSchema>> {
  validateApprovedResponsePolicyBinding(request.policyRequest, source);
  const supersession = request.supersedes;
  const conditionalAuthorization = request.conditionalNextPassAuthorization;
  const plan = projectApprovedResponse(source, dispositions);
  if (plan.state !== "ready-to-fix" && plan.state !== "ready-to-close") {
    throw new RespondCommandError("corrupt-state", `approved response produced unsupported state '${plan.state}'`);
  }
  const frontlineFollowUp = source.frontlineOutcome === undefined
    ? undefined
    : projectFrontlineFollowUpAdvice({
        outcome: source.frontlineOutcome,
        dispositionState: dispositions,
      });
  const deliveryMember = source.responseBinding?.deliveryMember
    ?? source.hostedAttempt?.vehicle
    ?? source.deliveryAdmission?.vehicle
    ?? null;
  const lineage = source.responseBinding === undefined && deliveryMember !== null
    ? null
    : unchangedCandidateLineage ?? await dependencies.readCandidateLineage(
        source.responseBinding?.candidate.target ?? source.target,
      );
  const errand = lineage === null && deliveryMember === null
    ? await dependencies.resolveActiveErrand()
    : null;
  const authoringResolution = await resolveCandidateMemberAuthoring(source, lineage, plan, dependencies);
  if (authoringResolution.kind === "refused") return authoringResolution.envelope;
  const candidateMemberAuthoring = authoringResolution.authoring;
  const existing = await dependencies.dispositionStore.readDispositionRecord(source.operationId);
  const expectedConditionalAuthorizationId = conditionalAuthorization === undefined
    ? undefined
    : computeConditionalPassAuthorizationId({
        authorizedBy: conditionalAuthorization.authorizedBy,
        repositoryId: source.repositoryId,
        lane: request.policyRequest.lane,
        lineage: source.result.admission.lineage,
        producerId: source.operationId,
        dispositionSetId: dispositions.dispositionSet.dispositionSetId,
        originatingHeadSha: source.target.headSha,
        exhaustedPassCount: conditionalAuthorization.exhaustedPassCount,
        nextPass: conditionalAuthorization.nextPass,
      });
  const responsePolicyRequest = expectedConditionalAuthorizationId === undefined
    ? request.policyRequest
    : ReviewPolicyCommandRequestSchema.parse({
        ...request.policyRequest,
        ceilingOverride: request.policyRequest.ceilingOverride === undefined
          ? undefined
          : {
              ...request.policyRequest.ceilingOverride,
              conditionalPassAuthorizationId: expectedConditionalAuthorizationId,
            },
      });
  const initialNode = {
    approvedDisposition: dispositions,
    responsePolicyRequest,
    policyProjectionPending: true as const,
    fixAuthorization: plan.fixAuthorization,
    errandFixResponse: null,
    deliveryMemberFixResponse: null,
    predecessorDispositionSetId: null,
    successorDispositionSetId: null,
  };
  let record: ApprovedDispositionRecord;
  let supersessionReplay = false;
  if (supersession === undefined) {
    if (existing !== null
      && canonicalize(currentApprovedDispositionNode(existing).approvedDisposition)
        !== canonicalize(dispositions)) {
      throw new RespondCommandError("corrupt-state", "conflicting approved disposition record");
    }
    if (existing !== null) {
      const current = currentApprovedDispositionNode(existing);
      if (current.policyProjectionPending !== true
        && canonicalize(current.responsePolicyRequest) !== canonicalize(responsePolicyRequest)) {
        throw new RespondCommandError(
          "invalid-input",
          "approved response already resolved a different policy request; replay its exact policy request",
        );
      }
    }
    record = ApprovedDispositionRecordSchema.parse({
      schemaVersion: 1,
      semanticsVersion: "review-advisory/v1",
      repositoryId: source.repositoryId,
      operationId: source.operationId,
      candidate: lineage === null
        ? null
        : {
            workUnit: lineage.workUnit,
            candidateId: lineage.record.attestation.candidateId,
          },
      errand,
      deliveryMember,
      source: source.source,
      currentDispositionSetId: dispositions.dispositionSet.dispositionSetId,
      approvedDispositionLineage: existing?.approvedDispositionLineage ?? [initialNode],
    });
    if (existing !== null && canonicalize(existing) !== canonicalize(record)
      && !isExactDeliveryMemberBindingAdvance(existing, record)) {
      throw new RespondCommandError("corrupt-state", "conflicting approved disposition record");
    }
  } else {
    if (existing === null) {
      return supersessionRefusalEnvelope({
        operationId: source.operationId,
        predecessorDispositionSetId: supersession.predecessorDispositionSetId,
        reason: "predecessor-unavailable",
        detail: "disposition successor predecessor is unavailable",
      });
    }
    validateApprovedDispositionRecordForResult(existing, source.result);
    const successorDispositionSetId = dispositions.dispositionSet.dispositionSetId;
    const existingCurrent = currentApprovedDispositionNode(existing);
    if (existingCurrent.policyProjectionPending === true
      && existing.currentDispositionSetId !== dispositions.dispositionSet.dispositionSetId) {
      throw new RespondCommandError(
        "invalid-input",
        "approved predecessor policy projection is pending; replay its approved response before superseding it",
      );
    }
    if (existing.currentDispositionSetId === successorDispositionSetId) {
      if (existingCurrent.predecessorDispositionSetId !== supersession.predecessorDispositionSetId
        || canonicalize(existingCurrent.approvedDisposition) !== canonicalize(dispositions)) {
        return supersessionRefusalEnvelope({
          operationId: source.operationId,
          predecessorDispositionSetId: supersession.predecessorDispositionSetId,
          reason: "successor-conflict",
          detail: "disposition successor replay conflicts with current state",
          currentDispositionSetId: existing.currentDispositionSetId,
        });
      }
      if (existingCurrent.policyProjectionPending !== true
        && canonicalize(existingCurrent.responsePolicyRequest) !== canonicalize(responsePolicyRequest)) {
        throw new RespondCommandError(
          "invalid-input",
          "approved successor already resolved a different policy request; replay its exact policy request",
        );
      }
      record = existing;
      supersessionReplay = true;
    } else {
      if (existing.currentDispositionSetId !== supersession.predecessorDispositionSetId) {
        return supersessionRefusalEnvelope({
          operationId: source.operationId,
          predecessorDispositionSetId: supersession.predecessorDispositionSetId,
          reason: "predecessor-not-current",
          detail: "disposition successor predecessor is not current",
          currentDispositionSetId: existing.currentDispositionSetId,
        });
      }
      if (existingCurrent.errandFixResponse !== null || existingCurrent.deliveryMemberFixResponse !== null) {
        return supersessionRefusalEnvelope({
          operationId: source.operationId,
          predecessorDispositionSetId: supersession.predecessorDispositionSetId,
          reason: "fix-consumed",
          detail: "disposition successor predecessor fix was already consumed",
        });
      }
      if (lineage !== null && candidateReviewResponses(lineage.record).some((response) =>
        response.dispositionId === supersession.predecessorDispositionSetId)) {
        return supersessionRefusalEnvelope({
          operationId: source.operationId,
          predecessorDispositionSetId: supersession.predecessorDispositionSetId,
          reason: "fix-consumed",
          detail: "disposition successor predecessor fix was already consumed",
        });
      }
      const historical = existing.approvedDispositionLineage.map((node) => (
        node.approvedDisposition.dispositionSet.dispositionSetId === supersession.predecessorDispositionSetId
          ? { ...node, successorDispositionSetId }
          : node
      ));
      record = ApprovedDispositionRecordSchema.parse({
        ...existing,
        currentDispositionSetId: successorDispositionSetId,
        approvedDispositionLineage: [...historical, {
          ...initialNode,
          predecessorDispositionSetId: supersession.predecessorDispositionSetId,
        }],
      });
    }
  }
  const hostedSupersessionInput = supersession === undefined || source.hostedAttempt === undefined
    ? undefined
    : {
        operationId: source.hostedAttempt.operationId,
        attemptId: source.hostedAttempt.attemptId,
        predecessorDispositionSetId: supersession.predecessorDispositionSetId,
        successorDispositionSetId: dispositions.dispositionSet.dispositionSetId,
        findingDispositions: projectHostedDispositionBindings(source, dispositions),
      };
  const conditionalSupersessionInput = supersession === undefined
    ? undefined
    : {
        lane: request.policyRequest.lane,
        repositoryId: source.repositoryId,
        headSha: source.target.headSha,
        lineage: source.result.admission.lineage,
        producerId: source.operationId,
        dispositionSetId: supersession.predecessorDispositionSetId,
        successorDispositionSetId: dispositions.dispositionSet.dispositionSetId,
      };
  const conditionalPreflight = conditionalSupersessionInput === undefined
    ? undefined
    : await dependencies.preflightConditionalNextPassInvalidation(conditionalSupersessionInput);
  if (supersession !== undefined && conditionalPreflight?.state === "refused") {
    return supersessionRefusalEnvelope({
      operationId: source.operationId,
      predecessorDispositionSetId: supersession.predecessorDispositionSetId,
      reason: conditionalPreflight.reason,
      detail: conditionalPreflight.detail,
    });
  }
  const hostedPreflight = hostedSupersessionInput === undefined
    ? undefined
    : await dependencies.preflightHostedDisposition(hostedSupersessionInput);
  if (supersession !== undefined && hostedPreflight?.state === "refused") {
    return supersessionRefusalEnvelope({
      operationId: source.operationId,
      predecessorDispositionSetId: supersession.predecessorDispositionSetId,
      reason: hostedPreflight.reason,
      detail: hostedPreflight.detail,
    });
  }
  const { appended, policy } = await appendAndResolveApprovedPolicy(
    record, request.policyRequest, responsePolicyRequest, source.target, dependencies,
  );
  if (conditionalSupersessionInput !== undefined) {
    await dependencies.invalidateConditionalNextPass(conditionalSupersessionInput);
  }
  const capturedConditionalAuthorization = conditionalAuthorization === undefined
    ? undefined
    : await dependencies.captureConditionalNextPass({
        lane: request.policyRequest.lane,
        repositoryId: source.repositoryId,
        headSha: source.target.headSha,
        lineage: source.result.admission.lineage,
        producerId: source.operationId,
        dispositionSetId: dispositions.dispositionSet.dispositionSetId,
        authorizedBy: conditionalAuthorization.authorizedBy,
        exhaustedPassCount: conditionalAuthorization.exhaustedPassCount,
        nextPass: conditionalAuthorization.nextPass,
      });
  if (capturedConditionalAuthorization !== undefined
    && capturedConditionalAuthorization.authorizationId !== expectedConditionalAuthorizationId) {
    throw new RespondCommandError(
      "corrupt-state",
      "captured conditional pass authorization does not match the durable response continuation",
    );
  }
  const policyRequest = responsePolicyRequest;
  const policyContinuation = { policyRequest, policy };
  const hostedSupersessionResolution = hostedSupersessionInput === undefined
    ? undefined
    : await dependencies.supersedeHostedDisposition(hostedSupersessionInput);
  if (supersession !== undefined && hostedSupersessionResolution?.state === "refused") {
    return supersessionRefusalEnvelope({
      operationId: source.operationId,
      predecessorDispositionSetId: supersession.predecessorDispositionSetId,
      reason: hostedSupersessionResolution.reason,
      detail: hostedSupersessionResolution.detail,
    });
  }
  const hostedSupersession = hostedSupersessionResolution?.state === "advanced"
    ? hostedSupersessionResolution
    : undefined;
  if (supersession === undefined && source.hostedAttempt !== undefined && !source.hostedAttempt.settled) {
    await dependencies.bindHostedDisposition({
      operationId: source.hostedAttempt.operationId,
      attemptId: source.hostedAttempt.attemptId,
      dispositionSetId: dispositions.dispositionSet.dispositionSetId,
      findingDispositions: projectHostedDispositionBindings(source, dispositions),
    });
  }
  const supersessionResult = supersession === undefined
    ? undefined
    : {
        status: supersessionReplay ? "replayed" as const : "published" as const,
        predecessorDispositionSetId: supersession.predecessorDispositionSetId,
        successorDispositionSetId: dispositions.dispositionSet.dispositionSetId,
        carriedFindingIds: [...hostedSupersession?.carriedFindingIds ?? []],
        reopenedFindingIds: [...hostedSupersession?.reopenedFindingIds ?? []],
      };
  if (source.hostedAttempt === undefined && plan.state === "ready-to-close") {
    await dependencies.settleLaneFindings({
      lane: source.frontlineOutcome === undefined ? "standard" : "frontline",
      repositoryId: source.repositoryId,
      headSha: source.target.headSha,
      ...(source.laneLineage === undefined ? {} : { lineage: source.laneLineage }),
      attemptId: source.operationId,
      dispositionSetId: dispositions.dispositionSet.dispositionSetId,
      ...(supersession === undefined
        ? {}
        : { predecessorDispositionSetId: supersession.predecessorDispositionSetId }),
      producedHeadSha: source.target.headSha,
    });
  }
  const alreadySettled = supersession === undefined ? existing !== null : supersessionReplay;
  const hostedSettlementPlan = projectHostedSettlementPlan(
    source,
    dispositions,
    hostedSupersession?.carriedFindingIds,
  );
  if (plan.state === "ready-to-fix" && deliveryMember !== null && lineage === null) {
    const repository = source.hostedAttempt?.target.repository ?? source.deliveryAdmission?.target.repository;
    if (repository === undefined || plan.fixAuthorization === null) {
      throw new RespondCommandError(
        "corrupt-state",
        "delivery-member fix response is missing its repository target or fix authorization",
      );
    }
    return RespondEnvelopeSchema.parse({
      schemaVersion: 1,
      mode: "review-respond",
      diagnostics: [],
      state: "delivery-correction-required",
      nextAction: "continue-delivery-correction",
      payload: {
        operationId: source.operationId,
        dispositionRecordRef: appended.dispositionRecordRef,
        fixAuthorization: plan.fixAuthorization,
        deliveryMember,
        dispositionReportText,
        ...policyContinuation,
        ...(supersessionResult === undefined ? {} : { supersession: supersessionResult }),
        ...(capturedConditionalAuthorization === undefined
          ? {}
          : { conditionalPassAuthorizationId: capturedConditionalAuthorization.authorizationId }),
        correctionAction: {
          argv: ["arc", "delivery", "review-fix", "continue", "-"],
          input: { repository, remote: "origin" },
        },
        ...(hostedSettlementPlan === undefined ? {} : { hostedSettlementPlan }),
      },
    });
  }
  if (plan.state === "ready-to-close"
    && source.hostedAttempt !== undefined
    && (!source.hostedAttempt.settled || (hostedSupersession?.reopenedFindingIds.length ?? 0) > 0)
    && hostedSettlementPlan !== undefined
    && hostedSettlementPlan.beforeFixFindingIds.length > 0) {
    return RespondEnvelopeSchema.parse({
      schemaVersion: 1,
      mode: "review-respond",
      diagnostics: [],
      state: "ready-to-settle",
      nextAction: "settle-hosted",
      payload: {
        operationId: source.operationId,
        dispositionRecordRef: appended.dispositionRecordRef,
        dispositionReportText,
        ...policyContinuation,
        ...(supersessionResult === undefined ? {} : { supersession: supersessionResult }),
        ...(capturedConditionalAuthorization === undefined
          ? {}
          : { conditionalPassAuthorizationId: capturedConditionalAuthorization.authorizationId }),
        hostedSettlementPlan,
      },
    });
  }
  return RespondEnvelopeSchema.parse({
    schemaVersion: 1,
    mode: "review-respond",
    diagnostics: [],
    state: plan.state === "ready-to-fix" ? "ready-to-fix" : alreadySettled ? "already-settled" : "settled",
    nextAction: plan.state === "ready-to-fix" ? "apply-fix" : settledNextAction(source),
    payload: {
      operationId: source.operationId,
      dispositionRecordRef: appended.dispositionRecordRef,
      dispositionReportText,
      ...policyContinuation,
      ...(supersessionResult === undefined ? {} : { supersession: supersessionResult }),
      ...(capturedConditionalAuthorization === undefined
        ? {}
        : { conditionalPassAuthorizationId: capturedConditionalAuthorization.authorizationId }),
      ...(plan.fixAuthorization === null ? {} : { fixAuthorization: plan.fixAuthorization }),
      ...(plan.fixAuthorization === null
        ? {}
        : {
            reentryCommand: "respond-verified-fix",
          }),
      ...(frontlineFollowUp === undefined ? {} : { frontlineFollowUp }),
      ...(hostedSettlementPlan === undefined ? {} : { hostedSettlementPlan }),
      ...(candidateMemberAuthoring === null ? {} : { authoring: candidateMemberAuthoring }),
    },
  });
}

async function respondToResolvedReviewCommand(
  request: z.infer<typeof RespondRequestSchema>,
  source: ResolvedResponseSource,
  dependencies: RespondCommandDependencies,
): Promise<z.infer<typeof RespondEnvelopeSchema>> {
  const verifiedFix = "verifiedFix" in request ? request.verifiedFix : undefined;
  const settledFixTarget = "settledFixTarget" in request ? request.settledFixTarget : undefined;
  const supersession = "supersedes" in request ? request.supersedes : undefined;
  if ("conditionalNextPassWithdrawal" in request) {
    return withdrawConditionalResponseAuthority(request.conditionalNextPassWithdrawal, source, dependencies);
  }
  if ("proposal" in request && supersession === undefined && source.hostedAttempt?.settled === true) {
    throw new RespondCommandError("invalid-input", "hosted response proposal requires an unsettled findings attempt");
  }
  const targetConfirmation = await confirmResponseTarget(source, supersession, dependencies);
  if (targetConfirmation.kind === "refused") return targetConfirmation.envelope;
  const confirmation = targetConfirmation.confirmation;
  const position = await resolveResponsePosition(
    source, confirmation, verifiedFix, settledFixTarget, dependencies,
  );
  if (position.kind === "refused") return position.envelope;
  const { recordedFix, changedTarget, deliveryMemberFixTarget, unchangedCandidateLineage } = position;
  if ("proposal" in request) {
    return prepareResponseProposal(request, source, supersession, dependencies);
  }
  let dispositions: ApprovedDispositionSet;
  try {
    const validated = validateDispositionState(request.dispositions);
    if (validated.state !== "approved") throw new Error("respond requires approved dispositions");
    dispositions = validated;
  } catch (error) {
    throw new RespondCommandError(
      "invalid-input",
      error instanceof Error ? error.message : "invalid approved dispositions",
    );
  }
  if (settledFixTarget !== undefined) {
    // The replay's own refusals return typed state: it runs unattended behind the merge verb, where
    // a thrown refusal reaches the operator only as a generic operation failure.
    const mismatch = actorMismatch(dispositions, source.actors);
    if (mismatch !== null) {
      return RespondEnvelopeSchema.parse({
        schemaVersion: 1,
        mode: "review-respond",
        diagnostics: [],
        state: "actor-mismatch",
        nextAction: "respond-again",
        payload: { operationId: source.operationId, actor: mismatch },
      });
    }
    validateFindings(dispositions, source);
    const dispositionReportText = renderDispositionReport({
      dispositionSet: dispositions.dispositionSet,
      producerFindings: source.findings,
    });
    return settleApprovedReplay(source, dispositions, dispositionReportText, dependencies);
  }
  validateActors(dispositions, source.actors);
  validateFindings(dispositions, source);
  const conditionalAuthorization = request.conditionalNextPassAuthorization;
  if (conditionalAuthorization !== undefined
    && conditionalAuthorization.authorizedBy !== source.actors.approverIdentity) {
    throw new RespondCommandError(
      "invalid-input",
      "conditional next-pass authorizer is not the active local identity",
    );
  }
  const dispositionReportText = renderDispositionReport({
    dispositionSet: dispositions.dispositionSet,
    producerFindings: source.findings,
  });
  if (verifiedFix !== undefined && changedTarget !== null) {
    return persistVerifiedReviewFix(
      source, dispositions, verifiedFix, changedTarget,
      deliveryMemberFixTarget, recordedFix, dispositionReportText, dependencies,
    );
  }
  return settleNewApprovedResponse(
    request, source, dispositions, dispositionReportText, unchangedCandidateLineage, dependencies,
  );
}
