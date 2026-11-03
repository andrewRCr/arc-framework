/** Locked cross-record admission for attributed approval-root choices. */
import { canonicalize } from "../../../../kernel/index.js";
import { sameReference, recordReferences } from "../../../identity.js";
import type { StoreRecord } from "../../../read.js";
import { StoreRefusalError } from "../../../refusal-error.js";
import type { BrokenRule, WriteCheckInput } from "../../../write-check.js";
import { brokenRule, observeRecord, observeRecords } from "../../rule-support.js";
import { decodeReviewEvidence } from "../evidence/parser.js";
import { readEvidenceHistory } from "../evidence/history.js";
import { decodeReviewOutcome } from "../outcome/parser.js";
import { reviewRecordConflict } from "../check-conflicts.js";
import { decodeReviewEvidenceRootSelection } from "./parser.js";
import { reviewEvidenceRootSelectionKey } from "./key.js";
import { selectReviewEvidenceBranch } from "./selection.js";
import { reviewRootSelectionPreviewRemedy } from "./remedy.js";
import type { ReviewEvidenceRootSelection } from "./schema.js";

const RESTORE_SELECTION_FACTS = "Restore the complete immutable producer and approved-response inventory, then obtain a fresh root-selection preview.";

/** Admit an exact immutable binding and complete observed inventory under the existing owner lock. */
export async function checkReviewEvidenceRootSelection(input: WriteCheckInput): Promise<readonly BrokenRule[]> {
  const fail = (condition: string, rule = "admission"): BrokenRule[] => [brokenRule(`review.evidence-root-selection.${rule}`,
    condition, RESTORE_SELECTION_FACTS)];
  if (input.next === undefined) return fail("Root selections cannot be removed.", "removal");
  const decoded = decodeReviewEvidenceRootSelection(input.next.content);
  if (!decoded.success) return [];
  const value = decoded.data;
  const identityRule = selectionIdentityRule(input, value);
  if (identityRule !== null) return [identityRule];
  const selected = await observeRecord(input.after, input.reference);
  if (selected.status !== "known") return fail("The proposed selector is unavailable in the final write view.");
  const selectorConflict = reviewRecordConflict(selected.value, "review.evidence-root-selection.conflict");
  if (selectorConflict !== null) return [{ ...selectorConflict,
    remedy: { text: reviewRootSelectionPreviewRemedy(input.reference.owner, value.producerId) } }];
  const evidence = await readEvidenceHistory(input, input.after);
  const outcome = await observeRecord(input.after, recordReferences["review/outcome"](input.reference.owner, value.outcomeKey));
  if (evidence.status !== "known") return [evidence.rule];
  if (outcome.status !== "known") return fail("The bound outcome is unavailable.");
  const conflict = reviewRecordConflict(outcome.value, "review.evidence-root-selection.outcome");
  if (conflict !== null) return [conflict];
  const producer = decodeReviewOutcome(outcome.value.content);
  if (!producer.success) return fail(producer.error, "outcome");
  const values = [...evidence.value.values()].filter(entry => entry.dispositionSet.producerId === value.producerId);
  try { selectReviewEvidenceBranch(input.reference.owner, producer.data, values, value); }
  catch (error) {
    if (!(error instanceof StoreRefusalError) || error.refusal.code !== "record-malformed") throw error;
    return [{ rule: error.refusal.rule, condition: error.refusal.condition, remedy: error.refusal.remedy }];
  }
  if (input.writer.kind === "verb" && input.writer.verb === "sync") return [];
  return checkSelectionObservations(input, value);
}

function selectionIdentityRule(input: WriteCheckInput, value: ReviewEvidenceRootSelection): BrokenRule | null {
  if (input.reference.key !== reviewEvidenceRootSelectionKey(input.reference.owner, value.producerId)) {
    return brokenRule("review.evidence-root-selection.key", "The selector key differs from its exact owner UID and producer.", RESTORE_SELECTION_FACTS);
  }
  if (input.prior !== undefined) {
    const prior = decodeReviewEvidenceRootSelection(input.prior.content);
    if (!prior.success || canonicalize(binding(prior.data)) !== canonicalize(binding(value))) {
      return brokenRule("review.evidence-root-selection.binding",
        "Restore the exact selector content; its immutable producer/result binding cannot change.", RESTORE_SELECTION_FACTS);
    }
  }
  return null;
}

function binding(value: ReviewEvidenceRootSelection) {
  return { producerId: value.producerId, outcomeKey: value.outcomeKey, resultDigest: value.resultDigest };
}

async function checkSelectionObservations(input: WriteCheckInput, value: ReviewEvidenceRootSelection): Promise<readonly BrokenRule[]> {
  const fail = (condition: string): BrokenRule[] => [brokenRule("review.evidence-root-selection.observations", condition,
    reviewRootSelectionPreviewRemedy(input.reference.owner, value.producerId))];
  const before = await observeRecords(input.before, { family: "review", kind: "review/evidence", owner: input.reference.owner });
  const outcome = await observeRecord(input.before, recordReferences["review/outcome"](input.reference.owner, value.outcomeKey));
  if (before.status !== "known" || outcome.status !== "known") return fail("The preview's complete original facts are unavailable.");
  const records = [outcome.value];
  for (const record of before.value) {
    const parsed = decodeReviewEvidence(record.content);
    if (!parsed.success) return fail("The original evidence listing is malformed.");
    if (parsed.data.dispositionSet.producerId === value.producerId) records.push(record);
  }
  return records.every(record => matchesObservation(input, record)) ? []
    : fail("The selector write does not observe every current evidence version and the exact outcome conflict set.");
}

function matchesObservation(input: WriteCheckInput, record: StoreRecord): boolean {
  const observation = input.observations.find(entry => sameReference(entry.reference, record.reference));
  return observation?.expected !== null && observation?.expected !== undefined && observation.expected.version === record.version
    && canonicalize(observation.expected.conflicts.map(entry => canonicalize(entry)).sort())
      === canonicalize(record.conflicts.map(entry => canonicalize(entry)).sort());
}
