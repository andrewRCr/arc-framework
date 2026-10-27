/** Invert a batch's own contributions while retaining changes made around that batch. */

import { canonicalize } from "../../kernel/canonical/canonical-json.js";
import type { RefBackendContext } from "./context.js";
import { readBatchObjects, type RefTreeEntry, type BatchObject } from "./batch-read.js";
import { archivedFolders, isArchiveRef } from "./archive-read.js";
import { writeRefBlob } from "./tree-write.js";
import { inverseEntryDocument } from "./sync-withdraw-entries.js";
import { repairWithdrawnLineage } from "./sync-withdraw-lineage.js";
import type { WithdrawJournalStep } from "./sync-withdraw-journal.js";
import type { ConflictRecord } from "../conflict.js";
import { appendRefConflicts } from "./write-conflicts.js";
import { parseRefMetadata } from "./metadata.js";
import { refPrototype } from "./read.js";
import { viewRefFamily } from "./view-state.js";
import { expandStoredPath } from "../stored-path.js";

/** Undo an unpublished end in an already merged snapshot, selecting untouched published entries. */
export async function inverseWithdrawStep(context: RefBackendContext, step: WithdrawJournalStep,
  current: ReadonlyMap<string, RefTreeEntry>, batches: ReadonlySet<string>, published: ReadonlyMap<string, RefTreeEntry>): Promise<Map<string, RefTreeEntry>> {
  const entries = new Map(current);
  const objects = await readBatchObjects(context, [...new Set([...current.values(), ...step.before.values(), ...step.after.values(), ...step.ancestor.values(), ...published.values()].map(({ oid }) => oid))]);
  if (isArchiveRef(step.ref)) return inverseArchive(step.ref, entries, objects, batches);
  const paths = new Set([...step.before.keys(), ...step.after.keys()]);
  const conflicts: ConflictRecord[] = [];
  for (const path of paths) {
    if (step.lineageOnly && !["metadata-registry.json", `lineage/${step.lineageOnly}.json`].includes(path)) continue;
    await inverseEntry(context, step, path, entries, published, objects, conflicts);
  }
  await repairWithdrawnLineage(context, step, entries, current, objects);
  await preserveInverseConflicts(context, step.ref, entries, conflicts);
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
  const original = object(before), written = object(after) ?? (after === undefined ? {} : undefined);
  const held = object(current), remote = object(published);
  if (!original || !written || !held || after !== undefined && original.kind !== written.kind) return equal(after, current) ? before : current;
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
  entries: Map<string, RefTreeEntry>, published: ReadonlyMap<string, RefTreeEntry>, objects: ReadonlyMap<string, BatchObject | null>, conflicts: ConflictRecord[]): Promise<void> {
  const before = step.before.get(path), after = step.after.get(path), here = entries.get(path);
  if (same(before, after)) return;
  const remote = published.get(path);
  const text = await inverseEntryDocument(context, step, path, { before, after, current: here, published: remote, ancestor: step.ancestor.get(path) }, objects);
  if (text !== undefined) {
    const template = here ?? before ?? after;
    if (template) entries.set(path, { ...template, oid: await writeRefBlob(context, text.content) });
    conflicts.push(...text.conflicts);
    return;
  }
  if (after && same(after, remote)) return;
  const metadata = /^metadata-[^/]+\.json$/u.test(path);
  if (metadata && here && (step.lineageOnly || before)) {
    entries.set(path, { ...here, oid: await inverseMetadata(context, [before, after, here, remote], objects, step.lineageOnly) });
    return;
  }
  if (!same(here, after)) return;
  if (before) entries.set(path, before);
  else if (metadata && here) entries.set(path, { ...here, oid: await writeRefBlob(context, canonicalize({ formatVersion: 1, formats: {} })) });
  else entries.delete(path);
}

async function preserveInverseConflicts(context: RefBackendContext, ref: string, entries: Map<string, RefTreeEntry>, conflicts: readonly ConflictRecord[]): Promise<void> {
  if (!conflicts.length) return;
  const live = ref.replace("refs/arc/history/", "refs/arc/"), family = viewRefFamily(live);
  if (!family) throw new Error("An entry inverse has no conflict namespace");
  const home = expandStoredPath(refPrototype(context, live, family), { registry: context.registry }), entry = entries.get(home.metadataPath);
  const metadata = parseRefMetadata(entry ? (await readBatchObjects(context, [entry.oid])).get(entry.oid) : undefined);
  if (!entry || !metadata) throw new Error("An entry inverse has no conflict metadata");
  await appendRefConflicts(context, ref, { entries, metadata }, conflicts);
  entries.set(home.metadataPath, { ...entry, oid: await writeRefBlob(context, canonicalize(metadata)) });
}

function lineageMetadataSlice(value: unknown, uid: string): unknown {
  const metadata = object(value), formats = object(metadata?.formats), lineage = object(metadata?.lineage);
  const key = canonicalize({ kind: "lineage/transition", ownerUid: uid });
  return { formats: formats?.[key] === undefined ? {} : { [key]: formats[key] },
    lineage: lineage?.[uid] === undefined ? {} : { [uid]: lineage[uid] } };
}
