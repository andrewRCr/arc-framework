/** Complete admission and record preparation for the first batch of a cut. */
import type { DecomposeContext, DecomposeMapInput } from "./context.js";
import type { DecomposeAdditiveMode } from "./bind-map.js";
import type { DecomposeResult } from "./refusal.js";
import type { DecomposeAdditiveApplied } from "./additive.js";
import type { PreparedLifecycleWrite } from "../work-unit/prepared-lifecycle-write.js";
import type { StoreRecord } from "../store/read.js";
import { bindDecomposeMap } from "./bind-map.js";
import { checkDecomposeNames } from "./check-names.js";
import { checkDecomposeHomes } from "./check-homes.js";
import { checkDecomposeAllocations } from "./allocation-rules.js";
import { planDecomposeCohorts } from "./cohort-scaffold.js";
import { acquireDecomposeDependencyFacts } from "./dependency-facts.js";
import { projectDecomposeDependencies } from "./dependency-projection.js";
import { checkDecomposeWrittenEdges } from "./check-written-edges.js";
import { planDecomposeMembers } from "./member-scaffold.js";
import { planDecomposeSlugSettlements } from "./slug-settlement.js";
import { decomposeSlugSettlementWrites } from "./slug-settler.js";
import { recordReferences, sameReference } from "../store/identity.js";
import { writeCutMapRecord } from "../store/kinds/cut-map/index.js";

/** Prepared edits and their immutable provider observations, with report inputs. */
export interface DecomposeAdditivePlan extends Omit<DecomposeAdditiveApplied, "batch"> {
  prepared: PreparedLifecycleWrite;
  observations: readonly StoreRecord[];
}

/** Rebind and check all authored decisions before composing any record mutation. */
export async function prepareDecomposeAdditive(ctx: DecomposeContext, origin: string, mode: DecomposeAdditiveMode,
  input: DecomposeMapInput): Promise<DecomposeResult<DecomposeAdditivePlan>> {
  const bound = await bindDecomposeMap(ctx, origin, mode, input);
  if (bound.status === "refused") return bound;
  const { map, acquired } = bound.result;
  const names = await checkDecomposeNames(ctx.executor.store, map);
  if (names.status === "refused") return names;
  const homes = await checkDecomposeHomes(ctx, map);
  if (homes.status === "refused") return homes;
  const allocations = checkDecomposeAllocations(map, homes.result);
  if (allocations !== undefined) return allocations;
  const cohorts = planDecomposeCohorts(ctx, map, names.result);
  if (cohorts.status === "refused") return cohorts;
  const facts = await acquireDecomposeDependencyFacts(ctx, map, acquired, homes.result);
  if (facts.status === "refused") return facts;
  const dependencies = projectDecomposeDependencies(map, facts.result);
  if (dependencies.status === "refused") return dependencies;
  const edges = await checkDecomposeWrittenEdges(ctx, map, facts.result, dependencies.result);
  if (edges !== undefined) return edges;
  const members = planDecomposeMembers(ctx, map, acquired, cohorts.result.topology, dependencies.result);
  if (members.status === "refused") return members;
  const settlement = await planDecomposeSlugSettlements(ctx, map, acquired,
    [...facts.result.dependents, ...homes.result.map(home => home.primary)]);
  if (settlement.status === "refused") return settlement;
  const settled = decomposeSlugSettlementWrites(settlement.result);
  if (settled.status === "refused") return settled;
  const storedMap = recordReferences["work-item/cut-map"](acquired.primary.reference.owner);
  const records = uniqueRecords([...acquired.records, ...settlement.result.settlements.map(entry => entry.primary)]);
  return { status: "ok", result: { map, storedMap, members: members.result.members, cohorts: cohorts.result.cohorts,
    observations: uniqueRecords([...settlement.result.records, ...facts.result.dependents, ...homes.result.map(home => home.primary)]),
    prepared: { records, writes: [...members.result.writes, ...cohorts.result.writes, ...settled.result,
      { action: "put", reference: storedMap, expected: null, content: writeCutMapRecord(map) }] } } };
}

function uniqueRecords(records: readonly StoreRecord[]): StoreRecord[] {
  return records.filter((record, index) => !records.slice(0, index).some(prior => sameReference(prior.reference, record.reference)));
}
