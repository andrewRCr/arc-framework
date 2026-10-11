/** Completeness-preserving observations and actionable content-rule diagnostics. */
import type { RecordReference } from "../identity.js";
import type { StoreRecord } from "../read.js";
import type { BrokenRule, StoreView } from "../write-check.js";

/** A proved value or absence, distinct from unavailable evidence. */
export type RuleObservation<T> = { status: "known"; value: T } | { status: "absent" } | { status: "unavailable"; condition: string };

/** Read exact bytes without turning an environmental refusal into absence.
 * @param view - One side of the proposed batch.
 * @param reference - Exact logical record.
 * @returns A record, proved absence, or an explicit incomplete observation.
 */
export async function observeRecord(view: StoreView, reference: RecordReference): Promise<RuleObservation<StoreRecord>> {
  const result = await view.read({ reference });
  if (result.status === "ok") return { status: "known", value: result.result };
  return result.refusal.code === "not-found" ? { status: "absent" }
    : { status: "unavailable", condition: result.refusal.condition };
}

/** Name the rule and an actionable correction for the whole refused write.
 * @param rule - Stable rule identifier.
 * @param condition - Observed breaking condition.
 * @param remedy - Correction needed before retry.
 * @returns One contract diagnostic.
 */
export function brokenRule(rule: string, condition: string, remedy: string): BrokenRule {
  return { rule, condition, remedy: { text: remedy } };
}

/** Enumerate only when every selected entry is available for a content rule.
 * @param view - One side of the proposed batch.
 * @param input - Logical family and optional role selection.
 * @returns Every selected record, or explicit incomplete evidence.
 */
export async function observeRecords(view: StoreView, input: import("../read.js").ListInput): Promise<RuleObservation<readonly StoreRecord[]>> {
  const result = await view.list(input);
  if (result.status === "refused") return { status: "unavailable", condition: result.refusal.condition };
  const listing = result.result;
  if (listing.status === "absent") return { status: "known", value: [] };
  if (listing.status === "unreadable") return { status: "unavailable", condition: listing.condition };
  return listing.missed || listing.diagnostics.length > 0
    ? { status: "unavailable", condition: "The selected family has unreadable or malformed entries." }
    : { status: "known", value: listing.records };
}
