/** A retired work item's route refusal comes from its terminal lineage, including cut successors. */
import { StoreRefusalSchema } from "../store/refusal.js";
import { parseLineageRecord } from "../store/kinds/lineage/parser.js";
import type { InboxContext, InboxOutcome, InboxRefusal } from "./types.js";
import { failure, withProvenance } from "./refusals.js";
import { readWorkUnitLineage } from "../locus/store-terminal-work-unit.js";
import { z } from "zod";

/** Explain an absent primary using lineage before treating its name as available or empty.
 * @param slug - Requested work-item name.
 * @param absent - Primary lookup's exact absence evidence.
 * @param context - Store reader.
 * @returns A terminal-home repair, original absence, or failed observation.
 */
export async function retiredDestination(slug: string, absent: InboxRefusal, context: InboxContext): Promise<InboxOutcome<never>> {
  let saved;
  try { saved = await readWorkUnitLineage(context.store, slug); }
  catch (error) { return lineageRefusal(error); }
  if (saved === null) return { status: "refused", refusal: absent };
  const lineage = parseLineageRecord(saved.content);
  if (lineage === null) return failure("record-malformed", `Lineage for ${slug} could not be read.`, "Repair its terminal lineage before routing work to that name.");
  if (z.uuid().safeParse(slug).success && lineage.kind === "rename") return failure("observation-incomplete", `Generation ${slug} has rename lineage but no current primary.`, "Restore its current work-item record, then retry the entry command.");
  const successors = lineage.successors.map((successor) => successor.name).join(", ");
  const remedy = lineage.kind === "decompose" ? `Route to an inbox or one of the cut's successors: ${successors}.`
    : lineage.kind === "rename" ? `Use the current name ${successors}.` : "Route the entry to an inbox; this work item was abandoned.";
  return failure("destination-refused", `${slug} was retired by ${lineage.kind === "decompose" ? "a cut" : lineage.kind}.`, remedy);
}

function lineageRefusal(error: unknown): InboxOutcome<never> {
  const refusal = StoreRefusalSchema.safeParse(error instanceof Error ? error.cause : undefined);
  return refusal.success ? { status: "refused", refusal: withProvenance(refusal.data) }
    : failure("observation-incomplete", error instanceof Error ? error.message : String(error), "Repair the named lineage evidence, then retry the entry command.");
}
