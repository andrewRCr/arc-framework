/** Logical record selection and accepted whole-record sides for published tree merges. */

import type { RefBackendContext } from "./context.js";
import type { SyncTreeSide } from "./sync-tree.js";
import type { BatchObject, RefTreeEntry } from "./batch-read.js";
import { viewRefFamily } from "./view-state.js";
import { decodeReference, refOwner } from "./codec.js";
import { ConflictRecordValueSchema, type ConflictRecordValue, type ConflictRecord, type SideLabel } from "../conflict.js";
import { refRecordVersion } from "./record-version.js";
import { refFormatKey } from "./format-key.js";
import { expandStoredPath } from "../stored-path.js";
import { RecordReferenceSchema, type RecordReference } from "../identity.js";
import type { CapturedWriteGroup } from "./write-current.js";
import { appendRefConflicts } from "./write-conflicts.js";
import { mergeLineText, mergeEntryText, splitEntryList } from "../concurrency/index.js";
import { writeRefBlob } from "./tree-write.js";
import type { RefMetadata } from "./metadata.js";
import type { EntryConfig, KindDefinition } from "../registry.js";
import { readSyncRecordLabel } from "./sync-label.js";

interface IndexedRecord { entry: RefTreeEntry; value: ConflictRecordValue }

interface SyncRecordSides { base: SyncTreeSide; local: SyncTreeSide; incoming: SyncTreeSide }
interface RecordTriple { base: IndexedRecord | undefined; local: IndexedRecord | undefined; incoming: IndexedRecord | undefined }
interface RecordChoice { selected: IndexedRecord | undefined; conflicts: ConflictRecord[]; retainMetadata?: boolean }

/** Reconcile semantic records while retaining opaque entries outside the registered record set. */
export async function reconcileSyncRecords(context: RefBackendContext, ref: string, base: SyncTreeSide, local: SyncTreeSide,
  incoming: SyncTreeSide, objects: ReadonlyMap<string, BatchObject | null>, group: CapturedWriteGroup, metadataConflicts: readonly string[][]): Promise<void> {
  const previous = indexRecords(context, ref, base, objects), current = indexRecords(context, ref, local, objects);
  const remote = indexRecords(context, ref, incoming, objects), conflicts: ConflictRecord[] = [];
  const choices: { records: RecordTriple; choice: RecordChoice }[] = [];
  for (const key of new Set([...previous.keys(), ...current.keys(), ...remote.keys()])) {
    const records = { base: previous.get(key), local: current.get(key), incoming: remote.get(key) };
    const choice = await chooseRecord(context, ref, { base, local, incoming }, records, group.metadata, ownsMetadataConflict(key, records, metadataConflicts));
    conflicts.push(...choice.conflicts);
    if (choice.retainMetadata && key === "primary") retainPrimaryMetadata(group.metadata, local.metadata);
    choices.push({ records, choice });
  }
  for (const { records, choice } of choices) installRecord(context, ref, group, records, choice.selected, choice.retainMetadata ?? false);
  await appendRefConflicts(context, ref, group, conflicts);
}

async function chooseRecord(context: RefBackendContext, ref: string, sides: SyncRecordSides,
  records: RecordTriple, metadata: RefMetadata, metadataConflict: boolean): Promise<RecordChoice> {
  const { base, local, incoming } = records;
  if (!metadataConflict && same(local, base)) return { selected: incoming, conflicts: [] };
  if (!metadataConflict && (same(incoming, base) || same(local, incoming))) return { selected: local, conflicts: [] };
  if (!metadataConflict && local && incoming) {
    if (sameContent(local, base)) return { selected: incoming, conflicts: [] };
    if (sameContent(incoming, base) || sameContent(local, incoming)) return { selected: local, conflicts: [] };
  }
  const subject = local ?? incoming ?? base;
  if (!subject || !sides.local.tip || !sides.incoming.tip) throw new Error("Competing records must have published tips");
  const [currentLabel, incomingLabel] = await Promise.all([
    readSyncRecordLabel(context, subject.value.reference, ref, sides.local.tip, sides.base.tip),
    readSyncRecordLabel(context, subject.value.reference, ref, sides.incoming.tip, sides.base.tip),
  ]);
  const definition = context.registry[subject.value.reference.kind];
  if (metadataConflict || wholeRecordRequired(definition, records)) return {
    selected: local, retainMetadata: true, conflicts: [{ record: subject.value.reference, location: { kind: "record" }, base: base?.value ?? null,
      current: { value: local?.value ?? null, label: currentLabel }, incoming: { value: incoming?.value ?? null, label: incomingLabel } }],
  };
  if (!local || !incoming) throw new Error("A text merge requires both present records");
  return mergeTextRecord(context, definition, { ...records, local, incoming }, metadata, currentLabel, incomingLabel);
}

function wholeRecordRequired(definition: KindDefinition, { base, local, incoming }: RecordTriple): boolean {
  if (definition.merge === "single-writer" || !local || !incoming || local.value.reference.kind !== incoming.value.reference.kind) return true;
  if (definition.merge !== "entry" || !definition.entry) return false;
  const grammar = definition.entry;
  return [base, local, incoming].some((record) => record !== undefined && invalidEntryIds(record.value.content, grammar));
}

function invalidEntryIds(content: string, grammar: EntryConfig): boolean {
  const seen = new Set<string>();
  for (const part of splitEntryList(content, grammar).parts) {
    if (part.kind !== "entry") continue;
    if (!part.id || seen.has(part.id)) return true;
    seen.add(part.id);
  }
  return false;
}

