/** Inbound concerns must be settled before activation, integration, or archive. */
import type { EntryListConfig } from "../../concurrency/entries.js";
import { brokenRule, observeRecord, type RuleObservation } from "../rule-support.js";
import { observeInboundHeld } from "../work-item/inbound-held.js";
import { metaFieldChanged, metaFieldVersions } from "./check-support.js";
import type { BrokenRule, WriteCheckInput } from "../../write-check.js";
/** Check held inbound entries on an activation, integration, or archive transition.
 * @param input - Proposed metadata write.
 * @param grammar - Declared inbound entry grammar; absent until the kind declares one.
 * @returns Violations preventing the transition.
 */
export async function checkMetaInboundHeld(input: WriteCheckInput, grammar?: EntryListConfig): Promise<readonly BrokenRule[]> {
  if (grammar === undefined || input.next === undefined) return [];
  const fail = (condition: string): readonly BrokenRule[] => [brokenRule("meta.inbound-held", condition,
    "Integrate or route held inbound entries, repair unavailable observations, then retry the lifecycle transition.")];
  const archive = await observeArchiveEntry(input);
  if (archive.status === "unavailable") return fail(archive.condition);
  const versions = metaFieldVersions(input);
  const advancing = metaFieldChanged(versions, "state")
    && (versions.next?.state === "Integrating" || versions.next?.state === "Active");
  if (!(archive.status === "known" && archive.value) && !advancing) return [];
  const held = await observeInboundHeld(input.after, input.reference.owner, grammar);
  if (held.status === "unavailable") return fail(held.condition);
  return held.status === "known" && held.value ? fail("The work item's inbound list still holds an entry.") : [];
}

async function observeArchiveEntry(input: WriteCheckInput): Promise<RuleObservation<boolean>> {
  const after = await observeRecord(input.after, input.reference);
  if (after.status !== "known") return { status: "unavailable",
    condition: after.status === "unavailable" ? after.condition : "Resulting placement is unavailable." };
  if (after.value.placement?.kind !== "completed") return { status: "known", value: false };
  if (input.prior === undefined) return { status: "known", value: true };
  const before = await observeRecord(input.before, input.reference);
  return before.status === "known" ? { status: "known", value: before.value.placement?.kind !== "completed" }
    : { status: "unavailable", condition: before.status === "unavailable" ? before.condition : "Prior placement is unavailable." };
}
