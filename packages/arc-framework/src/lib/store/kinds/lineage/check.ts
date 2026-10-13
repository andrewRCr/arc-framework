/** Terminal lineage creation cannot leave its origin's inbound concerns held. */
import type { EntryListConfig } from "../../concurrency/entries.js";
import { OwnerIdentitySchema } from "../../identity.js";
import { brokenRule } from "../rule-support.js";
import { observeInboundHeld } from "../work-item/inbound-held.js";
import { parseLineageRecord } from "./parser.js";
import type { BrokenRule, WriteCheckInput } from "../../write-check.js";
/** Check the proposed origin's inbound list only when creating terminal lineage.
 * @param input - Proposed terminal record and both whole-batch views.
 * @param grammar - Declared inbound entry grammar; absent until the kind declares it.
 * @returns Held-entry or unavailable-evidence violations.
 */
export async function checkLineageRecord(input: WriteCheckInput, grammar?: EntryListConfig): Promise<readonly BrokenRule[]> {
  if (grammar === undefined || input.prior !== undefined || input.next === undefined) return [];
  const lineage = parseLineageRecord(input.next.content);
  if (lineage === null) return [];
  const owner = OwnerIdentitySchema.parse({ type: "work-item", ...lineage.origin });
  const held = await observeInboundHeld(input.after, owner, grammar);
  const condition = held.status === "unavailable" ? held.condition
    : held.status === "known" && held.value ? "The retiring work item's inbound list still holds an entry." : undefined;
  return condition === undefined ? [] : [brokenRule("lineage.inbound-held", condition,
    "Integrate or route the origin's held inbound entries, repair unavailable observations, and retry retirement.")];
}
