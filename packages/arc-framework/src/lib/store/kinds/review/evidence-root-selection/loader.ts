/** Snapshot-preserving fact access and one shared producer-selection boundary. */
import type { Store } from "../../../contract.js";
import { recordReferences, type OwnerIdentity, type StateVersion } from "../../../identity.js";
import { StoreRefusalError } from "../../../refusal-error.js";
import type { StoredReviewFact, ReviewFactListing } from "../../../../../scripts/review-gate/core/ports.js";
import { createReviewFactAccess, decodeReviewFactListing, reviewFactListingError } from "../fact-access.js";
import { ReviewEvidenceSchema, type ReviewEvidence } from "../evidence/schema.js";
import { ReviewOutcomeSchema, type ReviewOutcome } from "../outcome/schema.js";
import { reviewOutcomeKey } from "../outcome/key.js";
import { ReviewEvidenceRootSelectionSchema, type ReviewEvidenceRootSelection } from "./schema.js";
import { reviewEvidenceRootSelectionKey } from "./key.js";
import { reviewRootSelectionPreviewRemedy, reviewRootSelectionRefusal, reviewRootSelectionRestoreRemedy } from "./remedy.js";
import { selectReviewEvidenceBranch } from "./selection.js";
import { decodeReviewEvidenceRootSelection } from "./parser.js";
import type { ListingDiagnostic } from "../../../read.js";
import { KIND_REGISTRY } from "../../../registry.js";
import { decodeStoredKindReference } from "../../../ref/path-decode.js";
import { reviewEvidenceLineageRefusal } from "../evidence/composed-record.js";

/** A retained manifest internal to review composition, including an absent listing. */
export interface ReviewFactSnapshot<T> { records: readonly StoredReviewFact<T>[]; asOf: StateVersion }

/** Open one owner's fact readers without broadening any caller's first listing. */
export function createReviewSelectionLoader(store: Store, owner: OwnerIdentity) {
  const evidence = createReviewFactAccess(store, key => recordReferences["review/evidence"](owner, key),
    ReviewEvidenceSchema, value => value.dispositionSet.dispositionSetId);
  const outcomes = createReviewFactAccess(store, key => recordReferences["review/outcome"](owner, key), ReviewOutcomeSchema, reviewOutcomeKey);
  const selectors = createReviewFactAccess(store, key => recordReferences["review/evidence-root-selection"](owner, key),
    ReviewEvidenceRootSelectionSchema, value => reviewEvidenceRootSelectionKey(owner, value.producerId));
  return {
    evidence: async (asOf?: StateVersion) => completeSnapshot(await evidence.snapshot(asOf), owner),
    outcomes: async (asOf?: StateVersion) => completeSnapshot(await outcomes.snapshot(asOf), owner),
    selectors: async (asOf: StateVersion) => readSelectorSnapshot(store, owner, asOf),
    outcome: outcomes.read,
    async selector(producerId: string, asOf: StateVersion) {
      try { return await selectors.read(reviewEvidenceRootSelectionKey(owner, producerId), asOf); }
      catch (error) {
        if (!(error instanceof StoreRefusalError) || error.refusal.code !== "record-malformed"
          || !["review.record-conflict", "review.record-schema"].includes(error.refusal.rule)) throw error;
        const conflict = error.refusal.rule === "review.record-conflict";
        throw new StoreRefusalError({ ...error.refusal, remedy: { text: conflict
          ? reviewRootSelectionPreviewRemedy(owner, producerId)
          : `Restore the exact selector content at ${JSON.stringify(error.refusal.reference)} before previewing root selection.` } }, true);
      }
    },
    select(producerId: string, records: readonly StoredReviewFact<ReviewEvidence>[],
      selector: StoredReviewFact<ReviewEvidenceRootSelection> | null, outcome: StoredReviewFact<ReviewOutcome> | null) {
      return selectedProducer(owner, producerId, records, selector, outcome);
    },
  };
}

async function readSelectorSnapshot(store: Store, owner: OwnerIdentity, asOf: StateVersion): Promise<ReviewFactSnapshot<ReviewEvidenceRootSelection>> {
  const result = await store.list({ family: "review", kind: "review/evidence-root-selection", owner, asOf });
  try {
    const listing = decodeReviewFactListing(store, result, ReviewEvidenceRootSelectionSchema);
    if (listing.status !== "complete" && listing.refusal?.code === "record-malformed"
      && listing.refusal.rule === "review.record-conflict" && result.status === "ok" && result.result.status === "complete") {
      const record = result.result.records.find(entry => entry.conflicts.length > 0);
      const value = record === undefined ? null : decodeReviewEvidenceRootSelection(record.content);
      if (value?.success) throw new StoreRefusalError({ ...listing.refusal,
        remedy: { text: reviewRootSelectionPreviewRemedy(owner, value.data.producerId) } }, true);
    }
    return completeSnapshot({ listing, diagnostics: result.status === "ok" && result.result.status === "complete" ? result.result.diagnostics : [],
      ...(result.status === "ok" && result.result.status !== "unreadable"
      && result.result.asOf !== undefined ? { asOf: result.result.asOf } : {}) }, owner);
  } catch (error) {
    if (!(error instanceof StoreRefusalError) || error.refusal.code !== "record-malformed"
      || error.refusal.rule !== "review.record-schema") throw error;
    throw new StoreRefusalError({ ...error.refusal, remedy: { text:
      `Restore the exact selector content at ${JSON.stringify(error.refusal.reference)} before previewing root selection.` } }, true);
  }
}

