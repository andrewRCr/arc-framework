/** Source-authoritative orchestration for `arc review respond`. */

import { z } from "zod";

import { canonicalize } from "../../../lib/kernel/index.js";
import {
  CandidateManagedRecordV1Schema,
  CandidateVerificationApplicabilitySchema,
  candidateReviewResponses,
  type CandidateLineageTarget,
  type CandidateManagedRecordV1,
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
  FrontlineOutcomeRecordSchema,
  isExactDeliveryMemberBindingAdvance,
  type ApprovedDispositionRecord,
  type ErrandReviewBinding,
} from "../core/advisory-records.js";
import {
  dispositionSetMatchesSourceContext,
  reviewerDispositionSeverity,
  reviewerDispositionNit,
  type DispositionSourceContext,
  type ProposedDispositionSet,
  type ApprovedDispositionSet,
} from "../core/disposition-records.js";
import {
  createDispositionSet,
  proposeDispositionSet,
  validateDispositionState,
} from "../core/dispositions.js";
import { ReviewSeveritySchema } from "../core/review-primitives.js";
import { validateReviewReceipt } from "../core/gate-contract-v2.js";
import {
  ReviewTargetSchema,
  type ReviewReceiptV2,
  type ReviewTarget,
} from "../core/gate-contract-v2-schema.js";
import type {
  ApprovedDispositionRecordStore,
  FrontlineOutcomeStore,
  LocalReviewSourceStore,
  ReviewOperationStateStore,
} from "../core/ports.js";
import type { BoundFrontlineResponseBinding } from "../core/frontline-response-binding.js";
import { RespondEnvelopeSchema } from "../core/review-command-envelope.js";
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
import type { LocalTargetConfirmation } from "../hosts/local/repository-target.js";
import type { HostedTarget } from "../hosted/request.js";
import {
  projectCandidateDeltaVerification,
  recordCandidateVerifiedResponse,
} from "../policy/pre-publication-procedure.js";
import {
  computeFrontlineSourceBindingId,
} from "../policy/frontline-operation.js";
import {
  projectFrontlineResponse,
} from "../policy/frontline-response.js";
import {
  projectFrontlineFollowUpAdvice,
} from "../policy/frontline-follow-up.js";
import type { FrontlineExecutionOutcome } from "../policy/frontline-outcome.js";
import type { DeliveryLocalReviewAdmission } from
  "../policy/delivery-local-review-admission.js";

const AuthorDispositionSchema = z.strictObject({
  findingId: z.string().trim().min(1).max(512),
  sourceVerification: z.enum(["verified", "not-supported"]),
  verificationRefs: z.array(z.string().trim().min(1)).min(1),
  /** Primary re-grade; omission accepts the reviewer's reported grade. */
  severity: ReviewSeveritySchema.optional(),
  disposition: z.enum(["fix", "defer", "reject"]),
  rationale: z.string().trim().min(1).max(4096),
  recommendation: z.string().trim().min(1).max(4096),
  openQuestions: z.array(z.string().trim().min(1).max(4096)),
});

const RespondProposalRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  source: ReviewResponseSettlementSourceSchema,
  proposal: z.strictObject({
    findings: z.array(AuthorDispositionSchema).min(1),
  }),
});

/**
 * The one judgment the repository cannot establish: how much verification the applied fix warranted.
 *
 * Its presence is what distinguishes the post-fix settlement pass from the approval pass — the same
 * approved dispositions and durable source, submitted once the fix has landed and been verified.
 */
export const RespondVerifiedFixSchema = z.strictObject({
  applicability: CandidateVerificationApplicabilitySchema,
  verificationEvidenceRefs: z.array(z.string().trim().min(1)).min(1),
});

/**
 * The head an approved set's fixes settled at, supplied when the checkpoint's plan replays it.
 *
 * A settlement replay carries no new judgment — the fix landed and was verified at approval time —
 * so it names the target that must still be current instead of the applicability a fix pass owns.
 */
const RespondSettledFixTargetSchema = ReviewTargetSchema;

const RespondApprovedRequestSchema = ReviewResponseSettlementRequestSchema.extend({
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
});

