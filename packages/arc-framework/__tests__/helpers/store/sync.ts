/** Real reconciliation against an independently writable in-memory remote namespace. */

import {
  FAMILY_IDS, FAMILY_REGISTRY, familyOf, sameOwner, sameReference, type WholeRecordConflict, type ConflictRecordValue, type FamilyId, type SideLabel, type RecordReference,
  type StoreRefusal, type StoreResult, type SyncResult,
} from "../../../src/lib/store/index.js";
import { ArchiveSequenceSchema } from "../../../src/lib/kernel/index.js";
import type { ReferenceContext } from "./context.js";
import { advanceMemoryState, observeArchivePlacement, recordKey, type MemoryRecord, type MemoryState } from "./model.js";
import { createMemoryState } from "./model.js";
import { randomUUID } from "node:crypto";
import { RecordVersionSchema } from "../../../src/lib/store/index.js";
import { mergeContents, storeConflicts } from "./merge.js";
import { namespaceAdmission, refused, ok } from "./refusals.js";
import { indexIdentities } from "./identities.js";
import { publicRecord } from "./read.js";
import { checkpointMemoryState, transferMemoryHistory } from "./history-transfer.js";

/** Remote transport condition is injected separately from its durable records. */
export interface MemoryRemote { state: MemoryState; condition: "available" | "down" | "contended" | "refusing"; message: string; beforePublish?: () => void }
/** One client's common remote ancestor; independent clients keep independent bases. */
export interface ReferencePublication { remote?: MemoryRemote; base: Map<string, MemoryRecord> }

/** Create an independently writable remote without a network, process or Git backend.
 * @returns Empty remote records with an available transport.
 */
export function createMemoryRemote(): MemoryRemote { return { state: createMemoryState(), condition: "available", message: "Remote policy refuses this publish." }; }

function equal(left?: MemoryRecord, right?: MemoryRecord): boolean {
  return left === undefined ? right === undefined : right !== undefined
    && left.version === right.version && left.content === right.content && left.formatVersion === right.formatVersion && JSON.stringify(left.placement) === JSON.stringify(right.placement)
    && JSON.stringify(left.links) === JSON.stringify(right.links) && JSON.stringify(left.reference) === JSON.stringify(right.reference);
}

function recordValue(context: ReferenceContext, record: MemoryRecord | undefined, records: ReadonlyMap<string, MemoryRecord>): ConflictRecordValue | null {
  if (record === undefined) return null;
  const { reference, content, version, formatVersion, placement, links } = publicRecord(context, record, records);
  return { reference, content, version, formatVersion,
    ...(placement === undefined ? {} : { placement }), ...(links === undefined ? {} : { links }) };
}

function sideLabel(state: MemoryState, key: string, record: MemoryRecord | undefined): SideLabel {
  if (record !== undefined) return record.label;
  const removal = [...state.events].reverse().find((event) => recordKey(event.reference) === key && event.version === undefined);
  if (removal === undefined) throw new Error("Absent competing record lacks its removal event");
  return removal.label;
}

function wholeRecordConflict(context: ReferenceContext, remote: MemoryRemote, key: string, reference: RecordReference,
  baseRecords: ReadonlyMap<string, MemoryRecord>, incomingRecords: ReadonlyMap<string, MemoryRecord>): WholeRecordConflict {
  const base = baseRecords.get(key), current = remote.state.records.get(key), incoming = incomingRecords.get(key);
  return { record: reference, location: { kind: "record" }, base: recordValue(context, base, baseRecords),
    current: { value: recordValue(context, current, remote.state.records), label: sideLabel(remote.state, key, current) },
    incoming: { value: recordValue(context, incoming, incomingRecords), label: sideLabel(context.state, key, incoming) } };
}

