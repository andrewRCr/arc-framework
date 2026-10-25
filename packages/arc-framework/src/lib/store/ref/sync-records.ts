/** Logical record selection and accepted whole-record sides for published tree merges. */

import type { RefBackendContext } from "./context.js";
import { ZodError } from "zod";
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
import type { ReadPlacement } from "../placement.js";
import type { EntryConfig, KindDefinition } from "../registry.js";
import type { SyncCheckRecord } from "./sync-checks.js";
import { readSyncRecordLabel, RefSyncLabelError } from "./sync-label.js";

interface IndexedRecord { entry: RefTreeEntry; value: ConflictRecordValue }

interface SyncRecordSides { base: SyncTreeSide; local: SyncTreeSide; incoming: SyncTreeSide }
interface RecordTriple { base: IndexedRecord | undefined; local: IndexedRecord | undefined; incoming: IndexedRecord | undefined }
interface RecordChoice { selected: IndexedRecord | undefined; conflicts: ConflictRecord[]; retainMetadata?: boolean; followsIncoming?: boolean }
interface PlannedRecord { records: RecordTriple; choice: RecordChoice }

/** Reconcile semantic records while retaining opaque entries outside the registered record set. */
export async function reconcileSyncRecords(context: RefBackendContext, ref: string, base: SyncTreeSide, local: SyncTreeSide,
  incoming: SyncTreeSide, objects: ReadonlyMap<string, BatchObject | null>, group: CapturedWriteGroup, metadataConflicts: readonly string[][], currentSide: "local" | "incoming" = "incoming"): Promise<SyncCheckRecord[]> {
  const previous = indexRecords(context, ref, base, objects), current = indexRecords(context, ref, local, objects);
  const remote = indexRecords(context, ref, incoming, objects), conflicts: ConflictRecord[] = [];
  const choices: PlannedRecord[] = [];
  for (const key of new Set([...previous.keys(), ...current.keys(), ...remote.keys()])) {
    const records = { base: previous.get(key), local: current.get(key), incoming: remote.get(key) };
    // An end stays current against a late write; ordinary clashes keep the published side.
    const sides = currentSide === "local" ? { base, local, incoming } : { base, local: incoming, incoming: local };
    const values = currentSide === "local" ? records : { base: records.base, local: records.incoming, incoming: records.local };
    const choice = await chooseRecord(context, ref, sides, values, group.metadata, ownsMetadataConflict(key, records, metadataConflicts));
    // Only the transition record's row carries the lineage name; a conflict record owning the same coordinate leaves it.
    const subject = (records.local ?? records.incoming ?? records.base)?.value.reference;
    if (choice.followsIncoming && subject?.kind === "lineage/transition") followLineageName(group.metadata, sides.incoming.metadata, subject);
    conflicts.push(...choice.conflicts);
    if (choice.retainMetadata && key === "primary") retainPrimaryMetadata(group.metadata, currentSide === "local" ? local.metadata : incoming.metadata);
    choices.push({ records, choice });
  }
  installSelectedRecords(context, ref, group, choices);
  await appendRefConflicts(context, ref, group, conflicts);
  return choices.flatMap(({ records, choice }) => checkRecords(ref, group.metadata, records.local, choice.selected));
}

function installSelectedRecords(context: RefBackendContext, ref: string, group: CapturedWriteGroup,
  choices: readonly PlannedRecord[]): void {
  const installations = choices.flatMap(({ choice }) => choice.selected
    ? [recordInstallation(context, ref, group, choice.selected, choice.retainMetadata ?? false)] : []);
  const homes = new Set<string>();
  for (const { entry } of installations) {
    if (homes.has(entry.path)) throw new RefSyncLabelError(ref, { code: "namespace-corrupt", class: "terminal", namespace: ref,
      condition: `Two selected records on ${ref} resolve to the same stored path ${entry.path}.`,
      remedy: { text: "Give the colliding records distinct stored paths in their source states, then retry the pull." } });
    homes.add(entry.path);
  }
  for (const { records } of choices) removeRecordPaths(group, records);
  for (const { reference, entry, formatVersion } of installations) {
    group.entries.set(entry.path, entry);
    group.metadata.formats[refFormatKey(reference)] = formatVersion;
  }
}

