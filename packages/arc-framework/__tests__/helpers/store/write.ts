/** Atomic local mutations and backend-enriched provenance for reference contract tests. */

import { randomUUID } from "node:crypto";
import {
  ConflictRecordSchema, RecordReferenceSchema, familyOf, type BatchInput, type BatchResult, type ConflictRecord, type Mutation, type ReadPlacement,
  type StoreRefusal, type StoreResult, type WriteInput, type WriteResult,
} from "../../../src/lib/store/index.js";
import { ArchiveSequenceSchema } from "../../../src/lib/kernel/index.js";
import type { ReferenceContext } from "./context.js";
import {
  advanceMemoryState, canonicalReference, ownerNameKey, recordKey, type MemoryRecord,
} from "./model.js";
import { malformed, ok, namespaceAdmission, recordAdmission, refused, surfaceLock, versionConflict } from "./refusals.js";
import { mergeBase, mergeContents, persistedContent, storeConflicts } from "./merge.js";
import { indexIdentities } from "./identities.js";

function primary(write: Mutation): boolean {
  return write.reference.kind === "work-item/meta" || write.reference.kind === "work-item/record";
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
  if (write.action === "remove" && write.reference.kind.endsWith("/conflict-record")) {
    return { ...malformed(write.reference, "A conflict record closes only through a resolving write to its subject."),
      remedy: { text: "Write the conflict's subject against its current version, naming this conflict in resolves." } };
  }
  if (definition.writerRule === "write-once" && !definition.writerVerbs?.includes(write.provenance.verb)) {
    return malformed(write.reference, "This write-once record may only be changed by its declared writer verbs.");
  }
  if (write.action === "put") {
    const parsed = definition.parser?.(write.content);
    if (parsed?.success === false) return malformed(write.reference, parsed.error);
  }
  return undefined;
}

function stale(context: ReferenceContext, write: Mutation): boolean {
  const record = context.state.records.get(recordKey(canonicalReference(context.state, write.reference)));
  if (write.expected === null) return record !== undefined;
  if (record === undefined) return true;
  if (record.version !== write.expected) return write.action === "remove" || context.registry[write.reference.kind].merge === "single-writer"
    || mergeBase(context, { ...write, provenance: { verb: "check", lifecycleAction: "check" } }) === undefined;
  return write.action === "put" && ["create-only", "write-once"].includes(context.registry[write.reference.kind].writerRule);
}

function placement(context: ReferenceContext, write: Extract<Mutation, { action: "put" }>, prior?: MemoryRecord): ReadPlacement | undefined {
  if (write.placement?.kind !== "completed" || write.reference.kind !== "work-item/meta") return write.placement;
  if (prior?.placement?.kind === "completed" && prior.placement.quarter === write.placement.quarter) return prior.placement;
  const next = (context.state.archiveSequences.get(write.placement.quarter) ?? 0) + 1;
  context.state.archiveSequences.set(write.placement.quarter, next);
  return { ...write.placement, sequence: ArchiveSequenceSchema.parse(String(next).padStart(2, "0")) };
}

function land(context: ReferenceContext, write: WriteInput, batchId?: string): WriteResult {
  if (primary(write) && write.expected === null && write.reference.owner.type !== "person" && write.reference.owner.uid === undefined) {
    const priorIdentity = canonicalReference(context.state, write.reference).owner;
    const hasPrimary = [...context.state.records.values()].some((record) => primary({ ...write, reference: record.reference })
      && record.reference.owner.type !== "person" && priorIdentity.type !== "person" && record.reference.owner.uid === priorIdentity.uid);
    if (!hasPrimary) context.state.identities.delete(ownerNameKey(write.reference.owner));
  }
  const reference = canonicalReference(context.state, write.reference, true);
  const key = recordKey(reference);
  const prior = context.state.records.get(key);
  let content = write.action === "put" ? persistedContent(context, reference, write.content) : undefined;
  let conflicts: ConflictRecord[] = [];
  if (write.action === "put" && prior && prior.version !== write.expected) {
    const merged = mergeContents(context, reference, mergeBase(context, write)!, prior, content!);
    content = merged.content;
    conflicts = merged.conflicts;
  }
  const allocated = advanceMemoryState(context.state);
  const provenance = {
    ...write.provenance, reference,
    ...(reference.owner.type === "person" || reference.owner.uid === undefined ? {} : { ownerUid: reference.owner.uid }),
    ...(batchId === undefined ? {} : { batchId }),
  };
  if (write.action === "remove") context.state.records.delete(key);
  else {
    const formerSlugs = [...(prior?.formerSlugs ?? [])];
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
      label: { actor: context.environment.actor, time: new Date(context.environment.now()).toISOString() },
      ...(selectedPlacement === undefined ? {} : { placement: selectedPlacement }),
      ...(write.links === undefined ? prior?.links === undefined ? {} : { links: prior.links } : { links: write.links }),
      ...(reference.kind.endsWith("/conflict-record") ? { conflict: ConflictRecordSchema.parse({ ...JSON.parse(content!), record: canonicalReference(context.state, JSON.parse(content!).record) }) } : {}),
    });
  }
  for (const conflict of write.resolves ?? []) {
    const resolved = canonicalReference(context.state, conflict);
    if (context.state.records.delete(recordKey(resolved))) context.state.events.push({ reference: resolved, stateVersion: allocated.stateVersion,
      provenance: { ...write.provenance, reference: resolved,
        ...(resolved.owner.type === "person" || resolved.owner.uid === undefined ? {} : { ownerUid: resolved.owner.uid }),
        ...(batchId === undefined ? {} : { batchId }) } });
  }
  context.state.events.push({ reference, ...(write.action === "remove" ? {} : { version: allocated.version }), stateVersion: allocated.stateVersion, provenance });
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
  const refusal = preflight(context, write);
  if (refusal) return refused(refusal);
  if (stale(context, write)) return refused(versionConflict([write.reference]));
  const prepared = { ...context, state: structuredClone(context.state) };
  const result = land(prepared, write);
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
  for (const write of writes) { const refusal = preflight(context, write); if (refusal) return refused(refusal); }
  const conflicts = writes.filter((write) => stale(context, write)).map((write) => write.reference);
  if (conflicts.length > 0) return refused(versionConflict(conflicts));
  const prepared = { ...context, state: structuredClone(context.state) };
  const batchId = randomUUID();
  const results = writes.map((write) => land(prepared, write, batchId));
  const identities = indexIdentities(prepared.state.records);
  if (identities.status === "refused") return identities;
  prepared.state.identities = identities.result;
  Object.assign(context.state, prepared.state);
  return ok({ batchId, writes: results });
}
