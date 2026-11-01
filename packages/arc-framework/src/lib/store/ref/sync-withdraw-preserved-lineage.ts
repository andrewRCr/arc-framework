/** Reconcile protected sibling registry coordinates after every ordinary batch inverse has completed. */
import { RecordReferenceSchema, type OwnerIdentity } from "../identity.js";
import { WholeRecordConflictSchema, type WholeRecordConflict } from "../conflict.js";
import { requireWithdrawLineage } from "./sync-withdraw-lineage.js";
import { canonicalize } from "../../kernel/canonical/canonical-json.js";
import type { RefBackendContext } from "./context.js";
import { readBatchObjects, type BatchObject, type RefTreeEntry } from "./batch-read.js";
import { readRefMetadata, type RefMetadata } from "./metadata.js";
import { refFormatKey } from "./format-key.js";
import { mergeLineageAliases } from "./lineage-aliases.js";
import { writeRefBlob } from "./tree-write.js";
import { UnavailableWithdrawJournal } from "./sync-withdraw-journal.js";
import type { RefCaptureFault } from "./capture-diagnostic.js";
import { refObjectFault, type RefFaultOptions } from "./object-fault.js";

const registry = "refs/arc/project/registry", metadataPath = "metadata-registry.json";

/** Restore only protected UIDs' current records, metadata and conflict coordinates, preserving current absence too. */
export async function preserveSiblingLineage(context: RefBackendContext, owners: readonly OwnerIdentity[],
  currentTree: readonly RefTreeEntry[], prepared: Map<string, RefTreeEntry>): Promise<void> {
  const protectedOwners = owners.filter(owner => owner.type === "work-item" && owner.uid);
  if (!protectedOwners.length) return;
  const current = new Map(currentTree.map(entry => [entry.path, entry]));
  const objects = await readBatchObjects(context, [...new Set([...current.values(), ...prepared.values()]
    .filter(entry => entry.path === metadataPath || entry.path.startsWith("lineage/")).map(entry => entry.oid))]);
  const beforeMetadata = registryMetadata(current, objects, false),
    metadata = registryMetadata(prepared, objects, prepared.get(metadataPath)?.oid !== current.get(metadataPath)?.oid);
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
    const condition = "The protected sibling's current lineage cannot be decoded.";
    const lineage = requireWithdrawLineage(registry, path, objects.get(entry.oid), condition);
    if (lineage.origin.uid !== owner.uid) throw unavailable(condition);
  }
  copyEntry(current, prepared, path);
  copyFormat(before, metadata, refFormatKey(RecordReferenceSchema.parse({ owner, kind: "lineage/transition" })));
  const name = before.lineage?.[owner.uid];
  if (name !== undefined) metadata.lineage = { ...metadata.lineage, [owner.uid]: name };
  else if (metadata.lineage) Reflect.deleteProperty(metadata.lineage, owner.uid);
}

function registryMetadata(entries: ReadonlyMap<string, RefTreeEntry>, objects: ReadonlyMap<string, BatchObject | null>, saved: boolean): RefMetadata {
  const entry = entries.get(metadataPath);
  if (!entry && entries.size === 0) return { formatVersion: 1, formats: {} };
  const read = readRefMetadata(registry, entry, objects);
  if (read.kind === "parsed") return read.metadata;
  const fault = read.kind === "absent" ? "no-metadata" : read.kind;
  throw unavailable(refObjectFault(registry, fault, { saved }).condition, fault, { saved });
}

function preserveConflicts(current: ReadonlyMap<string, RefTreeEntry>, prepared: Map<string, RefTreeEntry>,
  objects: ReadonlyMap<string, BatchObject | null>, before: RefMetadata, metadata: RefMetadata, uids: ReadonlySet<string>): void {
  const prefix = "lineage/conflicts/", paths = new Set([...current.keys(), ...prepared.keys()].filter(path => path.startsWith(prefix)));
  for (const path of paths) {
    const currentEntry = current.get(path);
    const values = [currentEntry, prepared.get(path)].flatMap(entry => entry
      ? [decodeConflict(objects.get(entry.oid), path, entry.oid !== currentEntry?.oid)] : []);
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

function decodeConflict(object: BatchObject | null | undefined, path: string, saved: boolean): WholeRecordConflict {
  const options: RefFaultOptions = { saved, key: `${registry}:${path}`,
    ...!saved ? { remedy: { text: `Repair the malformed lineage conflict at ${registry}:${path} in a new commit, then retry the withdrawal.` } } : {} };
  if (object?.type !== "blob") throw unavailable("A lineage conflict required to preserve sibling authority is unavailable.", "missing", { key: options.key });
  let value: unknown;
  try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(object.bytes)); }
  catch { throw unavailable("A lineage conflict required to preserve sibling authority cannot be decoded.", "unparseable", options); }
  const result = WholeRecordConflictSchema.safeParse(value);
  if (!result.success) throw unavailable("A lineage conflict required to preserve sibling authority cannot be decoded.", "unparseable", options);
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

function unavailable(condition: string, fault?: RefCaptureFault, options?: RefFaultOptions): UnavailableWithdrawJournal {
  return new UnavailableWithdrawJournal(registry, condition, fault, options);
}
