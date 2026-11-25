/** Complete branch validation shared by approval reads and repair admission. */
import { canonicalize } from "../../../../kernel/index.js";
import { orderReviewEvidenceBranch, reviewEvidenceLineageRefusal } from "../evidence/composed-record.js";
import type { ReviewEvidence } from "../evidence/schema.js";
import type { ReviewOutcome } from "../outcome/schema.js";
import { reviewOutcomeMatchesDispositionSet } from "../outcome/result.js";
import { reviewOutcomeKey } from "../outcome/key.js";
import { checkEvidenceEdges } from "../evidence/succession.js";
import { checkProducerPerformance } from "../evidence/result-check.js";
import { checkHostedEvidence } from "../evidence/hosted-check.js";
import { checkEvidenceSettlementCarry } from "../evidence/settlement-check.js";

/** Partition every approved response into complete producer-bound linear branches. */
export function reviewEvidenceBranches(outcome: ReviewOutcome, evidence: readonly ReviewEvidence[]): ReviewEvidence[][] {
  const records = new Map(evidence.map(value => [value.dispositionSet.dispositionSetId, value]));
  if (records.size !== evidence.length) throw reviewEvidenceLineageRefusal(evidence, "key", "Restore uniquely keyed approved responses.");
  const roots = evidence.filter(value => value.predecessorDispositionSetId === null)
    .sort((left, right) => left.dispositionSet.dispositionSetId.localeCompare(right.dispositionSet.dispositionSetId));
  const branches = roots.map(root => orderReviewEvidenceBranch(root, records));
  const visited = branches.flat();
  if (visited.length !== evidence.length || new Set(visited.map(value => value.dispositionSet.dispositionSetId)).size !== evidence.length) {
    throw reviewEvidenceLineageRefusal(evidence, "connected", "Restore all complete, disjoint approved-response branches before selecting roots.");
  }
  const binding = canonicalize(evidence[0]?.binding ?? null);
  for (const value of evidence) {
    if (value.result.outcomeKey !== reviewOutcomeKey(outcome) || !reviewOutcomeMatchesDispositionSet(outcome, value.dispositionSet)
      || canonicalize(value.binding) !== binding) throw reviewEvidenceLineageRefusal(evidence, "context",
        "Restore consistent approved-response source and target context for these records, then retry.");
    const rules = [...checkEvidenceEdges(value, value, records, records), ...checkProducerPerformance(value, outcome),
      ...checkHostedEvidence(value, outcome), ...checkEvidenceSettlementCarry(value, records)];
    const first = rules[0];
    if (first !== undefined) throw reviewEvidenceLineageRefusal(evidence, first.rule.replace(/^review\.evidence\./u, ""),
      first.remedy.text, first.condition);
  }
  return branches;
}
