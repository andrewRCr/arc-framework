/** Invert a batch's own contributions while retaining changes made around that batch. */

import { canonicalize } from "../../kernel/canonical/canonical-json.js";
import type { RefBackendContext } from "./context.js";
import { readBatchObjects, type RefTreeEntry, type BatchObject } from "./batch-read.js";
import { archivedFolders, isArchiveRef } from "./archive-read.js";
import { writeRefBlob } from "./tree-write.js";
import { inverseAddedEntries } from "./sync-withdraw-entries.js";
import { repairWithdrawnLineage } from "./sync-withdraw-lineage.js";
import type { WithdrawJournalStep } from "./sync-withdraw-journal.js";

/** Undo an unpublished end in an already merged snapshot, selecting untouched published entries. */
export async function inverseWithdrawStep(context: RefBackendContext, step: WithdrawJournalStep,
  current: ReadonlyMap<string, RefTreeEntry>, batches: ReadonlySet<string>, published: ReadonlyMap<string, RefTreeEntry>): Promise<Map<string, RefTreeEntry>> {
  const entries = new Map(current);
  const objects = await readBatchObjects(context, [...new Set([...current.values(), ...step.before.values(), ...step.after.values(), ...published.values()].map(({ oid }) => oid))]);
  if (isArchiveRef(step.ref)) return inverseArchive(step.ref, entries, objects, batches);
  const paths = new Set([...step.before.keys(), ...step.after.keys()]);
  for (const path of paths) {
    if (step.lineageOnly && !["metadata-registry.json", `lineage/${step.lineageOnly}.json`].includes(path)) continue;
    await inverseEntry(context, step, path, entries, published, objects);
  }
  await repairWithdrawnLineage(context, step, entries, current, objects);
  return entries;
}

function same(left: RefTreeEntry | undefined, right: RefTreeEntry | undefined): boolean {
  return left?.oid === right?.oid && left?.mode === right?.mode;
}
function equal(left: unknown, right: unknown): boolean {
  return left === undefined || right === undefined ? left === right : canonicalize(left) === canonicalize(right);
}
function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function inverseValue(before: unknown, after: unknown, current: unknown, published?: unknown): unknown {
  if (equal(before, after)) return current;
  if (published !== undefined && equal(after, published)) return current;
  const original = object(before), written = object(after), held = object(current), remote = object(published);
  if (!original || !written || !held || original.kind !== written.kind) return equal(after, current) ? before : current;
  const result = { ...held };
  for (const key of new Set([...Object.keys(original), ...Object.keys(written)])) {
    const value = inverseValue(original[key], written[key], held[key], remote?.[key]);
    if (value === undefined) Reflect.deleteProperty(result, key); else result[key] = value;
  }
  return result;
}

function inverseArchive(ref: string, entries: Map<string, RefTreeEntry>,
  objects: ReadonlyMap<string, BatchObject | null>, batches: ReadonlySet<string>): Map<string, RefTreeEntry> {
  const folders = (["work-item", "cohort"] as const).flatMap((family) => archivedFolders(family, ref, [...entries.values()], objects).folders);
  for (const folder of folders) {
    if (!folder.metadata.endBatch || !batches.has(folder.metadata.endBatch)) continue;
    for (const path of entries.keys()) if (path.startsWith(folder.root)) entries.delete(path);
  }
  return entries;
}

async function inverseMetadata(context: RefBackendContext, entries: readonly (RefTreeEntry | undefined)[],
  objects: ReadonlyMap<string, BatchObject | null>, lineageOnly?: string): Promise<string> {
  const values = entries.map((entry) => {
    if (!entry) return undefined;
    const object = objects.get(entry.oid);
    if (object?.type !== "blob") throw new Error("An inverse metadata blob is unavailable");
    return JSON.parse(new TextDecoder().decode(object.bytes)) as unknown;
  });
  const before = lineageOnly ? lineageMetadataSlice(values[0], lineageOnly) : values[0];
  const after = lineageOnly ? lineageMetadataSlice(values[1], lineageOnly) : values[1];
  return writeRefBlob(context, canonicalize(inverseValue(before, after, values[2], values[3])));
}

async function inverseEntry(context: RefBackendContext, step: WithdrawJournalStep, path: string,
  entries: Map<string, RefTreeEntry>, published: ReadonlyMap<string, RefTreeEntry>, objects: ReadonlyMap<string, BatchObject | null>): Promise<void> {
  const before = step.before.get(path), after = step.after.get(path), here = entries.get(path);
  if (same(before, after)) return;
  const remote = published.get(path);
  const text = inverseAddedEntries(context, step.ref, path, { before, after, current: here, published: remote }, step.after, objects);
  if (text !== undefined && here) { entries.set(path, { ...here, oid: await writeRefBlob(context, text) }); return; }
  if (after && same(after, remote)) return;
  const metadata = /^metadata-[^/]+\.json$/u.test(path);
  if (metadata && after && here && (step.lineageOnly || before)) {
    entries.set(path, { ...here, oid: await inverseMetadata(context, [before, after, here, remote], objects, step.lineageOnly) });
    return;
  }
  if (!same(here, after)) return;
  if (before) entries.set(path, before);
  else if (metadata && here) entries.set(path, { ...here, oid: await writeRefBlob(context, canonicalize({ formatVersion: 1, formats: {} })) });
  else entries.delete(path);
}

function lineageMetadataSlice(value: unknown, uid: string): unknown {
  const metadata = object(value), formats = object(metadata?.formats), lineage = object(metadata?.lineage);
  const key = canonicalize({ kind: "lineage/transition", ownerUid: uid });
  return { formats: formats?.[key] === undefined ? {} : { [key]: formats[key] },
    lineage: lineage?.[uid] === undefined ? {} : { [uid]: lineage[uid] } };
}
