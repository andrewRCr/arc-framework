/** Added scaffolds, retained seed edits, and removed whole member groups. */
import type { DecomposeContext } from "./context.js";
import type { DecomposeRevisionAdmission } from "./revision-admission.js";
import type { DecomposeResult } from "./refusal.js";
import type { StoreRecord } from "../store/read.js";
import type { Mutation } from "../store/write.js";
import { planDecomposeMembers } from "./member-scaffold.js";
import { acquireLifecycleRecords } from "../work-unit/prepared-lifecycle-write.js";
import { recordPut } from "../store/lifecycle-write.js";
import { parseLifecycleMetaContent } from "../store/lifecycle-meta-content.js";
import { checkDecomposeRevisionSeedMove } from "./revision-guards.js";
import { projectDecomposeRevisionSeeds } from "./revision-seeds.js";
import { decomposeRemovalWrites } from "./removal-records.js";
import { sameReference } from "../store/identity.js";
import { decomposeStoreRefusal } from "./refusal.js";
import { decomposeMapRuleRefusal } from "./map-rule-refusal.js";

/** Added member names depend on map membership, never destination IDs or reused generations. */
export function decomposeRevisionAddedSlugs(input: DecomposeRevisionAdmission): ReadonlySet<string> {
  const prior = new Set(input.prior.members.map(member => member.slug));
  return new Set(input.map.authoring.destinations.flatMap(destination => destination.kind === "new-member"
    && !prior.has(destination.slug) ? [destination.slug] : []));
}

/** Prepare member changes, combining any prior-generation settlement into each retained metadata put. */
export async function prepareDecomposeRevisionMembers(ctx: DecomposeContext, input: DecomposeRevisionAdmission,
  settled: readonly Mutation[]): Promise<DecomposeResult<{ records: readonly StoreRecord[]; writes: readonly Mutation[] }>> {
  const addedSlugs = decomposeRevisionAddedSlugs(input);
  const added = planDecomposeMembers(ctx, input.map, input.prior.acquired, input.cohorts.topology, input.dependencies, addedSlugs);
  if (added.status === "refused") return added;
  const records: StoreRecord[] = [], writes: Mutation[] = [...added.result.writes];
  const desired = new Map(input.dependencies.members.map(member => [member.slug, member]));
  for (const member of input.prior.members) {
    const primary = member.primary;
    if (primary === null) continue;
    records.push(primary);
    const seed = desired.get(member.slug);
    if (seed === undefined) {
      const group = await acquireLifecycleRecords(ctx.executor.store, member.slug);
      if (group.status === "refused") return decomposeStoreRefusal(group.refusal);
      records.push(...group.result);
      writes.push(...decomposeRemovalWrites(group.result));
      continue;
    }
    const retained = await prepareRetainedMember(ctx, input, primary, seed.dependsOn, settled);
    if (retained.status === "refused") return retained;
    records.push(...retained.result.records);
    writes.push(...retained.result.writes);
  }
  const touched = input.prior.members.flatMap(member => member.primary === null ? [] : [member.primary.reference]);
  writes.push(...settled.filter(write => !touched.some(reference => sameReference(reference, write.reference))));
  return { status: "ok", result: { records, writes } };
}

async function prepareRetainedMember(ctx: DecomposeContext, input: DecomposeRevisionAdmission, primary: StoreRecord,
  dependsOn: readonly string[], settled: readonly Mutation[]): Promise<DecomposeResult<{ records: readonly StoreRecord[]; writes: readonly Mutation[] }>> {
  const priorPut = settled.find(write => write.action === "put" && sameReference(write.reference, primary.reference));
  const basis = priorPut?.action === "put" ? proposedMember(primary, priorPut.content) : { status: "ok" as const, result: primary };
  if (basis.status === "refused") return basis;
  const moved = await projectDecomposeRevisionSeeds(ctx.executor.store, input.prior, basis.result, {
    dependsOn, cohort: input.cohorts.topology.memberCohort, addedSlugs: decomposeRevisionAddedSlugs(input) });
  if (moved.status === "refused") return moved;
  const protectedMove = checkDecomposeRevisionSeedMove(primary, moved.result.content);
  if (protectedMove !== undefined) return protectedMove;
  return { status: "ok", result: { records: moved.result.records,
    writes: moved.result.content === primary.content ? [] : [recordPut(primary, { content: moved.result.content })] } };
}

function proposedMember(primary: StoreRecord, content: string): DecomposeResult<StoreRecord> {
  const fields = parseLifecycleMetaContent(content);
  return fields.success ? { status: "ok", result: { ...primary, content, fields: fields.data } }
    : decomposeMapRuleRefusal("source-artifact", primary.reference.owner.name, fields.error);
}
