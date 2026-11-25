/** Complete candidate owner births derived from native allocations and final primary trees. */
import { CreatedOwnerSchema, compareCreatedOwners, type CreatedOwner } from "../creation-receipt.js";
import type { ResolvedBatch } from "./write-resolution.js";
import type { PreparedRefMutation } from "./write-merge.js";
import type { RefWriteGroup } from "./write-commits.js";

/** Intersect actual primary creations with allocations belonging to this resolved attempt. */
export function proposedRefCreatedOwners(resolved: ResolvedBatch, writes: readonly PreparedRefMutation[],
  groups: ReadonlyMap<string, RefWriteGroup>): CreatedOwner[] {
  const allocated = new Set(resolved.freshOwners.flatMap(owner => owner.type !== "person" && owner.uid !== undefined
    ? [`${owner.type}:${owner.uid}`] : []));
  const births: CreatedOwner[] = [];
  for (const { mutation, home } of writes) {
    const { reference } = mutation, { owner, kind } = reference;
    if (mutation.action !== "put" || !["work-item/meta", "work-item/record", "cohort/document"].includes(kind)
      || owner.type === "person" || owner.uid === undefined || !allocated.has(`${owner.type}:${owner.uid}`)) continue;
    const group = groups.get(home.ref);
    if (!group || group.original.has(home.path) || !group.entries.has(home.path)
      || kind !== "cohort/document" && group.metadata.primary?.role !== kind) continue;
    births.push(CreatedOwnerSchema.parse({ kind, owner }));
  }
  return births.sort(compareCreatedOwners);
}
