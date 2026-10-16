/** A retired work item's route refusal comes from its terminal lineage, including cut successors. */
import type { Slug } from "../kernel/index.js";
import type { StoreRefusal } from "../store/refusal.js";
import { parseLineageRecord } from "../store/kinds/lineage/parser.js";
import type { InboxContext, InboxOutcome } from "./types.js";
import { failure, withProvenance } from "./refusals.js";

/** Explain an absent primary using lineage before treating its name as available or empty.
 * @param slug - Requested work-item name.
 * @param absent - Primary lookup's exact absence evidence.
 * @param context - Store reader.
 * @returns A terminal-home repair, original absence, or failed observation.
 */
export async function retiredDestination(slug: Slug, absent: StoreRefusal, context: InboxContext): Promise<InboxOutcome<never>> {
  const found = await context.store.lookup({ kind: "lineage", origin: slug });
  if (found.status === "refused") return { status: "refused", refusal: withProvenance(found.refusal.code === "not-found" ? absent : found.refusal) };
  const saved = await context.store.read({ reference: found.result.reference });
  if (saved.status === "refused") return { status: "refused", refusal: withProvenance(saved.refusal) };
  const lineage = parseLineageRecord(saved.result.content);
  if (lineage === null) return failure("record-malformed", `Lineage for ${slug} could not be read.`, "Repair its terminal lineage before routing work to that name.");
  const successors = lineage.successors.map((successor) => successor.name).join(", ");
  const remedy = lineage.kind === "decompose" ? `Route to an inbox or one of the cut's successors: ${successors}.`
    : lineage.kind === "rename" ? `Use the current name ${successors}.` : "Route the entry to an inbox; this work item was abandoned.";
  return failure("destination-refused", `${slug} was retired by ${lineage.kind === "decompose" ? "a cut" : lineage.kind}.`, remedy);
}
