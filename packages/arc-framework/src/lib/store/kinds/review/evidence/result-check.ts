/** Producer-bound admission rules for approved review evidence. */
import type { BrokenRule, WriteCheckInput } from "../../../write-check.js";
import { recordReferences } from "../../../identity.js";
import { observeRecord, brokenRule } from "../../rule-support.js";
import type { ReviewEvidence } from "./schema.js";
import { decodeReviewOutcome } from "../outcome/parser.js";
import { reviewOutcomeMatchesDispositionSet } from "../outcome/result.js";
import { reviewOutcomeKey } from "../outcome/key.js";
import { canonicalize } from "../../../../kernel/index.js";
import type { ReviewOutcome } from "../outcome/schema.js";
import { checkHostedEvidence } from "./hosted-check.js";

/** Check an approved response against its exact immutable producer outcome. */
export async function checkReviewEvidenceResult(input: WriteCheckInput, value: ReviewEvidence): Promise<readonly BrokenRule[]> {
  const observed = await observeRecord(input.after, recordReferences["review/outcome"](input.reference.owner, value.result.outcomeKey));
  if (observed.status !== "known") return [brokenRule("review.evidence.outcome-unavailable",
    observed.status === "absent" ? "The response's outcome is missing on this work item." : observed.condition,
    "Restore the exact producer outcome on this work item before retrying.")];
  const decoded = decodeReviewOutcome(observed.value.content);
  if (!decoded.success || reviewOutcomeKey(decoded.data) !== value.result.outcomeKey
    || !reviewOutcomeMatchesDispositionSet(decoded.data, value.dispositionSet)) {
    return [brokenRule("review.evidence.outcome-binding", decoded.success
      ? "The approved response does not match the exact outcome identity, context, and findings." : decoded.error,
    "Restore a valid outcome under its exact producer key.")];
  }
  return [...checkProducerPerformance(value, decoded.data), ...checkHostedEvidence(value, decoded.data)];
}

function checkProducerPerformance(value: ReviewEvidence, outcome: ReviewOutcome): readonly BrokenRule[] {
  if (value.performance !== undefined && value.performance.originatingHeadSha !== outcome.target.headSha) {
    return [brokenRule("review.evidence.performance-target", "The performed response differs from its producer's original reviewed head.",
      "Retain the exact original head from the outcome in the performed response.")];
  }
  if (value.performance?.candidateResponseId !== undefined && outcome.lineage.kind !== "candidate") {
    return [brokenRule("review.evidence.response-lineage", "Only a Candidate-lineage producer may carry a Candidate response digest.",
      "Retain the producer's original lineage and omit an ineligible Candidate response digest.")];
  }
  if (value.binding?.kind === "candidate-member" && value.dispositionSet.findings.some(({ disposition }) => disposition === "fix")
    && value.binding.deliveryMember.head !== outcome.target.headSha) {
    return [brokenRule("review.evidence.private-member-head", "The private member differs from the original approved fix head.",
      "Bind the private member to the producer outcome's original fix head.")];
  }
  return checkPerformanceSource(value, outcome);
}

function checkPerformanceSource(value: ReviewEvidence, outcome: ReviewOutcome): readonly BrokenRule[] {
  const response = value.performance?.fixResponse;
  if (response !== undefined && (canonicalize(response.hostedTarget) !== canonicalize(outcome.hosted?.target ?? null)
    || value.binding?.kind === "delivery-member" && (outcome.source.kind === "frontline"
      || !("hostedFixTarget" in response)
      || (response.hostedFixTarget !== null) !== (outcome.source.kind === "hosted")))) {
    return [brokenRule("review.evidence.performance-source", "The performed fix does not retain its producer's originating change request.",
      "Use the source kind and exact change request recorded by the producer outcome.")];
  }
  return [];
}
