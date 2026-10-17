/** Resolve a mutation batch's owner generations from one captured live namespace. */

import { randomUUID } from "node:crypto";
import { OwnerIdentitySchema, RecordReferenceSchema, type OwnerIdentity, type RecordReference } from "../identity.js";
import type { Mutation } from "../write.js";
import type { StoreResult } from "../refusal.js";
import { expandStoredPath, type StoredRecordHome } from "../stored-path.js";
import { readBatchObjects, readRefTips } from "./batch-read.js";
import { matchesFamilyRef, refOwner } from "./codec.js";
import { parseRefMetadata, metadataFailure } from "./metadata.js";
import type { RefBackendContext } from "./context.js";

/** Canonical mutation and its concrete ref/tree address. */
export interface ResolvedMutation { mutation: Mutation; home: StoredRecordHome }
/** One resolved owner generation per name, with its captured mutation basis. */
export interface ResolvedBatch { writes: ResolvedMutation[]; tips: Map<string, string> }

/** Resolve all owner names together so records created in one batch share a generation. */
export async function resolveRefWrites(context: RefBackendContext, writes: readonly Mutation[]): Promise<StoreResult<ResolvedBatch>> {
  const personal = writes.find((write) => write.reference.owner.type === "person");
  if (personal && await context.identity() === null) return { status: "refused", refusal: {
    code: "not-found", class: "recoverable", reference: personal.reference,
    condition: "No arc.identity is configured for person-owned state",
    remedy: { text: "Configure arc.identity, then retry the write." },
  } };
  const tips = await readRefTips(context, { includeHistory: true });
  const observed = await readLiveOwners(context, tips);
  if (observed.status === "refused") return observed;
  const owners = observed.result;
  const fresh = new Map<string, OwnerIdentity>();
  const resolved: ResolvedMutation[] = [];
  for (const mutation of writes) {
    const found = resolveOwner(mutation.reference, owners, fresh);
    if (found.status === "refused") return found;
    const owner = found.result;
    const reference = RecordReferenceSchema.parse({ ...mutation.reference, owner });
    resolved.push({ mutation: { ...mutation, reference }, home: expandStoredPath(reference, { registry: context.registry }) });
  }
  for (const write of resolved) {
    if (write.mutation.resolves === undefined) continue;
    const resolves: RecordReference[] = [];
    for (const reference of write.mutation.resolves) {
      const found = resolveOwner(reference, owners, fresh);
      if (found.status === "refused") return found;
      resolves.push(RecordReferenceSchema.parse({ ...reference, owner: found.result }));
    }
    write.mutation = { ...write.mutation, resolves };
  }
  return { status: "ok", result: { writes: resolved, tips } };
}

async function readLiveOwners(context: RefBackendContext, tips: ReadonlyMap<string, string>): Promise<StoreResult<OwnerIdentity[]>> {
  const refs = [...tips].filter(([ref]) => matchesFamilyRef(ref, "work-item") || matchesFamilyRef(ref, "cohort"));
  const query = (ref: string, tip: string) => `${tip}:metadata-${ref.split("/").at(-1)}.json`;
  const objects = await readBatchObjects(context, refs.map(([ref, tip]) => query(ref, tip)));
  const owners: OwnerIdentity[] = [];
  for (const [ref, tip] of refs) {
    const metadata = parseRefMetadata(objects.get(query(ref, tip)), ref);
    if (!metadata) return { status: "refused", refusal: { code: "namespace-corrupt", class: "terminal",
      namespace: ref, ...metadataFailure(ref) } };
    owners.push(refOwner(ref, matchesFamilyRef(ref, "work-item") ? "work-item" : "cohort", metadata));
  }
  return { status: "ok", result: owners };
}

function resolveOwner(reference: RecordReference, owners: readonly OwnerIdentity[], fresh: Map<string, OwnerIdentity>): StoreResult<OwnerIdentity> {
  const requested = reference.owner;
  if (requested.type === "person" || requested.type === "project") return { status: "ok", result: requested };
  const candidates = owners.filter((owner) => owner.type !== "person" && owner.type === requested.type
    && (requested.uid ? owner.uid === requested.uid : owner.name === requested.name));
  if (requested.uid && candidates.length === 0) return { status: "refused", refusal: {
    code: "not-found", class: "recoverable", reference,
    condition: "The named owner has no live ref",
    remedy: { text: "Resolve the owner's current lifecycle state, then restore it or create a new generation by name before retrying." },
  } };
  if (candidates.length > 1) return { status: "refused", refusal: {
    code: "ambiguous-match", class: "recoverable",
    candidates: candidates.map((owner) => RecordReferenceSchema.parse({ ...reference, owner })),
    condition: "More than one live owner holds this name", remedy: { text: "Name the intended owner by UID and rename one, then retry." },
  } };
  const key = `${requested.type}:${requested.name}`;
  const owner = candidates[0] ?? fresh.get(key) ?? OwnerIdentitySchema.parse({ ...requested, uid: randomUUID() });
  if (candidates.length === 0) fresh.set(key, owner);
  return { status: "ok", result: owner };
}
