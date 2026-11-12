/** Name acquisition is an identity fact, independent of a primary record's parsed fields. */
import type { WriteCheckInput } from "../../write-check.js";
import { observeRecord, type RuleObservation } from "../rule-support.js";

/** Establish whether a creation or rename acquires the reference's after-name.
 * @param input - Proposed primary write and its prior view.
 * @returns Whether a name is acquired, or the evidence preventing that decision.
 */
export async function acquiresSlug(input: WriteCheckInput): Promise<RuleObservation<boolean>> {
  if (input.next === undefined) return { status: "known", value: false };
  if (input.prior === undefined) return { status: "known", value: true };
  const prior = await observeRecord(input.before, input.reference);
  if (prior.status === "unavailable") return prior;
  if (prior.status === "absent") return { status: "unavailable", condition: "The prior primary identity cannot be read." };
  return { status: "known", value: prior.value.reference.owner.name !== input.reference.owner.name };
}
