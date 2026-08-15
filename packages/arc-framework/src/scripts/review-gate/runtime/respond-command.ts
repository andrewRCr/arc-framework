/** Source-authoritative orchestration for `arc review respond`. */

import { z } from "zod";

import { canonicalize } from "../../../lib/kernel/index.js";
import {
  CandidateManagedRecordV1Schema,
  CandidateVerificationApplicabilitySchema,
  projectCandidateCurrentness,
  type CandidateLineageTarget,
  type CandidateManagedRecordV1,
} from "../../../lib/work-unit/candidate-attestation.js";
import {
  ApprovedDispositionRecordSchema,
  FrontlineOutcomeRecordSchema,
  type ApprovedDispositionRecord,
} from "../core/advisory-records.js";
import {
  type DispositionReportItem,
  type ProposedDispositionSet,
  type ApprovedDispositionSet,
} from "../core/disposition-records.js";
import {
  createDispositionSet,
  proposeDispositionSet,
  validateDispositionState,
} from "../core/dispositions.js";
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
import { RespondEnvelopeSchema } from "../core/review-command-envelope.js";
import {
  parseReviewSourceReference,
} from "../core/review-source-reference.js";
import { projectReviewResponse } from "../core/response-plan.js";
import {
  ReviewResponseSettlementRequestSchema,
  ReviewResponseSettlementSourceSchema,
  type ReviewResponseInput,
} from "../core/response-plan-schema.js";
import type { LocalTargetConfirmation } from "../hosts/local/repository-target.js";
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

const AuthorDispositionSchema = z.strictObject({
  findingId: z.string().trim().min(1).max(512),
  sourceVerification: z.enum(["verified", "not-supported"]),
  verificationRefs: z.array(z.string().trim().min(1)).min(1),
  disposition: z.enum(["fix", "defer", "reject"]),
  rationale: z.string().trim().min(1).max(4096),
  recommendation: z.string().trim().min(1).max(4096),
  openQuestions: z.array(z.string().trim().min(1).max(4096)),
});

const RespondProposalRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  source: z.strictObject({
    kind: z.literal("attested-local"),
    receiptRef: z.string().trim().min(1),
  }),
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
const RespondVerifiedFixSchema = z.strictObject({
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
  current: CandidateLineageTarget;
}

export interface RespondCommandDependencies {
  operationStore: ReviewOperationStateStore;
  sourceStore: LocalReviewSourceStore;
  outcomeStore: FrontlineOutcomeStore;
  dispositionStore: ApprovedDispositionRecordStore;
  readReceipt(reference: string): Promise<ReviewReceiptV2 | null>;
  confirmTarget(target: ReviewTarget): Promise<LocalTargetConfirmation>;
  resolveLocalActors(evaluatorIdentity: string): Promise<ResponseActors>;
  resolveFrontlineActors(): Promise<ResponseActors>;
  /** Null when no work unit is active or it carries no Candidate record. */
  readCandidateLineage(): Promise<CandidateLineageBinding | null>;
  appendCandidateResponse(input: {
    workUnit: string;
    record: CandidateManagedRecordV1;
  }): Promise<{ recordPath: string }>;
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
  policyVersion?: string;
  rubricVersion?: string;
  rubricDigest?: string;
  actors: ResponseActors;
  frontlineOutcome?: FrontlineExecutionOutcome;
}

type RespondSource = z.infer<typeof ReviewResponseSettlementSourceSchema>;

function parseSourceReference(
  reference: string,
  kind: "attested-local" | "frontline",
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

function validateActors(dispositions: ApprovedDispositionSet, actors: ResponseActors): void {
  if (dispositions.approval.approvedBy !== actors.approverIdentity) {
    throw new RespondCommandError("invalid-input", "disposition approver is not the active local identity");
  }
  if (dispositions.dispositionSet.proposedBy !== actors.proposerIdentity) {
    throw new RespondCommandError("invalid-input", "disposition proposer is not the composing runtime");
  }
}

function validateFindings(
  dispositions: ApprovedDispositionSet,
  source: ResolvedResponseSource,
): void {
  const set = dispositions.dispositionSet;
  if (set.targetId !== source.target.targetId
    || (source.policyVersion !== undefined && set.policyVersion !== source.policyVersion)
    || (source.rubricVersion !== undefined && set.rubricVersion !== source.rubricVersion)
    || (source.rubricDigest !== undefined && set.rubricDigest !== source.rubricDigest)
    || set.findings.length !== source.findings.length
    || !set.findings.every((item) => {
      const finding = source.findings.find((candidate) => candidate.findingId === item.findingId);
      return finding !== undefined
        && item.sourceIdentity === source.sourceIdentity
        && item.locus === finding.locus
        && item.severity === finding.severity
        && item.nit === finding.nit;
    })) {
    throw new RespondCommandError("invalid-input", "approved dispositions do not match the selected review source");
  }
}

function prepareDispositionProposal(
  request: z.infer<typeof RespondProposalRequestSchema>,
  source: ResolvedResponseSource,
): ProposedDispositionSet {
  if (source.policyVersion === undefined
    || source.rubricVersion === undefined
    || source.rubricDigest === undefined) {
    throw new RespondCommandError("corrupt-state", "local response source lacks disposition context");
  }
  if (request.proposal.findings.length !== source.findings.length) {
    throw new RespondCommandError("invalid-input", "proposal must disposition every selected-source finding");
  }
  const decisions = new Map(request.proposal.findings.map((finding) => [finding.findingId, finding]));
  if (decisions.size !== request.proposal.findings.length) {
    throw new RespondCommandError("invalid-input", "proposal contains duplicate finding identities");
  }
  const findings: DispositionReportItem[] = source.findings.map((finding) => {
    const decision = decisions.get(finding.findingId);
    if (decision === undefined) {
      throw new RespondCommandError("invalid-input", "proposal must disposition every selected-source finding");
    }
    return {
      ...decision,
      sourceIdentity: source.sourceIdentity,
      locus: finding.locus,
      severity: finding.severity,
      ...(finding.nit === true ? { nit: true as const } : {}),
      gating: finding.severity === "minor" ? "record-only" : "blocking",
    };
  });
  try {
    return proposeDispositionSet(createDispositionSet({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      targetId: source.target.targetId,
      policyVersion: source.policyVersion,
      rubricVersion: source.rubricVersion,
      rubricDigest: source.rubricDigest,
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
    dependencies.resolveLocalActors(state.request.evaluatorIdentity),
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
    policyVersion: state.policyVersion,
    rubricVersion: state.requirement.rubricVersion,
    rubricDigest: state.requirement.rubricDigest,
    actors,
  };
}

async function resolveFrontlineSource(
  request: RespondSource & { kind: "frontline" },
  dependencies: RespondCommandDependencies,
): Promise<ResolvedResponseSource> {
  const reference = parseSourceReference(request.outcomeRef, "frontline");
  const persisted = await dependencies.outcomeStore.readOutcome(reference.operationId);
  if (persisted.record === null
    || persisted.outcomeRef !== reference.durableRef
    || persisted.record.operationId !== reference.operationId) {
    throw new RespondCommandError("corrupt-state", "frontline response outcome is unavailable");
  }
  const record = FrontlineOutcomeRecordSchema.parse(persisted.record);
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
    actors: await dependencies.resolveFrontlineActors(),
    frontlineOutcome: record.outcome,
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
  const lineage = await dependencies.readCandidateLineage();
  if (lineage === null) {
    throw new RespondCommandError(
      "invalid-input",
      "a verified fix requires an active work unit carrying a managed Candidate record",
    );
  }
  const header = { schemaVersion: 1, mode: "review-respond", diagnostics: [] } as const;
  const currentness = projectCandidateCurrentness({ record: lineage.record, current: lineage.current });
  if (currentness.status === "current") {
    return RespondEnvelopeSchema.parse({
      ...header,
      state: "candidate-current",
      nextAction: "continue-review",
      payload: {
        operationId: source.operationId,
        candidateId: currentness.candidateId,
        implementationChanged: currentness.implementationChanged,
      },
    });
  }
  const projection = projectCandidateDeltaVerification({ record: lineage.record, current: lineage.current });
  const response = recordCandidateVerifiedResponse({
    projection,
    dispositionId: dispositions.dispositionSet.dispositionSetId,
    approvedBy: dispositions.approval.approvedBy,
    appliedBy: dispositions.dispositionSet.proposedBy,
    applicability: verifiedFix.applicability,
    verificationEvidenceRefs: verifiedFix.verificationEvidenceRefs,
  });
  const { recordPath } = await dependencies.appendCandidateResponse({
    workUnit: lineage.workUnit,
    record: CandidateManagedRecordV1Schema.parse({
      ...lineage.record,
      responses: [...lineage.record.responses, response],
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
 * Settle one approved set the durable record already carries, at the head its fixes landed at.
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
    throw new RespondCommandError("invalid-input", "settlement replay has no approved disposition record");
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
      : await resolveFrontlineSource(request.source, dependencies);
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
  const confirmation = await dependencies.confirmTarget(source.target);
  const currentTarget = confirmation.state === "stale-target"
    ? confirmation.currentTarget
    : confirmation.target;
  // A landed fix moves the head, so the settlement pass expects the stale reading its approval pass
  // treats as a dead end. An unchanged head means no fix landed and there is nothing to attest.
  const changedTarget = confirmation.state === "stale-target" ? confirmation.currentTarget : null;
  if (verifiedFix !== undefined && changedTarget === null) {
    throw new RespondCommandError(
      "invalid-input",
      "a verified fix requires a changed exact target",
    );
  }
  // A replay pins the head its fixes settled at, not the originating review target, which the same
  // fixes are expected to have left stale.
  if (settledFixTarget !== undefined && currentTarget.targetId !== settledFixTarget.targetId) {
    return staleTargetEnvelope(source.operationId, settledFixTarget, currentTarget);
  }
  if (confirmation.state === "stale-target" && verifiedFix === undefined && settledFixTarget === undefined) {
    return staleTargetEnvelope(source.operationId, confirmation.attemptedTarget, confirmation.currentTarget);
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
  validateActors(dispositions, source.actors);
  validateFindings(dispositions, source);
  if (settledFixTarget !== undefined) {
    return settleApprovedReplay(source, dispositions, dependencies);
  }
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
    return persistCandidateResponse(source, dispositions, verifiedFix, dependencies);
  }
  const plan = projectApprovedResponse(source, dispositions);
  if (plan.state !== "ready-to-fix" && plan.state !== "ready-to-close") {
    throw new RespondCommandError("corrupt-state", `approved response produced unsupported state '${plan.state}'`);
  }
  const record = ApprovedDispositionRecordSchema.parse({
    schemaVersion: 1,
    semanticsVersion: "review-advisory/v1",
    repositoryId: source.repositoryId,
    operationId: source.operationId,
    source: source.source,
    approvedDisposition: dispositions,
    fixAuthorization: plan.fixAuthorization,
  });
  const existing = await dependencies.dispositionStore.readDispositionRecord(source.operationId);
  if (existing !== null && canonicalize(existing) !== canonicalize(record)) {
    throw new RespondCommandError("corrupt-state", "conflicting approved disposition record");
  }
  const appended = await dependencies.dispositionStore.appendDispositionRecord(record);
  const alreadySettled = existing !== null;
  const frontlineFollowUp = source.frontlineOutcome === undefined
    ? undefined
    : projectFrontlineFollowUpAdvice({
        outcome: source.frontlineOutcome,
        dispositionState: dispositions,
      });
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
              : "frontline-resolve",
          }),
      ...(frontlineFollowUp === undefined ? {} : { frontlineFollowUp }),
    },
  });
}
