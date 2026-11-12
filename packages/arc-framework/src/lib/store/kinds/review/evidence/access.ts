/** Bind approved evidence to one invocation's work item. */
import type { Store } from "../../../contract.js";
import { recordReferences, type OwnerIdentity } from "../../../identity.js";
import type { ReviewEvidencePort } from "../../../../../scripts/review-gate/core/ports.js";
import { createReviewFactAccess } from "../fact-access.js";
import { ReviewEvidenceSchema, type ReviewEvidence } from "./schema.js";
import { composeReviewDispositionRecord } from "./composed-record.js";
import { createReviewSelectionLoader, type ReviewFactSnapshot } from "../evidence-root-selection/loader.js";
import type { ReviewEvidenceRootSelection } from "../evidence-root-selection/schema.js";
import type { StoredReviewFact } from "../../../../../scripts/review-gate/core/ports.js";

/** Open typed evidence access on the supplied backend. */
export function createReviewEvidencePort(store: Store, owner: OwnerIdentity): ReviewEvidencePort {
  const access = createReviewFactAccess(store, (key) => recordReferences["review/evidence"](owner, key),
    ReviewEvidenceSchema, (value) => value.dispositionSet.dispositionSetId);
  const loader = createReviewSelectionLoader(store, owner);
  const composeProducer = async (producerId: string, snapshot: ReviewFactSnapshot<ReviewEvidence>,
    selector: StoredReviewFact<ReviewEvidenceRootSelection> | null) => {
    const first = snapshot.records.find(record => record.value.dispositionSet.producerId === producerId);
    const outcomeKey = first?.value.result.outcomeKey ?? selector?.value.outcomeKey;
    const outcome = outcomeKey === undefined ? null : await loader.outcome(outcomeKey, snapshot.asOf);
    const selected = loader.select(producerId, snapshot.records, selector, outcome);
    return selected.outcome === null || selected.evidence.length === 0 ? null
      : composeReviewDispositionRecord(selected.outcome.value, selected.evidence.map(record => record.value), selected.outcome.reference.owner);
  };
  return { read: access.read, list: access.list,
    create: (value) => access.write(value, null), prepareCreate: (value) => access.prepare(value, null),
    advance: access.write, prepareAdvance: access.prepare,
    async readDispositionRecord(producerId) {
      const snapshot = await loader.evidence();
      return composeProducer(producerId, snapshot, await loader.selector(producerId, snapshot.asOf));
    },
    async listDispositionRecords() {
      const evidence = await loader.evidence(), selectors = await loader.selectors(evidence.asOf);
      const producers = [...new Set([...evidence.records.map(record => record.value.dispositionSet.producerId),
        ...selectors.records.map(record => record.value.producerId)])];
      const records = await Promise.all(producers.map(producerId => composeProducer(producerId, evidence,
        selectors.records.find(record => record.value.producerId === producerId) ?? null)));
      return records.filter((record) => record !== null);
    } };
}
