/** Contextual repair for a member whose stored Cohort names a missing document. */
import { ParsedMetaRecordSchema } from "../active/meta-schema.js";
import type { StoreRecord } from "./read.js";
import type { StoreRefusal } from "./refusal.js";

/** Replace only missing-document recovery with the member owner's actionable field edit. */
export function memberCohortReadRefusal(member: StoreRecord, refusal: StoreRefusal): StoreRefusal {
  if (refusal.code !== "not-found") return refusal;
  const owner = member.reference.owner, cohort = ParsedMetaRecordSchema.parse(member.fields).cohort;
  const identity = `${owner.name}${owner.type !== "person" && owner.uid !== undefined ? ` (UID ${owner.uid})` : ""}`;
  return { ...refusal, condition: `Work unit ${identity} has Cohort ${JSON.stringify(cohort)}, naming a missing cohort document.`,
    remedy: { text: "Have its owner clear Cohort or re-point it to an existing cohort's current path, then retry the command." } };
}
