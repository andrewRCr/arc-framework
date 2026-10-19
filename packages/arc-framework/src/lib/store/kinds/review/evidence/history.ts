/** Complete observations of approved response lineage on both sides of a batch. */
import type { BrokenRule, StoreView, WriteCheckInput } from "../../../write-check.js";
import { observeRecords, brokenRule } from "../../rule-support.js";
import { decodeReviewEvidence } from "./parser.js";
import type { ReviewEvidence } from "./schema.js";

export type EvidenceHistory = ReadonlyMap<string, ReviewEvidence>;
export type EvidenceHistoryObservation = { status: "known"; value: EvidenceHistory } | { status: "unavailable"; rule: BrokenRule };

/** Require a complete, uniquely keyed and parseable response history for this work item. */
export async function readEvidenceHistory(input: WriteCheckInput, view: StoreView): Promise<EvidenceHistoryObservation> {
  const refuse = (condition: string): EvidenceHistoryObservation => ({ status: "unavailable",
    rule: brokenRule("review.evidence.complete-listing", condition, "Restore the complete approved-response listing before retrying.") });
  const observed = await observeRecords(view, { family: "review", kind: "review/evidence", owner: input.reference.owner });
  if (observed.status !== "known") return refuse(observed.status === "unavailable" ? observed.condition : "Evidence could not be enumerated.");
  const entries = new Map<string, ReviewEvidence>();
  for (const record of observed.value) {
    const parsed = decodeReviewEvidence(record.content);
    const key = record.reference.key;
    if (!parsed.success || typeof key !== "string" || key !== parsed.data.dispositionSet.dispositionSetId || entries.has(key)) {
      return refuse(`Evidence ${JSON.stringify(key)}: ${parsed.success ? "invalid or duplicate disposition-set key" : parsed.error}`);
    }
    entries.set(key, parsed.data);
  }
  return { status: "known", value: entries };
}
