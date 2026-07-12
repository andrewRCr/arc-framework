/** Production composition of review-policy, evidence, admission, verdict, and projection reducers. */

import { admitAutomaticRequest } from "./admission.js";
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
import { reduceRequirementState } from "./requirement-state.js";
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
  authorizedDismissers: string[];
  knownHostActors: string[];
  inconsistencies: string[];
  ledgerVersion: number | null;
  lifecycleTail?: LifecycleTailProof | null;
  lifecycleTailPredicateId: string;
  receiptRefs: string[];
  actorIdentity: string;
}

/** Request plus projection emitted by one core reduction. */
export interface GateReductionDecision {
  request: ReviewRequest | null;
  projection: GateProjection;
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

function requestFor(
  input: ReviewGateReductionInput,
  requirement: ReviewRequirement,
  declaration: ReviewSourceQualification,
  generation: number,
): ReviewRequest {
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
    requestMechanism: "automatic",
    requiredActorIdentity: input.actorIdentity,
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

  for (const policyRequirement of policyDecision.requirements) {
    const requirement = applyRequiredOverride(policyRequirement, input.receipts);
    const receipts = input.receipts.filter((receipt) => receiptCurrent(requirement, receipt));
    const evidence = input.evidence.filter((item) => item.requirementId === requirement.id
      && evidenceQualified(requirement, item, input.qualifications));
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
      authorizedDismissers: input.authorizedDismissers,
      knownHostActors: input.knownHostActors,
      dismissalReceipts: receipts
        .filter((receipt) => receipt.action === "dismissed")
        .flatMap((receipt) => receipt.findingIds.map((findingId) => ({
          sourceIdentity: receipt.request.sourceIdentity,
          findingId,
          actorIdentity: receipt.request.actorIdentity,
          reason: receipt.reason,
          durableRef: receipt.evidenceUrlOrId,
        }))),
    });
    inconsistencies.push(...findings.errors);
    const candidates = input.qualifications.filter((declaration) =>
      declaration.transport === "durable-record" && sourceQualified(requirement, declaration));
    if (candidates.length > 1) inconsistencies.push("multiple-invokable-sources");
    const candidate = candidates.length === 1 ? candidates[0] : undefined;
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
      findingsConsistent: findings.consistent,
      openFindingCount: findings.openFindings.length,
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
          && findings.consistent
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
  return {
    request: verdict.conclusion === "failure" ? null : request,
    projection: renderGateProjection({
      verdict,
      policy: policyProjection(policyDecision),
      ciState: input.ciState,
      ledgerVersion: input.ledgerVersion,
      receiptRefs: input.receiptRefs,
      evidence: projectionEvidence,
    }),
  };
}
