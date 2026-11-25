/** Owner-bound native response authority from one retained manifest. */
import type { Store } from "../../../contract.js";
import type { OwnerIdentity } from "../../../identity.js";
import type { StoredReviewFact, ReviewResponsePort, ReviewResponseRead, ReviewResponseMissing, ReviewResponseAuthority }
  from "../../../../../scripts/review-gate/core/ports.js";
import type { ReviewOutcome } from "../outcome/schema.js";
import type { ReviewEvidenceRootSelection } from "./schema.js";
import { createReviewSelectionLoader } from "./loader.js";
import { reviewRootSelectionRefusal, reviewRootSelectionPreviewRemedy } from "./remedy.js";

/** Bind selected authority without exposing snapshot tokens or opening another store. */
export function createReviewResponsePort(store: Store, owner: OwnerIdentity): ReviewResponsePort {
  const loader = createReviewSelectionLoader(store, owner);
  async function read(producerId: string, purpose: "authority"): Promise<ReviewResponseMissing | ReviewResponseAuthority>;
  async function read(producerId: string, purpose: "producer-result"): Promise<ReviewResponseRead>;
  async function read(producerId: string, purpose: "authority" | "producer-result"): Promise<ReviewResponseRead> {
    const outcomes = await loader.outcomes();
    const outcome = uniqueProducer(owner, producerId, outcomes.records);
    if (purpose === "producer-result") {
      if (outcome === null) return { status: "missing-producer" };
      if (outcome.value.hosted === undefined) return { status: "found", outcome, authority: "not-requested" };
    }
    const evidence = await loader.evidence(outcomes.asOf), selector = await loader.selector(producerId, outcomes.asOf);
    const selected = loader.select(producerId, evidence.records, selector, outcome);
    return selected.outcome === null ? { status: "missing-producer" }
      : { status: "found", outcome: selected.outcome, authority: "loaded", evidence: selected.evidence };
  }
  return { read, async list() {
    const outcomes = await loader.outcomes(), evidence = await loader.evidence(outcomes.asOf), selectors = await loader.selectors(outcomes.asOf);
    const producers = new Set([...outcomes.records.map(record => record.value.attemptId),
      ...evidence.records.map(record => record.value.dispositionSet.producerId), ...selectors.records.map(record => record.value.producerId)]);
    const selected = [...producers].flatMap(producerId => loader.select(producerId, evidence.records,
      uniqueSelector(owner, producerId, selectors.records), uniqueProducer(owner, producerId, outcomes.records)).evidence);
    return { outcomes: outcomes.records, evidence: selected };
  } };
}

function uniqueProducer(owner: OwnerIdentity, producerId: string, records: readonly StoredReviewFact<ReviewOutcome>[]) {
  const matches = records.filter(record => record.value.attemptId === producerId);
  if (matches.length > 1) throw reviewRootSelectionRefusal(owner, producerId, "outcome", "Multiple immutable outcomes name the same producer.",
    `Restore one exact immutable producer outcome among ${JSON.stringify(matches.map(record => record.reference))}. ${reviewRootSelectionPreviewRemedy(owner, producerId)}`);
  return matches[0] ?? null;
}

function uniqueSelector(owner: OwnerIdentity, producerId: string, records: readonly StoredReviewFact<ReviewEvidenceRootSelection>[]) {
  const matches = records.filter(record => record.value.producerId === producerId);
  if (matches.length > 1) throw reviewRootSelectionRefusal(owner, producerId, "key", "Multiple selectors name the same exact producer.",
    `Restore the exact keyed selector among ${JSON.stringify(matches.map(record => record.reference))}. ${reviewRootSelectionPreviewRemedy(owner, producerId)}`);
  return matches[0] ?? null;
}
