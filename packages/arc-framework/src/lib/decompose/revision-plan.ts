/** Version-bound preparation of the difference between two cut maps. */
import type { DecomposeContext, DecomposeMapInput } from "./context.js";
import type { DecomposeResult } from "./refusal.js";
import type { StoreRecord } from "../store/read.js";
import type { Mutation } from "../store/write.js";
import { admitDecomposeRevision, type DecomposeRevisionAdmission } from "./revision-admission.js";
import { recordPut } from "../store/lifecycle-write.js";
import { writeCutMapRecord } from "../store/kinds/cut-map/index.js";
import { sameReference } from "../store/identity.js";
import { decomposeReadCache } from "./read-cache.js";
import { decomposeRevisionAddedSlugs, prepareDecomposeRevisionMembers } from "./revision-members.js";
import { planDecomposeSlugSettlements } from "./slug-settlement.js";
import { decomposeSlugSettlementWrites } from "./slug-settler.js";
import { decomposeRemovalWrites } from "./removal-records.js";
import { checkDecomposeRemovals } from "./removal-guards.js";

/** Admitted authoring, version guards, and only the mutations to show and apply. */
export interface DecomposeRevisionPlan extends DecomposeRevisionAdmission {
  records: readonly StoreRecord[];
  writes: readonly Mutation[];
}

/** Prepare a current cut revision without writing to the store. */
export async function prepareDecomposeRevision(ctx: DecomposeContext, origin: string,
  input: DecomposeMapInput): Promise<DecomposeResult<DecomposeRevisionPlan>> {
  const store = decomposeReadCache(ctx.executor.store);
  const cached = { ...ctx, executor: { ...ctx.executor, store } };
  const admitted = await admitDecomposeRevision(cached, origin, input);
  if (admitted.status === "refused") return admitted;
  const plan = admitted.result, { prior, map, ownedCohorts, facts, homes } = plan;
  const settled = await planDecomposeSlugSettlements(cached, map, prior.acquired,
    [...facts.dependents, ...homes.map(home => home.primary)], decomposeRevisionAddedSlugs(plan));
  if (settled.status === "refused") return settled;
  const settlement = decomposeSlugSettlementWrites(settled.result);
  if (settlement.status === "refused") return settlement;
  const members = await prepareDecomposeRevisionMembers(cached, plan, settlement.result);
  if (members.status === "refused") return members;
  const cohortPath = plan.cohorts.topology.memberCohort;
  const keepsCohort = (path: string): boolean => cohortPath === path || cohortPath?.startsWith(`${path}/`) === true;
  const removedCohorts = ownedCohorts.filter(cohort => !keepsCohort(cohort.path));
  const records = [...prior.acquired.records, ...members.result.records, ...ownedCohorts.map(cohort => cohort.record),
    ...plan.names.cohorts.filter(cohort => keepsCohort(cohort.path)).map(cohort => cohort.record),
    ...settled.result.records, ...facts.dependents, ...homes.map(home => home.primary)]
    .filter((record, index, all) => all.findIndex(other => sameReference(other.reference, record.reference)) === index);
  const writes: Mutation[] = [...members.result.writes, ...plan.cohorts.writes,
    ...decomposeRemovalWrites(removedCohorts.map(cohort => cohort.record)),
    { ...recordPut(prior.storedMap, { content: writeCutMapRecord(map) }),
      ...(prior.storedMap.conflicts.length === 0 ? {} : { resolves: prior.storedMap.conflicts }) }];
  const routeTo = prior.members.find(member => member.primary !== null
    && plan.dependencies.members.some(next => next.slug === member.slug))?.slug ?? "<retained-member>";
  const refusal = await checkDecomposeRemovals(cached, { records, writes, routeTo });
  return refusal ?? { status: "ok", result: { ...plan, records, writes } };
}
