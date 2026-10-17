/** Resolve a mutation batch's owner generations from one captured namespace. */

import { randomUUID } from "node:crypto";
import { OwnerIdentitySchema, RecordReferenceSchema, type OwnerIdentity, type RecordReference } from "../identity.js";
import type { Mutation } from "../write.js";
import type { StoreResult, StoreRefusal } from "../refusal.js";
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
import { retirementTargets } from "./write-retirement.js";
import { resolveNamedRefWrites, writeOwnerNameKey } from "./write-names.js";
import { readLiveRefOwners, type LiveRefOwners } from "./live-owners.js";

/** Canonical mutation and its concrete ref/tree address. */
export interface ResolvedMutation { mutation: Mutation; home: StoredRecordHome; prior?: { reference: RecordReference; home: StoredRecordHome } }
/** One resolved owner generation per name, with its captured mutation basis. */
export interface ResolvedBatch { writes: ResolvedMutation[]; tips: Map<string, string>; archived?: readonly ArchivedFolder[] }
/** A ref/tree coordinate that the batch may change directly or through resolution. */
export interface RefWriteTarget { reference: RecordReference; home: StoredRecordHome }

/** Include conflict-resolution refs in the same capture, locking, and publication set. */
export function refWriteTargets(context: Pick<RefBackendContext, "registry">, batch: ResolvedBatch): RefWriteTarget[] {
  return batch.writes.flatMap(({ mutation, home }) => [{ reference: mutation.reference, home },
    ...(mutation.resolves ?? []).map((reference) => ({ reference, home: mutationHome(context, reference, batch.archived ?? []) }))]).concat(retirementTargets(context, batch), renameRegistryTargets(context, batch));
}

/** Resolve all owner names together so records created in one batch share a generation. */
export async function resolveRefWrites(context: RefBackendContext, writes: readonly Mutation[]): Promise<StoreResult<ResolvedBatch>> {
  const identity = await refWriteIdentityRefusal(context, writes);
  if (identity) return { status: "refused", refusal: identity };
  const tips = await readRefTips(context, { includeHistory: true });
  const project = await bindProjectMutations(context, writes, tips);
  if (project.status === "refused") return project;
  writes = project.result;
  const named = await resolveNamedRefWrites(context, writes, tips);
  if (named.status === "refused") return named;
  writes = named.result.writes;
  const observed = await readLiveRefOwners(context, tips);
  if (observed.status === "refused") return observed;
  const owners = observed.result.owners;
  const brokenTarget = unreadableWriteTarget(context, writes, observed.result);
  if (brokenTarget) return { status: "refused", refusal: brokenTarget };
  const archived = await resolveArchivedReferences(context, writes.flatMap((write) => [write.reference, ...write.resolves ?? []]), tips);
  if (archived.status === "refused") return archived;
  const endedOwners = [...new Map(archived.result.map(({ owner }) => ["uid" in owner ? owner.uid : owner.name, owner])).values()];
  const needsLineage = writes.some((mutation) => [mutation.reference, ...mutation.resolves ?? []]
    .some((reference) => context.registry[reference.kind].family === "lineage"));
  const lineage = needsLineage ? await readLineageOwners(context, tips) : { status: "ok" as const, result: [] };
  if (lineage.status === "refused") return lineage;
  const fresh = new Map<string, OwnerIdentity>();
  const liveOwners = owners.map(({ owner }) => owner);
  const resolve = (reference: RecordReference) => {
    const freshName = !("uid" in reference.owner && reference.owner.uid) && named.result.freshNames.has(writeOwnerNameKey(reference));
    const candidates = freshName ? liveOwners : context.registry[reference.kind].family === "lineage"
      ? lineageOwnerCandidates(reference, liveOwners, lineage.result) : [...liveOwners, ...endedOwners];
    return resolveOwner(reference, candidates, fresh);
  };

  const renames = requestedRenames(writes);
  const resolved: ResolvedMutation[] = [];
  for (const mutation of writes) {
    const found = resolve(mutation.reference);
    if (found.status === "refused") return found;
    resolved.push(resolvedOwnerWrite(context, mutation, found.result, renames, archived.result));
  }
  const canonical = resolveConflictReferences(resolved, resolve);
  if (canonical.status === "refused") return canonical;
  const unknownClaim = unreadableNewClaim(resolved, observed.result);
  if (unknownClaim) return { status: "refused", refusal: unknownClaim };
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
  const history = ["work-item", "cohort"].includes(rootFamily(context.registry[reference.kind].family))
    && archived.some(({ owner }) => sameOwner(owner, reference.owner));
  return expandStoredPath(reference, { registry: context.registry, history });
}

