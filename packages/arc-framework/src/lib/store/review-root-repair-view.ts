/** Raw repair inspection at one manifest, independent of composed approval availability. */
import { canonicalize } from "../kernel/index.js";
import type { Store } from "./contract.js";
import { WholeRecordConflictSchema, type WholeRecordConflict } from "./conflict.js";
import { recordReferences, sameReference, type RecordReference, type StateVersion } from "./identity.js";
import type { StoreRecord } from "./read.js";
import type { RecordObservation } from "./write.js";
import { StoreRefusalError } from "./refusal-error.js";
import type { ReviewRootRepairRequest, ReviewRootRepairBasis } from "./review-root-repair-schema.js";
import { createReviewSelectionLoader, validateReviewProducerFactKeys } from "./kinds/review/evidence-root-selection/loader.js";
import { reviewEvidenceRootSelectionKey } from "./kinds/review/evidence-root-selection/key.js";
import { decodeReviewEvidenceRootSelection } from "./kinds/review/evidence-root-selection/parser.js";
import { reviewRootSelectionRefusal, reviewRootSelectionPreviewRemedy, reviewRootSelectionRestoreRemedy } from "./kinds/review/evidence-root-selection/remedy.js";
import { reviewEvidenceBranches } from "./kinds/review/evidence-root-selection/lineage.js";
import { eligibleReviewEvidenceRoots } from "./kinds/review/evidence-root-selection/selection.js";
import { reviewOutcomeKey } from "./kinds/review/outcome/key.js";
import { reviewOutcomeResultDigest } from "./kinds/review/outcome/result.js";
import type { ReviewEvidenceRootSelection } from "./kinds/review/evidence-root-selection/schema.js";

type Coordinates = Pick<ReviewRootRepairRequest, "workItem" | "producerId">;
interface SelectorAlternative { record: StoreRecord; value: WholeRecordConflict }
interface RetainedSelection { value: ReviewEvidenceRootSelection; source: RecordReference }

/** Read the exact owner, producer, complete branches, and every retained selector alternative. */
export async function readReviewRootRepairView(store: Store, input: Coordinates) {
  const loader = createReviewSelectionLoader(store, input.workItem), snapshot = await loader.evidence();
  await requireExactRepairOwner(store, input, snapshot.asOf);
  const outcomes = await loader.outcomes(snapshot.asOf);
  const matches = outcomes.records.filter(record => record.value.attemptId === input.producerId);
  const outcome = matches[0];
  if (matches.length !== 1 || outcome === undefined) throw reviewRootSelectionRefusal(input.workItem, input.producerId,
    "outcome", "Restore the one exact immutable producer outcome before previewing root repair.");
  const reference = recordReferences["review/evidence-root-selection"](input.workItem,
    reviewEvidenceRootSelectionKey(input.workItem, input.producerId));
  const selector = await readRawRecord(store, reference, snapshot.asOf);
  const selection = selector === null ? null : decodeSelection(selector.content, input, reference);
  const alternatives: SelectorAlternative[] = [];
  for (const conflict of selector?.conflicts ?? []) {
    const record = await readRawRecord(store, conflict, snapshot.asOf);
    if (record === null) throw reviewRootSelectionRefusal(input.workItem, input.producerId, "conflict",
      `The selector names a missing conflict record ${JSON.stringify(conflict)}.`,
      `Restore the exact selector conflict at ${JSON.stringify(conflict)}. ${reviewRootSelectionPreviewRemedy(input.workItem, input.producerId)}`);
    alternatives.push({ record, value: decodeSelectorConflict(record, reference, input) });
  }
  const evidence = snapshot.records.filter(record => record.value.dispositionSet.producerId === input.producerId);
  validateReviewProducerFactKeys(input.workItem, input.producerId, evidence, outcome);
  const branches = reviewEvidenceBranches(outcome.value, evidence.map(record => record.value));
  const roots = branches.map(branch => branch[0]?.dispositionSet.dispositionSetId).filter(root => root !== undefined);
  const resultDigest = reviewOutcomeResultDigest(outcome.value), outcomeKey = reviewOutcomeKey(outcome.value);
  validateRetainedSelections(input, [...selection === null ? [] : [{ value: selection, source: reference }],
    ...alternativeSelections(alternatives, input)], outcomeKey, resultDigest, roots);
  const byKey = new Map(evidence.map(record => [record.value.dispositionSet.dispositionSetId, record]));
  const basis: ReviewRootRepairBasis | null = resultDigest === null ? null : {
    workItem: input.workItem, producerId: input.producerId, asOf: snapshot.asOf, roots,
    evidence: evidence.map(record => observation({ ...record, conflicts: [] })),
    selector: selector === null ? { reference, expected: null } : observation(selector),
    selectorAlternatives: alternatives.map(entry => observation(entry.record)),
    outcome: observation({ ...outcome, conflicts: [] }), outcomeKey, resultDigest,
  };
  return { basis, reference, roots, selector, selection, alternatives, outcome, evidence, outcomeKey, resultDigest,
    eligibleChoices: eligibleReviewEvidenceRoots(branches), branches: branches.map(branch => {
      const root = branch[0];
      if (root === undefined) throw new Error("Repair inventory contains an empty branch.");
      return { root: root.dispositionSet.dispositionSetId, records: branch.map(value => {
        const record = byKey.get(value.dispositionSet.dispositionSetId);
        if (record === undefined) throw new Error("Repair branch lost its observed evidence.");
        return { ...record, performed: value.performance !== undefined, settled: value.settlement !== undefined };
      }) };
    }) };
}

