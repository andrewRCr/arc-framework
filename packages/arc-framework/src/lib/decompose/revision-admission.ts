/** Admission of a revised map against one stored cut and fresh machine facts. */
import type { DecomposeContext, DecomposeMapInput } from "./context.js";
import type { DecomposeResult } from "./refusal.js";
import { checkDecomposeRevisionIdentities } from "./revision-guards.js";
import { bindDecomposeRevisionMap, type BoundDecomposeRevision } from "./bind-revision.js";
import { checkDecomposeNames, type DecomposeNames, type DecomposeCohortObservation } from "./check-names.js";
import { checkDecomposeHomes, type DecomposeHome } from "./check-homes.js";
import { checkDecomposeAllocations } from "./allocation-rules.js";
import { acquireDecomposeCutCohorts } from "./cut-cohorts.js";
import { planDecomposeCohorts, type DecomposeCohortScaffolds } from "./cohort-scaffold.js";
import { acquireDecomposeDependencyFacts, type DecomposeDependencyFacts } from "./dependency-facts.js";
import { projectDecomposeDependencies, type DecomposeDependencyProjection } from "./dependency-projection.js";
import { checkDecomposeWrittenEdges } from "./check-written-edges.js";
import { decomposeReadCache } from "./read-cache.js";
import { decomposeSelectedCohortPaths } from "./owner-birth-bindings.js";

/** Complete authoring admission and observations needed to prepare the revision difference. */
export interface DecomposeRevisionAdmission extends BoundDecomposeRevision {
  names: DecomposeNames;
  homes: readonly DecomposeHome[];
  cohorts: DecomposeCohortScaffolds;
  ownedCohorts: readonly DecomposeCohortObservation[];
  facts: DecomposeDependencyFacts;
  dependencies: DecomposeDependencyProjection;
}

/** Check a revision before preparing any record mutation. */
export async function admitDecomposeRevision(ctx: DecomposeContext, origin: string,
  input: DecomposeMapInput): Promise<DecomposeResult<DecomposeRevisionAdmission>> {
  const store = decomposeReadCache(ctx.executor.store);
  const cached = { ...ctx, executor: { ...ctx.executor, store } };
  const bound = await bindDecomposeRevisionMap(cached, origin, input);
  if (bound.status === "refused") return bound;
  const { prior, map } = bound.result;
  const owned = await acquireDecomposeCutCohorts(store, prior.storedCut, prior.storedMap);
  if (owned.status === "refused") return owned;
  const identities = checkDecomposeRevisionIdentities(bound.result, owned.result);
  if (identities !== undefined) return identities;
  const retained = prior.members.flatMap(member => member.primary === null ? [] : [member.primary.reference]);
  const names = await checkDecomposeNames(store, map, retained);
  if (names.status === "refused") return names;
  const homes = await checkDecomposeHomes(cached, map);
  if (homes.status === "refused") return homes;
  const allocations = checkDecomposeAllocations(map, homes.result);
  if (allocations !== undefined) return allocations;
  const ownedPaths = decomposeSelectedCohortPaths(prior.map).filter(path => prior.storedCut.ownerBirths
    .some(birth => birth.kind === "cohort/document" && birth.name === path.split("/").at(-1)));
  const cohorts = planDecomposeCohorts(cached, map, names.result, new Set(ownedPaths));
  if (cohorts.status === "refused") return cohorts;
  const facts = await acquireDecomposeDependencyFacts(cached, map, prior.acquired, homes.result);
  if (facts.status === "refused") return facts;
  const dependencies = projectDecomposeDependencies(map, facts.result);
  if (dependencies.status === "refused") return dependencies;
  const edges = await checkDecomposeWrittenEdges(cached, map, facts.result, dependencies.result);
  if (edges !== undefined) return edges;
  return { status: "ok", result: { ...bound.result, names: names.result, homes: homes.result, cohorts: cohorts.result,
    ownedCohorts: owned.result, facts: facts.result, dependencies: dependencies.result } };
}
