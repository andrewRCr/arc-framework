/** Bind approved evidence to one invocation's work item. */
import type { Store } from "../../../contract.js";
import { recordReferences, type OwnerIdentity } from "../../../identity.js";
import type { ReviewEvidencePort } from "../../../../../scripts/review-gate/core/ports.js";
import { createReviewFactAccess } from "../fact-access.js";
import { ReviewEvidenceSchema, type ReviewEvidence } from "./schema.js";
import { createReviewOutcomePort } from "../outcome/access.js";
import { composeReviewDispositionRecord } from "./composed-record.js";

/** Open typed evidence access on the supplied backend. */
export function createReviewEvidencePort(store: Store, owner: OwnerIdentity): ReviewEvidencePort {
  const access = createReviewFactAccess(store, (key) => recordReferences["review/evidence"](owner, key),
    ReviewEvidenceSchema, (value) => value.dispositionSet.dispositionSetId);
  const outcomes = createReviewOutcomePort(store, owner);
  const completeEvidence = async (): Promise<readonly ReviewEvidence[]> => {
    const listing = await access.list();
    if (listing.status !== "complete") throw new Error(listing.reason);
    return listing.records.map(({ value }) => value);
  };
  const composeProducer = async (producerId: string, records: readonly ReviewEvidence[]) => {
    const evidence = records.filter((value) => value.dispositionSet.producerId === producerId);
    const first = evidence[0];
    if (first === undefined) return null;
    const outcome = await outcomes.read(first.result.outcomeKey);
    if (outcome === null) throw new Error(`Restore outcome ${first.result.outcomeKey} before reading its approved responses.`);
    return composeReviewDispositionRecord(outcome.value, evidence, outcome.reference.owner);
  };
  return { read: access.read, list: access.list,
    create: (value) => access.write(value, null), prepareCreate: (value) => access.prepare(value, null),
    advance: access.write, prepareAdvance: access.prepare,
    async readDispositionRecord(producerId) {
      return composeProducer(producerId, await completeEvidence());
    },
    async listDispositionRecords() {
      const evidence = await completeEvidence();
      const producers = [...new Set(evidence.map((value) => value.dispositionSet.producerId))];
      const records = await Promise.all(producers.map((producerId) => composeProducer(producerId, evidence)));
      return records.filter((record) => record !== null);
    } };
}
