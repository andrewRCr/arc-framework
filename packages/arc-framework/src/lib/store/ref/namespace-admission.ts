/** Shared live slug admission over captured primaries and the complete mutation batch. */

import { canonicalize } from "../../kernel/canonical/canonical-json.js";
import { sameOwner, type OwnerIdentity, type RecordReference } from "../identity.js";
import type { StoreRefusal } from "../refusal.js";
import type { WritePlacement } from "../placement.js";
import type { ResolvedMutation } from "./write-resolution.js";

/** An addressable live ref, including whether it still holds a primary. */
export interface LiveRefOwner {
  owner: OwnerIdentity;
  primary?: { reference: RecordReference; placement?: WritePlacement };
}

/** Identify the two record roles whose presence makes a work item live. */
export function isWorkPrimary(reference: RecordReference): boolean {
  return reference.kind === "work-item/meta" || reference.kind === "work-item/record";
}

/** Refuse only a primary write that introduces or changes a shared namespace claim. */
export function checkLiveNamespace(writes: readonly ResolvedMutation[], owners: readonly LiveRefOwner[]): StoreRefusal | undefined {
  const primaries = writes.filter(({ mutation }) => isWorkPrimary(mutation.reference) || mutation.reference.kind === "cohort/document");
  const retained = owners.flatMap(({ primary }) => primary && !primaries.some(({ mutation }) => sameOwner(mutation.reference.owner, primary.reference.owner))
    ? [primary.reference] : []);
  const holders = [...retained, ...primaries.flatMap(({ mutation }) => mutation.action === "put" ? [mutation.reference] : [])];
  for (const { mutation } of primaries) {
    if (mutation.action !== "put") continue;
    const { reference } = mutation;
    const prior = owners.find(({ owner }) => sameOwner(owner, reference.owner))?.primary;
    if (prior && prior.reference.owner.name === reference.owner.name
      && canonicalize(prior.placement ?? null) === canonicalize(mutation.placement ?? null)) continue;
    const others = holders.filter((holder) => holder.owner.name === reference.owner.name && !sameOwner(holder.owner, reference.owner));
    if (others.length === 0) continue;
    return { code: "ambiguous-match", class: "recoverable", candidates: [reference, ...others],
      condition: "Another live work item or cohort holds this slug.",
      remedy: { text: "Name the intended owners by UID and rename one to a free slug, then retry." } };
  }
  return undefined;
}
