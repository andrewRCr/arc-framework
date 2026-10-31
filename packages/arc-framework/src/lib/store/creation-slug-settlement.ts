/** Expected-version stub edge settlement for work-item name creation. */
import type { Store } from "./contract.js";
import type { OwnerIdentity } from "./identity.js";
import { recordReferences, sameOwner, sameReference } from "./identity.js";
import type { StoreRecord } from "./read.js";
import type { Mutation, RecordObservation } from "./write.js";
import { SlugSchema } from "../kernel/index.js";
import { priorTarget } from "./kinds/work-item/slug-edges.js";
import { observeRecords } from "./kinds/rule-support.js";
import { resolveRetiredEdge } from "./retired-edge.js";
import { replaceDependencySlot } from "./dependency-slot.js";
import { readLifecycleMetaFields, recordPut } from "./lifecycle-write.js";
import { writeMetaDependsOn } from "./kinds/meta/writers.js";

/** Writes and exact read evidence to append after a caller's primary create. */
export interface CreationSlugSettlement { writes: readonly Mutation[]; observations: readonly RecordObservation[] }

/** Settle eligible stub dependencies while leaving owner decisions to the slug-edge write rule. */
export async function settleCreationSlugEdges(store: Store, slug: string, writingOwner: OwnerIdentity): Promise<CreationSlugSettlement> {
  const empty = { writes: [], observations: [] };
  const prior = await priorTarget(store, SlugSchema.parse(slug));
  if (prior.status !== "known" || prior.value !== null && sameOwner(prior.value, writingOwner)) return empty;
  const records = await observeRecords(store, { family: "work-item", kind: "work-item/meta" });
  if (records.status !== "known") return empty;
  const writes: Mutation[] = [], observations: RecordObservation[] = [];
  for (const primary of records.value) {
    if (sameOwner(primary.reference.owner, writingOwner)) continue;
    const planned = await settleStub(store, primary, slug);
    if (planned === null) continue;
    writes.push(planned.write);
    for (const observation of planned.observations) {
      if (!observations.some(prior => sameReference(prior.reference, observation.reference))) observations.push(observation);
    }
  }
  return { writes, observations };
}

async function settleStub(store: Store, primary: StoreRecord, slug: string): Promise<{
  write: Mutation; observations: readonly RecordObservation[];
} | null> {
  if (primary.placement?.kind !== "backlog" || primary.conflicts.length > 0) return null;
  const fields = readLifecycleMetaFields(primary);
  if (fields.status === "refused" || fields.result.state !== "Planning" || !fields.result.dependsOn.includes(slug)) return null;
  const cutReference = recordReferences["work-item/cut-map"](primary.reference.owner);
  const cut = await store.read({ reference: cutReference });
  if (cut.status !== "refused" || cut.refusal.code !== "not-found") return null;
  const resolved = await resolveRetiredEdge(store, slug, primary.reference.owner);
  if (resolved.status === "refused" || resolved.result === null) return null;
  const disposition = resolved.result.disposition;
  const targets = replaceDependencySlot(fields.result.dependsOn, new Set([slug]),
    disposition.kind === "drop" ? [] : disposition.replacementTargets);
  const records = [primary, ...resolved.result.records];
  return { write: recordPut(primary, { content: writeMetaDependsOn(primary.content, targets) }), observations: [
    { reference: cutReference, expected: null },
    ...records.map(record => ({ reference: record.reference, expected: { version: record.version, conflicts: record.conflicts } })),
  ] };
}
