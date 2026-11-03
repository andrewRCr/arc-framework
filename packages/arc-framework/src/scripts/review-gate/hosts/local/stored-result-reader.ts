/** Immutable producer results read from the invocation's portable review facts. */
import { StoreRefusalError } from "../../../../lib/store/refusal-error.js";
import { reviewFactListingError } from "../../../../lib/store/kinds/review/fact-access.js";
import { projectStoredFrontlineOutcome } from "../../core/frontline-result.js";
import type { ReviewOutcomePort, ReviewEvidencePort, ReviewResultReader } from "../../core/ports.js";
import type { ReviewResult } from "../../core/review-result.js";
import type { ReviewOutcome } from "../../../../lib/store/kinds/review/outcome/schema.js";
import type { OwnerIdentity } from "../../../../lib/store/identity.js";
import { ProjectIdentityError } from "../../../../lib/store/project-identity.js";
import { reviewOutcomeKey } from "../../../../lib/store/kinds/review/outcome/key.js";
import { reviewOutcomeResultDigest } from "../../../../lib/store/kinds/review/outcome/result.js";
import type { ReviewEvidence } from "../../../../lib/store/kinds/review/evidence/schema.js";
import { reviewOutcomeIsSettled } from "../../../../lib/store/kinds/review/outcome/settlement.js";
import { outcomeLaneOperationId } from "./lane-outcome-composition.js";
import { LocalReviewResultReaderError } from "./review-result-reader.js";

/** Read results without requiring machine-local execution or source records. */
export class StoredReviewResultReader implements ReviewResultReader {
  constructor(private readonly dependencies: { outcomes: ReviewOutcomePort; readProjectId: () => Promise<string>;
    evidence: Pick<ReviewEvidencePort, "list"> }) {}

  /** Read one exact producer admitted under the selected native owner. */
  async readResult(producerId: string): Promise<ReviewResult> {
    try {
      const projectId = await this.dependencies.readProjectId();
      const listing = await this.dependencies.outcomes.list();
      if (listing.status !== "complete") throw listing.refusal === undefined
        ? new LocalReviewResultReaderError("corrupt-result", listing.reason) : reviewFactListingError(listing);
      const matches = listing.records.filter(({ value }) => value.attemptId === producerId);
      if (matches.length === 0) throw new LocalReviewResultReaderError("missing-producer", `No review producer matches '${producerId}'.`);
      if (matches.length !== 1) throw new LocalReviewResultReaderError("ambiguous-result");
      const stored = matches[0];
      if (stored === undefined) throw new LocalReviewResultReaderError("missing-producer");
      if (stored.value.target.repositoryId !== projectId || stored.reference.owner.type !== "work-item"
        || stored.reference.owner.uid === undefined) throw new LocalReviewResultReaderError("corrupt-result", "Restore the producer under its selected project and exact work-item owner.");
      if (stored.value.hosted !== undefined) return await this.readHostedResult(stored.value, stored.reference.owner);
      return stored.value.frontline === undefined ? localResult(stored.value, stored.reference.owner)
        : frontlineResult(stored.value, stored.reference.owner);
    } catch (error) {
      if (error instanceof LocalReviewResultReaderError || error instanceof ProjectIdentityError
        || (error instanceof StoreRefusalError && error.offBranch)) throw error;
      throw new LocalReviewResultReaderError("corrupt-result", error instanceof Error ? error.message : "producer result cannot be validated");
    }
  }

  private async readHostedResult(outcome: ReviewOutcome, workItem: OwnerIdentity): Promise<ReviewResult> {
    const listing = await this.dependencies.evidence.list();
    if (listing.status !== "complete") throw listing.refusal === undefined
      ? new LocalReviewResultReaderError("corrupt-result", listing.reason) : reviewFactListingError(listing);
    return hostedResult(outcome, workItem, listing.records.map(record => record.value));
  }
}