function renameRegistryTargets(context: Pick<RefBackendContext, "registry">, batch: ResolvedBatch): RefWriteTarget[] {
  return batch.writes.flatMap(({ mutation, prior }) => {
    if (!prior || mutation.reference.owner.type !== "work-item") return [];
    const reference = RecordReferenceSchema.parse({ kind: "lineage/transition", owner: mutation.reference.owner });
    return [{ reference, home: expandStoredPath(reference, { registry: context.registry }) }];
  });
}

function requestedRenames(writes: readonly Mutation[]): Map<string, string> {
  return new Map(writes.filter((write) => write.action === "put" && ["work-item/meta", "work-item/record", "cohort/document"].includes(write.reference.kind))
    .flatMap(({ reference }) => "uid" in reference.owner && reference.owner.uid ? [[reference.owner.uid, reference.owner.name] as const] : []));
}

function resolvedOwnerWrite(context: RefBackendContext, mutation: Mutation, owner: OwnerIdentity, renames: ReadonlyMap<string, string>, archived: readonly ArchivedFolder[]): ResolvedMutation {
  const current = RecordReferenceSchema.parse({ ...mutation.reference, owner });
  const name = "uid" in owner && owner.uid ? renames.get(owner.uid) : undefined;
  const reference = RecordReferenceSchema.parse({ ...current, owner: { ...owner, name: name ?? owner.name } });
  return { mutation: { ...mutation, reference }, home: mutationHome(context, reference, archived),
    ...(reference.owner.name === owner.name ? {} : { prior: { reference: current, home: mutationHome(context, current, archived) } }) };
}

function unreadableWriteTarget(context: RefBackendContext, writes: readonly Mutation[], captured: LiveRefOwners): StoreRefusal | undefined {
  for (const reference of writes.flatMap((write) => [write.reference, ...write.resolves ?? []])) {
    if (reference.owner.type !== "person" && reference.owner.type !== "project" && !reference.owner.uid) continue;
    const broken = captured.unreadable.get(expandStoredPath(reference, { registry: context.registry }).ref);
    if (broken) return broken;
  }
  return undefined;
}

function unreadableNewClaim(writes: readonly ResolvedMutation[], captured: LiveRefOwners): StoreRefusal | undefined {
  const unseen = [...captured.unreadable.values()][0];
  if (!unseen) return undefined;
  const changesClaim = writes.some(({ mutation }) => {
    if (mutation.action !== "put" || !["work-item/meta", "work-item/record", "cohort/document"].includes(mutation.reference.kind)) return false;
    const prior = captured.owners.find(({ owner }) => sameOwner(owner, mutation.reference.owner))?.primary;
    return !prior || prior.reference.owner.name !== mutation.reference.owner.name;
  });
  return changesClaim ? unseen : undefined;
}

/** Refuse identity-owned writes before selecting a repository or consulting Git. */
export async function refWriteIdentityRefusal(context: RefBackendContext, writes: readonly Mutation[]): Promise<StoreRefusal | undefined> {
  const personal = writes.find((write) => write.reference.owner.type === "person");
  if (personal && await context.identity() === null) return {
    code: "not-found", class: "recoverable", reference: personal.reference,
    condition: "No arc.identity is configured for person-owned state",
    remedy: { text: "Configure arc.identity, then retry the write." },
  };
  return undefined;
}
