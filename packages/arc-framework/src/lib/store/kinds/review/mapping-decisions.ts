/** Pure decisions reconstructed from native lane authorization histories. */
import { recordReferences, type OwnerIdentity } from "../../identity.js";
import type { LaneProgressState, ConditionalPassAuthorization } from "../../../../scripts/review-gate/core/operation-state-schema.js";
import type { ReviewDecision } from "./decision/schema.js";
import { reviewDecisionKey } from "./decision/key.js";
import type { MappedReviewOutcome } from "./mapping-source-listing.js";
import type { ReviewMappingResult } from "./mapping-types.js";

/** Serialize a decision with its content key and imported owner identity. */
export function mappedReviewDecision(owner: OwnerIdentity, decision: ReviewDecision): ReviewMappingResult["records"][number] {
  return { reference: recordReferences["review/decision"](owner, reviewDecisionKey(decision)),
    contents: [JSON.stringify(decision)] };
}

function authorizationDecision(authorization: ConditionalPassAuthorization): ReviewDecision {
  return { schemaVersion: 1,
    subject: { lineage: authorization.lineage, headSha: authorization.originatingHeadSha, subjectDigest: null },
    lane: authorization.lane, choice: { kind: "extra-pass", passCount: authorization.exhaustedPassCount,
      precondition: { kind: "approved-fix", repositoryId: authorization.repositoryId, producerId: authorization.producerId,
        dispositionSetId: authorization.dispositionSetId, originatingHeadSha: authorization.originatingHeadSha,
        exhaustedPassCount: authorization.exhaustedPassCount } },
    decidedBy: authorization.authorizedBy, decidedAt: authorization.capturedAt, basis: null };
}

function citeConsumedAuthorization(authorization: ConditionalPassAuthorization, state: LaneProgressState,
  outcomes: readonly MappedReviewOutcome[]): void {
  if (authorization.status !== "consumed") return;
  const index = state.attempts.findIndex((attempt) =>
    (attempt.hosted?.admission.admissionId ?? attempt.attemptId) === authorization.admissionId);
  const admitted = state.attempts[index];
  if (admitted === undefined) throw new Error(`Consumed admission ${authorization.admissionId} is unavailable.`);
  const attempts = state.attempts.slice(index).filter((attempt) => attempt.logicalPass === admitted.logicalPass
    && attempt.sourceId === admitted.sourceId && attempt.retryGeneration >= admitted.retryGeneration);
  for (const attempt of attempts) {
    const mapped = outcomes.find(({ outcome }) => outcome.attemptId === attempt.attemptId
      && outcome.lane === state.lane && outcome.target.repositoryId === state.repositoryId);
    if (mapped !== undefined) mapped.outcome = { ...mapped.outcome, admittedBy: authorization.authorizationId };
  }
}

/** Retain every authorization entry owned by an imported ended producer. */
export function mapReviewLaneDecisions(state: LaneProgressState, outcomes: readonly MappedReviewOutcome[]): ReviewMappingResult["records"] {
  return state.attempts.flatMap((attempt) => {
    const producer = outcomes.find(({ outcome }) => outcome.attemptId === attempt.attemptId);
    if (producer === undefined) return [];
    return (attempt.conditionalPassAuthorizations?.authorizations ?? []).flatMap((authorization) => {
      citeConsumedAuthorization(authorization, state, outcomes);
      const decision = authorizationDecision(authorization);
      const mapped = [mappedReviewDecision(producer.reference.owner, decision)];
      if (authorization.status === "invalidated" && authorization.reason === "withdrawn") {
        mapped.push(mappedReviewDecision(producer.reference.owner, { ...decision,
          choice: { kind: "withdrawal", decisionKey: authorization.authorizationId },
          decidedBy: authorization.withdrawnBy, decidedAt: authorization.invalidatedAt }));
      }
      return mapped;
    });
  });
}

/** Coalesce content-addressed decisions while retaining all other mapped record histories. */
export function coalesceReviewDecisionRecords(records: ReviewMappingResult["records"]): ReviewMappingResult["records"] {
  const seen = new Set<string>();
  return records.filter(({ reference }) => {
    if (reference.kind !== "review/decision") return true;
    const identity = JSON.stringify(reference);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}
