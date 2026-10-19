/** Version-bound acquisition for finishing a stored decomposition. */
import type { DecomposeContext } from "./context.js";
import type { DecomposeResult } from "./refusal.js";
import type { CutMap } from "./cut-map-schema.js";
import type { DecomposeOriginRecords } from "./acquire-origin.js";
import type { StoreRecord } from "../store/read.js";
import type { DecomposeCohortObservation } from "./check-names.js";
import type { DecomposeTerminalHome } from "./acquire-terminal-targets.js";
import { acquireLifecycleRecords } from "../work-unit/prepared-lifecycle-write.js";
import { decomposeStoreRefusal } from "./refusal.js";
import { decomposeReadCache } from "./read-cache.js";
import { decodeCutMap } from "./cut-map-decode.js";
import { acquireDecomposeOrigin } from "./acquire-origin.js";
import { acquireDecomposeTerminalCohorts, acquireDecomposeTerminalHomes } from "./acquire-terminal-targets.js";
import { sameReference } from "../store/identity.js";
import { acquireDecomposeMembers } from "./member-identity.js";

/** A map member's authenticated current primary, or absence after retirement or slug reuse. */
export interface DecomposeTerminalMember { destinationId: string; slug: string; primary: StoreRecord | null }
/** One stored cut's complete preparation inputs, retained at their acquired versions. */
export interface DecomposeTerminalRecords {
  map: CutMap;
  acquired: DecomposeOriginRecords & { storedMap: StoreRecord };
  members: readonly DecomposeTerminalMember[];
  cohorts: readonly DecomposeCohortObservation[];
  homes: readonly DecomposeTerminalHome[];
  dependents: readonly StoreRecord[];
  records: readonly StoreRecord[];
}

/** Acquire the stored cut and every record required to prepare its terminal batch. */
export async function acquireDecomposeTerminal(ctx: DecomposeContext, origin: string): Promise<DecomposeResult<DecomposeTerminalRecords>> {
  const store = decomposeReadCache(ctx.executor.store);
  const reading = { ...ctx, executor: { ...ctx.executor, store } };
  const group = await acquireLifecycleRecords(store, origin);
  if (group.status === "refused") return decomposeStoreRefusal(group.refusal);
  const storedMap = group.result.find(record => record.reference.kind === "work-item/cut-map");
  if (storedMap === undefined) return { status: "refused", reason: "no-stored-map", class: "recoverable", locus: origin,
    remedy: { text: "Start the cut with --execute or --extract and a completed preflight map, then finish the stored cut." } };
  const decoded = decodeCutMap(JSON.parse(storedMap.content));
  if (decoded.status === "rejected") return { status: "refused", reason: decoded.issue.code, class: "recoverable",
    locus: decoded.issue.path || "$", message: decoded.issue.message, remedy: { text: "Restore the stored cut map through --revise, then finish it." } };
  const map = decoded.value;
  const selected = await acquireDecomposeMembers(store, map, storedMap);
  if (selected.status === "refused") return selected;
  const members = selected.result;
  const excluded = new Set(members.flatMap(member => {
    const owner = member.primary?.reference.owner;
    return owner?.type === "work-item" && owner.uid !== undefined ? [owner.uid] : [];
  }));
  const acquired = await acquireDecomposeOrigin(reading, origin, excluded);
  if (acquired.status === "refused") return acquired;
  const cohorts = await acquireDecomposeTerminalCohorts(store, map);
  if (cohorts.status === "refused") return cohorts;
  const homes = await acquireDecomposeTerminalHomes(reading, map);
  if (homes.status === "refused") return homes;
  const dependents: StoreRecord[] = [];
  for (const { uid } of acquired.result.edges.incoming) {
    const entry = acquired.result.incomingCandidates.find(candidate => candidate.reference.owner.type === "work-item"
      && candidate.reference.owner.uid === uid && candidate.placement.kind === "backlog");
    if (entry === undefined) continue;
    const record = await store.read({ reference: entry.reference });
    if (record.status === "refused") return decomposeStoreRefusal(record.refusal);
    dependents.push(record.result);
  }
  const inputs = [...acquired.result.records, ...members.flatMap(member => member.primary === null ? [] : [member.primary]),
    ...cohorts.result.map(cohort => cohort.record), ...homes.result.flatMap(home => home.records), ...dependents];
  const records = inputs.filter((record, index) => inputs.findIndex(other => sameReference(other.reference, record.reference)) === index);
  return { status: "ok", result: { map, acquired: { ...acquired.result, storedMap }, members, cohorts: cohorts.result, homes: homes.result, dependents, records } };
}
