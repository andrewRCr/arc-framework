/** Reconcile protected sibling registry coordinates after every ordinary batch inverse has completed. */
import { RecordReferenceSchema, type OwnerIdentity } from "../identity.js";
import { WholeRecordConflictSchema, type WholeRecordConflict } from "../conflict.js";
import { parseLineageRecord } from "../kinds/lineage/index.js";
import { canonicalize } from "../../kernel/canonical/canonical-json.js";
import type { RefBackendContext } from "./context.js";
import { readBatchObjects, type BatchObject, type RefTreeEntry } from "./batch-read.js";
import { parseRefMetadata, type RefMetadata } from "./metadata.js";
import { refFormatKey } from "./format-key.js";
import { mergeLineageAliases } from "./lineage-aliases.js";
import { writeRefBlob } from "./tree-write.js";
import { UnavailableWithdrawJournal } from "./sync-withdraw-journal.js";

const registry = "refs/arc/project/registry", metadataPath = "metadata-registry.json";

/** Restore only protected UIDs' current records, metadata and conflict coordinates, preserving current absence too. */
export async function preserveSiblingLineage(context: RefBackendContext, owners: readonly OwnerIdentity[],
  currentTree: readonly RefTreeEntry[], prepared: Map<string, RefTreeEntry>): Promise<void> {
  const protectedOwners = owners.filter(owner => owner.type === "work-item" && owner.uid);
  if (!protectedOwners.length) return;
  const current = new Map(currentTree.map(entry => [entry.path, entry]));
  const objects = await readBatchObjects(context, [...new Set([...current.values(), ...prepared.values()]
    .filter(entry => entry.path === metadataPath || entry.path.startsWith("lineage/")).map(entry => entry.oid))]);
  const beforeMetadata = registryMetadata(current, objects), metadata = registryMetadata(prepared, objects);
  for (const owner of protectedOwners) preserveOwnerLineage(owner, current, prepared, objects, beforeMetadata, metadata);
  const aliases = mergeLineageAliases(metadata.lineageFormerSlugs, beforeMetadata.lineageFormerSlugs);
  if (aliases) metadata.lineageFormerSlugs = aliases;
  preserveConflicts(current, prepared, objects, beforeMetadata, metadata,
    new Set(protectedOwners.flatMap(owner => "uid" in owner && owner.uid ? [owner.uid] : [])));
  prepared.set(metadataPath, { path: metadataPath, mode: "100644", oid: await writeRefBlob(context, canonicalize(metadata)) });
}

function preserveOwnerLineage(owner: OwnerIdentity, current: ReadonlyMap<string, RefTreeEntry>, prepared: Map<string, RefTreeEntry>,
  objects: ReadonlyMap<string, BatchObject | null>, before: RefMetadata, metadata: RefMetadata): void {
  if (!("uid" in owner) || !owner.uid) return;
  const path = `lineage/${owner.uid}.json`, entry = current.get(path);
  if (entry) {
    const object = objects.get(entry.oid), lineage = object?.type === "blob" ? parseLineageRecord(new TextDecoder().decode(object.bytes)) : null;
    if (lineage?.origin.uid !== owner.uid) throw unavailable("The protected sibling's current lineage cannot be decoded.");
  }
  copyEntry(current, prepared, path);
  copyFormat(before, metadata, refFormatKey(RecordReferenceSchema.parse({ owner, kind: "lineage/transition" })));
  const name = before.lineage?.[owner.uid];
  if (name !== undefined) metadata.lineage = { ...metadata.lineage, [owner.uid]: name };
  else if (metadata.lineage) Reflect.deleteProperty(metadata.lineage, owner.uid);
}

function registryMetadata(entries: ReadonlyMap<string, RefTreeEntry>, objects: ReadonlyMap<string, BatchObject | null>): RefMetadata {
  const entry = entries.get(metadataPath);
  if (!entry && entries.size === 0) return { formatVersion: 1, formats: {} };
  const metadata = parseRefMetadata(entry ? objects.get(entry.oid) : null);
  if (!metadata) throw unavailable("Registry metadata required to preserve later sibling ends cannot be decoded.");
  return metadata;
}

function preserveConflicts(current: ReadonlyMap<string, RefTreeEntry>, prepared: Map<string, RefTreeEntry>,
  objects: ReadonlyMap<string, BatchObject | null>, before: RefMetadata, metadata: RefMetadata, uids: ReadonlySet<string>): void {
  const prefix = "lineage/conflicts/", paths = new Set([...current.keys(), ...prepared.keys()].filter(path => path.startsWith(prefix)));
  for (const path of paths) {
    const values = [current.get(path), prepared.get(path)].flatMap(entry => entry ? [decodeConflict(objects.get(entry.oid))] : []);
    const protectedConflict = values.find(value => value.record.kind === "lineage/transition"
      && value.record.owner.type === "work-item" && value.record.owner.uid && uids.has(value.record.owner.uid));
    if (!protectedConflict) continue;
    const reference = RecordReferenceSchema.safeParse({ owner: protectedConflict.record.owner,
      kind: "lineage/conflict-record", key: path.slice(prefix.length, -".json".length) });
    if (!reference.success) throw unavailable("A protected lineage conflict's coordinate cannot be decoded.");
    copyEntry(current, prepared, path);
    copyFormat(before, metadata, refFormatKey(reference.data));
  }
}

function decodeConflict(object: BatchObject | null | undefined): WholeRecordConflict {
  if (object?.type !== "blob") throw unavailable("A lineage conflict required to preserve sibling authority is unavailable.");
  let value: unknown;
  try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(object.bytes)); }
  catch { throw unavailable("A lineage conflict required to preserve sibling authority cannot be decoded."); }
  const result = WholeRecordConflictSchema.safeParse(value);
  if (!result.success) throw unavailable("A lineage conflict required to preserve sibling authority cannot be decoded.");
  return result.data;
}

function copyEntry(current: ReadonlyMap<string, RefTreeEntry>, prepared: Map<string, RefTreeEntry>, path: string): void {
  const entry = current.get(path);
  if (entry) prepared.set(path, entry); else prepared.delete(path);
}

function copyFormat(current: RefMetadata, metadata: RefMetadata, key: string): void {
  const version = current.formats[key];
  if (version === undefined) Reflect.deleteProperty(metadata.formats, key); else metadata.formats[key] = version;
}

function unavailable(condition: string): UnavailableWithdrawJournal { return new UnavailableWithdrawJournal(registry, condition); }