async function chooseRecord(context: RefBackendContext, ref: string, sides: SyncRecordSides,
  records: RecordTriple, metadata: RefMetadata, metadataConflict: boolean): Promise<RecordChoice> {
  const { base, local, incoming } = records;
  const unchanged = unchangedSideChoice(records, metadataConflict);
  if (unchanged) return unchanged;
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

/** Keep the record of the only side that changed it, without reading labels a side with no record change lacks. */
function unchangedSideChoice({ base, local, incoming }: RecordTriple, metadataConflict: boolean): RecordChoice | undefined {
  // Only a lineage name sits outside its record's version, so a side whose record matches the base changed only that name.
  if (metadataConflict) {
    if (same(incoming, base)) return { selected: local, conflicts: [] };
    return same(local, base) ? { selected: incoming, conflicts: [], followsIncoming: true } : undefined;
  }
  if (same(local, base)) return { selected: incoming, conflicts: [] };
  if (same(incoming, base) || same(local, incoming)) return { selected: local, conflicts: [] };
  if (!local || !incoming) return undefined;
  if (sameContent(local, base)) return { selected: incoming, conflicts: [] };
  return sameContent(incoming, base) || sameContent(local, incoming) ? { selected: local, conflicts: [] } : undefined;
}

/** Give the merged registry the lineage name of the side whose record it kept, or none for a removed record. */
function followLineageName(metadata: RefMetadata, side: RefMetadata, reference: RecordReference | undefined): void {
  if (reference?.owner.type !== "work-item" || !reference.owner.uid) return;
  const uid = reference.owner.uid, name = side.lineage?.[uid];
  if (name !== undefined) metadata.lineage = { ...metadata.lineage, [uid]: name };
  else if (metadata.lineage) Reflect.deleteProperty(metadata.lineage, uid);
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

function removeRecordPaths(group: CapturedWriteGroup, records: RecordTriple): void {
  for (const record of [records.base, records.local, records.incoming]) {
    if (!record) continue;
    group.entries.delete(record.entry.path);
    Reflect.deleteProperty(group.metadata.formats, refFormatKey(record.value.reference));
  }
}

function recordInstallation(context: RefBackendContext, ref: string, group: CapturedWriteGroup,
  selected: IndexedRecord, retainMetadata: boolean): { reference: RecordReference; entry: RefTreeEntry; formatVersion: number } {
  const selectedFormat = group.metadata.formats[refFormatKey(selected.value.reference)] ?? 1;
  const reference = canonicalRecordReference(ref, group.metadata, selected.value.reference);
  const home = expandStoredPath(reference, { registry: context.registry, history: ref.startsWith("refs/arc/history/") });
  return { reference, entry: { ...selected.entry, path: home.path },
    formatVersion: retainMetadata ? selected.value.formatVersion : selectedFormat };
}

function indexRecords(context: RefBackendContext, ref: string, side: SyncTreeSide,
  objects: ReadonlyMap<string, BatchObject | null>): Map<string, IndexedRecord> {
  // A primary-less retired tree has no placement to expose; retain its entries in the opaque tree merge.
  if (ref.startsWith("refs/arc/history/work/") && !side.metadata.primary && !side.placement) return new Map();
  try { return indexRecordValues(context, ref, side, objects); }
  catch (error) {
    if (!(error instanceof ZodError) && !(error instanceof TypeError && "code" in error
      && error.code === "ERR_ENCODING_INVALID_ENCODED_DATA")) throw error;
    throw new RefSyncLabelError(ref, { code: "namespace-corrupt", class: "terminal", namespace: ref,
      condition: `A stored record on ${ref} cannot be decoded: ${error.message}`,
      remedy: { text: `Repair the malformed record on ${ref} forward in its source state, then retry the pull.` } });
  }
}

function indexRecordValues(context: RefBackendContext, ref: string, side: SyncTreeSide,
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
    const value = recordValue(reference, entry, object, side.metadata, formatVersion, primary, side.placement);
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
  formatVersion: number, primary: boolean, placement?: ReadPlacement): ConflictRecordValue {
  return ConflictRecordValueSchema.parse({ reference, content: new TextDecoder("utf-8", { fatal: true }).decode(object.bytes),
      version: refRecordVersion(reference, entry.oid, metadata, formatVersion), formatVersion,
      ...(placement ?? metadata.primary?.placement ?? metadata.placement) ? { placement: placement ?? metadata.primary?.placement ?? metadata.placement } : {},
      ...primary && metadata.primary?.links ? { links: metadata.primary.links } : {} });
}

function canonicalRecordReference(ref: string, metadata: RefMetadata, reference: RecordReference): RecordReference {
  const family = viewRefFamily(ref.replace("refs/arc/history/", "refs/arc/"));
  if (!family) throw new Error("A registered record lacks a containing family");
  return RecordReferenceSchema.parse({ ...reference,
    owner: reference.kind.startsWith("lineage/") ? reference.owner : refOwner(ref, family, metadata) });
}

function checkRecords(ref: string, metadata: RefMetadata, prior: IndexedRecord | undefined,
  next: IndexedRecord | undefined): SyncCheckRecord[] {
  if (prior && next && prior.value.reference.kind !== next.value.reference.kind) return [
    ...checkRecords(ref, metadata, prior, undefined), ...checkRecords(ref, metadata, undefined, next),
  ];
  const subject = next ?? prior;
  if (!subject) return [];
  return [{ reference: canonicalRecordReference(ref, metadata, subject.value.reference),
    ...prior ? { prior: prior.value } : {}, ...next ? { next: next.value } : {} }];
}