export const RespondRequestSchema = z.union([
  RespondProposalRequestSchema,
  RespondApprovedRequestSchema,
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

export interface RespondCommandDependencies {
  operationStore: ReviewOperationStateStore;
  sourceStore: LocalReviewSourceStore;
  outcomeStore: FrontlineOutcomeStore;
  dispositionStore: ApprovedDispositionRecordStore;
  readReceipt(reference: string): Promise<ReviewReceiptV2 | null>;
  confirmTarget(target: ReviewTarget): Promise<LocalTargetConfirmation>;
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
  now(): string;
  /** Null when the response target identifies no active or archived Candidate lineage. */
  readCandidateLineage(target: ReviewTarget): Promise<CandidateLineageBinding | null>;
  appendCandidateResponse(input: {
    workUnit: string;
    record: CandidateManagedRecordV1;
    expectedRecordVersion: string;
  }): Promise<{ recordPath: string }>;
  stageCandidateResponse(workUnit: string): Promise<{ recordPath: string }>;
  settleLaneFindings(input: {
    lane: "frontline" | "standard";
    repositoryId: string;
    headSha: string;
    attemptId: string;
  }): Promise<void>;
  bindHostedDisposition(input: {
    operationId: string;
    attemptId: string;
    dispositionSetId: string;
    findingIds: readonly string[];
    noHostSettlementFindingIds: readonly string[];
  }): Promise<void>;
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

interface ResolvedResponseSource {
  operationId: string;
  repositoryId: string;
  target: ReviewTarget;
  findings: FrontlineExecutionOutcome["findings"];
  sourceIdentity: string;
  source: ApprovedDispositionRecord["source"];
  dispositionContext: DispositionSourceContext;
  actors: ResponseActors;
  deliveryAdmission?: DeliveryLocalReviewAdmission;
  responseBinding?: BoundFrontlineResponseBinding;
  frontlineOutcome?: FrontlineExecutionOutcome;
  hostedAttempt?: {
    operationId: string;
    attemptId: string;
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
  const set = dispositions.dispositionSet;
  if (set.targetId !== source.target.targetId
    || !dispositionSetMatchesSourceContext(set, source.dispositionContext)
    || set.findings.length !== source.findings.length
    || !set.findings.every((item) => {
      const finding = source.findings.find((candidate) => candidate.findingId === item.findingId);
      return finding !== undefined
        && item.sourceIdentity === source.sourceIdentity
        && item.locus === finding.locus
        && reviewerDispositionSeverity(item) === finding.severity
        && reviewerDispositionNit(item) === finding.nit;
    })) {
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
    const {
      severity: proposedSeverity,
      sourceVerification,
      disposition,
      ...decisionFields
    } = decision;
    const severity = proposedSeverity ?? finding.severity;
    const base = {
      ...decisionFields,
      sourceIdentity: source.sourceIdentity,
      locus: finding.locus,
    };
    if (sourceVerification === "not-supported") {
      if (disposition !== "reject") {
        throw new RespondCommandError("invalid-input", "a finding not supported by source must be rejected");
      }
      return {
        ...base,
        sourceVerification,
        disposition,
        reviewerSeverity: finding.severity,
        ...(finding.nit === true ? { reviewerNit: true as const } : {}),
      };
    }
    return severity === finding.severity
      ? {
          ...base,
          sourceVerification,
          disposition,
          severity,
          ...(finding.nit === true ? { nit: true as const } : {}),
        }
      : {
          ...base,
          sourceVerification,
          disposition,
          reviewerSeverity: finding.severity,
          ...(finding.nit === true ? { reviewerNit: true as const } : {}),
          arcSeverity: severity,
        };
  });
  const dispositionContext = source.dispositionContext.kind === "rubric"
    ? {
        policyVersion: source.dispositionContext.policyVersion,
        rubricVersion: source.dispositionContext.rubricVersion,
        rubricDigest: source.dispositionContext.rubricDigest,
      }
    : {
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
      findings,
    }));
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
  const persisted = await dependencies.operationStore.readOperation(reference.operationId);
  if (persisted.state === null
    || persisted.state.kind !== "local-review"
    || persisted.state.operationId !== reference.operationId) {
    throw new RespondCommandError("corrupt-state", "local response operation is unavailable");
  }
  const state = persisted.state;
  const [receipt, localSource, actors] = await Promise.all([
    dependencies.readReceipt(reference.durableRef),
    dependencies.sourceStore.readSource(state.sourceRef),
    dependencies.resolveLocalActors(state.request.evaluatorIdentity, state.request.authorIdentity),
  ]);
  if (receipt === null) throw new RespondCommandError("corrupt-state", "local response receipt is unavailable");
  if (localSource === null
    || localSource.sourceDigest !== state.sourceDigest
    || localSource.repositoryId !== state.repositoryId
    || localSource.targetId !== state.targetId) {
    throw new RespondCommandError("corrupt-state", "local response source snapshot mismatch");
  }
  validateReviewReceipt(state.target, state.requirement, state.request, receipt);
  if (receipt.result !== "findings") {
    throw new RespondCommandError("invalid-input", "local response requires a findings receipt");
  }
  return {
    operationId: state.operationId,
    repositoryId: state.repositoryId,
    target: state.target,
    findings: receipt.findings,
    sourceIdentity: state.request.evaluatorIdentity,
    source: {
      kind: "attested-local",
      receiptRef: request.receiptRef,
      localSourceRef: state.sourceRef,
    },
    dispositionContext: {
      kind: "rubric",
      policyVersion: state.policyVersion,
      rubricVersion: state.requirement.rubricVersion,
      rubricDigest: state.requirement.rubricDigest,
    },
    actors,
    ...(state.deliveryAdmission === undefined ? {} : { deliveryAdmission: state.deliveryAdmission }),
  };
}

async function resolveFrontlineSource(
  request: RespondSource & { kind: "frontline" },
  dependencies: RespondCommandDependencies,
): Promise<ResolvedResponseSource> {
  const reference = parseSourceReference(request.outcomeRef, "frontline");
  const [persistedOutcome, persistedOperation] = await Promise.all([
    dependencies.outcomeStore.readOutcome(reference.operationId),
    dependencies.operationStore.readOperation(reference.operationId),
  ]);
  if (persistedOutcome.record === null
    || persistedOutcome.outcomeRef !== reference.durableRef
    || persistedOutcome.record.operationId !== reference.operationId) {
    throw new RespondCommandError("corrupt-state", "frontline response outcome is unavailable");
  }
  if (persistedOperation.state === null
    || persistedOperation.state.kind !== "frontline-run"
    || persistedOperation.state.operationId !== reference.operationId) {
    throw new RespondCommandError("corrupt-state", "frontline response operation is unavailable");
  }
  const record = FrontlineOutcomeRecordSchema.parse(persistedOutcome.record);
  const state = persistedOperation.state;
  if (state.targetId !== record.outcome.target.targetId
    || state.sourceIdentity !== record.sourceIdentity
    || state.outcome !== record.outcome.outcome
    || state.passCount !== record.outcome.pass
    || state.sourceBindingId !== computeFrontlineSourceBindingId(
      record.outcome.source,
      record.responseBinding,
    )
    || canonicalize(state.responseBinding ?? null) !== canonicalize(record.responseBinding ?? null)) {
    throw new RespondCommandError("corrupt-state", "frontline response source snapshot mismatch");
  }
  const responseBinding = record.responseBinding;
  if (responseBinding !== undefined
    && (record.outcome.target.kind !== "delivery-member"
      || record.outcome.target.repositoryId !== responseBinding.candidate.target.repositoryId
      || record.outcome.target.baseRef !== responseBinding.candidate.target.baseRef
      || record.outcome.target.headSha !== responseBinding.deliveryMember.head)) {
    throw new RespondCommandError("corrupt-state", "Frontline response binding does not match its exact targets");
  }
  if (record.outcome.outcome !== "findings") {
    throw new RespondCommandError("invalid-input", "frontline response requires a findings outcome");
  }
  return {
    operationId: record.operationId,
    repositoryId: record.repositoryId,
    target: record.outcome.target,
    findings: record.outcome.findings,
    sourceIdentity: record.sourceIdentity,
    source: { kind: "frontline", outcomeRef: request.outcomeRef },
    dispositionContext: {
      kind: "frontline",
      policyVersion: state.policyVersion,
      frontlineBinding: {
        operationId: state.operationId,
        sourceBindingId: state.sourceBindingId,
        outcomeDigest: record.outcomeDigest,
      },
    },
    actors: await dependencies.resolveFrontlineActors(),
    frontlineOutcome: record.outcome,
    ...(responseBinding === undefined ? {} : { responseBinding }),
  };
}

async function resolveHostedSource(
  request: RespondSource & { kind: "hosted" },
  dependencies: RespondCommandDependencies,
): Promise<ResolvedResponseSource> {
  const reference = parseSourceReference(request.attemptRef, "hosted");
  const persisted = await dependencies.operationStore.readOperation(reference.operationId);
  if (persisted.state === null
    || persisted.state.kind !== "lane-progress"
    || persisted.state.operationId !== reference.operationId
    || persisted.state.lane !== "standard") {
    throw new RespondCommandError("corrupt-state", "hosted response operation is unavailable");
  }
  const attempt = persisted.state.attempts.find(({ attemptId }) => attemptId === reference.durableRef);
  if ((attempt?.outcome !== "findings" && attempt?.outcome !== "settled-findings")
    || attempt.hosted === undefined) {
    throw new RespondCommandError("invalid-input", "hosted response requires a findings attempt");
  }
  if (attempt.sourceId !== attempt.hosted.requirement.acceptableSources.find(
    ({ sourceKind, qualifier }) => sourceKind === "hosted" && qualifier === attempt.sourceId,
  )?.qualifier
    || persisted.state.repositoryId !== attempt.hosted.reviewTarget.repositoryId
    || persisted.state.headSha !== attempt.hosted.target.headSha
    || persisted.state.changeRequestId !== `pull/${attempt.hosted.target.pullRequest}`
    || attempt.hosted.reviewTarget.headSha !== attempt.hosted.target.headSha
    || (attempt.hosted.reviewTarget.kind === "delivery-member"
      ? attempt.hosted.vehicle === undefined
        || attempt.hosted.vehicle.head !== attempt.hosted.reviewTarget.headSha
      : attempt.hosted.vehicle !== undefined)) {
    throw new RespondCommandError("corrupt-state", "hosted response source snapshot mismatch");
  }
  return {
    operationId: attempt.attemptId,
    repositoryId: persisted.state.repositoryId,
    target: attempt.hosted.reviewTarget,
    findings: attempt.hosted.findings.map((finding) => ({
      findingId: finding.findingId,
      severity: finding.severity,
      locus: finding.locus,
      evidenceUrlOrId: finding.url,
    })),
    sourceIdentity: attempt.sourceId,
    source: { kind: "hosted", attemptRef: request.attemptRef },
    dispositionContext: {
      kind: "rubric",
      policyVersion: attempt.hosted.requirement.policyVersion,
      rubricVersion: attempt.hosted.requirement.rubricVersion,
      rubricDigest: attempt.hosted.requirement.rubricDigest,
    },
    actors: await dependencies.resolveFrontlineActors(),
    hostedAttempt: {
      operationId: persisted.state.operationId,
      attemptId: attempt.attemptId,
      ...(attempt.hosted.vehicle === undefined ? {} : { vehicle: attempt.hosted.vehicle }),
      target: attempt.hosted.target,
      noHostSettlementFindingIds: attempt.hosted.findings
        .filter(({ settlement }) => settlement === "not-applicable")
        .map(({ findingId }) => findingId),
      hostSettlementFindingIds: attempt.hosted.findings
        .filter(({ settlement }) => settlement === "reply-and-resolve")
        .map(({ findingId }) => findingId),
      settled: attempt.outcome === "settled-findings",
    },
  };
}

function projectHostedSettlementPlan(
  source: ResolvedResponseSource,
  dispositions: ApprovedDispositionSet,
) {
  if (source.hostedAttempt === undefined) return undefined;
  const hostSettlementFindingIds = new Set(source.hostedAttempt.hostSettlementFindingIds);
  const findings = dispositions.dispositionSet.findings.filter(({ findingId }) =>
    hostSettlementFindingIds.has(findingId));
  return {
    beforeFixFindingIds: findings
      .filter(({ disposition }) => disposition !== "fix")
      .map(({ findingId }) => findingId),
    afterFixFindingIds: findings
      .filter(({ disposition }) => disposition === "fix")
      .map(({ findingId }) => findingId),
  };
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

/**
 * Append one approved fix's delta-verification evidence to the managed Candidate record.
 *
 * The lineage targets are the repository's own — the recognized head reduced from prior responses and
 * the subject the index currently carries — so the caller supplies only the applicability it selected
 * and the evidence that supports it. An already-explained subject appends nothing, which is what makes
 * a repeated settlement pass a no-op rather than a second empty response.
 */
async function persistCandidateResponse(
  source: ResolvedResponseSource,
  dispositions: ApprovedDispositionSet,
  verifiedFix: z.infer<typeof RespondVerifiedFixSchema>,
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
  const existing = await dependencies.dispositionStore.readDispositionRecord(source.operationId);
  const candidateBinding = existing?.candidate;
  const privateMemberBindingMatches = source.responseBinding === undefined
    ? existing?.deliveryMember === null
    : existing?.deliveryMember !== null
      && existing?.deliveryMember !== undefined
      && canonicalize(existing.deliveryMember) === canonicalize(source.responseBinding.deliveryMember);
  let expectedAuthorization;
  try {
    expectedAuthorization = createFixAuthorization({
      dispositionState: dispositions,
      oldTarget: source.target,
    });
  } catch {
    expectedAuthorization = null;
  }
  if (existing === null
    || candidateBinding === null
    || candidateBinding === undefined
    || candidateBinding.workUnit !== lineage.workUnit
    || candidateBinding.candidateId !== lineage.record.attestation.candidateId
    || existing.errand !== null
    || !privateMemberBindingMatches
    || canonicalize(existing.approvedDisposition) !== canonicalize(dispositions)
    || canonicalize(existing.source) !== canonicalize(source.source)
    || expectedAuthorization === null
    || canonicalize(existing.fixAuthorization) !== canonicalize(expectedAuthorization)) {
    throw new RespondCommandError(
      "invalid-input",
      "a verified Candidate fix requires its exact approved response record and fix authorization",
    );
  }
  if (lineage.unstagedReviewablePaths.length > 0) {
    throw new RespondCommandError(
      "invalid-input",
      "a verified fix must be staged before it can advance the Candidate lineage; the index does not "
        + `carry ${lineage.unstagedReviewablePaths.length} reviewable path(s): `
        + lineage.unstagedReviewablePaths.join(", "),
    );
  }
  const header = { schemaVersion: 1, mode: "review-respond", diagnostics: [] } as const;
  const currentness = projectEffectiveCandidateCurrentness(lineage.effective);
  const recordedResponses = candidateReviewResponses(lineage.record);
  const matchingResponses = recordedResponses.filter((response) =>
    response.dispositionId === dispositions.dispositionSet.dispositionSetId);
  if (matchingResponses.length > 0) {
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
    return RespondEnvelopeSchema.parse({
      ...header,
      state: "candidate-current",
      nextAction: "continue-review",
      payload: {
        operationId: source.operationId,
        candidateId: currentness.candidateId,
        recordPath,
        implementationChanged: currentness.implementationChanged,
      },
    });
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
async function persistErrandResponse(
  source: ResolvedResponseSource,
  dispositions: ApprovedDispositionSet,
  newTarget: ReviewTarget,
  verifiedFix: z.infer<typeof RespondVerifiedFixSchema>,
  dependencies: RespondCommandDependencies,
): Promise<z.infer<typeof RespondEnvelopeSchema>> {
  const [existing, activeErrand] = await Promise.all([
    dependencies.dispositionStore.readDispositionRecord(source.operationId),
    dependencies.resolveActiveErrand(),
  ]);
  if (existing === null
    || existing.candidate !== null
    || existing.errand === null
    || activeErrand === null
    || canonicalize(existing.errand) !== canonicalize(activeErrand)
    || canonicalize(existing.approvedDisposition) !== canonicalize(dispositions)
    || canonicalize(existing.source) !== canonicalize(source.source)
    || existing.fixAuthorization === null) {
    throw new RespondCommandError(
      "invalid-input",
      "a verified fix without Candidate lineage requires the exact approved active Errand response record",
    );
  }
  const header = { schemaVersion: 1, mode: "review-respond", diagnostics: [] } as const;
  if (existing.errandFixResponse !== null) {
    if (!errandResponseMatches(existing.errandFixResponse, {
      source,
      dispositions,
      newTarget,
      verifiedFix,
    })) {
      throw new RespondCommandError("invalid-input", "Errand response replay conflicts with the recorded response");
    }
    const { dispositionRecordRef } = await dependencies.dispositionStore.appendDispositionRecord(existing);
    return RespondEnvelopeSchema.parse({
      ...header,
      state: "errand-current",
      nextAction: "continue-review",
      payload: {
        operationId: source.operationId,
        dispositionRecordRef,
        fixAuthorizationId: existing.fixAuthorization.fixAuthorizationId,
      },
    });
  }
  const fixConsumption = consumeFixAuthorization({
    authorization: existing.fixAuthorization,
    oldTarget: source.target,
    newTarget,
    appliedBy: dispositions.dispositionSet.proposedBy,
    consumedAt: dependencies.now(),
    verificationRefs: verifiedFix.verificationEvidenceRefs,
    priorConsumptions: [],
  });
  const record = ApprovedDispositionRecordSchema.parse({
    ...existing,
    errandFixResponse: {
      oldTarget: source.target,
      newTarget,
      applicability: verifiedFix.applicability,
      fixConsumption,
      hostedTarget: source.hostedAttempt?.target ?? null,
    },
  });
  const { dispositionRecordRef } = await dependencies.dispositionStore.appendDispositionRecord(record);
  return RespondEnvelopeSchema.parse({
    ...header,
    state: "errand-advanced",
    nextAction: "continue-review",
    payload: {
      operationId: source.operationId,
      dispositionRecordRef,
      fixAuthorizationId: fixConsumption.fixAuthorizationId,
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
  return existing.oldTarget.targetId === input.source.target.targetId
    && existing.newTarget.targetId === input.currentTarget.targetId
    && existing.applicability === input.verifiedFix.applicability
    && canonicalize(existing.fixConsumption.verificationRefs)
      === canonicalize(input.verifiedFix.verificationEvidenceRefs)
    && existing.fixConsumption.appliedBy === input.dispositions.dispositionSet.proposedBy
    && canonicalize(existing.hostedTarget) === canonicalize(input.source.hostedAttempt?.target)
    && canonicalize(existing.hostedFixTarget) === canonicalize(input.hostedFixTarget);
}

/** Persist one verified fix against the current coordinates of its exact hosted delivery member. */
async function persistDeliveryMemberResponse(
  source: ResolvedResponseSource,
  dispositions: ApprovedDispositionSet,
  currentTarget: ReviewTarget,
  hostedFixTarget: HostedTarget,
  verifiedFix: z.infer<typeof RespondVerifiedFixSchema>,
  dependencies: RespondCommandDependencies,
): Promise<z.infer<typeof RespondEnvelopeSchema>> {
  const existing = await dependencies.dispositionStore.readDispositionRecord(source.operationId);
  const hostedAttempt = source.hostedAttempt;
  if (hostedAttempt?.vehicle === undefined) {
    throw new RespondCommandError(
      "invalid-input",
      "a verified delivery-member fix requires its exact approved hosted response record",
    );
  }
  const vehicle = hostedAttempt.vehicle;
  const hostedTarget = hostedAttempt.target;
  if (existing === null
    || existing.candidate !== null
    || existing.errand !== null
    || existing.deliveryMember === null
    || canonicalize(existing.deliveryMember) !== canonicalize(vehicle)
    || canonicalize(existing.approvedDisposition) !== canonicalize(dispositions)
    || canonicalize(existing.source) !== canonicalize(source.source)
    || existing.fixAuthorization === null) {
    throw new RespondCommandError(
      "invalid-input",
      "a verified delivery-member fix requires its exact approved hosted response record",
    );
  }
  const header = { schemaVersion: 1, mode: "review-respond", diagnostics: [] } as const;
  const hostedSettlementPlan = projectHostedSettlementPlan(source, dispositions);
  if (existing.deliveryMemberFixResponse !== null) {
    if (!deliveryMemberResponseMatches(existing.deliveryMemberFixResponse, {
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
    if (!hostedAttempt.settled) {
      await dependencies.bindHostedDisposition({
        ...hostedAttempt,
        dispositionSetId: dispositions.dispositionSet.dispositionSetId,
        findingIds: dispositions.dispositionSet.findings.map(({ findingId }) => findingId),
      });
    }
    return RespondEnvelopeSchema.parse({
      ...header,
      state: "delivery-member-current",
      nextAction: "continue-review",
      payload: {
        operationId: source.operationId,
        dispositionRecordRef,
        fixAuthorizationId: existing.fixAuthorization.fixAuthorizationId,
        currentTarget,
        hostedFixTarget,
        ...(hostedSettlementPlan === undefined ? {} : { hostedSettlementPlan }),
      },
    });
  }
  const fixConsumption = consumeFixAuthorization({
    authorization: existing.fixAuthorization,
    oldTarget: source.target,
    newTarget: currentTarget,
    appliedBy: dispositions.dispositionSet.proposedBy,
    consumedAt: dependencies.now(),
    verificationRefs: verifiedFix.verificationEvidenceRefs,
    priorConsumptions: [],
  });
  const record = ApprovedDispositionRecordSchema.parse({
    ...existing,
    deliveryMemberFixResponse: {
      oldTarget: source.target,
      newTarget: currentTarget,
      applicability: verifiedFix.applicability,
      fixConsumption,
      hostedTarget,
      hostedFixTarget,
    },
  });
  const { dispositionRecordRef } = await dependencies.dispositionStore.appendDispositionRecord(record);
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

/**
 * Settle one approved set the durable record already carries, at the head the response settled at.
 *
 * The replay decides nothing: approval, the fix, and its verification all completed earlier, and the
 * durable record is what proves it. Re-appending the exact record it read is what makes a repeated
 * settlement pass a no-op rather than a second decision, and a record that disagrees refuses.
 */
async function settleApprovedReplay(
  source: ResolvedResponseSource,
  dispositions: ApprovedDispositionSet,
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
  if (canonicalize(existing.approvedDisposition) !== canonicalize(dispositions)) {
    throw new RespondCommandError("corrupt-state", "conflicting approved disposition record");
  }
  const appended = await dependencies.dispositionStore.appendDispositionRecord(existing);
  return RespondEnvelopeSchema.parse({
    schemaVersion: 1,
    mode: "review-respond",
    diagnostics: [],
    state: "already-settled",
    nextAction: "reduce",
    payload: {
      operationId: source.operationId,
      dispositionRecordRef: appended.dispositionRecordRef,
    },
  });
}

/** Validate one approved set against its durable source and append its advisory record. */
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
  const verifiedFix = "verifiedFix" in request ? request.verifiedFix : undefined;
  const settledFixTarget = "settledFixTarget" in request ? request.settledFixTarget : undefined;
  if ("proposal" in request && source.hostedAttempt?.settled === true) {
    throw new RespondCommandError("invalid-input", "hosted response proposal requires an unsettled findings attempt");
  }
  const confirmation = await dependencies.confirmTarget(source.target);
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
  let unchangedCandidateLineage: CandidateLineageBinding | null = null;
  // A landed fix moves the head, so the settlement pass expects the stale reading its approval pass
  // treats as a dead end. An unchanged head means no fix landed and there is nothing to attest.
  let changedTarget = confirmation.state === "stale-target" ? confirmation.currentTarget : null;
  let deliveryMemberFixTarget: { currentTarget: ReviewTarget; hostedFixTarget: HostedTarget } | null = null;
  if (verifiedFix !== undefined && source.hostedAttempt?.vehicle !== undefined) {
    deliveryMemberFixTarget = await dependencies.resolveDeliveryMemberFixTarget({
      vehicle: source.hostedAttempt.vehicle,
      originatingTarget: source.target,
      hostedTarget: source.hostedAttempt.target,
    });
    if (deliveryMemberFixTarget === null) {
      throw new RespondCommandError(
        "invalid-input",
        "the authoritative current delivery-member target is unavailable or no longer matches the hosted request",
      );
    }
    changedTarget = deliveryMemberFixTarget.currentTarget.targetId === source.target.targetId
      ? null
      : deliveryMemberFixTarget.currentTarget;
  }
  const candidateBoundFix = verifiedFix !== undefined
    && recordedFix?.candidate !== null
    && recordedFix?.candidate !== undefined
    && source.hostedAttempt?.vehicle === undefined
    && source.deliveryAdmission?.vehicle === undefined
    ? await dependencies.readCandidateLineage(source.responseBinding?.candidate.target ?? source.target)
    : null;
  if (candidateBoundFix !== null) {
    changedTarget = candidateBoundFix.candidateFixTarget.targetId === source.target.targetId
      ? null
      : candidateBoundFix.candidateFixTarget;
  }
  if (verifiedFix !== undefined && changedTarget === null) {
    throw new RespondCommandError(
      "invalid-input",
      "a verified fix requires a changed exact target",
    );
  }
  // A replay pins the head the response settled at, not the originating review target, which later
  // ceremony writes may have left stale even when the response authorized no fix.
  if (settledFixTarget !== undefined && currentTarget.targetId !== settledFixTarget.targetId) {
    return staleTargetEnvelope(source.operationId, settledFixTarget, currentTarget);
  }
  if (confirmation.state === "stale-target" && verifiedFix === undefined && settledFixTarget === undefined) {
    const lineage = await dependencies.readCandidateLineage(
      source.responseBinding?.candidate.target ?? source.target,
    );
    const currentness = lineage === null
      ? null
      : projectEffectiveCandidateCurrentness(lineage.effective);
    if (currentness === null || !("status" in currentness) || currentness.status !== "current") {
      return staleTargetEnvelope(source.operationId, confirmation.attemptedTarget, confirmation.currentTarget);
    }
    // Lifecycle ceremony may commit around an unchanged Candidate after its review target was minted.
    // The managed Candidate subject, not the stale whole-repository target, is authoritative for whether
    // that operational-only head move invalidates the approved response.
    unchangedCandidateLineage = lineage;
  }
  if ("proposal" in request) {
    return RespondEnvelopeSchema.parse({
      schemaVersion: 1,
      mode: "review-respond",
      diagnostics: [],
      state: "awaiting-approval",
      nextAction: "obtain-approval",
      payload: {
        operationId: source.operationId,
        proposal: prepareDispositionProposal(request, source),
      },
    });
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
    return settleApprovedReplay(source, dispositions, dependencies);
  }
  validateActors(dispositions, source.actors);
  validateFindings(dispositions, source);
  if (verifiedFix !== undefined && changedTarget !== null) {
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
        dependencies,
      );
    }
    return recordedFix?.candidate === null || recordedFix?.candidate === undefined
      ? persistErrandResponse(source, dispositions, changedTarget, verifiedFix, dependencies)
      : persistCandidateResponse(source, dispositions, verifiedFix, dependencies);
  }
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
  const existing = await dependencies.dispositionStore.readDispositionRecord(source.operationId);
  const record = ApprovedDispositionRecordSchema.parse({
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
    approvedDisposition: dispositions,
    fixAuthorization: plan.fixAuthorization,
    errandFixResponse: existing?.errandFixResponse ?? null,
    deliveryMemberFixResponse: existing?.deliveryMemberFixResponse ?? null,
  });
  if (existing !== null && canonicalize(existing) !== canonicalize(record)
    && !isExactDeliveryMemberBindingAdvance(existing, record)) {
    throw new RespondCommandError("corrupt-state", "conflicting approved disposition record");
  }
  const appended = await dependencies.dispositionStore.appendDispositionRecord(record);
  if (source.hostedAttempt !== undefined && !source.hostedAttempt.settled) {
    await dependencies.bindHostedDisposition({
      ...source.hostedAttempt,
      dispositionSetId: dispositions.dispositionSet.dispositionSetId,
      findingIds: dispositions.dispositionSet.findings.map(({ findingId }) => findingId),
    });
  } else if (plan.state === "ready-to-close") {
    await dependencies.settleLaneFindings({
      lane: source.frontlineOutcome === undefined ? "standard" : "frontline",
      repositoryId: source.repositoryId,
      headSha: source.target.headSha,
      attemptId: source.operationId,
    });
  }
  const alreadySettled = existing !== null;
  const hostedSettlementPlan = projectHostedSettlementPlan(source, dispositions);
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
        correctionAction: {
          argv: ["arc", "delivery", "review-fix", "continue", "-", "--json"],
          input: { repository, remote: "origin" },
        },
        ...(hostedSettlementPlan === undefined ? {} : { hostedSettlementPlan }),
      },
    });
  }
  return RespondEnvelopeSchema.parse({
    schemaVersion: 1,
    mode: "review-respond",
    diagnostics: [],
    state: plan.state === "ready-to-fix" ? "ready-to-fix" : alreadySettled ? "already-settled" : "settled",
    nextAction: plan.state === "ready-to-fix" ? "apply-fix" : "reduce",
    payload: {
      operationId: source.operationId,
      dispositionRecordRef: appended.dispositionRecordRef,
      ...(plan.fixAuthorization === null ? {} : { fixAuthorization: plan.fixAuthorization }),
      ...(plan.fixAuthorization === null
        ? {}
        : {
            reentryCommand: source.source.kind === "attested-local"
              ? "local-prepare"
              : source.source.kind === "frontline"
                ? "frontline-resolve"
                : "hosted-settle",
          }),
      ...(frontlineFollowUp === undefined ? {} : { frontlineFollowUp }),
      ...(hostedSettlementPlan === undefined ? {} : { hostedSettlementPlan }),
    },
  });
}
