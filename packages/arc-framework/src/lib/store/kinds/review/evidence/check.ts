/** Cross-record and monotonic-write admission for approved review evidence. */
import type { BrokenRule, WriteCheckInput } from "../../../write-check.js";
import { parseReviewEvidence } from "./parser.js";
import { checkReviewEvidenceResult } from "./result-check.js";
import { brokenRule } from "../../rule-support.js";
import { isReviewEvidenceAdvance } from "./advances.js";
import { readEvidenceHistory } from "./history.js";
import { checkEvidenceSuccession } from "./succession.js";
import { checkEvidenceSettlementCarry } from "./settlement-check.js";

/** Admit complete evidence and only its permitted in-place advances. */
export async function checkReviewEvidence(input: WriteCheckInput): Promise<readonly BrokenRule[]> {
  if (input.next === undefined) return [brokenRule("review.evidence.advance", "Approved response evidence cannot be removed.",
    "Preserve this record and use its permitted monotonic advances.")];
  const value = parseReviewEvidence(input.next.content);
  if (value === null) return [];
  const rules = input.reference.key === value.dispositionSet.dispositionSetId ? [] : [brokenRule("review.evidence.key",
    "The evidence key differs from its approved disposition set.", "Store this response under its dispositionSetId.")];
  const [before, after] = await Promise.all([readEvidenceHistory(input, input.before), readEvidenceHistory(input, input.after)]);
  if (before.status !== "known") rules.push(before.rule);
  if (after.status !== "known") rules.push(after.rule);
  if (before.status !== "known" || after.status !== "known") return rules;
  const prior = input.prior === undefined ? undefined : parseReviewEvidence(input.prior.content);
  if (input.prior !== undefined) {
    if (prior === null || prior === undefined || !isReviewEvidenceAdvance(prior, value)) rules.push(brokenRule("review.evidence.advance",
      "The write changes approved evidence outside its permitted in-place advances.",
      "Preserve existing evidence and perform one permitted monotonic advance."));
  }
  return [...rules, ...checkEvidenceSuccession(value, prior ?? undefined, before.value, after.value),
    ...checkEvidenceSettlementCarry(value, after.value),
    ...await checkReviewEvidenceResult(input, value)];
}
