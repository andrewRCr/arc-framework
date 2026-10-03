/** Atomic local mutations and backend-enriched provenance for reference contract tests. */

import { randomUUID } from "node:crypto";
import {
  ConflictRecordSchema, LinksSchema, RecordReferenceSchema, familyOf, type BatchInput, type BatchResult, type ConflictRecord, type Mutation, type ReadPlacement,
  type StoreRefusal, type StoreResult, type WriteInput, type WriteResult, type OwnerIdentity, sameReference,
} from "../../../src/lib/store/index.js";
import { ArchiveSequenceSchema } from "../../../src/lib/kernel/index.js";
import type { ReferenceContext } from "./context.js";
import {
  advanceMemoryState, canonicalReference, generationAliases, ownerNameKey, recordKey, type MemoryRecord,
} from "./model.js";
import { malformed, ok, namespaceAdmission, recordAdmission, refused, surfaceLock, versionConflict } from "./refusals.js";
import { mergeBase, mergeContents, persistedContent, storeConflicts } from "./merge.js";
import { indexIdentities } from "./identities.js";

function primary(write: Mutation): boolean {
  return write.reference.kind === "work-item/meta" || write.reference.kind === "work-item/record";
}

function prepareGenerations(context: ReferenceContext, writes: WriteInput[]): WriteInput[] {
  const fresh = new Map<string, OwnerIdentity>();
  for (const write of writes) {
    const owner = write.reference.owner;
    if (!primary(write) || write.action !== "put" || write.expected !== null || owner.type === "person" || owner.uid !== undefined) continue;
    const name = ownerNameKey(owner);
    if (fresh.has(name)) continue;
    const prior = canonicalReference(context.state, write.reference).owner;
    const live = [...context.state.records.values()].some((record) => primary({ ...write, reference: record.reference })
      && record.reference.owner.type !== "person" && prior.type !== "person" && record.reference.owner.uid === prior.uid
      && record.placement?.kind !== "completed");
    if (live) continue;
    context.state.identities.delete(name);
    fresh.set(name, canonicalReference(context.state, write.reference, true).owner);
  }
  return writes.map((write) => {
    if (write.reference.owner.type === "person" || write.reference.owner.uid !== undefined) return write;
    const owner = fresh.get(ownerNameKey(write.reference.owner));
    return owner === undefined ? write : { ...write, reference: RecordReferenceSchema.parse({ ...write.reference, owner }) };
  });
}

function preflight(context: ReferenceContext, write: WriteInput): StoreRefusal | undefined {
  const admission = recordAdmission(context.state, write.reference, context.environment.identity);
  if (admission) return admission;
  const lock = surfaceLock(write.reference);
  if (context.state.locks.has(lock)) return {
    code: "lock-held", class: "recoverable", lock,
    condition: "Another process holds this surface's write lock past its wait.",
    remedy: { text: "Wait for the holder to release the write lock, then retry." },
  };
  const definition = context.registry[write.reference.kind];
  if (write.action === "remove" && write.reference.kind.endsWith("/conflict-record")
    && !write.resolves?.some((conflict) => sameReference(canonicalReference(context.state, conflict), canonicalReference(context.state, write.reference)))) {
    return { ...malformed(write.reference, "Removing a conflict record requires explicitly naming it in resolves."),
      remedy: { text: "Name this conflict in resolves and remove it against its current version, or write its subject naming the conflict." } };
  }
  if (definition.writerRule === "write-once" && !definition.writerVerbs?.includes(write.provenance.verb)) {
    return malformed(write.reference, "This write-once record may only be changed by its declared writer verbs.");
  }
  if (write.action === "put") {
    const links = write.links === undefined ? undefined : LinksSchema.safeParse(write.links);
    if (links?.success === false) return malformed(write.reference,`links: ${links.error.message}`);
    const parsed = definition.parser?.(write.content);
    if (parsed?.success === false) return malformed(write.reference, parsed.error);
  }
  return undefined;
}

