/** Before-state settlement plans for stub edges naming a reused member slug. */
import type { DecomposeContext } from "./context.js";
import type { CutMap } from "./cut-map-schema.js";
import type { DecomposeOriginRecords } from "./acquire-origin.js";
import type { DecomposeResult } from "./refusal.js";
import type { StoreRecord } from "../store/read.js";
import type { WorkItemRef } from "../store/kinds/lineage/index.js";
import { sameOwner, recordReferences, sameReference } from "../store/identity.js";
import { readLifecycleMetaFields } from "../store/lifecycle-write.js";
import { decomposeStoreRefusal } from "./refusal.js";
import { resolveDecomposeRetiredEdge } from "./retired-edge.js";

/** A prior generation's edge, held at the dependent's acquired metadata version. */
export interface DecomposeSlugSettlement {
  primary: StoreRecord;
  edge: string;
  priorTarget: WorkItemRef;
  disposition: { kind: "drop"; reason: string } | { kind: "replace"; replacementTargets: readonly string[] };
}

/** Read guards retained alongside the edges that can be settled without owner judgment. */
export interface DecomposeSlugSettlementPlan {
  settlements: readonly DecomposeSlugSettlement[];
  records: readonly StoreRecord[];
}

/** Plan only resolvable stub edges, leaving held, started, and ambiguous edges for the store's slug guard. */
export async function planDecomposeSlugSettlements(ctx: DecomposeContext, map: CutMap,
  acquired: DecomposeOriginRecords, records: readonly StoreRecord[] = []): Promise<DecomposeResult<DecomposeSlugSettlementPlan>> {
  const slugs = new Set(map.authoring.destinations.flatMap(destination => destination.kind === "new-member" ? [destination.slug] : []));
  const settlements: DecomposeSlugSettlement[] = [], guards: StoreRecord[] = [];
  for (const entry of acquired.lifecycleEntries) {
    if (entry.placement.kind !== "backlog" || sameOwner(entry.reference.owner, acquired.primary.reference.owner)
      || !entry.fields.dependsOn.some(edge => slugs.has(edge))) continue;
    const planned = await planStub(ctx, entry.reference, slugs, records);
    if (planned.status === "refused") return planned;
    settlements.push(...planned.result.settlements);
    guards.push(...planned.result.records);
  }
  return { status: "ok", result: { settlements, records: guards.filter((record, index) => !guards.slice(0, index)
    .some(prior => sameReference(prior.reference, record.reference))) } };
}

async function planStub(ctx: DecomposeContext, reference: StoreRecord["reference"], slugs: ReadonlySet<string>,
  records: readonly StoreRecord[]): Promise<DecomposeResult<DecomposeSlugSettlementPlan>> {
  const existing = records.find(record => sameReference(record.reference, reference));
  const current = existing === undefined ? await ctx.executor.store.read({ reference }) : { status: "ok" as const, result: existing };
  if (current.status === "refused") return decomposeStoreRefusal(current.refusal);
  const empty = { status: "ok" as const, result: { settlements: [], records: [] } };
  if (current.result.placement?.kind !== "backlog" || current.result.conflicts.length > 0) return empty;
  const cut = await ctx.executor.store.read({ reference: recordReferences["work-item/cut-map"](current.result.reference.owner) });
  if (cut.status === "ok") return empty;
  if (cut.refusal.code !== "not-found") return decomposeStoreRefusal(cut.refusal);
  const fields = readLifecycleMetaFields(current.result);
  if (fields.status === "refused") return decomposeStoreRefusal(fields.refusal);
  const settlements: DecomposeSlugSettlement[] = [], guards: StoreRecord[] = [];
  for (const edge of fields.result.dependsOn.filter(target => slugs.has(target))) {
    const resolved = await resolveDecomposeRetiredEdge(ctx.executor.store, edge, current.result.reference.owner);
    if (resolved.status === "refused") return resolved;
    if (resolved.result === null) continue;
    settlements.push({ primary: current.result, edge, priorTarget: resolved.result.priorTarget, disposition: resolved.result.disposition });
    guards.push(current.result, ...resolved.result.records);
  }
  return { status: "ok", result: { settlements, records: guards } };
}
