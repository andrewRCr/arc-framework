/** Copy a retained item tree into a completed folder while retaining its lifecycle coordinates. */

import { canonicalize } from "../../kernel/canonical/canonical-json.js";
import { RecordReferenceSchema, type OwnerIdentity, type RecordReference } from "../identity.js";
import type { ReadPlacement } from "../placement.js";
import { expandStoredPath } from "../stored-path.js";
import type { RefBackendContext } from "./context.js";
import type { ArchivedFolder } from "./archive-read.js";
import type { RefWriteGroup } from "./write-commits.js";
import type { RefTreeEntry } from "./batch-read.js";
import type { RefMetadata } from "./metadata.js";
import { writeRefBlob } from "./tree-write.js";
import type { StoreResult } from "../refusal.js";
import { archiveSourceMetadataRefusal } from "./archive-metadata-admission.js";
import { projectRefTreeEntry } from "./entry-path.js";
import { archiveCopyNamespaceRefusal, archiveDestinationRefusal } from "./archive-destination-admission.js";

/** Where an owner's completed folder is written and the end batch it keeps, when it has one. */
export interface CompletedFolderTarget { placement: ReadPlacement; endBatch?: string | undefined }

/** An owner's primary record under its current slug: a cohort's document, or a work item's recorded primary role. */
export function ownerPrimaryReference(owner: OwnerIdentity, metadata: RefMetadata): RecordReference {
  return RecordReferenceSchema.parse({ owner: { ...owner, name: metadata.slug ?? owner.name },
    kind: owner.type === "cohort" ? "cohort/document" : metadata.primary?.role ?? "work-item/meta" });
}

/** The folder root a completed placement names, from the owner's primary and current slug, never another record's kind. */
export function archivedFolderRoot(context: Pick<RefBackendContext, "registry">, owner: OwnerIdentity, metadata: RefMetadata,
  placement: ReadPlacement): string {
  return expandStoredPath(ownerPrimaryReference(owner, metadata), { registry: context.registry, placement }).root;
}

/** Replace one owner's folder from its final group, preserving that folder's end and placement. */
export async function refreshArchivedFolder(context: RefBackendContext, folder: ArchivedFolder, group: Pick<RefWriteGroup, "entries" | "metadata">,
  entries: Map<string, RefTreeEntry>, target: CompletedFolderTarget = folderTarget(folder)): Promise<StoreResult<undefined>> {
  const refusal = archiveFolderRefusal(context, target, group, entries, folder.owner, folder.root);
  if (refusal) return { status: "refused", refusal };
  removeArchivedFolder(entries, folder);
  return writeArchivedFolder(context, target, group, entries, folder.owner);
}

/** Remove every entry of one folder from its quarter's entries. */
export function removeArchivedFolder(entries: Map<string, RefTreeEntry>, folder: Pick<ArchivedFolder, "root">): void {
  for (const path of entries.keys()) if (path.startsWith(folder.root)) entries.delete(path);
}

/** Write an owner's folder from its final group at the root its target placement names. */
export async function writeArchivedFolder(context: RefBackendContext, target: CompletedFolderTarget, group: Pick<RefWriteGroup, "entries" | "metadata">,
  entries: Map<string, RefTreeEntry>, owner: OwnerIdentity): Promise<StoreResult<undefined>> {
  const refusal = archiveFolderRefusal(context, target, group, entries, owner);
  if (refusal) return { status: "refused", refusal };
  const home = expandStoredPath(ownerPrimaryReference(owner, group.metadata), { registry: context.registry });
  const metadata = completedFolderMetadata(target, group.metadata);
  const root = archivedFolderRoot(context, owner, group.metadata, target.placement);
  for (const entry of group.entries.values()) {
    if (entry.path === home.manifestPath.slice(0, -1) || entry.path.startsWith(home.manifestPath)) continue;
    const projected = projectRefTreeEntry(entry, { fromPrefix: "", toPrefix: root });
    entries.set(projected.path, { ...projected, ...(entry.path === home.metadataPath ? { oid: await writeRefBlob(context, canonicalize(metadata)) } : {}) });
  }
  return { status: "ok", result: undefined };
}

function archiveFolderRefusal(context: RefBackendContext, target: CompletedFolderTarget,
  group: Pick<RefWriteGroup, "entries" | "metadata">, entries: ReadonlyMap<string, RefTreeEntry>, owner: OwnerIdentity, ownedRoot?: string) {
  const reference = ownerPrimaryReference(owner, group.metadata), home = expandStoredPath(reference, { registry: context.registry });
  const root = archivedFolderRoot(context, owner, group.metadata, target.placement);
  const destination = expandStoredPath(reference, { registry: context.registry, placement: target.placement });
  return archiveSourceMetadataRefusal(context, reference, home.ref.replace("refs/arc/", "refs/arc/history/"), group.entries.values())
    ?? archiveDestinationRefusal(reference, destination.ref, root, entries.values(), ownedRoot)
    ?? archiveCopyNamespaceRefusal(reference, destination.ref, root, [...group.entries.values()].filter(entry =>
      entry.path !== home.manifestPath.slice(0, -1) && !entry.path.startsWith(home.manifestPath)), entries.values(), ownedRoot);
}

/** The placement and end batch an existing folder keeps when it is refreshed. */
export function folderTarget(folder: ArchivedFolder): CompletedFolderTarget {
  return { placement: folder.placement, endBatch: folder.metadata.endBatch };
}

/** Preserve a folder's end identity, absent when the folder has none, while normalizing its completed placement. */
export function completedFolderMetadata(target: CompletedFolderTarget, source: RefMetadata): RefMetadata {
  const metadata = withCompletedPlacement(source, target.placement);
  delete metadata.endBatch;
  return target.endBatch === undefined ? metadata : { ...metadata, endBatch: target.endBatch };
}

/** Metadata whose stored completed placement names this placement's quarter, as an ended item's latest folder defines it. */
export function withCompletedPlacement(source: RefMetadata, placement: ReadPlacement): RefMetadata {
  if (placement.kind !== "completed") throw new Error("A completed folder has no completed placement");
  const completed = { kind: "completed" as const, quarter: placement.quarter };
  const metadata: RefMetadata = { ...source };
  if (metadata.placement) metadata.placement = completed;
  if (metadata.primary) metadata.primary = { ...metadata.primary, placement: completed };
  return metadata;
}
