/** Exact acquired-group membership checked against atomic before-state listings. */
import type { WriteCheckInput, BrokenRule, StoreView } from "../../write-check.js";
import type { OwnerIdentity } from "../../identity.js";
import { sameOwner, sameReference } from "../../identity.js";
import type { DecomposeTerminalMember } from "../../../decompose/acquire-terminal.js";
import type { Remedy } from "../../refusal.js";

/** One stable cut admission failure, preserving a usable repair route. */
export function cutMapBindingFailure(condition: string, remedy: Remedy): readonly BrokenRule[] {
  return [{ rule: "cut-map.atomic-binding", condition, remedy }];
}

/** Require the current whole group to be exactly the positive observation references. */
export async function checkCutMapObservedGroup(input: WriteCheckInput, before: StoreView,
  owner: OwnerIdentity): Promise<readonly BrokenRule[]> {
  const listed = await before.list({ family: "work-item", owner });
  if (listed.status === "refused") return cutMapBindingFailure(listed.refusal.condition, listed.refusal.remedy);
  const listing = listed.result;
  if (listing.status === "unreadable") return cutMapBindingFailure(listing.condition, listing.remedy);
  if (listing.status !== "complete" || listing.missed || listing.diagnostics.length > 0) {
    const diagnostics = listing.status === "complete" ? listing.diagnostics : [];
    return cutMapBindingFailure("The acquired record group could not be observed completely.", {
      text: diagnostics.map(item => `${item.condition} ${item.remedy.text}`).join("\n")
        || "Restore a complete record-group listing, then prepare the cut again.",
    });
  }
  const expected = input.observations.filter(item => item.expected !== null && item.reference.kind.startsWith("work-item/") && sameOwner(item.reference.owner, owner));
  if (listing.records.length === expected.length
    && listing.records.every(record => expected.some(item => sameReference(item.reference, record.reference)))) return [];
  return cutMapBindingFailure(`The acquired record group for ${owner.name} changed before publication.`, {
    text: "Acquire the complete group again and prepare a fresh preview; obtain approval again before applying a removing batch.",
  });
}

/** Refuse a new companion escaping an approved whole-member-group removal. */
export async function checkCutMapRemovedGroups(input: WriteCheckInput, before: StoreView,
  members: readonly DecomposeTerminalMember[]): Promise<readonly BrokenRule[]> {
  for (const member of members) {
    if (member.primary === null) continue;
    const after = await input.after.read({ reference: member.primary.reference });
    if (after.status === "ok") continue;
    if (after.refusal.code !== "not-found") return cutMapBindingFailure(after.refusal.condition, after.refusal.remedy);
    const broken = await checkCutMapObservedGroup(input, before, member.primary.reference.owner);
    if (broken.length > 0) return broken;
  }
  return [];
}