function completeSnapshot<T>(snapshot: { listing: ReviewFactListing<T>; asOf?: StateVersion; diagnostics: readonly ListingDiagnostic[] },
  owner: OwnerIdentity): ReviewFactSnapshot<T> {
  for (const diagnostic of snapshot.diagnostics) {
    if (diagnostic.kind !== "malformed" || diagnostic.rule !== undefined) continue;
    const reference = decodeStoredKindReference(KIND_REGISTRY["review/evidence-root-selection"], owner, diagnostic.key);
    if (reference !== null) throw new StoreRefusalError({ code: "record-malformed", class: "recoverable", reference,
      rule: "review.record-schema", condition: `${diagnostic.condition} Stored selector: ${diagnostic.key}.`,
      remedy: { text: `Restore the exact selector content at ${JSON.stringify(reference)} before previewing root selection.` } }, true);
  }
  if (snapshot.listing.status !== "complete") throw reviewFactListingError(snapshot.listing);
  if (snapshot.asOf === undefined) throw new StoreRefusalError({ code: "record-malformed", class: "recoverable",
    rule: "review.snapshot", condition: "The native review listing supplied no captured manifest.",
    remedy: { text: "Restore a snapshot-capable native store before reading response authority." } }, true);
  return { records: snapshot.listing.records, asOf: snapshot.asOf };
}

function selectedProducer(owner: OwnerIdentity, producerId: string, records: readonly StoredReviewFact<ReviewEvidence>[],
  selector: StoredReviewFact<ReviewEvidenceRootSelection> | null, outcome: StoredReviewFact<ReviewOutcome> | null) {
  const facts = records.filter(record => record.value.dispositionSet.producerId === producerId);
  if (selector !== null && (selector.value.producerId !== producerId
    || selector.reference.key !== reviewEvidenceRootSelectionKey(owner, producerId))) {
    throw reviewRootSelectionRefusal(owner, producerId, "key", "The stored selector does not match its exact producer key.", reviewRootSelectionRestoreRemedy(owner, producerId));
  }
  validateReviewProducerFactKeys(owner, producerId, facts, outcome);
  if (outcome === null) {
    const remedy = `Restore the exact producer outcome at ${JSON.stringify([...new Set([...facts.map(record => record.value.result.outcomeKey),
      ...selector === null ? [] : [selector.value.outcomeKey]])].map(key => recordReferences["review/outcome"](owner, key)))}. ${reviewRootSelectionPreviewRemedy(owner, producerId)}`;
    if (facts.length > 0) throw reviewEvidenceLineageRefusal(facts.map(record => record.value), "outcome", remedy);
    if (selector !== null) throw reviewRootSelectionRefusal(owner, producerId, "outcome",
      "A root selector remains without its immutable producer outcome.", remedy);
    return { outcome: null, evidence: [] };
  }
  const selected = selectReviewEvidenceBranch(owner, outcome.value, facts.map(record => record.value), selector?.value ?? null);
  const byKey = new Map(facts.map(record => [record.value.dispositionSet.dispositionSetId, record]));
  return { outcome, evidence: selected.map(value => {
    const stored = byKey.get(value.dispositionSet.dispositionSetId);
    if (stored === undefined) throw new Error("Selected response is absent from its validated inventory.");
    return stored;
  }) };
}

/** Require canonical physical fact keys for both response readers and raw repair inspection. */
export function validateReviewProducerFactKeys(owner: OwnerIdentity, producerId: string,
  evidence: readonly StoredReviewFact<ReviewEvidence>[], outcome: StoredReviewFact<ReviewOutcome> | null): void {
  const misplaced = evidence.find(record => record.reference.key !== record.value.dispositionSet.dispositionSetId);
  if (misplaced !== undefined) {
    const expected = recordReferences["review/evidence"](owner, misplaced.value.dispositionSet.dispositionSetId);
    throw reviewRootSelectionRefusal(owner, producerId, "evidence",
      `Evidence at ${JSON.stringify(misplaced.reference)} does not match its approved disposition-set key.`,
      `Restore the original evidence/key binding at ${JSON.stringify(expected)}, then retry. ${reviewRootSelectionPreviewRemedy(owner, producerId)}`);
  }
  if (outcome !== null && (outcome.value.attemptId !== producerId || outcome.reference.key !== reviewOutcomeKey(outcome.value))) {
    throw reviewRootSelectionRefusal(owner, producerId, "outcome", `The outcome at ${JSON.stringify(outcome.reference)} does not match producer ${producerId}.`,
      `Restore the original immutable producer outcome and its canonical key, then retry. ${reviewRootSelectionPreviewRemedy(owner, producerId)}`);
  }
}
