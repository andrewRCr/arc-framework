/** Resolve response references to imported producers while preserving their operation binding. */
import { bindReviewSourceReference, parseReviewSourceReference, type ReviewSourceReferenceOwner } from "../../../../scripts/review-gate/core/review-source-reference.js";
import type { IntegrationBoundaryLocus } from "../../../../scripts/review-gate/policy/integration-boundary-locus.js";
import type { MappedReviewOutcome } from "./mapping-source-listing.js";
import { reviewOutcomeKey } from "./outcome/key.js";

type ResponseSource = NonNullable<Extract<IntegrationBoundaryLocus["nextAction"], { kind: "continue-pre-publication-review" }>["responseSource"]>;

/** Translate the durable coordinate of an original bound response source, binding the imported owner. */
export function mapReviewResponseSource(source: ResponseSource, outcomes: readonly MappedReviewOutcome[],
  owner: ReviewSourceReferenceOwner): ResponseSource {
  const original = source.kind === "attested-local" ? source.receiptRef
    : source.kind === "frontline" ? source.outcomeRef : source.attemptRef;
  const reference = parseReviewSourceReference(original, source.kind);
  const attemptId = source.kind === "hosted" ? reference.durableRef : reference.operationId;
  const producer = outcomes.find(({ outcome }) => outcome.attemptId === attemptId);
  if (producer === undefined) throw new Error(`Response source ${attemptId} has no mapped live result.`);
  const durableRef = source.kind === "hosted" ? producer.outcome.attemptId : reviewOutcomeKey(producer.outcome);
  const mapped = bindReviewSourceReference({ kind: reference.kind, operationId: reference.operationId, durableRef,
    repositoryId: owner.repositoryId, workItem: owner.workItem });
  return source.kind === "attested-local" ? { kind: source.kind, receiptRef: mapped }
    : source.kind === "frontline" ? { kind: source.kind, outcomeRef: mapped } : { kind: source.kind, attemptRef: mapped };
}
