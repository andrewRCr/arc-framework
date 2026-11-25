/** Version-bound preparation of an in-progress cut's complete removals. */
import type { DecomposeContext } from "./context.js";
import type { DecomposeResult } from "./refusal.js";
import type { DecomposeStoredCut } from "./stored-cut.js";
import type { DecomposeTerminalMember } from "./acquire-terminal.js";
import type { StoreRecord } from "../store/read.js";
import type { Mutation } from "../store/write.js";
import { acquireDecomposeStoredCut } from "./stored-cut.js";
import { acquireDecomposeMembers } from "./member-identity.js";
import { acquireDecomposeCutCohorts } from "./cut-cohorts.js";
import { acquireLifecycleRecords } from "../work-unit/prepared-lifecycle-write.js";
import { decomposeReadCache } from "./read-cache.js";
import { decomposeStoreRefusal } from "./refusal.js";
import { decomposeRemovalWrites } from "./removal-records.js";
import { sameReference } from "../store/identity.js";
import { checkDecomposeRemovals } from "./removal-guards.js";

/** Stored map, authenticated members, observations, and exact explicit removals. */
export interface DecomposeDiscardPlan extends DecomposeStoredCut {
  members: readonly DecomposeTerminalMember[];
  records: readonly StoreRecord[];
  writes: readonly Mutation[];
  leftEdited: DecomposeStoredCut["map"]["authoring"]["destinations"];
}

/** Acquire whole current member generations without applying source or conservation checks. */
export async function prepareDecomposeDiscard(ctx: DecomposeContext, origin: string): Promise<DecomposeResult<DecomposeDiscardPlan>> {
  const store = decomposeReadCache(ctx.executor.store);
  const selected = await acquireDecomposeStoredCut(store, origin);
  if (selected.status === "refused") return selected;
  const { map, primary, storedMap } = selected.result;
  const originGroup = await acquireLifecycleRecords(store, primary.reference);
  if (originGroup.status === "refused") return decomposeStoreRefusal(originGroup.refusal);
  const members = await acquireDecomposeMembers(store, selected.result.storedCut, storedMap);
  if (members.status === "refused") return members;
  const cohorts = await acquireDecomposeCutCohorts(store, selected.result.storedCut, storedMap);
  if (cohorts.status === "refused") return cohorts;
  const removed: StoreRecord[] = [storedMap, ...cohorts.result.map(cohort => cohort.record)];
  const acquired = new Set<string>();
  for (const member of members.result) {
    if (member.primary === null || acquired.has(member.primary.reference.owner.name)) continue;
    acquired.add(member.primary.reference.owner.name);
    const group = await acquireLifecycleRecords(store, member.primary.reference);
    if (group.status === "refused") return decomposeStoreRefusal(group.refusal);
    removed.push(...group.result);
  }
  const records = [...originGroup.result, ...removed].filter((record, index, all) =>
    all.findIndex(other => sameReference(other.reference, record.reference)) === index);
  const allocated = new Set(map.authoring.sourceAllocations.flatMap(allocation =>
    allocation.disposition.kind === "target" ? [allocation.disposition.destinationId] : []));
  const leftEdited = map.authoring.destinations.filter(destination => allocated.has(destination.destinationId)
    && (destination.kind === "existing-home" || destination.kind === "cohort-coordination"
      && !cohorts.result.some(cohort => cohort.path === destination.cohort)));
  const writes = decomposeRemovalWrites(removed);
  const refusal = await checkDecomposeRemovals({ ...ctx, executor: { ...ctx.executor, store } }, {
    records, writes, routeTo: primary.reference.owner.name });
  return refusal ?? { status: "ok", result: { ...selected.result, members: members.result, records, writes, leftEdited } };
}