function adopt(context: ReferenceContext, key: string, record: MemoryRecord | undefined, source: MemoryState): void {
  const prior = context.state.records.get(key);
  if (equal(prior, record)) return;
  const allocation = advanceMemoryState(context.state);
  if (record === undefined) context.state.records.delete(key);
  else {
    context.state.records.set(key, structuredClone(record));
    observeArchivePlacement(context.state, record);
  }
  const reference = record?.reference ?? prior!.reference;
  const accepted = source.events.some((event) => recordKey(event.reference) === key && event.version === record?.version);
  if (!accepted) context.state.events.push({ id: randomUUID(), reference, ...(record ? { version: record.version } : {}), stateVersion: allocation.stateVersion,
    label: sideLabel(source, key, record),
    provenance: { verb: "sync", lifecycleAction: "reconcile", reference,
      ...(reference.owner.type === "person" || reference.owner.uid === undefined ? {} : { ownerUid: reference.owner.uid }) } });
  context.state.snapshots.set(allocation.stateVersion, structuredClone(context.state.records));
}

function remoteFailure( remote: MemoryRemote): StoreRefusal | undefined {
  if (remote.condition === "down") return {
    code: "unreachable", class: "recoverable", cause: "network", condition: "The configured memory remote does not answer.",
    remedy: { text: "Restore the remote connection, then retry sync.", argv: ["arc", "sync"] },
  };
  if (remote.condition === "refusing") return {
    code: "refused", class: "terminal", message: remote.message, condition: remote.message,
    remedy: { text: `Change the remote policy named by the server: ${remote.message}` },
  };
  return undefined;
}

function reconciledRecords(context: ReferenceContext, publication: ReferencePublication, families: FamilyId[]): { records: Map<string, MemoryRecord>; remoteMoved: boolean; archiveSequences: Map<string, number> } {
  const remote = publication.remote!;
  const selected = new Set(families);
  const records = structuredClone(remote.state.records);
  const incomingRecords: ReadonlyMap<string, MemoryRecord> = structuredClone(context.state.records);
  const keys = new Set([...incomingRecords.keys(), ...remote.state.records.keys(), ...publication.base.keys()]);
  const generatedConflicts = new Set<string>();
  let remoteMoved = false;
  for (const key of keys) {
    const base = publication.base.get(key), local = incomingRecords.get(key), current = remote.state.records.get(key);
    const reference = local && current && local.reference.kind !== current.reference.kind
      && sameReference(local.reference, current.reference) ? current.reference : local?.reference ?? current?.reference ?? base!.reference;
    if (!selected.has(familyOf(reference.kind))) continue;
    const changedLocal = !equal(base, local), changedRemote = !equal(base, current);
    remoteMoved ||= changedRemote;
    let merged = local;
    if (!changedLocal) merged = current;
    else if (changedRemote && !equal(local, current) && context.registry[reference.kind].merge === "single-writer") {
      const conflict = wholeRecordConflict(context, remote, key, reference, publication.base, incomingRecords);
      merged = current;
      adopt(context, key, merged, remote.state);
      for (const created of storeConflicts(context, [conflict], { verb: "sync", lifecycleAction: "reconcile" })) generatedConflicts.add(recordKey(created));
    } else if (changedRemote && !equal(local, current) && local && current) {
      const result = mergeContents({ ...context, environment: { ...context.environment, actor: local.label.actor, now: () => Date.parse(local.label.time) } }, reference,
          base ?? { ...current, content: "" }, current, local.content);
      merged = { ...current, content: result.content };
      if (merged.content !== current.content) merged.version = RecordVersionSchema.parse(`record:sync:${randomUUID()}`);
      adopt(context, key, merged, remote.state);
      for (const created of storeConflicts(context, result.conflicts, { verb: "sync", lifecycleAction: "reconcile" })) generatedConflicts.add(recordKey(created));
    } else if (changedRemote && !local && current) merged = current;
    if (merged === undefined) records.delete(key); else records.set(key, structuredClone(merged));
  }
  // Conflicts created by reconciliation are part of the same publish, rather than side-channel state.
  for (const key of generatedConflicts) records.set(key, structuredClone(context.state.records.get(key)!));
  const archiveSequences = reconcileArchivePositions(records, remote.state);
  for (const [quarter, highWater] of archiveSequences) context.state.archiveSequences.set(quarter,
    Math.max(context.state.archiveSequences.get(quarter) ?? 0, highWater));
  for (const key of new Set([...context.state.records.keys(), ...records.keys()])) {
    const record = records.get(key);
    const reference = record?.reference ?? context.state.records.get(key)!.reference;
    if (selected.has(familyOf(reference.kind))) adopt(context, key, record, remote.state);
  }
  return { records, remoteMoved, archiveSequences };
}

