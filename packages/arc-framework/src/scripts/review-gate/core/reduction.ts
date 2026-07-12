/** Production composition of review-policy, evidence, admission, verdict, and projection reducers. */

import { admitAutomaticRequest } from "./admission.js";
import { deriveReviewGateAction, type ReviewGateAction } from "./next-action.js";
import { applyRequiredOverride, COMMAND_RECEIPT_SOURCE } from "./command-receipts.js";
import type { NormalizedChangeRequest, ReviewRequirement, SourceKind } from "./contracts.js";
import { reduceCoverage } from "./coverage.js";
import type { Evidence } from "./evidence.js";
import {
  REVIEW_SEMANTICS_VERSION,
  type GateProjection,
  type ReceiptEnvelope,
  type ReviewReceipt,
  type ReviewRequest,
  type SourceCapacity,
} from "./execution.js";
import { reduceFindings } from "./findings.js";
import type { LifecycleTailProof } from "./lifecycle-tail.js";
import { renderGateProjection } from "./projection.js";
import { resolveProviderFallback } from "./provider-fallback.js";
import { reduceRequirementState } from "./requirement-state.js";
import { reduceFindingSettlements } from "./settlement.js";
import { reduceGateVerdict, type GateVerdictInput, type VerdictRequirement } from "./verdict.js";

/** Policy decision data consumed by the neutral reducer. */
export interface ReviewGatePolicyDecision {
  lane: "auto" | "reviewed";
  reviewRisk: "routine" | "sensitive";
  disposition: "required" | "recommended" | "exempt";
  reasons: string[];
  policyVersion: string;
  requirements: ReviewRequirement[];
}

/** Pre-qualified source capabilities supplied by repository policy. */
export interface ReviewSourceQualification {
  sourceKind: SourceKind;
  qualifier: string;
  sourceIdentity: string;
  qualifiedRubricVersions: string[];
  transport: "durable-record" | "authenticated-attestation";
  requestMechanism: "automatic" | "user-trigger";
  requiredActorIdentity: string | null;
  requestCommand: string | null;
  closureCapability: boolean;
}

/** Canonical state consumed by the production core reduction. */
export interface ReviewGateReductionInput {
  policyDecision: ReviewGatePolicyDecision;
  qualifications: ReviewSourceQualification[];
  changeRequest: NormalizedChangeRequest;
  evidence: Evidence[];
  receipts: ReviewReceipt[];
  capacities: SourceCapacity[];
  readiness: {
    draft: boolean;
    mergeability: "unknown" | "mergeable" | "conflicting";
    baseFresh: boolean;
  };
  ciState: "pending" | "failure" | "success";
  nativeReview: GateVerdictInput["nativeReview"];
  inconsistencies: string[];
  ledgerVersion: number | null;
  lifecycleTail?: LifecycleTailProof | null;
  lifecycleTailPredicateId: string;
  receiptRefs: string[];
  actorIdentity: string;
  settlementActorIdentity: string | null;
  now?: Date;
}

/** Request plus projection emitted by one core reduction. */
export interface GateReductionDecision {
  request: ReviewRequest | null;
  receiptsToAppend: ReviewReceipt[];
  projection: GateProjection;
  action: ReviewGateAction;
}

/** Recover normalized evidence only after the receipt store authenticated and parsed its envelope. */
export function extractAuthenticatedReceiptEvidence(envelopes: ReceiptEnvelope[]): Evidence[] {
  return envelopes.flatMap((envelope) => envelope.receipt.evidence === undefined ? [] : [envelope.receipt.evidence]);
}

function sourceAccepted(requirement: ReviewRequirement, declaration: ReviewSourceQualification): boolean {
  return requirement.acceptableSources.some((accepted) => accepted.sourceKind === declaration.sourceKind
    && (accepted.qualifier === undefined || accepted.qualifier === declaration.qualifier));
}

function sourceQualified(requirement: ReviewRequirement, declaration: ReviewSourceQualification): boolean {
  return sourceAccepted(requirement, declaration)
    && declaration.qualifiedRubricVersions.includes(requirement.rubricVersion);
}

function evidenceQualified(
  requirement: ReviewRequirement,
  evidence: Evidence,
  declarations: ReviewSourceQualification[],
): boolean {
  return declarations.some((declaration) => declaration.sourceKind === evidence.sourceKind
    && (declaration.sourceIdentity === evidence.sourceIdentity
      || declaration.sourceIdentity === evidence.reviewerClaim)
    && sourceQualified(requirement, declaration));
}

function receiptCurrent(requirement: ReviewRequirement, receipt: ReviewReceipt): boolean {
  return receipt.request.requirementId === requirement.id
    && receipt.request.changeSetId === requirement.changeSetId
    && receipt.request.policyVersion === requirement.policyVersion
    && receipt.request.rubricVersion === requirement.rubricVersion;
}

