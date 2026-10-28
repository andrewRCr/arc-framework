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
import { mergeLineageAliases } from "./lineage-aliases.js";
import type { Slug } from "../../kernel/schema/slug.js";
import { projectRefTreeEntry } from "./entry-path.js";

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
    renameLineageOwner(groups, mutation.reference, group.metadata.formerSlugs);
  }
  return undefined;
}

function renamedEntries(context: RefBackendContext, group: RefWriteGroup, prior: RecordReference, next: RecordReference): StoreResult<Map<string, RefTreeEntry>> {
  const home = expandStoredPath(prior, { registry: context.registry });
  const neighbors: RefPathNeighbor[] = [];
  const moves: Array<[RefTreeEntry, RefTreeEntry]> = [];
  for (const entry of group.entries.values()) {
    if (entry.path === home.metadataPath || entry.path.startsWith(home.manifestPath)) continue;
    const old = decodeStoredReference(context.registry, prior.owner, context.registry[prior.kind].family, entry.path, group.metadata);
    if (!old || !("owner" in old)) {
      neighbors.push({ home: { ref: home.ref, path: entry.path } });
      continue;
    }
    const reference = RecordReferenceSchema.parse({ ...old, owner: next.owner });
    const target = expandStoredPath(reference, { registry: context.registry });
    const refusal = renamedEntryRefusal(context, reference, entry, target);
    if (refusal) return { status: "refused", refusal };
    neighbors.push({ reference, home: { ref: home.ref, path: target.path } });
    moves.push([entry, projectRefTreeEntry(entry, { path: target.path })]);
  }
  // Every target comes from the former entries, so a record whose new path is another's former path is not lost.
  const entries = new Map(group.entries);
  for (const [entry] of moves) entries.delete(entry.path);
  for (const [, moved] of moves) entries.set(moved.path, moved);
  for (const neighbor of neighbors) {
    if (!neighbor.reference) continue;
    const refusal = checkRefPathCollision(neighbor.reference, neighbor.home, neighbors);
    if (refusal) return { status: "refused", refusal };
  }
  return { status: "ok", result: entries };
}

function renamedEntryRefusal(context: RefBackendContext, reference: RecordReference, entry: RefTreeEntry,
  target: { ref: string; path: string }): StoreRefusal | undefined {
  const refusal = checkRefKey(reference, context.registry);
  if (refusal) return { ...refusal, condition: `${entry.path}: ${refusal.condition}`,
    remedy: { text: `Re-key the companion ${JSON.stringify(reference.key)} before renaming its owner, then retry.` } };
  if (entry.path === target.path || !entry.invalidName && !entry.rawPath) return undefined;
  return { code: "namespace-corrupt", class: "terminal", namespace: target.ref,
    condition: `The stored path ${JSON.stringify(entry.path)} cannot be renamed through its decoded name because its original bytes are not valid UTF-8.`,
    remedy: { text: "Rename or remove the malformed entry with Git in a new commit, then retry the owner rename." },
  };
}

function renameLineageOwner(groups: ReadonlyMap<string, RefWriteGroup>, reference: RecordReference, formerSlugs: Slug[]): void {
  const owner = reference.owner;
  if (owner.type !== "work-item" || !owner.uid) return;
  const metadata = groups.get("refs/arc/project/registry")?.metadata;
  if (!metadata) throw new Error("A work-item rename has no captured registry");
  metadata.lineageFormerSlugs = mergeLineageAliases(metadata.lineageFormerSlugs, { [owner.uid]: formerSlugs });
  if (metadata.lineage?.[owner.uid] !== undefined) metadata.lineage[owner.uid] = owner.name;
}
