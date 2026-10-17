/** Prepare owner renames by moving tree entries while retaining their record blobs. */
import { RecordReferenceSchema, type RecordReference } from "../identity.js";
import { expandStoredPath } from "../stored-path.js";
import type { StoreResult, StoreRefusal } from "../refusal.js";
import type { RefBackendContext } from "./context.js";
import type { ResolvedBatch } from "./write-resolution.js";
import type { RefWriteGroup } from "./write-commits.js";
import type { RefTreeEntry } from "./batch-read.js";
import { decodeStoredReference } from "./path-decode.js";
import { checkRefKey, checkRefPathCollision, type RefPathNeighbor } from "./path-admission.js";

/** Validate each old key under the new owner before changing any prepared tree. */
export function prepareRefRenames(context: RefBackendContext, batch: ResolvedBatch, groups: ReadonlyMap<string, RefWriteGroup>): StoreRefusal | undefined {
  const renamed = new Set<string>();
  for (const { mutation, home, prior } of batch.writes) {
    if (!prior || renamed.has(home.ref)) continue;
    renamed.add(home.ref);
    const group = groups.get(home.ref);
    if (!group) throw new Error("A renamed owner has no captured ref group");
    const entries = renamedEntries(context, group, prior.reference, mutation.reference);
    if (entries.status === "refused") return entries.refusal;
    group.entries = entries.result;
    group.metadata.formerSlugs = [...group.metadata.formerSlugs ?? [], prior.reference.owner.name];
    group.metadata.slug = mutation.reference.owner.name;
    renameLineageOwner(groups, mutation.reference);
  }
  return undefined;
}

function renamedEntries(context: RefBackendContext, group: RefWriteGroup, prior: RecordReference, next: RecordReference): StoreResult<Map<string, RefTreeEntry>> {
  const home = expandStoredPath(prior, { registry: context.registry });
  const neighbors: RefPathNeighbor[] = [];
  const entries = new Map(group.entries);
  for (const entry of group.entries.values()) {
    if (entry.path === home.metadataPath || entry.path.startsWith(home.manifestPath)) continue;
    const old = decodeStoredReference(context.registry, prior.owner, context.registry[prior.kind].family, entry.path, group.metadata);
    if (!old || !("owner" in old)) {
      neighbors.push({ home: { ref: home.ref, path: entry.path } });
      continue;
    }
    const reference = RecordReferenceSchema.parse({ ...old, owner: next.owner });
    const refusal = checkRefKey(reference, context.registry);
    if (refusal) return { status: "refused", refusal: { ...refusal, condition: `${entry.path}: ${refusal.condition}`,
      remedy: { text: `Re-key the companion ${JSON.stringify(old.key)} before renaming its owner, then retry.` } } };
    const target = expandStoredPath(reference, { registry: context.registry });
    neighbors.push({ reference, home: { ref: home.ref, path: target.path } });
    entries.delete(entry.path);
    entries.set(target.path, { ...entry, path: target.path });
  }
  for (const neighbor of neighbors) {
    if (!neighbor.reference) continue;
    const refusal = checkRefPathCollision(neighbor.reference, neighbor.home, neighbors);
    if (refusal) return { status: "refused", refusal };
  }
  return { status: "ok", result: entries };
}

function renameLineageOwner(groups: ReadonlyMap<string, RefWriteGroup>, reference: RecordReference): void {
  const owner = reference.owner;
  if (owner.type !== "work-item" || !owner.uid) return;
  const lineage = groups.get("refs/arc/project/registry")?.metadata.lineage;
  if (lineage?.[owner.uid] !== undefined) lineage[owner.uid] = owner.name;
}