function hostedResult(outcome: ReviewOutcome, workItem: OwnerIdentity, evidence: readonly ReviewEvidence[]): ReviewResult {
  const hosted = outcome.hosted, sealed = hosted?.sealedResult;
  if (hosted === undefined || sealed === undefined || (outcome.outcome !== "clean" && outcome.outcome !== "findings")) {
    throw new LocalReviewResultReaderError("missing-result", "The producer has no immutable hosted verdict.");
  }
  return { kind: "hosted", workItem, producerId: outcome.attemptId, repositoryId: outcome.target.repositoryId,
    target: hosted.reviewTarget, sourceIdentity: outcome.source.sourceId, originalOutcome: outcome.outcome,
    findings: outcome.findings, resultDigest: sealed.hostedResultId,
    admission: { lineage: hosted.admission.lineage, logicalPass: hosted.admission.logicalPass,
      retryGeneration: outcome.retryGeneration, requestedCoverage: hosted.requestedCoverage,
      effectiveCoverage: hosted.effectiveCoverage, scopeMode: "whole-target", policyVersion: hosted.requirement.policyVersion,
      ...(hosted.admission.correctionScope === undefined
        || (hosted.admission.sourceId === "coderabbit-pr" && sealed.coverageEvidence?.status !== "established")
        ? {} : { correctionScope: hosted.admission.correctionScope }) },
    laneOperationId: outcomeLaneOperationId(outcome), actorIdentity: hosted.actorIdentity, hostedTarget: hosted.target,
    requirement: hosted.requirement,
    ...(sealed.coverageEvidence === undefined ? {} : { coverageEvidence: sealed.coverageEvidence }),
    ...(hosted.vehicle === undefined ? {} : { vehicle: hosted.vehicle }),
    hostSettlementFindingIds: sealed.findings.filter(finding => finding.settlement === "reply-and-resolve").map(finding => finding.findingId),
    noHostSettlementFindingIds: sealed.findings.filter(finding => finding.settlement === "not-applicable").map(finding => finding.findingId),
    settled: reviewOutcomeIsSettled(outcome, evidence) };
}

function frontlineResult(outcome: ReviewOutcome, workItem: OwnerIdentity): ReviewResult {
  const frontline = outcome.frontline;
  if (frontline === undefined || (outcome.outcome !== "clean" && outcome.outcome !== "findings")) {
    throw new LocalReviewResultReaderError("missing-result", "The producer has no immutable frontline verdict.");
  }
  const admission = frontline.admission;
  return { kind: "frontline", workItem, producerId: outcome.attemptId, repositoryId: outcome.target.repositoryId,
    target: outcome.target, sourceIdentity: outcome.source.sourceId, originalOutcome: outcome.outcome,
    findings: outcome.findings, resultDigest: frontline.outcomeDigest,
    admission: { lineage: outcome.lineage, logicalPass: outcome.logicalPass, retryGeneration: outcome.retryGeneration,
      requestedCoverage: outcome.requestedCoverage, effectiveCoverage: outcome.effectiveCoverage,
      scopeMode: "whole-target", policyVersion: admission.policyVersion },
    outcomeRef: reviewOutcomeKey(outcome), sourceBindingId: frontline.sourceBindingId,
    executableIdentity: frontline.executableIdentity,
    outcome: projectStoredFrontlineOutcome(outcome),
    ...(frontline.responseBinding === undefined ? {} : { responseBinding: frontline.responseBinding }) };
}

function localResult(outcome: ReviewOutcome, workItem: OwnerIdentity): ReviewResult {
  const local = outcome.local;
  const requirement = outcome.requirement;
  const receipt = local?.receipt;
  const resultDigest = reviewOutcomeResultDigest(outcome);
  if (local === undefined || requirement === undefined || receipt === undefined || resultDigest === null
    || (receipt.result !== "clean" && receipt.result !== "findings")) {
    throw new LocalReviewResultReaderError("missing-result", "The producer has no immutable local verdict.");
  }
  return { kind: "attested-local", workItem, producerId: outcome.attemptId, repositoryId: outcome.target.repositoryId,
    target: outcome.target, sourceIdentity: local.request.evaluatorIdentity, originalOutcome: receipt.result,
    findings: receipt.findings, resultDigest, receiptRef: reviewOutcomeKey(outcome), localSourceRef: local.sourceDigest,
    vehicle: local.vehicle, requirement, request: local.request,
    admission: { lineage: outcome.lineage, logicalPass: outcome.logicalPass, retryGeneration: outcome.retryGeneration,
      requestedCoverage: outcome.requestedCoverage, effectiveCoverage: outcome.effectiveCoverage,
      scopeMode: local.scopeMode, policyVersion: local.policyVersion,
      ...(outcome.correctionScope === undefined ? {} : { correctionScope: outcome.correctionScope }) },
    ...(local.deliveryAdmission === undefined ? {} : { deliveryAdmission: local.deliveryAdmission }) };
}
