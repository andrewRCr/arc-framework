/** Shared advancing-work pause gate over the operational store. */
import { ParsedMetaRecordSchema } from "../active/meta-schema.js";
import type { Store } from "./contract.js";
import type { StoreRefusal, Remedy } from "./refusal.js";
import { readWorkUnit } from "./lifecycle-write.js";
import type { StoreRecord } from "./read.js";
/** Pause admission for a verb which advances work. */
export type AdvancingPauseResult = { status: "clear" }
  | { status: "rejected"; reason: string; refusal?: StoreRefusal; remedy?: Remedy };
/** Refuse advancing a present pause, preserving store-read refusals.
 * @param store - Operational state contract.
 * @param slug - Work unit being advanced.
 * @param basis - Optional exact record already bound to the caller's mutation.
 * @returns Clear admission or actionable refusal.
 */
export async function checkAdvancingPause(store: Store, slug: string, basis?: StoreRecord): Promise<AdvancingPauseResult> {
  const read = basis === undefined ? await readWorkUnit(store, slug) : { status: "ok" as const, result: basis };
  if (read.status === "refused") return { status: "rejected", reason: read.refusal.condition, refusal: read.refusal };
  const parsed = ParsedMetaRecordSchema.safeParse(read.result.fields);
  if (!parsed.success) {
    const reason = `Metadata fields for \`${slug}\` could not be read.`;
    return { status: "rejected", reason, refusal: { code: "record-malformed", class: "recoverable",
      reference: read.result.reference, rule: "lifecycle.pause-fields", condition: reason,
      remedy: { text: "Repair the work unit's metadata fields, then retry." } } };
  }
  return parsed.data.pause === null ? { status: "clear" } : { status: "rejected",
    reason: `Work unit \`${slug}\` is paused. Run arc resume ${slug} before advancing its work.`,
    remedy: { text: "Resume the paused work unit, then retry.", argv: ["arc", "resume", slug] } };
}
