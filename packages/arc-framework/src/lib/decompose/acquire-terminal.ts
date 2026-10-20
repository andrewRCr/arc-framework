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
import { decodeCutMapContent, type StoredCutMap } from "../store/kinds/cut-map/index.js";
import { acquireDecomposeOrigin } from "./acquire-origin.js";
import { acquireDecomposeTerminalCohorts, acquireDecomposeTerminalHomes } from "./acquire-terminal-targets.js";
import { sameReference } from "../store/identity.js";
import { acquireDecomposeMembers } from "./member-identity.js";

/** A map member's authenticated current primary, or absence after retirement or slug reuse. */
export interface DecomposeTerminalMember { destinationId: string; slug: string; uid: string; primary: StoreRecord | null }
/** One stored cut's complete preparation inputs, retained at their acquired versions. */
export interface DecomposeTerminalRecords {
  map: CutMap;
  storedCut: StoredCutMap;
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
  if (storedMap.conflicts.length > 0) return { status: "refused", reason: "stored-map-conflict", class: "recoverable", locus: origin,
    message: "The stored cut map has an open sync conflict.",
    remedy: { text: `Keep the current map by resolving its conflict with arc decompose ${origin} --discard or arc decompose ${origin} --revise.` } };
  const decoded = decodeCutMapContent(storedMap.content);
  if (!decoded.success) return { status: "refused", reason: "invalid-structure", class: "recoverable",
    locus: "$", message: decoded.error, remedy: { text: "Restore the authentic stored wrapper and required history from a known intact source, then prepare again. Explicitly regenerate development state whose required generation facts were never recorded." } };
  const storedCut = decoded.data, map = storedCut.map;
  const selected = await acquireDecomposeMembers(store, storedCut, storedMap);
  if (selected.status === "refused") return selected;
  const members = selected.result;
  const excluded = new Set(members.flatMap(member => {
    const owner = member.primary?.reference.owner;
    return owner?.type === "work-item" && owner.uid !== undefined ? [owner.uid] : [];
  }));
  const acquired = await acquireDecomposeOrigin(reading, origin, excluded);
  if (acquired.status === "refused") return acquired;
  const cohorts = await acquireDecomposeTerminalCohorts(store, map, storedCut, storedMap);
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
  return { status: "ok", result: { map, storedCut, acquired: { ...acquired.result, storedMap }, members, cohorts: cohorts.result, homes: homes.result, dependents, records } };
}
