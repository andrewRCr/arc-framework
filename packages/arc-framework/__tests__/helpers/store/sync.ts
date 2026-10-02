/** Real reconciliation against an independently writable in-memory remote namespace. */

import {
  FAMILY_IDS, FAMILY_REGISTRY, familyOf, type ConflictRecord, type FamilyId,
  type StoreRefusal, type StoreResult, type SyncResult, type StateVersion,
} from "../../../src/lib/store/index.js";
import type { ReferenceContext } from "./context.js";
import { advanceMemoryState, recordKey, type MemoryEvent, type MemoryRecord, type MemoryState } from "./model.js";
import { createMemoryState } from "./model.js";
import { randomUUID } from "node:crypto";
import { RecordVersionSchema } from "../../../src/lib/store/index.js";
import { mergeContents, storeConflicts } from "./merge.js";
import { namespaceAdmission, refused, ok } from "./refusals.js";
import { indexIdentities } from "./identities.js";

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

function wholeRecordConflict( base: MemoryRecord | undefined, current: MemoryRecord, incoming: MemoryRecord): ConflictRecord {
  return { record: current.reference, location: { kind: "record" }, base: base?.content ?? "",
    current: { content: current.content, label: current.label },
    incoming: { content: incoming.content, label: incoming.label } };
}

function adopt(context: ReferenceContext, key: string, record: MemoryRecord | undefined): void {
  const prior = context.state.records.get(key);
  if (equal(prior, record)) return;
  const allocation = advanceMemoryState(context.state);
  if (record === undefined) context.state.records.delete(key);
  else context.state.records.set(key, structuredClone(record));
  const reference = record?.reference ?? prior!.reference;
  context.state.events.push({ reference, ...(record ? { version: record.version } : {}), stateVersion: allocation.stateVersion,
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

function reconciledRecords(context: ReferenceContext, publication: ReferencePublication, families: FamilyId[]): { records: Map<string, MemoryRecord>; remoteMoved: boolean } {
  const remote = publication.remote!;
  const selected = new Set(families);
  const records = structuredClone(remote.state.records);
  const keys = new Set([...context.state.records.keys(), ...remote.state.records.keys(), ...publication.base.keys()]);
  let remoteMoved = false;
  for (const key of keys) {
    const base = publication.base.get(key), local = context.state.records.get(key), current = remote.state.records.get(key);
    const reference = local?.reference ?? current?.reference ?? base!.reference;
    if (!selected.has(familyOf(reference.kind))) continue;
    const changedLocal = !equal(base, local), changedRemote = !equal(base, current);
    remoteMoved ||= changedRemote;
    let merged = local;
    if (!changedLocal) merged = current;
    else if (changedRemote && !equal(local, current) && local && current) {
      const mechanism = context.registry[reference.kind].merge;
      const result = mechanism === "single-writer" ? { content: current.content,
        conflicts: [wholeRecordConflict(base, current, local)] }
        : mergeContents({ ...context, environment: { ...context.environment, actor: local.label.actor, now: () => Date.parse(local.label.time) } }, reference,
          base ?? { ...current, content: "" }, current, local.content);
      merged = { ...current, content: result.content };
      if (merged.content !== current.content) merged.version = RecordVersionSchema.parse(`record:sync:${randomUUID()}`);
      adopt(context, key, merged);
      storeConflicts(context, result.conflicts, { verb: "sync", lifecycleAction: "reconcile" });
    } else if (changedRemote && !local && current) merged = current;
    if (merged === undefined) records.delete(key); else records.set(key, structuredClone(merged));
    adopt(context, key, merged);
  }
  // Conflicts created by reconciliation are part of the same publish, rather than side-channel state.
  for (const [key, record] of context.state.records) if (record.conflict && selected.has(familyOf(record.reference.kind))) records.set(key, structuredClone(record));
  return { records, remoteMoved };
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
    return finishPublish(context, publication, states, families, prepared.result);
  }
  return ok({ states, publishes: [{ status: "failed", families, failure: {
    code: "retries-exhausted", class: "recoverable", retryCount: 3, waitedMs: context.environment.now() - started,
    condition: "The remote moved before every compare-and-swap publish attempt.",
    remedy: { text: "Retry at the next firing point or run arc sync after contention subsides.", argv: ["arc", "sync"] },
  } }] });
}

interface Reconciliation extends ReturnType<typeof reconciledRecords> { state: MemoryState; identities: MemoryState["identities"] }
function prepareReconciliation(context: ReferenceContext, publication: ReferencePublication, families: FamilyId[]): StoreResult<Reconciliation> {
  const prepared = { ...context, state: structuredClone(context.state) };
  const result = reconciledRecords(prepared,publication,families);
  const localIndex = indexIdentities(prepared.state.records);
  if (localIndex.status === "refused") return localIndex;
  const remoteIndex = indexIdentities(result.records);
  if (remoteIndex.status === "refused") return remoteIndex;
  prepared.state.identities = localIndex.result;
  return ok({...result,state:prepared.state,identities:remoteIndex.result});
}

function finishPublish(context: ReferenceContext, publication: ReferencePublication, states: SyncResult["states"], families: FamilyId[], result: Reconciliation): StoreResult<SyncResult> {
  const remote = publication.remote!;
  const before = structuredClone(remote.state.records);
  const changedKeys = [...new Set([...before.keys(), ...result.records.keys()])].filter((key) => !equal(before.get(key), result.records.get(key)));
  const changed = changedKeys.length > 0;
  remote.state.records = result.records;
  remote.state.identities = result.identities;
  if (changed) {
    const remoteAllocation = advanceMemoryState(remote.state);
    for (const key of changedKeys) remote.state.events.push(publicationEvent(context, key, before.get(key), result.records.get(key), remoteAllocation.stateVersion));
    remote.state.snapshots.set(remoteAllocation.stateVersion, structuredClone(result.records));
  }
  for (const family of families) {
    for (const [key, record] of publication.base) if (familyOf(record.reference.kind) === family) publication.base.delete(key);
    for (const [key, record] of result.records) if (familyOf(record.reference.kind) === family) publication.base.set(key, structuredClone(record));
  }
  return ok({ states, publishes: [{ status: result.remoteMoved ? "reconciled" : changed ? "pushed" : "noop", families }] });
}

function publicationEvent(context: ReferenceContext, key: string, before: MemoryRecord | undefined, after: MemoryRecord | undefined, stateVersion: StateVersion): MemoryEvent {
  const source = [...context.state.events].reverse().find((event) => recordKey(event.reference) === key && event.version === after?.version
    && (after === undefined || JSON.stringify(event.reference) === JSON.stringify(after.reference)));
  const reference = after?.reference ?? source?.reference ?? before!.reference;
  return { reference, ...(after === undefined ? {} : { version: after.version }), stateVersion,
    provenance: { ...(source === undefined ? { verb: "sync", lifecycleAction: "reconcile" } : structuredClone(source.provenance)), reference,
      ...(reference.owner.type === "person" || reference.owner.uid === undefined ? {} : { ownerUid: reference.owner.uid }) } };
}
