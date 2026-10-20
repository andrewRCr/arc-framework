/** Open work-item and cohort holdings that prevent cut document removal. */
import type { Store } from "../store/contract.js";
import type { StoreRecord } from "../store/read.js";
import type { Mutation } from "../store/write.js";
import type { DecomposeSurvivingMember } from "./removal-holders.js";
import type { DecomposeRefusal } from "./refusal.js";
import { acquireDecomposeCohortInventory } from "./check-names.js";
import { decomposeSurvivingStore } from "./removal-holders.js";

/** Report every open holder of the cohort documents the prepared batch removes. */
export async function checkDecomposeRemovalCohorts(store: Store, removed: readonly StoreRecord[],
  writes: readonly Mutation[], members: readonly DecomposeSurvivingMember[]): Promise<DecomposeRefusal | undefined> {
  if (removed.length === 0) return undefined;
  const cohorts = await acquireDecomposeCohortInventory(decomposeSurvivingStore(store, writes));
  if (cohorts.status === "refused") return cohorts;
  const holdings: string[] = [];
  for (const cohort of removed) {
    const name = cohort.reference.owner.name;
    const workItems = members.filter(entry => entry.fields.cohort?.split("/").includes(name))
      .map(entry => `work item ${entry.reference.owner.name}`);
    const children = cohorts.result.filter(entry => entry.record.placement?.kind !== "completed" && entry.path.startsWith(`${name}/`))
      .map(entry => `cohort ${entry.record.reference.owner.name}`);
    if (workItems.length + children.length > 0) holdings.push(`${name}: ${[...workItems, ...children].join(", ")}`);
  }
  return holdings.length === 0 ? undefined : { status: "refused", reason: "removed-cohort-held", class: "recoverable",
    locus: "cohort-membership", message: `Cohort documents still have open holders: ${holdings.join("; ")}.`,
    remedy: { text: "Have each owner move its work item out of the cohort through write-back; anyone may move a stub. Change a held cohort's Parent through write-back after its own open members leave, or in one batch with their moves, then retry." } };
}