function stale(context: ReferenceContext, write: Mutation): boolean {
  const record = context.state.records.get(recordKey(canonicalReference(context.state, write.reference)));
  if (write.expected === null) return record !== undefined;
  if (record === undefined) return true;
  if (record.version !== write.expected) return write.action === "remove" || record.reference.kind !== write.reference.kind
    || context.registry[write.reference.kind].merge === "single-writer"
    || mergeBase(context, { ...write, provenance: { verb: "check", lifecycleAction: "check" } }) === undefined;
  return write.action === "put" && ["create-only", "write-once"].includes(context.registry[write.reference.kind].writerRule);
}

function placement(context: ReferenceContext, write: Extract<Mutation, { action: "put" }>, prior?: MemoryRecord): ReadPlacement | undefined {
  if (write.placement?.kind !== "completed" || write.reference.kind !== "work-item/meta") return write.placement;
  if (prior?.placement?.kind === "completed" && "sequence" in prior.placement
    && prior.placement.quarter === write.placement.quarter) return prior.placement;
  const quarter = write.placement.quarter;
  const imported = [...context.state.records.values()].flatMap((record) =>
    record.reference.kind === "work-item/meta" && record.placement?.kind === "completed" && record.placement.quarter === quarter && "sequence" in record.placement
      ? [Number(record.placement.sequence)] : []);
  const next = Math.max(context.state.archiveSequences.get(quarter) ?? 0,...imported) + 1;
  context.state.archiveSequences.set(write.placement.quarter, next);
  return { ...write.placement, sequence: ArchiveSequenceSchema.parse(String(next).padStart(2, "0")) };
}

function land(context: ReferenceContext, write: WriteInput, batchId?: string): WriteResult {
  let reference = canonicalReference(context.state, write.reference, true);
  const key = recordKey(reference);
  const prior = context.state.records.get(key);
  if (write.action === "remove" && prior !== undefined) reference = prior.reference;
  let content = write.action === "put" ? persistedContent(context, reference, write.content) : undefined;
  let conflicts: ConflictRecord[] = [];
  if (write.action === "put" && prior && prior.version !== write.expected) {
    const merged = mergeContents(context, reference, mergeBase(context, write)!, prior, content!);
    content = merged.content;
    conflicts = merged.conflicts;
  }
  const allocated = advanceMemoryState(context.state);
  const label = { actor: context.environment.actor, time: new Date(context.environment.now()).toISOString() };
  const provenance = {
    ...write.provenance, reference,
    ...(reference.owner.type === "person" || reference.owner.uid === undefined ? {} : { ownerUid: reference.owner.uid }),
    ...(batchId === undefined ? {} : { batchId }),
  };
  if (write.action === "remove") context.state.records.delete(key);
  else {
    const formerSlugs = primary(write) && write.resolves?.length ? generationAliases(context.state, reference)
      : [...(prior?.formerSlugs ?? [])];
    if (primary(write) && prior && prior.reference.owner.name !== reference.owner.name) {
      formerSlugs.push(prior.reference.owner.name);
      for (const record of context.state.records.values()) {
        if (record.reference.owner.type !== "person" && reference.owner.type !== "person"
          && record.reference.owner.uid === reference.owner.uid) {
          record.reference = RecordReferenceSchema.parse({ ...record.reference, owner: reference.owner });
        }
      }
      context.state.identities.set(ownerNameKey(reference.owner), reference.owner);
      for (const [alias, owner] of context.state.identities) {
        if (owner.type !== "person" && reference.owner.type !== "person" && owner.uid === reference.owner.uid) context.state.identities.set(alias, reference.owner);
      }
    }
    const ownerPrimary = [...context.state.records.values()].find((record) => primary({ ...write, reference: record.reference })
      && record.reference.owner.type !== "person" && reference.owner.type !== "person" && record.reference.owner.uid === reference.owner.uid);
    const selectedPlacement = primary(write) ? placement(context, write, prior)
      : ["work-item", "review"].includes(familyOf(reference.kind)) ? ownerPrimary?.placement ?? prior?.placement : undefined;
    context.state.records.set(key, {
      reference, content: content!, version: allocated.version,
      formatVersion: context.registry[reference.kind].formatVersion, formerSlugs,
      label,
      ...(selectedPlacement === undefined ? {} : { placement: selectedPlacement }),
      ...(write.links === undefined ? prior?.links === undefined ? {} : { links: prior.links } : { links: write.links }),
      ...(reference.kind.endsWith("/conflict-record") ? { conflict: ConflictRecordSchema.parse({ ...JSON.parse(content!), record: canonicalReference(context.state, JSON.parse(content!).record) }) } : {}),
    });
  }
  for (const conflict of write.resolves ?? []) {
    const resolved = canonicalReference(context.state, conflict);
    if (context.state.records.delete(recordKey(resolved))) context.state.events.push({ reference: resolved, stateVersion: allocated.stateVersion,
      label,
      provenance: { ...write.provenance, reference: resolved,
        ...(resolved.owner.type === "person" || resolved.owner.uid === undefined ? {} : { ownerUid: resolved.owner.uid }),
        ...(batchId === undefined ? {} : { batchId }) } });
  }
  context.state.events.push({ reference, ...(write.action === "remove" ? {} : { version: allocated.version }), stateVersion: allocated.stateVersion, provenance, label });
  context.state.snapshots.set(allocated.stateVersion, structuredClone(context.state.records));
  const storedConflicts = storeConflicts(context, conflicts, write.provenance, batchId);
  return { reference, ...(write.action === "remove" ? {} : { version: allocated.version }), conflicts: storedConflicts };
}

