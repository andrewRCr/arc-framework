/** Version-bound recipient reads and external provider observations for dependency projection. */
import type { DecomposeContext } from "./context.js";
import type { CutMap } from "./cut-map-schema.js";
import type { DecomposeOriginRecords } from "./acquire-origin.js";
import type { DecomposeHome } from "./check-homes.js";
import type { DecomposeResult } from "./refusal.js";
import type { StoreRecord } from "../store/read.js";
import { SlugSchema } from "../kernel/index.js";
import { decomposeStoreRefusal } from "./refusal.js";

/** Stored recipient generations and provider names observed before any planned writes. */
export interface DecomposeDependencyFacts {
  origin: StoreRecord;
  dependents: readonly StoreRecord[];
  homes: readonly DecomposeHome[];
  externalTargets: ReadonlySet<string>;
}

/** Acquire each incoming primary once, sharing an already acquired home generation when applicable. */
export async function acquireDecomposeDependencyFacts(ctx: DecomposeContext, map: CutMap,
  acquired: DecomposeOriginRecords, homes: readonly DecomposeHome[]): Promise<DecomposeResult<DecomposeDependencyFacts>> {
  const store = ctx.executor.store;
  const dependents: StoreRecord[] = [];
  for (const { dependent } of map.machine.incomingEdges) {
    const existing = homes.find(home => home.primary.reference.owner.type === "work-item"
      && home.primary.reference.owner.uid === dependent.uid);
    if (existing !== undefined) { dependents.push(existing.primary); continue; }
    const entry = acquired.lifecycleEntries.find(candidate => candidate.reference.owner.type === "work-item"
      && candidate.reference.owner.uid === dependent.uid);
    if (entry === undefined) return { status: "refused", reason: "origin-changed", class: "recoverable",
      locus: "machine.incomingEdges", remedy: { text: "Generate and complete a fresh preflight map, or revise the stored cut to bind its current dependents." } };
    const read = await store.read({ reference: entry.reference });
    if (read.status === "refused") return decomposeStoreRefusal(read.refusal);
    dependents.push(read.result);
  }
  const externalTargets = new Set<string>();
  for (const slug of new Set(map.authoring.externalEdges.map(edge => edge.to))) {
    const lookup = await store.lookup({ kind: "slug", slug: SlugSchema.parse(slug) });
    if (lookup.status === "refused") {
      if (lookup.refusal.code === "not-found" || lookup.refusal.code === "ambiguous-match") continue;
      return decomposeStoreRefusal(lookup.refusal);
    }
    if (lookup.result.reference.kind === "work-item/meta") externalTargets.add(slug);
  }
  return { status: "ok", result: { origin: acquired.primary, dependents, homes, externalTargets } };
}
