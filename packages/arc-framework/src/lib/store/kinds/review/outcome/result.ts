/** Reproduce portable result identities from immutable admission facts. */
import { canonicalDigest, canonicalize, type CanonicalDigest } from "../../../../kernel/index.js";
import { dispositionSetMatchesSourceContext, type DispositionSet, type DispositionSourceContext } from "../../../../../scripts/review-gate/core/disposition-records.js";
import type { ReviewOutcome } from "./schema.js";

/** Reproduce the original producer result digest, or return null when no result was recorded. */
export function reviewOutcomeResultDigest(outcome: ReviewOutcome): CanonicalDigest | null {
  if (outcome.frontline !== undefined) return outcome.frontline.outcomeDigest;
  if (outcome.hosted !== undefined) return outcome.hosted.sealedResult?.hostedResultId ?? null;
  const local = outcome.local;
  if (local?.receipt === undefined) return null;
  return canonicalDigest({ domain: "arc.review.local-result/v1", producerId: outcome.attemptId, receipt: local.receipt,
    admission: { lineage: outcome.lineage, logicalPass: outcome.logicalPass, retryGeneration: outcome.retryGeneration,
      laneSourceId: outcome.source.sourceId, target: outcome.target, requirement: outcome.requirement,
      request: local.request, attestation: local.attestation, policyBindingDigest: local.policyBindingDigest,
      sourceDigest: local.sourceDigest, guidanceDigest: local.guidanceDigest, requestedCoverage: local.requestedCoverage,
      correctionScope: local.correctionScope ?? null, effectiveCoverage: local.effectiveCoverage, scopeMode: local.scopeMode,
      deliveryAdmission: local.deliveryAdmission ?? null } });
}

/** Project exactly the policy and source identities an existing disposition approval binds. */
export function reviewOutcomeDispositionContext(outcome: ReviewOutcome): DispositionSourceContext | null {
  const resultDigest = reviewOutcomeResultDigest(outcome);
  if (resultDigest === null) return null;
  const producer = { producerId: outcome.attemptId, resultDigest };
  if (outcome.frontline !== undefined) return { ...producer, kind: "frontline",
    policyVersion: outcome.frontline.admission.policyVersion,
    frontlineBinding: { operationId: outcome.attemptId, sourceBindingId: outcome.frontline.sourceBindingId,
      outcomeDigest: resultDigest } };
  if (outcome.requirement === undefined) return null;
  return { ...producer, kind: "rubric", policyVersion: outcome.requirement.policyVersion,
    rubricVersion: outcome.requirement.rubricVersion, rubricDigest: outcome.requirement.rubricDigest };
}

/** Compare the canonical producer, target, result context, and reported findings of one approved set. */
export function reviewOutcomeMatchesDispositionSet(outcome: ReviewOutcome, set: DispositionSet): boolean {
  const context = reviewOutcomeDispositionContext(outcome);
  if (outcome.outcome !== "findings" || context === null || set.targetId !== outcome.target.targetId
    || !dispositionSetMatchesSourceContext(set, context)) return false;
  const expected = outcome.findings.map(({ findingId, severity, locus, nit }) => ({ findingId, severity, locus, nit: nit === true }))
    .sort((left, right) => left.findingId.localeCompare(right.findingId));
  const actual = set.findings.map(({ findingId, reportedSeverity, locus, reportedNit }) =>
    ({ findingId, severity: reportedSeverity, locus, nit: reportedNit === true }))
    .sort((left, right) => left.findingId.localeCompare(right.findingId));
  return canonicalize(expected) === canonicalize(actual)
    && set.findings.every(({ sourceIdentity }) => sourceIdentity === outcome.source.sourceId);
}
