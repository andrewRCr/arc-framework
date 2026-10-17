/** Retain published lineage while removing only a withdrawn lineage's merge conflict. */

import { canonicalize } from "../../kernel/canonical/canonical-json.js";
import { WholeRecordConflictSchema, type WholeRecordConflict } from "../conflict.js";
import { RecordReferenceSchema, type RecordReference } from "../identity.js";
import { parseLineageRecord } from "../kinds/lineage/index.js";
import { expandStoredPath } from "../stored-path.js";
import { refFormatKey } from "./format-key.js";
import type { RefBackendContext } from "./context.js";
import { readBatchObjects, type BatchObject, type RefTreeEntry } from "./batch-read.js";
import { parseRefMetadata } from "./metadata.js";
import { writeRefBlob } from "./tree-write.js";
import type { WithdrawJournalStep } from "./sync-withdraw-journal.js";

/** Reconcile auxiliary lineage metadata from the records that survived the inverse. */
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
  metadata.lineage = {};
  for (const record of entries.values()) {
    if (!/^lineage\/[^/]+\.json$/u.test(record.path)) continue;
    const object = objects.get(record.oid), lineage = object?.type === "blob" ? parseLineageRecord(new TextDecoder().decode(object.bytes)) : null;
    if (!lineage?.origin.uid) continue;
    metadata.lineage[lineage.origin.uid] = lineage.origin.name;
    const reference = RecordReferenceSchema.parse({ kind: "lineage/transition", owner: { type: "work-item", ...lineage.origin } });
    const key = refFormatKey(reference);
    metadata.formats[key] = prior?.formats[key] ?? 1;
  }
  for (const reference of removed) Reflect.deleteProperty(metadata.formats, refFormatKey(reference));
  entries.set(path, { ...entry, oid: await writeRefBlob(context, canonicalize(metadata)) });
}

function removeLineageConflicts(context: RefBackendContext, step: WithdrawJournalStep,
  entries: Map<string, RefTreeEntry>, objects: ReadonlyMap<string, BatchObject | null>): RecordReference[] {
  const removed: RecordReference[] = [];
  for (const entry of entries.values()) {
    if (!entry.path.startsWith("lineage/conflicts/") || step.before.has(entry.path)) continue;
    const clash = decodeConflict(objects.get(entry.oid));
    if (!clash || clash.record.kind !== "lineage/transition") continue;
    const home = expandStoredPath(clash.record, { registry: context.registry }), own = step.after.get(home.path);
    const original = own ? objects.get(own.oid) : null;
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