function receiptPolicyRelevant(requirement: ReviewRequirement, receipt: ReviewReceipt): boolean {
  return receipt.request.requirementId === requirement.id
    && receipt.request.policyVersion === requirement.policyVersion
    && receipt.request.rubricVersion === requirement.rubricVersion;
}

function awaitsAuthorizedFollowUp(input: {
  sourceIdentity: string;
  findingId: string;
  originHeadSha: string;
  currentHeadSha: string;
  authorizedActorIdentity: string | null;
  evidence: Evidence[];
  receipts: ReviewReceipt[];
}): boolean {
  if (input.authorizedActorIdentity === null || input.originHeadSha === input.currentHeadSha) return false;
  const authorization = input.receipts.find((receipt) => receipt.action === "begin-fix"
    && receipt.payload.kind === "head-update-authorization"
    && receipt.payload.oldHeadSha === input.originHeadSha
    && receipt.payload.targetHeadSha === input.currentHeadSha
    && receipt.payload.actorIdentity === input.authorizedActorIdentity
    && receipt.findingIds.includes(input.findingId));
  if (authorization === undefined) return false;
  const consumed = input.receipts.some((receipt) => receipt.action === "head-update-consumed"
    && receipt.payload.kind === "head-update-consumption"
    && receipt.payload.authorizationReceiptHash === authorization.receiptHash
    && receipt.payload.oldHeadSha === input.originHeadSha
    && receipt.payload.newHeadSha === input.currentHeadSha
    && receipt.findingIds.includes(input.findingId));
  const followUpArrived = input.evidence.some((item) => item.sourceIdentity === input.sourceIdentity
    && item.headSha === input.currentHeadSha
    && item.coverage === "full"
    && item.coverageThroughSha === input.currentHeadSha);
  return consumed && !followUpArrived;
}

function requestFor(
  input: ReviewGateReductionInput,
  requirement: ReviewRequirement,
  declaration: ReviewSourceQualification,
  generation: number,
): ReviewRequest {
  const requiredActorIdentity = declaration.requiredActorIdentity ?? input.actorIdentity;
  return {
    schemaVersion: 1,
    repositoryId: input.changeRequest.repositoryId,
    changeRequestId: input.changeRequest.changeRequestId,
    changeSetId: requirement.changeSetId,
    policyVersion: requirement.policyVersion,
    semanticsVersion: REVIEW_SEMANTICS_VERSION,
    rubricVersion: requirement.rubricVersion,
    requirementId: requirement.id,
    sourceIdentity: declaration.sourceIdentity,
    coverage: "full",
    coverageFromSha: input.changeRequest.diffBaseSha,
    coverageThroughSha: input.changeRequest.headSha,
    generation,
    actorIdentity: input.actorIdentity,
    requestMechanism: declaration.requestMechanism,
    requiredActorIdentity,
    requestCommand: declaration.requestCommand,
  };
}

function policyProjection(decision: ReviewGatePolicyDecision): GateProjection["policyDecision"] {
  return {
    lane: decision.lane,
    reviewRisk: decision.reviewRisk,
    disposition: decision.disposition,
    reasons: decision.reasons,
    policyVersion: decision.policyVersion,
  };
}

