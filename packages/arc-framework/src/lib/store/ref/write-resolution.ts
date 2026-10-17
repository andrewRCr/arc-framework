/** Resolve a mutation batch's owner generations from one captured live namespace. */

import { randomUUID } from "node:crypto";
import { OwnerIdentitySchema, RecordReferenceSchema, type OwnerIdentity, type RecordReference } from "../identity.js";
import type { Mutation } from "../write.js";
import type { StoreResult } from "../refusal.js";
import { expandStoredPath, type StoredRecordHome } from "../stored-path.js";
import { sameOwner } from "../identity.js";
import type { ArchivedFolder } from "./archive-read.js";
import { resolveArchivedReferences } from "./archive-resolution.js";
import { rootFamily } from "./path-decode.js";
import { bindProjectMutations } from "./project-identity.js";
import { readRefTips } from "./batch-read.js";
import type { RefBackendContext } from "./context.js";
import { checkLiveNamespace } from "./namespace-admission.js";
import { readLineageOwners, lineageOwnerCandidates } from "./lineage-resolution.js";
import { readLiveRefOwners } from "./live-owners.js";

/** Canonical mutation and its concrete ref/tree address. */
export interface ResolvedMutation { mutation: Mutation; home: StoredRecordHome }
/** One resolved owner generation per name, with its captured mutation basis. */
export interface ResolvedBatch { writes: ResolvedMutation[]; tips: Map<string, string>; archived?: readonly ArchivedFolder[] }
/** A ref/tree coordinate that the batch may change directly or through resolution. */
export interface RefWriteTarget { reference: RecordReference; home: StoredRecordHome }

/** Include conflict-resolution refs in the same capture, locking, and publication set. */
export function refWriteTargets(context: Pick<RefBackendContext, "registry">, batch: ResolvedBatch): RefWriteTarget[] {
  return batch.writes.flatMap(({ mutation, home }) => [{ reference: mutation.reference, home },
    ...(mutation.resolves ?? []).map((reference) => ({ reference, home: mutationHome(context, reference, batch.archived ?? []) }))]);
}

/** Resolve all owner names together so records created in one batch share a generation. */
export async function resolveRefWrites(context: RefBackendContext, writes: readonly Mutation[]): Promise<StoreResult<ResolvedBatch>> {
  const personal = writes.find((write) => write.reference.owner.type === "person");
  if (personal && await context.identity() === null) return { status: "refused", refusal: {
    code: "not-found", class: "recoverable", reference: personal.reference,
    condition: "No arc.identity is configured for person-owned state",
    remedy: { text: "Configure arc.identity, then retry the write." },
  } };
  const tips = await readRefTips(context, { includeHistory: true });
  const project = await bindProjectMutations(context, writes, tips);
  if (project.status === "refused") return project;
  writes = project.result;
  const observed = await readLiveRefOwners(context, tips);
  if (observed.status === "refused") return observed;
  const owners = observed.result;
  const archived = await resolveArchivedReferences(context, writes.flatMap((write) => [write.reference, ...write.resolves ?? []]), tips);
  if (archived.status === "refused") return archived;
  const endedOwners = [...new Map(archived.result.map(({ owner }) => ["uid" in owner ? owner.uid : owner.name, owner])).values()];
  const needsLineage = writes.some((mutation) => [mutation.reference, ...mutation.resolves ?? []]
    .some((reference) => context.registry[reference.kind].family === "lineage"));
  const lineage = needsLineage ? await readLineageOwners(context, tips) : { status: "ok" as const, result: [] };
  if (lineage.status === "refused") return lineage;
  const fresh = new Map<string, OwnerIdentity>();
  const resolve = (reference: RecordReference) => resolveOwner(reference,
    context.registry[reference.kind].family === "lineage"
      ? lineageOwnerCandidates(reference, owners.map(({ owner }) => owner), lineage.result)
      : [...owners.map(({ owner }) => owner), ...endedOwners], fresh);
  const resolved: ResolvedMutation[] = [];
  for (const mutation of writes) {
    const found = resolve(mutation.reference);
    if (found.status === "refused") return found;
    const owner = found.result;
    const reference = RecordReferenceSchema.parse({ ...mutation.reference, owner });
    resolved.push({ mutation: { ...mutation, reference }, home: mutationHome(context, reference, archived.result) });
  }
  const canonical = resolveConflictReferences(resolved, resolve);
  if (canonical.status === "refused") return canonical;
  const clash = checkLiveNamespace(resolved, owners);
  if (clash) return { status: "refused", refusal: clash };
  return { status: "ok", result: { writes: resolved, tips, archived: archived.result } };
}

function resolveOwner(reference: RecordReference, owners: readonly OwnerIdentity[], fresh: Map<string, OwnerIdentity>): StoreResult<OwnerIdentity> {
  const requested = reference.owner;
  if (requested.type === "person" || requested.type === "project") return { status: "ok", result: requested };
  const candidates = owners.filter((owner) => owner.type !== "person" && owner.type === requested.type
    && (requested.uid ? owner.uid === requested.uid : owner.name === requested.name));
  if (requested.uid && candidates.length === 0 && reference.kind.startsWith("lineage/")) return { status: "ok", result: requested };
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

function resolveConflictReferences(resolved: ResolvedMutation[], resolve: (reference: RecordReference) => StoreResult<OwnerIdentity>): StoreResult<ResolvedMutation[]> {
  for (const write of resolved) {
    if (write.mutation.resolves === undefined) continue;
    const resolves: RecordReference[] = [];
    for (const reference of write.mutation.resolves) {
      const found = resolve(reference);
      if (found.status === "refused") return found;
      resolves.push(RecordReferenceSchema.parse({ ...reference, owner: found.result }));
    }
    write.mutation = { ...write.mutation, resolves };
  }
  return { status: "ok", result: resolved };
}

/** Select the history coordinate for a resolved completed owner. */
export function mutationHome(context: Pick<RefBackendContext, "registry">, reference: RecordReference, archived: readonly ArchivedFolder[]): StoredRecordHome {
  const history = rootFamily(context.registry[reference.kind].family) === "work-item"
    && archived.some(({ owner }) => sameOwner(owner, reference.owner));
  return expandStoredPath(reference, { registry: context.registry, history });
}
