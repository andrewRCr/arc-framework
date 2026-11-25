/** Accepted event transport is independent of current-tree reconciliation. */
import { familyOf, type FamilyId, type StateVersion } from "../../../src/lib/store/index.js";
import { advanceMemoryState, recordKey, type MemoryRecord, type MemoryState } from "./model.js";

/** Transfer unseen eligible events with exact historical bytes and receiving-local state anchors.
 * @param source - Durable accepted events and their original saved snapshots.
 * @param destination - Staged receiving namespace, never a live partially published target.
 * @param families - Families admitted by this sync's identity and publication policy.
 * @returns Number of accepted events received, including removals and net-zero histories.
 */
export function transferMemoryHistory(source: MemoryState, destination: MemoryState, families: readonly FamilyId[]): number {
  const eligible = new Set(families), known = new Set(destination.events.map((event) => event.id));
  const receivingVersions = new Map<StateVersion, StateVersion>();
  let count = 0;
  for (const event of source.events) {
    if (known.has(event.id) || !eligible.has(familyOf(event.reference.kind))) continue;
    const snapshot = source.snapshots.get(event.stateVersion);
    if (snapshot === undefined) throw new Error("An accepted event lacks its original saved state");
    if (event.version !== undefined && snapshot.get(recordKey(event.reference))?.version !== event.version)
      throw new Error("An accepted event lacks its exact historical record");
    let receivingVersion = receivingVersions.get(event.stateVersion);
    if (receivingVersion === undefined) {
      receivingVersion = advanceMemoryState(destination).stateVersion;
      receivingVersions.set(event.stateVersion, receivingVersion);
      destination.snapshots.set(receivingVersion, eligibleSnapshot(destination.records, snapshot, eligible));
    }
    destination.events.push({ ...structuredClone(event), stateVersion: receivingVersion });
    known.add(event.id); count++;
  }
  return count;
}

function eligibleSnapshot(current: ReadonlyMap<string, MemoryRecord>, historical: ReadonlyMap<string, MemoryRecord>,
  eligible: ReadonlySet<FamilyId>): Map<string, MemoryRecord> {
  const snapshot = structuredClone(new Map(current));
  for (const [key, record] of snapshot) if (eligible.has(familyOf(record.reference.kind))) snapshot.delete(key);
  for (const [key, record] of historical) if (eligible.has(familyOf(record.reference.kind))) snapshot.set(key, structuredClone(record));
  return snapshot;
}

/** Save the final current view after importing historical snapshots.
 * @param state - Staged namespace whose current tree is already reconciled.
 * @returns Nothing; this checkpoint carries no synthetic mutation event.
 */
export function checkpointMemoryState(state: MemoryState): void {
  const { stateVersion } = advanceMemoryState(state);
  state.snapshots.set(stateVersion, structuredClone(state.records));
}
