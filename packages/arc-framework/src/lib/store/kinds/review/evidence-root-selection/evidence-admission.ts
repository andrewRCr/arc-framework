/** Selected-branch authority checked against the writer's captured final view. */
import { canonicalize } from "../../../../kernel/index.js";
import { recordReferences } from "../../../identity.js";
import { StoreRefusalError } from "../../../refusal-error.js";
import type { BrokenRule, WriteCheckInput } from "../../../write-check.js";
import type { StoreRecord } from "../../../read.js";
import { observeRecord, brokenRule } from "../../rule-support.js";
import type { EvidenceHistory } from "../evidence/history.js";
import type { ReviewEvidence } from "../evidence/schema.js";
import { decodeReviewOutcome } from "../outcome/parser.js";
import { reviewRecordConflict } from "../check-conflicts.js";
import { reviewEvidenceRootSelectionKey } from "./key.js";
import { decodeReviewEvidenceRootSelection } from "./parser.js";
import { reviewRootSelectionPreviewRemedy } from "./remedy.js";
import { selectReviewEvidenceBranch } from "./selection.js";
import type { ReviewEvidenceRootSelection } from "./schema.js";

/** Permit selected monotonic advances and excluded exact replays, retaining ordinary new-root rejection. */
export async function checkSelectedEvidenceAdvance(input: WriteCheckInput, value: ReviewEvidence,
  prior: ReviewEvidence | undefined, after: EvidenceHistory): Promise<{ validSelection: boolean; rules: readonly BrokenRule[] }> {
  const producerId = value.dispositionSet.producerId;
  const remedy = reviewRootSelectionPreviewRemedy(input.reference.owner, producerId);
  const fail = (condition: string): { validSelection: false; rules: BrokenRule[] } => ({ validSelection: false,
    rules: [brokenRule("review.evidence-root-selection.advance", condition, remedy)] });
  const selector = await observeRecord(input.after, recordReferences["review/evidence-root-selection"](input.reference.owner,
    reviewEvidenceRootSelectionKey(input.reference.owner, producerId)));
  if (selector.status === "unavailable") return fail(selector.condition);
  const evidence = [...after.values()].filter(entry => entry.dispositionSet.producerId === producerId);
  if (selector.status === "absent" && usesOrdinaryRootAdmission(input, value, prior, evidence)) {
    return { validSelection: false, rules: [] };
  }
  const decoded = selector.status === "known" ? decodeAdvanceSelector(selector.value, remedy) : { selection: null };
  if ("rule" in decoded) return { validSelection: false, rules: [decoded.rule] };
  const { selection } = decoded;
  const outcome = await observeRecord(input.after, recordReferences["review/outcome"](input.reference.owner, value.result.outcomeKey));
  if (outcome.status !== "known") return fail("Restore the exact immutable producer outcome before advancing response authority.");
  const conflict = reviewRecordConflict(outcome.value, "review.evidence-root-selection.outcome");
  if (conflict !== null) return { validSelection: false, rules: [conflict] };
  const producer = decodeReviewOutcome(outcome.value.content);
  if (!producer.success) return fail(producer.error);
  try {
    const selected = selectReviewEvidenceBranch(input.reference.owner, producer.data, evidence,
      selection);
    if (input.purpose === "sync-observation") {
      return { validSelection: selection !== null, rules: [] };
    }
    if (!selected.some(entry => entry.dispositionSet.dispositionSetId === value.dispositionSet.dispositionSetId)
      && (prior === undefined || canonicalize(prior) !== canonicalize(value))) {
      return fail("Only the selected approved-response branch may advance; excluded branches permit exact replay alone.");
    }
    return { validSelection: selection !== null, rules: [] };
  } catch (error) {
    if (!(error instanceof StoreRefusalError) || error.refusal.code !== "record-malformed") throw error;
    return { validSelection: false, rules: [{ rule: error.refusal.rule, condition: error.refusal.condition, remedy: error.refusal.remedy }] };
  }
}

function usesOrdinaryRootAdmission(input: WriteCheckInput, value: ReviewEvidence, prior: ReviewEvidence | undefined,
  evidence: readonly ReviewEvidence[]): boolean {
  const newLocalRoot = prior === undefined && value.predecessorDispositionSetId === null
    && input.purpose !== "sync-observation";
  return newLocalRoot || evidence.filter(entry => entry.predecessorDispositionSetId === null).length <= 1;
}

function decodeAdvanceSelector(record: StoreRecord, remedy: string):
  { selection: ReviewEvidenceRootSelection } | { rule: BrokenRule } {
  const conflict = reviewRecordConflict(record, "review.evidence-root-selection.conflict");
  if (conflict !== null) return { rule: { ...conflict, remedy: { text: remedy } } };
  const decoded = decodeReviewEvidenceRootSelection(record.content);
  return decoded.success ? { selection: decoded.data } : { rule: brokenRule("review.evidence-root-selection.schema",
    `The selector at ${JSON.stringify(record.reference)} is malformed: ${decoded.error}`,
    `Restore the exact selector content at ${JSON.stringify(record.reference)} before previewing root selection.`) };
}