function reconcileArchivePositions(records: Map<string, MemoryRecord>, remote: MemoryState): Map<string, number> {
  const highWater = new Map(remote.archiveSequences);
  for (const record of remote.records.values()) {
    if (record.reference.kind === "work-item/meta" && record.placement?.kind === "completed" && "sequence" in record.placement)
      highWater.set(record.placement.quarter, Math.max(highWater.get(record.placement.quarter) ?? 0, Number(record.placement.sequence)));
  }
  const completions = [...records.values()].filter((record) => record.reference.kind === "work-item/meta"
    && record.placement?.kind === "completed" && "sequence" in record.placement);
  // Local allocations encode completion order; the key supplies a deterministic tie breaker.
  completions.sort((left, right) => {
    const position = (record: MemoryRecord) => record.placement?.kind === "completed" && "sequence" in record.placement ? Number(record.placement.sequence) : 0;
    return position(left) - position(right) || recordKey(left.reference).localeCompare(recordKey(right.reference));
  });
  for (const record of completions) {
    if (record.placement?.kind !== "completed") continue;
    const quarter = record.placement.quarter;
    const published = remote.records.get(recordKey(record.reference));
    const retained = published?.reference.kind === "work-item/meta" && published.placement?.kind === "completed"
      && published.placement.quarter === quarter && "sequence" in published.placement ? published.placement.sequence : undefined;
    const next = retained === undefined ? (highWater.get(quarter) ?? 0) + 1 : Number(retained);
    highWater.set(quarter, Math.max(highWater.get(quarter) ?? 0, next));
    const placement = { ...record.placement, sequence: ArchiveSequenceSchema.parse(String(next).padStart(2, "0")) };
    if (JSON.stringify(record.placement) === JSON.stringify(placement)) continue;
    record.placement = placement;
    record.version = RecordVersionSchema.parse(`record:sync:${randomUUID()}`);
    for (const companion of records.values()) {
      if (companion === record || !sameOwner(companion.reference.owner, record.reference.owner)
        || !["work-item", "review"].includes(familyOf(companion.reference.kind)) || companion.reference.kind.endsWith("/conflict-record")) continue;
      companion.placement = structuredClone(placement);
      companion.version = RecordVersionSchema.parse(`record:sync:${randomUUID()}`);
    }
  }
  return highWater;
}

/** Fetch, reconcile by registry mechanism, and publish the eligible family's complete saved state.
 * @param context - Independent local namespace and injected time boundary.
 * @param publication - Configured remote and this client's last common state.
 * @returns Independent configuration states and one family-scoped publish result.
 */