async function mergeTextRecord(context: RefBackendContext, definition: KindDefinition,
  records: RecordTriple & { local: IndexedRecord; incoming: IndexedRecord }, metadata: RefMetadata,
  currentLabel: SideLabel, incomingLabel: SideLabel): Promise<RecordChoice> {
  const { base, local, incoming } = records;
  const input = { record: local.value.reference, base: base?.value.content ?? "", baseVersion: base?.value.version ?? null,
    current: local.value.content, incoming: incoming.value.content, currentLabel, incomingLabel };
  const merged = definition.merge === "entry" && definition.entry ? mergeEntryText(input, definition.entry) : mergeLineText(input);
  const oid = await writeRefBlob(context, merged.content);
  return { selected: { entry: { ...local.entry, oid }, value: { ...local.value, content: merged.content,
    version: refRecordVersion(local.value.reference, oid, metadata, local.value.formatVersion) } }, conflicts: merged.conflicts };
}

function installRecord(context: RefBackendContext, ref: string, group: CapturedWriteGroup,
  records: RecordTriple, selected: IndexedRecord | undefined, retainMetadata: boolean): void {
  const selectedFormat = selected ? group.metadata.formats[refFormatKey(selected.value.reference)] ?? 1 : 1;
  for (const record of [records.base, records.local, records.incoming]) {
    if (!record) continue;
    group.entries.delete(record.entry.path);
    Reflect.deleteProperty(group.metadata.formats, refFormatKey(record.value.reference));
  }
  if (!selected) return;
  const family = viewRefFamily(ref.replace("refs/arc/history/", "refs/arc/"));
  if (!family) throw new Error("A registered record lacks a containing family");
  const reference = RecordReferenceSchema.parse({ ...selected.value.reference,
    owner: selected.value.reference.kind.startsWith("lineage/") ? selected.value.reference.owner : refOwner(ref, family, group.metadata) });
  const home = expandStoredPath(reference, { registry: context.registry, history: ref.startsWith("refs/arc/history/") });
  group.entries.set(home.path, { ...selected.entry, path: home.path });
  group.metadata.formats[refFormatKey(reference)] = retainMetadata ? selected.value.formatVersion : selectedFormat;
}

function indexRecords(context: RefBackendContext, ref: string, side: SyncTreeSide,
  objects: ReadonlyMap<string, BatchObject | null>): Map<string, IndexedRecord> {
  const family = viewRefFamily(ref.replace("refs/arc/history/", "refs/arc/"));
  if (!family || side.entries.size === 0) return new Map();
  const owner = refOwner(ref, family, side.metadata), indexed = new Map<string, IndexedRecord>();
  for (const entry of side.entries.values()) {
    const object = objects.get(entry.oid);
    if (entry.mode !== "100644" || object?.type !== "blob") continue;
    const reference = decodeReference(context, owner, family, entry.path, side.metadata, object);
    if (!reference || !("owner" in reference)) continue;
    const home = expandStoredPath(reference, { registry: context.registry });
    if (entry.path === home.metadataPath) continue;
    const formatVersion = side.metadata.formats[refFormatKey(reference)] ?? 1;
    const primary = reference.kind === side.metadata.primary?.role || reference.kind === "cohort/document";
    const value = recordValue(reference, entry, object, side.metadata, formatVersion, primary);
    indexed.set(primary ? "primary" : refFormatKey(reference), { entry, value });
  }
  return indexed;
}

function same(left: IndexedRecord | undefined, right: IndexedRecord | undefined): boolean {
  return left?.value.version === right?.value.version && left?.value.reference.kind === right?.value.reference.kind;
}

function sameContent(left: IndexedRecord | undefined, right: IndexedRecord | undefined): boolean {
  return left?.entry.oid === right?.entry.oid && left?.value.reference.kind === right?.value.reference.kind;
}

function ownsMetadataConflict(key: string, records: RecordTriple, paths: readonly string[][]): boolean {
  const reference = (records.local ?? records.incoming ?? records.base)?.value.reference;
  return paths.some(([root, coordinate]) => {
    if (root === "formats") return coordinate === (reference ? refFormatKey(reference) : key);
    if (root === "lineage") return reference?.owner.type === "work-item" && reference.owner.uid === coordinate;
    return key === "primary" && ["slug", "formerSlugs", "primary", "placement"].includes(root ?? "");
  });
}

function retainPrimaryMetadata(metadata: RefMetadata, local: RefMetadata): void {
  for (const key of ["slug", "formerSlugs", "primary", "placement"] as const) {
    Reflect.deleteProperty(metadata, key);
    if (local[key] !== undefined) Object.assign(metadata, { [key]: structuredClone(local[key]) });
  }
}

function recordValue(reference: RecordReference, entry: RefTreeEntry, object: BatchObject, metadata: RefMetadata,
  formatVersion: number, primary: boolean): ConflictRecordValue {
  return ConflictRecordValueSchema.parse({ reference, content: new TextDecoder("utf-8", { fatal: true }).decode(object.bytes),
      version: refRecordVersion(reference, entry.oid, metadata, formatVersion), formatVersion,
      ...primary && (metadata.primary?.placement ?? metadata.placement) ? { placement: metadata.primary?.placement ?? metadata.placement } : {},
      ...primary && metadata.primary?.links ? { links: metadata.primary.links } : {} });
}