async function requireExactRepairOwner(store: Store, input: Coordinates, asOf: StateVersion): Promise<void> {
  const expected = recordReferences["work-item/meta"](input.workItem);
  const primary = await readRawRecord(store, expected, asOf)
    ?? await readRawRecord(store, recordReferences["work-item/record"](input.workItem), asOf);
  if (primary === null) throw new StoreRefusalError({ code: "not-found", class: "recoverable", reference: expected,
    condition: "The exact repair work-item generation does not exist at this snapshot.",
    remedy: { text: "Select the existing work-item name and UID, then obtain a fresh repair preview." } }, true);
  if (primary.reference.owner.name !== input.workItem.name || primary.reference.owner.type !== "work-item"
    || primary.reference.owner.uid !== input.workItem.uid) throw new StoreRefusalError({ code: "identity-mismatch", class: "recoverable",
      expected, actual: primary.reference, condition: "The repair request names another work-item generation or current name.",
      remedy: { text: "Use the exact current work-item name and UID, then preview again." } }, true);
}

async function readRawRecord(store: Store, reference: RecordReference, asOf: StateVersion): Promise<StoreRecord | null> {
  const result = await store.read({ reference, asOf });
  if (result.status === "ok") return result.result;
  if (result.refusal.code === "not-found") return null;
  throw new StoreRefusalError(result.refusal, true);
}

function decodeSelection(content: string, input: Coordinates, source: RecordReference): ReviewEvidenceRootSelection {
  const decoded = decodeReviewEvidenceRootSelection(content);
  if (!decoded.success) throw reviewRootSelectionRefusal(input.workItem, input.producerId, "schema",
    `The selector content at ${JSON.stringify(source)} is malformed: ${decoded.error}`, selectionSourceRemedy(input, source));
  return decoded.data;
}

function decodeSelectorConflict(record: StoreRecord, reference: RecordReference, input: Coordinates): WholeRecordConflict {
  let value: unknown;
  try { value = JSON.parse(record.content) as unknown; } catch { value = null; }
  const parsed = WholeRecordConflictSchema.safeParse(value);
  if (!parsed.success || !sameReference(parsed.data.record, reference)) throw reviewRootSelectionRefusal(input.workItem,
    input.producerId, "conflict", `The whole-record selector conflict at ${JSON.stringify(record.reference)} is malformed or bound elsewhere.`,
    `Restore the exact whole-record selector conflict at ${JSON.stringify(record.reference)}. ${reviewRootSelectionPreviewRemedy(input.workItem, input.producerId)}`);
  return parsed.data;
}

function alternativeSelections(alternatives: readonly SelectorAlternative[], input: Coordinates): RetainedSelection[] {
  return alternatives.flatMap(({ record, value }) => [value.base, value.current.value, value.incoming.value]
    .flatMap(side => side === null ? [] : [{ value: decodeSelection(side.content, input, record.reference), source: record.reference }]));
}

function validateRetainedSelections(input: Coordinates, selections: readonly RetainedSelection[],
  outcomeKey: string, resultDigest: string | null, roots: readonly string[]): void {
  for (const { value, source } of selections) {
    if (value.producerId !== input.producerId || value.outcomeKey !== outcomeKey || value.resultDigest !== resultDigest) {
      throw reviewRootSelectionRefusal(input.workItem, input.producerId, "binding",
        `A retained selector at ${JSON.stringify(source)} binds another immutable producer result.`, selectionSourceRemedy(input, source));
    }
    if (value.roots.some(root => !roots.includes(root))) throw reviewRootSelectionRefusal(input.workItem, input.producerId,
      "inventory", "The retained selector names approved roots missing from this inventory.",
      `Restore the complete approved history for ${JSON.stringify(value.roots.filter(root => !roots.includes(root)))}. ${reviewRootSelectionPreviewRemedy(input.workItem, input.producerId)}`);
  }
}

function selectionSourceRemedy(input: Coordinates, source: RecordReference): string {
  return source.kind === "review/evidence-root-selection" ? reviewRootSelectionRestoreRemedy(input.workItem, input.producerId)
    : `Restore the original selector content and immutable binding inside conflict ${JSON.stringify(source)}. ${reviewRootSelectionPreviewRemedy(input.workItem, input.producerId)}`;
}

/** Canonical record observation, preserving exact versions and the complete conflict-reference set. */
export function observation(record: Pick<StoreRecord, "reference" | "version" | "conflicts">): RecordObservation {
  return { reference: record.reference, expected: { version: record.version,
    conflicts: [...record.conflicts].sort((a, b) => canonicalize(a).localeCompare(canonicalize(b))) } };
}
