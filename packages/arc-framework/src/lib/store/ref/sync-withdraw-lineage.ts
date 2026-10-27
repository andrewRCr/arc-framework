/** Retain published lineage while removing only a withdrawn lineage's merge conflict. */

import { canonicalize } from "../../kernel/canonical/canonical-json.js";
import { WholeRecordConflictSchema, type WholeRecordConflict } from "../conflict.js";
import { RecordReferenceSchema, type RecordReference } from "../identity.js";
import { parseLineageRecord, type LineageRecord } from "../kinds/lineage/index.js";
import { expandStoredPath } from "../stored-path.js";
import { refFormatKey } from "./format-key.js";
import type { RefBackendContext } from "./context.js";
import { readBatchObjects, type BatchObject, type RefTreeEntry } from "./batch-read.js";
import { parseRefMetadata, type RefMetadata } from "./metadata.js";
import { writeRefBlob } from "./tree-write.js";
import type { WithdrawJournalStep } from "./sync-withdraw-journal.js";
import { mergeLineageAliases } from "./lineage-aliases.js";

/** Reconcile auxiliary lineage metadata for the lineage records the withdrawn batch wrote. */
export async function repairWithdrawnLineage(context: RefBackendContext, step: WithdrawJournalStep,
  entries: Map<string, RefTreeEntry>, current: ReadonlyMap<string, RefTreeEntry>,
  objects: ReadonlyMap<string, BatchObject | null>): Promise<void> {
  if (step.ref !== "refs/arc/project/registry") return;
  const removed = removeLineageConflicts(context, step, entries, objects);
  const path = "metadata-registry.json", entry = entries.get(path), original = current.get(path);
  if (!entry) return;
  const blobs = await readBatchObjects(context, [entry.oid, ...original ? [original.oid] : []]);
  const metadata = parseRefMetadata(blobs.get(entry.oid)), prior = original ? parseRefMetadata(blobs.get(original.oid)) : null;
  if (!metadata) throw new Error("An inverse registry has no usable metadata");
  const aliases = mergeLineageAliases(metadata.lineageFormerSlugs, prior?.lineageFormerSlugs);
  if (aliases) metadata.lineageFormerSlugs = aliases;
  // Other items' names stay as written: a rename changes only the name, never the record it names.
  for (const home of new Set([...step.before.keys(), ...step.after.keys()])) {
    if (!/^lineage\/[^/]+\.json$/u.test(home) || !writtenLineage(step, home)) continue;
    repairLineageEntry(metadata, prior, lineageAt(entries.get(home), objects),
      lineageAt(current.get(home) ?? step.after.get(home) ?? step.before.get(home), objects));
  }
  for (const reference of removed) Reflect.deleteProperty(metadata.formats, refFormatKey(reference));
  entries.set(path, { ...entry, oid: await writeRefBlob(context, canonicalize(metadata)) });
}

/** Name a surviving written record and keep its format, or drop both for a record the inverse removed. */
function repairLineageEntry(metadata: RefMetadata, prior: RefMetadata | null, survivor: LineageRecord | null, held: LineageRecord | null): void {
  const written = survivor ?? held, uid = written?.origin.uid;
  if (!written || !uid) return;
  const key = refFormatKey(RecordReferenceSchema.parse({ kind: "lineage/transition", owner: { type: "work-item", ...written.origin } }));
  if (survivor) {
    metadata.lineage = { ...metadata.lineage, [uid]: metadata.lineage?.[uid] ?? written.origin.name };
    metadata.formats[key] = prior?.formats[key] ?? 1;
    return;
  }
  if (metadata.lineage) Reflect.deleteProperty(metadata.lineage, uid);
  Reflect.deleteProperty(metadata.formats, key);
}

function writtenLineage(step: WithdrawJournalStep, path: string): boolean {
  if (step.lineageOnly && path !== `lineage/${step.lineageOnly}.json`) return false;
  const before = step.before.get(path), after = step.after.get(path);
  return before?.oid !== after?.oid || before?.mode !== after?.mode;
}

function lineageAt(entry: RefTreeEntry | undefined, objects: ReadonlyMap<string, BatchObject | null>): LineageRecord | null {
  const object = entry ? objects.get(entry.oid) : undefined;
  return object?.type === "blob" ? parseLineageRecord(new TextDecoder().decode(object.bytes)) : null;
}

function removeLineageConflicts(context: RefBackendContext, step: WithdrawJournalStep,
  entries: Map<string, RefTreeEntry>, objects: ReadonlyMap<string, BatchObject | null>): RecordReference[] {
  const removed: RecordReference[] = [];
  for (const entry of entries.values()) {
    if (!entry.path.startsWith("lineage/conflicts/") || step.before.has(entry.path)) continue;
    const clash = decodeConflict(objects.get(entry.oid));
    if (!clash || clash.record.kind !== "lineage/transition") continue;
    const home = expandStoredPath(clash.record, { registry: context.registry });
    if (!writtenLineage(step, home.path)) continue;
    const own = step.after.get(home.path), original = own ? objects.get(own.oid) : null;
    if (original?.type !== "blob") continue;
    const content = new TextDecoder().decode(original.bytes);
    if (![clash.current.value?.content, clash.incoming.value?.content].includes(content)) continue;
    entries.delete(entry.path);
    removed.push(RecordReferenceSchema.parse({ owner: clash.record.owner, kind: "lineage/conflict-record",
      key: entry.path.slice("lineage/conflicts/".length, -".json".length) }));
  }
  return removed;
}
function decodeConflict(object: BatchObject | null | undefined): WholeRecordConflict | undefined {
  if (object?.type !== "blob") return undefined;
  try {
    const result = WholeRecordConflictSchema.safeParse(JSON.parse(new TextDecoder().decode(object.bytes)));
    return result.success ? result.data : undefined;
  } catch { return undefined; }
}
