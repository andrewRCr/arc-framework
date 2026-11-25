/** Rebuild name resolution from the complete proposed durable generations. */
import { type OwnerIdentity, type StoreResult } from "../../../src/lib/store/index.js";
import { ownerNameKey, type MemoryRecord } from "./model.js";
import { ok, refused } from "./refusals.js";

function priority(record: MemoryRecord): number {
  const {owner,kind} = record.reference;
  const primary = owner.type === "project" || kind === "cohort/document" || kind === "work-item/meta" || kind === "work-item/record";
  return !primary ? 0 : record.placement?.kind === "completed" ? 1 : 2;
}

/** Reconstruct current handles and rename aliases, preferring live primary generations.
 * @param records - Complete resulting namespace, including untouched families.
 * @returns A usable name index or every colliding live owner rather than an arbitrary winner.
 */
export function indexIdentities(records: ReadonlyMap<string, MemoryRecord>): StoreResult<Map<string, OwnerIdentity>> {
  const ordered = [...records.values()].filter((record) => record.reference.owner.type !== "person").sort((left,right) => priority(left)-priority(right));
  const live = new Map<string, MemoryRecord>();
  for (const record of ordered) {
    if (priority(record) !== 2) continue;
    const key = ownerNameKey(record.reference.owner);
    const prior = live.get(key);
    if (prior !== undefined && prior.reference.owner.type !== "person" && record.reference.owner.type !== "person"
      && prior.reference.owner.uid !== record.reference.owner.uid) return refused({
        code:"ambiguous-match",class:"recoverable",candidates:[prior.reference,record.reference],
        condition:`The proposed namespace contains multiple live generations named ${record.reference.owner.name}.`,
        remedy:{text:"Give the colliding live owners distinct names by UID, then retry."},
      });
    live.set(key,record);
  }
  const names = new Map<string, {owner:OwnerIdentity;priority:number}>();
  for (const record of ordered) {
    for (const alias of record.formerSlugs) indexName(names,record,alias,priority(record)*2);
    indexName(names,record,record.reference.owner.name,priority(record)*2+1);
  }
  return ok(new Map([...names].map(([name,value])=>[name,value.owner])));
}

function indexName(names:Map<string,{owner:OwnerIdentity;priority:number}>,record:MemoryRecord,name:string,priority:number): void {
  const key = ownerNameKey({...record.reference.owner,name});
  if ((names.get(key)?.priority ?? -1) <= priority) names.set(key,{owner:record.reference.owner,priority});
}