/** Land one validated version-checked mutation in the shared local namespace.
 * @param context - State, registry, identity and clock.
 * @param write - Complete caller write with provenance.
 * @returns Exact new mutation basis or an actionable refusal.
 */
export function writeReference(context: ReferenceContext, write: WriteInput): StoreResult<WriteResult> {
  const prepared = { ...context, state: structuredClone(context.state) };
  const mutation = prepareGenerations(prepared, [write])[0]!;
  const refusal = preflight(prepared, mutation);
  if (refusal) return refused(refusal);
  if (stale(prepared, mutation)) return refused(versionConflict([write.reference]));
  const result = land(prepared, mutation);
  const identities = indexIdentities(prepared.state.records);
  if (identities.status === "refused") return identities;
  prepared.state.identities = identities.result;
  Object.assign(context.state, prepared.state);
  return ok(result);
}

/** Validate every input before publishing the batch's independently prepared namespace.
 * @param context - Shared local state and injected dependencies.
 * @param input - Mutations under one caller provenance.
 * @returns Every requested write with one shared batch ID, or no applied write.
 */
export function batchReference(context: ReferenceContext, input: BatchInput): StoreResult<BatchResult> {
  const namespace = namespaceAdmission(context.state);
  if (namespace) return refused(namespace);
  const writes = input.writes.map((write) => ({ ...write, provenance: input.provenance }));
  const prepared = { ...context, state: structuredClone(context.state) };
  const mutations = prepareGenerations(prepared, writes);
  const keys = new Set<string>();
  for (const write of mutations) {
    const key = recordKey(canonicalReference(prepared.state,write.reference));
    if (keys.has(key)) return refused(malformed(write.reference,"An atomic batch must name each canonical record at most once."));
    keys.add(key);
  }
  for (const write of mutations) { const refusal = preflight(prepared, write); if (refusal) return refused(refusal); }
  const conflicts = mutations.flatMap((write, index) => stale(prepared, write) ? [writes[index]!.reference] : []);
  if (conflicts.length > 0) return refused(versionConflict(conflicts));
  const batchId = randomUUID();
  const results = mutations.map((write) => land(prepared, write, batchId));
  const identities = indexIdentities(prepared.state.records);
  if (identities.status === "refused") return identities;
  prepared.state.identities = identities.result;
  Object.assign(context.state, prepared.state);
  return ok({ batchId, writes: results });
}
