/** Shared live slug admission over captured primaries and the complete mutation batch. */

import { canonicalize } from "../../kernel/canonical/canonical-json.js";
import { sameOwner, type OwnerIdentity, type RecordReference } from "../identity.js";
import type { StoreRefusal } from "../refusal.js";
import type { WritePlacement } from "../placement.js";
import type { Mutation } from "../write.js";
import type { ResolvedMutation } from "./write-resolution.js";

/** An addressable live ref, including whether it still holds a primary. */
export interface LiveRefOwner {
  owner: OwnerIdentity;
  primary?: { reference: RecordReference; placement?: WritePlacement };
}

/** Identify the two record roles whose presence makes a work item live. */
function isWorkPrimary(reference: RecordReference): boolean {
  return reference.kind === "work-item/meta" || reference.kind === "work-item/record";
}

/**
 * A put that leaves its primary ended — its placement completed, or, with none given, its owner already archived.
 * @param mutation - A primary mutation
 * @param ended - Archived owners the batch writes
 * @returns Whether the put holds no live claim
 */
export function leavesPrimaryEnded(mutation: Mutation, ended: readonly OwnerIdentity[]): boolean {
  return mutation.action === "put" && (mutation.placement
    ? mutation.placement.kind === "completed" : ended.some((owner) => sameOwner(owner, mutation.reference.owner)));
}

/**
 * Refuse only a primary write that introduces or changes a shared namespace claim. A put that leaves its primary
 * ended — its placement completed, or, with none given, its owner already archived — holds no live claim.
 * @param writes - The complete resolved batch
 * @param owners - Live owners and the primaries they hold
 * @param ended - Archived owners the batch writes
 * @returns The first clash, or nothing
 */
export function checkLiveNamespace(writes: readonly ResolvedMutation[], owners: readonly LiveRefOwner[],
  ended: readonly OwnerIdentity[]): StoreRefusal | undefined {
  const primaries = writes.filter(({ mutation }) => isWorkPrimary(mutation.reference) || mutation.reference.kind === "cohort/document");
  const retained = owners.flatMap(({ primary }) => primary && !primaries.some(({ mutation }) => sameOwner(mutation.reference.owner, primary.reference.owner))
    ? [primary.reference] : []);
  const live = primaries.flatMap(({ mutation }) => mutation.action === "put" && !leavesPrimaryEnded(mutation, ended) ? [mutation] : []);
  const holders = [...retained, ...live.map(({ reference }) => reference)];
  for (const mutation of live) {
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
