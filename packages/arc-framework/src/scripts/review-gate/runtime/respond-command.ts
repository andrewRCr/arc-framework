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
  isExactDeliveryMemberBindingAdvance,
  type ApprovedDispositionRecord,
  type ErrandReviewBinding,
} from "../core/advisory-records.js";
import {
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
import { ReviewSeveritySchema } from "../core/review-primitives.js";
import { SeverityGatingPolicySchema } from "../core/severity-gating-policy.js";
import type { LaneSubjectLineage } from "../core/lane-admission.js";
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
import { RespondEnvelopeSchema } from "../core/review-command-envelope.js";
import {
  parseReviewSourceReference,
} from "../core/review-source-reference.js";
import { consumeFixAuthorization } from "../core/fix-authorization.js";
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
  projectFrontlineResponse,
} from "../policy/frontline-response.js";
import {
  projectFrontlineFollowUpAdvice,
} from "../policy/frontline-follow-up.js";
import type { FrontlineExecutionOutcome } from "../policy/frontline-outcome.js";
import type { DeliveryLocalReviewAdmission } from
  "../policy/delivery-local-review-admission.js";

const AuthorDispositionFieldsSchema = z.strictObject({
  findingId: z.string().trim().min(1).max(512),
  verificationRefs: z.array(z.string().trim().min(1)).min(1),
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

const RespondProposalRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  source: ReviewResponseSettlementSourceSchema,
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
  if (request.verifiedFix !== undefined
    && VerificationApplicabilityRank[request.verifiedFix.applicability]
      < VerificationApplicabilityRank[request.dispositions.dispositionSet.proposedVerification]) {
    context.addIssue({
      code: "custom",
      path: ["verifiedFix", "applicability"],
      message: "verified fix applicability is narrower than the approved scope",
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
  /**
   * Reviewable paths the index does not carry, read alongside the subject it does.
   *
   * A lineage advance records the current subject as the approved head, so an unstaged fix would
   * either be explained away as already-current or land a head that omits it.
   */
  unstagedReviewablePaths: readonly string[];
}

export interface RespondCommandDependencies {
  resultReader: ReviewResultReader;
  dispositionStore: ApprovedDispositionRecordStore;
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
    lineage?: LaneSubjectLineage;
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
  dispositionReportText: string,
  dependencies: RespondCommandDependencies,
): Promise<z.infer<typeof RespondEnvelopeSchema>> {
  const lineage = await dependencies.readCandidateLineage(source.target);
  if (lineage === null) {
    throw new RespondCommandError(
      "invalid-input",
      "a verified fix requires a work unit carrying the reviewed managed Candidate record",
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
      || matching.oldTarget.revision !== source.target.headSha
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
        dispositionReportText,
      },
    });
  }
  if (lineage.reviewed.recognizedTarget.revision !== source.target.headSha) {
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
      oldTarget: { ...projection.oldTarget, revision: source.target.headSha },
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
  dispositionReportText: string,
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
        dispositionReportText,
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
  const record = validateApprovedDispositionRecordForResult(ApprovedDispositionRecordSchema.parse({
    ...existing,
    errandFixResponse: {
      oldTarget: source.target,
      newTarget,
      applicability: verifiedFix.applicability,
      fixConsumption,
      hostedTarget: source.hostedAttempt?.target ?? null,
    },
  }), source.result);
  const { dispositionRecordRef } = await dependencies.dispositionStore.appendDispositionRecord(record);
  return RespondEnvelopeSchema.parse({
    ...header,
    state: "errand-advanced",
    nextAction: "continue-review",
    payload: {
      operationId: source.operationId,
      dispositionRecordRef,
      fixAuthorizationId: fixConsumption.fixAuthorizationId,
      dispositionReportText,
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
  dispositionReportText: string,
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
        dispositionReportText,
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
      dispositionReportText,
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
      dispositionReportText,
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
    const lineage = await dependencies.readCandidateLineage(source.target);
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
    const proposal = prepareDispositionProposal(request, source);
    return RespondEnvelopeSchema.parse({
      schemaVersion: 1,
      mode: "review-respond",
      diagnostics: [],
      state: "awaiting-approval",
      nextAction: "obtain-approval",
      payload: {
        operationId: source.operationId,
        proposal,
        dispositionReportText: renderDispositionReport({
          dispositionSet: proposal.dispositionSet,
          producerFindings: source.findings,
        }),
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
    const dispositionReportText = renderDispositionReport({
      dispositionSet: dispositions.dispositionSet,
      producerFindings: source.findings,
    });
    return settleApprovedReplay(source, dispositions, dispositionReportText, dependencies);
  }
  validateActors(dispositions, source.actors);
  validateFindings(dispositions, source);
  const dispositionReportText = renderDispositionReport({
    dispositionSet: dispositions.dispositionSet,
    producerFindings: source.findings,
  });
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
        dispositionReportText,
        dependencies,
      );
    }
    if (await dependencies.readCandidateLineage(source.target) === null) {
      return persistErrandResponse(
        source,
        dispositions,
        changedTarget,
        verifiedFix,
        dispositionReportText,
        dependencies,
      );
    }
    return persistCandidateResponse(source, dispositions, verifiedFix, dispositionReportText, dependencies);
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
  const deliveryMember = source.hostedAttempt?.vehicle ?? source.deliveryAdmission?.vehicle ?? null;
  const lineage = deliveryMember === null
    ? unchangedCandidateLineage ?? await dependencies.readCandidateLineage(source.target)
    : null;
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
      ...(source.laneLineage === undefined ? {} : { lineage: source.laneLineage }),
      attemptId: source.operationId,
    });
  }
  const alreadySettled = existing !== null;
  const hostedSettlementPlan = projectHostedSettlementPlan(source, dispositions);
  if (plan.state === "ready-to-fix" && deliveryMember !== null) {
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
      dispositionReportText,
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