/** Reduce one canonical self-hosting snapshot into the next request and neutral gate projection. */
export function reduceReviewGate(input: ReviewGateReductionInput): GateReductionDecision {
  const policyDecision = input.policyDecision;
  const inconsistencies = [...input.inconsistencies];
  const verdictRequirements: VerdictRequirement[] = [];
  const projectionEvidence: GateProjection["evidence"] = [];
  let request: ReviewRequest | null = null;
  const receiptsToAppend: ReviewReceipt[] = [];

  for (const policyRequirement of policyDecision.requirements) {
    const requirement = applyRequiredOverride(policyRequirement, input.receipts);
    const receipts = input.receipts.filter((receipt) => receiptCurrent(requirement, receipt));
    const evidence = input.evidence.filter((item) => item.requirementId === requirement.id
      && evidenceQualified(requirement, item, input.qualifications));
    const settlementReceipts = input.receipts.filter((receipt) => receiptPolicyRelevant(requirement, receipt));
    const coverage = reduceCoverage({
      requirement,
      baseRef: input.changeRequest.baseRef,
      diffBaseSha: input.changeRequest.diffBaseSha,
      headSha: input.changeRequest.headSha,
      evidence,
      lifecycleTail: input.lifecycleTail ?? null,
      lifecycleTailPredicateId: input.lifecycleTailPredicateId,
    });
    const findings = reduceFindings({
      evidence: coverage.stateEvidence,
      currentChangeSetId: coverage.stateChangeSetId,
    });
    const settlements = reduceFindingSettlements({
      evidence,
      receipts: settlementReceipts,
      currentHeadSha: input.changeRequest.headSha,
      ciState: input.ciState,
      authorizedActorIdentity: input.settlementActorIdentity,
      qualifiedClosureSources: input.qualifications
        .filter((declaration) => declaration.closureCapability && sourceQualified(requirement, declaration))
        .map((declaration) => declaration.sourceIdentity),
    });
    const findingsConsistent = findings.consistent && settlements.errors.length === 0;
    const blockingOpenFindingCount = settlements.openFindings.filter((finding) => !awaitsAuthorizedFollowUp({
      sourceIdentity: finding.sourceIdentity,
      findingId: finding.findingId,
      originHeadSha: finding.originHeadSha,
      currentHeadSha: input.changeRequest.headSha,
      authorizedActorIdentity: input.settlementActorIdentity,
      evidence,
      receipts: settlementReceipts,
    })).length;
    inconsistencies.push(...findings.errors, ...settlements.errors);
    const candidates = input.qualifications.filter((declaration) =>
      declaration.transport === "durable-record" && sourceQualified(requirement, declaration));
    const candidateRequests = candidates.map((declaration) => requestFor(
      input,
      requirement,
      declaration,
      receipts.filter((receipt) => receipt.request.sourceIdentity === declaration.sourceIdentity)
        .reduce((generation, receipt) => Math.max(generation, receipt.request.generation), 0),
    ));
    const fallback = input.ledgerVersion === null
      ? { kind: "blocked" as const, reason: "ledger-unavailable" }
      : resolveProviderFallback({
          orderedCandidates: candidateRequests,
          capacities: input.capacities,
          receipts: input.receipts,
          ledgerVersion: input.ledgerVersion + receiptsToAppend.length,
          now: input.now ?? new Date(0),
        });
    if (fallback.kind === "append-supersession") receiptsToAppend.push(fallback.receipt);
    const selectedCandidateRequest = fallback.kind === "append-supersession" ? undefined : fallback.request;
    const candidate = selectedCandidateRequest !== undefined
      ? candidates.find((item) => item.sourceIdentity === selectedCandidateRequest.sourceIdentity)
      : undefined;
    const capacity = candidate === undefined
      ? null
      : input.capacities.find((item) => item.sourceIdentity === candidate.sourceIdentity) ?? null;
    const waived = receipts.some((receipt) => receipt.action === "waived"
      && receipt.request.sourceIdentity === COMMAND_RECEIPT_SOURCE);
    const state = reduceRequirementState({
      requirement,
      evidence,
      currentEvidence: coverage.stateEvidence,
      receipts,
      capacity,
      waived,
      coverageSatisfied: coverage.satisfied,
      findingsConsistent,
      openFindingCount: blockingOpenFindingCount,
    });
    const latestEvidence = [...coverage.stateEvidence]
      .sort((left, right) => left.observedAt.localeCompare(right.observedAt))
      .at(-1);
    const latestReceipt = receipts.at(-1);
    verdictRequirements.push({
      requirement,
      state: state.state,
      sourceIdentity: latestEvidence?.sourceIdentity ?? latestReceipt?.request.sourceIdentity ?? candidate?.sourceIdentity ?? null,
      detail: coverage.carriedForward && state.state === "clean"
        ? "carried forward by lifecycle tail"
        : state.detail,
    });
    projectionEvidence.push(...coverage.chain.map((item) => ({
      requirementId: requirement.id,
      sourceIdentity: item.sourceIdentity,
      coverage: item.coverage,
      evidenceRef: item.evidenceUrlOrId,
    })));

    if (
      request === null
      && input.ledgerVersion !== null
      && candidate !== undefined
      && capacity !== null
      && (state.state === "not-requested" || state.state === "stale")
    ) {
      const admission = admitAutomaticRequest({
        requirement,
        ready: input.readiness.mergeability === "mergeable"
          && input.ciState === "success"
          && findingsConsistent
          && !input.nativeReview.requestedChanges
          && input.nativeReview.unresolvedRequiredConversations === 0
          && input.nativeReview.decision !== "changes-requested",
        draft: input.readiness.draft,
        history: receipts,
        capacity,
      });
      if (admission.admit && admission.generation !== null) {
        request = requestFor(input, requirement, candidate, admission.generation);
      }
    }
  }

  const verdict = reduceGateVerdict({
    readiness: {
      ...input.readiness,
      enforceBaseFreshness: false,
    },
    ci: { state: input.ciState },
    requirements: verdictRequirements,
    nativeReview: input.nativeReview,
    inconsistencies,
  });
  const admittedRequest = verdict.conclusion === "failure" ? null : request;
  const projection = renderGateProjection({
      verdict,
      policy: policyProjection(policyDecision),
      ciState: input.ciState,
      ledgerVersion: input.ledgerVersion,
      receiptRefs: input.receiptRefs,
      evidence: projectionEvidence,
    });
  return {
    request: admittedRequest,
    receiptsToAppend,
    projection,
    action: deriveReviewGateAction({
      repositoryId: input.changeRequest.repositoryId,
      changeRequestId: input.changeRequest.changeRequestId,
      headSha: input.changeRequest.headSha,
      request: admittedRequest,
      projection,
    }),
  };
}
