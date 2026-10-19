/** Cross-record admission for immutable review decisions. */
import type { BrokenRule, WriteCheckInput } from "../../../write-check.js";
import { brokenRule } from "../../rule-support.js";
import { readDecisionCheckHistory } from "./history.js";
import { parseReviewDecision, decodeReviewDecision } from "./parser.js";
import { reviewDecisionKey } from "./key.js";
import { decodeReviewOutcome } from "../outcome/parser.js";
import type { ReviewDecision } from "./schema.js";
import { laneSubjectOwnerMatches } from "../../../../../scripts/review-gate/core/lane-admission.js";

/** Check the decision's key, producer, and withdrawal authority against the proposed record set. */
export async function checkReviewDecision(input: WriteCheckInput): Promise<readonly BrokenRule[]> {
  if (input.next === undefined) return [];
  const value = parseReviewDecision(input.next.content);
  if (value === null) return [];
  const rules = input.reference.key === reviewDecisionKey(value) ? [] : [brokenRule("review.decision.key",
    "The decision key differs from its content identity.", "Store the decision under its computed key.")];
  if (value.choice.kind !== "withdrawal") return [...rules, ...await checkApprovedFixProducer(input, value)];
  const history = await readDecisionCheckHistory(input, "review/decision", decodeReviewDecision);
  if (history.status !== "known") return [...rules, history.rule];
  const targetKey = value.choice.decisionKey;
  const target = history.entries.find(({ key }) => key === targetKey)?.value;
  if (target === undefined || target.choice.kind === "withdrawal") rules.push(brokenRule("review.decision.withdrawal-target",
    "A withdrawal must name a non-withdrawal decision on the same work item.", "Choose an existing decision on this work item."));
  if (target?.choice.kind !== "extra-pass" || target.choice.precondition.kind !== "approved-fix") return rules;
  if (value.decidedBy !== target.decidedBy) rules.push(brokenRule("review.decision.withdrawal-decider",
    "Only the original authorizer may withdraw this approved-fix pass.", "Record the withdrawal with the original authorizer."));
  const outcomes = await readDecisionCheckHistory(input, "review/outcome", decodeReviewOutcome);
  if (outcomes.status !== "known") return [...rules, outcomes.rule];
  if (outcomes.entries.some(({ value: outcome }) => outcome.admittedBy === targetKey)) {
    rules.push(brokenRule("review.decision.withdrawal-consumed", "An ended attempt already cites this approved-fix admission.",
      "Keep the consumed decision and use its permitted retry or successor continuation."));
  }
  return rules;
}

async function checkApprovedFixProducer(input: WriteCheckInput, value: ReviewDecision): Promise<readonly BrokenRule[]> {
  if (value.choice.kind !== "extra-pass" || value.choice.precondition.kind !== "approved-fix") return [];
  const precondition = value.choice.precondition;
  const history = await readDecisionCheckHistory(input, "review/outcome", decodeReviewOutcome);
  if (history.status !== "known") return [history.rule];
  const producer = history.entries.find(({ value: outcome }) => outcome.attemptId === precondition.producerId
    && outcome.target.repositoryId === precondition.repositoryId && outcome.lane === value.lane
    && laneSubjectOwnerMatches(outcome.lineage, value.subject.lineage)
    && outcome.logicalPass === precondition.exhaustedPassCount && outcome.target.headSha === precondition.originatingHeadSha
    && (outcome.outcome === "clean" || outcome.outcome === "findings"));
  return producer === undefined ? [brokenRule("review.decision.approved-fix-producer",
    `Approved-fix producer ${precondition.producerId} is not a stored finished outcome with this lane, lineage, head, and logical pass.`,
    "Restore the original producer outcome or correct the authorization binding before retrying.")] : [];
}
