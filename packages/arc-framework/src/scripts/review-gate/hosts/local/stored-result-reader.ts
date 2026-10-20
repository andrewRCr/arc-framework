/** Immutable producer results read from the invocation's portable review facts. */
import type { ReviewOutcomePort, ReviewResultReader } from "../../core/ports.js";
import type { ReviewResult } from "../../core/review-result.js";
import type { ReviewOutcome } from "../../../../lib/store/kinds/review/outcome/schema.js";
import type { OwnerIdentity } from "../../../../lib/store/identity.js";
import { ProjectIdentityError } from "../../../../lib/store/project-identity.js";
import { reviewOutcomeKey } from "../../../../lib/store/kinds/review/outcome/key.js";
import { reviewOutcomeResultDigest } from "../../../../lib/store/kinds/review/outcome/result.js";
import { LocalReviewResultReaderError } from "./review-result-reader.js";

/** Read results without requiring machine-local execution or source records. */
export class StoredReviewResultReader implements ReviewResultReader {
  constructor(private readonly dependencies: { outcomes: ReviewOutcomePort; readProjectId: () => Promise<string> }) {}

  /** Read one exact producer admitted under the selected native owner. */
  async readResult(producerId: string): Promise<ReviewResult> {
    try {
      const projectId = await this.dependencies.readProjectId();
      const listing = await this.dependencies.outcomes.list();
      if (listing.status !== "complete") throw new LocalReviewResultReaderError("corrupt-result", listing.reason);
      const matches = listing.records.filter(({ value }) => value.attemptId === producerId);
      if (matches.length === 0) throw new LocalReviewResultReaderError("missing-producer", `No review producer matches '${producerId}'.`);
      if (matches.length !== 1) throw new LocalReviewResultReaderError("ambiguous-result");
      const stored = matches[0];
      if (stored === undefined) throw new LocalReviewResultReaderError("missing-producer");
      if (stored.value.target.repositoryId !== projectId || stored.reference.owner.type !== "work-item"
        || stored.reference.owner.uid === undefined) throw new LocalReviewResultReaderError("corrupt-result", "Restore the producer under its selected project and exact work-item owner.");
      return stored.value.frontline === undefined ? localResult(stored.value, stored.reference.owner)
        : frontlineResult(stored.value, stored.reference.owner);
    } catch (error) {
      if (error instanceof LocalReviewResultReaderError || error instanceof ProjectIdentityError) throw error;
      throw new LocalReviewResultReaderError("corrupt-result", error instanceof Error ? error.message : "producer result cannot be validated");
    }
  }
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
    outcome: { schemaVersion: 1, semanticsVersion: "frontline-review/v1", source: admission.frontlineReview.source,
      target: outcome.target, pass: outcome.logicalPass, maxPasses: admission.maxPasses,
      outcome: outcome.outcome, findings: outcome.findings, reason: null },
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