export function syncReference(context: ReferenceContext, publication: ReferencePublication): StoreResult<SyncResult> {
  const admission = namespaceAdmission(context.state);
  if (admission) return refused(admission);
  const states: SyncResult["states"] = [];
  const identityFamilies = FAMILY_IDS.filter((family) => FAMILY_REGISTRY[family].scope === "identity");
  if (context.environment.identity === undefined) states.push({ status: "no-identity", families: identityFamilies,
    remedy: { text: "Set arc.identity, then retry the identity-scope publishes.", argv: ["git", "config", "arc.identity", "test-user"] } });
  if (publication.remote === undefined) { states.push({ status: "no-remote" }); return ok({ states, publishes: [] }); }
  const families = FAMILY_IDS.filter((family) => context.environment.identity !== undefined || FAMILY_REGISTRY[family].scope === "project");
  const failure = remoteFailure(publication.remote);
  if (failure) return ok({ states, publishes: [{ status: "failed", families, failure: failure as Extract<SyncResult["publishes"][number], { status: "failed" }>["failure"] }] });
  const started = context.environment.now();
  for (let retry = 0; retry < 3; retry++) {
    const observedRemoteVersion = publication.remote.state.counter;
    const prepared = prepareReconciliation(context,publication,families);
    if (prepared.status === "refused") return prepared;
    publication.remote.beforePublish?.();
    if (publication.remote.state.counter !== observedRemoteVersion) { context.environment.wait(10); continue; }
    Object.assign(context.state, prepared.result.state);
    return finishPublish(publication, states, families, prepared.result);
  }
  return ok({ states, publishes: [{ status: "failed", families, failure: {
    code: "retries-exhausted", class: "recoverable", retryCount: 3, waitedMs: context.environment.now() - started,
    condition: "The remote moved before every compare-and-swap publish attempt.",
    remedy: { text: "Retry at the next firing point or run arc sync after contention subsides.", argv: ["arc", "sync"] },
  } }] });
}

interface Reconciliation extends ReturnType<typeof reconciledRecords> {
  state: MemoryState; remoteState: MemoryState; imported: number; exported: number; changed: boolean;
}
function prepareReconciliation(context: ReferenceContext, publication: ReferencePublication, families: FamilyId[]): StoreResult<Reconciliation> {
  const prepared = { ...context, state: structuredClone(context.state) };
  const originalEventCount = prepared.state.events.length;
  const result = reconciledRecords(prepared,publication,families);
  const localIndex = indexIdentities(prepared.state.records);
  if (localIndex.status === "refused") return localIndex;
  const remoteIndex = indexIdentities(result.records);
  if (remoteIndex.status === "refused") return remoteIndex;
  prepared.state.identities = localIndex.result;
  const remoteState = structuredClone(publication.remote!.state);
  const changed = [...new Set([...remoteState.records.keys(), ...result.records.keys()])]
    .some((key) => !equal(remoteState.records.get(key), result.records.get(key)));
  const generated = structuredClone(prepared.state);
  generated.events = prepared.state.events.splice(originalEventCount);
  const imported = transferMemoryHistory(remoteState, prepared.state, families);
  // Newly derived versions follow the accepted remote history they reconcile.
  transferMemoryHistory(generated, prepared.state, families);
  const exported = transferMemoryHistory(prepared.state, remoteState, families);
  remoteState.records = result.records;
  remoteState.identities = remoteIndex.result;
  remoteState.archiveSequences = result.archiveSequences;
  for (const record of result.records.values()) observeArchivePlacement(remoteState, record);
  if (imported > 0 || generated.events.length > 0) checkpointMemoryState(prepared.state);
  if (exported > 0 || changed) checkpointMemoryState(remoteState);
  return ok({...result,state:prepared.state,remoteState,imported,exported,changed});
}

function finishPublish(publication: ReferencePublication, states: SyncResult["states"], families: FamilyId[], result: Reconciliation): StoreResult<SyncResult> {
  const remote = publication.remote!;
  Object.assign(remote.state, result.remoteState);
  for (const family of families) {
    for (const [key, record] of publication.base) if (familyOf(record.reference.kind) === family) publication.base.delete(key);
    for (const [key, record] of result.records) if (familyOf(record.reference.kind) === family) publication.base.set(key, structuredClone(record));
  }
  return ok({ states, publishes: [{ status: result.remoteMoved || result.imported > 0 ? "reconciled"
    : result.changed || result.exported > 0 ? "pushed" : "noop", families }] });
}
