/** Reconcile complete entry documents with the original write removed. */

import { mergeEntryText } from "../concurrency/index.js";
import { entryIdProblem } from "../concurrency/entry-ids.js";
import { expandStoredPath } from "../stored-path.js";
import type { RefBackendContext } from "./context.js";
import type { BatchObject, RefTreeEntry } from "./batch-read.js";
import { refPrototype } from "./read.js";
import { viewRefFamily } from "./view-state.js";
import { decodeReference, refOwner } from "./codec.js";
import { parseRefMetadata, type RefMetadata } from "./metadata.js";
import type { EntryConfig } from "../registry.js";
import type { RecordReference } from "../identity.js";
import type { WithdrawJournalStep } from "./sync-withdraw-journal.js";
import { readStoredMergeLabel } from "./side-labels.js";
import { ConflictRecordValueSchema, type ConflictRecordValue, type ConflictRecord, type SideLabel } from "../conflict.js";
import { refRecordVersion } from "./record-version.js";
import { refFormatKey } from "./format-key.js";
import { RefSyncLabelError } from "./sync-label.js";
import { corruptRef } from "./namespace-health.js";
import { writeRefBlob } from "./tree-write.js";
import { completeSyncPlacements } from "./sync-placement.js";
import { readSyncRefs } from "./sync-graph.js";
import type { SyncTreeSide } from "./sync-tree.js";

/** Applied absence is distinct from an inapplicable entry inverse and from present empty bytes. */
export interface WithdrawEntryResult {
  selected?: RefTreeEntry; conflicts: ConflictRecord[];
  retainedFormat?: { metadataPath: string; key: string; version?: number };
}
interface EntryDefinition { grammar: EntryConfig; reference: RecordReference; metadataPath: string }
interface EntryDocument { entry: RefTreeEntry; content: string; metadata: RefMetadata; formatVersion: number; invalidIds: boolean }
interface EntryStage { selected?: EntryDocument; conflicts: ConflictRecord[]; retainMetadata?: boolean }
type EntrySource = "ancestor" | "before" | "after" | "current" | "published";

/** First preserve pre-batch and published changes, then replay the surrounding local changes. */
export async function inverseEntryDocument(context: RefBackendContext, step: WithdrawJournalStep, path: string,
  currentEntries: ReadonlyMap<string, RefTreeEntry>, publishedEntries: ReadonlyMap<string, RefTreeEntry>,
  objects: ReadonlyMap<string, BatchObject | null>): Promise<WithdrawEntryResult | undefined> {
  // A whole-document removal or later recreation keeps the existing generic inverse policy.
  if (!currentEntries.has(path) || !step.after.has(path)) return undefined;
  const definition = [step.after, step.before, currentEntries, publishedEntries]
    .map(entries => entryDefinition(context, step.ref, path, entries, objects)).find(value => value !== undefined);
  if (!definition) return undefined;
  const originals: readonly (readonly [EntrySource, ReadonlyMap<string, RefTreeEntry>])[] = [
    ["ancestor", step.ancestor], ["before", step.before], ["after", step.after], ["current", currentEntries], ["published", publishedEntries],
  ];
  const [ancestor, before, after, current, published] = originals
    .map(([source, entries]) => entryDocument(step.ref, definition, path, entries, objects, source));
  const beforeLabel = await entryLabel(context, step.beforeTip || step.afterTip, path);
  const publishedLabel = step.publishedTip ? await entryLabel(context, step.publishedTip, path) : beforeLabel;
  const currentLabel = sameDocument(current, published) ? publishedLabel : step.currentTip
    ? await entryLabel(context, step.currentTip, path) : beforeLabel;
  const without = await mergeDocumentStage(context, step.ref, definition, ancestor, before, published, beforeLabel, publishedLabel);
  const inverse = await mergeDocumentStage(context, step.ref, definition, after, current, without.selected, currentLabel,
    sameDocument(without.selected, published) ? publishedLabel : beforeLabel);
  return { selected: inverse.selected?.entry,
    ...inverse.retainMetadata ? { retainedFormat: { metadataPath: definition.metadataPath, key: refFormatKey(definition.reference),
      version: inverse.selected?.formatVersion } } : {},
    conflicts: [...without.conflicts, ...inverse.conflicts] };
}

/** Use the existing current-side policy for whole-record clashes, including explicit absence. */
async function mergeDocumentStage(context: RefBackendContext, ref: string, definition: EntryDefinition,
  base: EntryDocument | undefined, current: EntryDocument | undefined, incoming: EntryDocument | undefined,
  currentLabel: SideLabel, incomingLabel: SideLabel): Promise<EntryStage> {
  if (sameDocument(current, base)) return { selected: incoming, conflicts: [] };
  if (sameDocument(incoming, base) || sameDocument(current, incoming)) return { selected: current, conflicts: [] };
  if (!current || !incoming || [base, current, incoming].some(document => document?.invalidIds)) {
    const [original, left, right] = await Promise.all([
      conflictValue(context, ref, definition, base), conflictValue(context, ref, definition, current), conflictValue(context, ref, definition, incoming),
    ]);
    return { selected: current, retainMetadata: true, conflicts: [{ record: definition.reference, location: { kind: "record" }, base: original,
      current: { value: left, label: currentLabel }, incoming: { value: right, label: incomingLabel } }] };
  }
  const merged = mergeEntryText({ record: definition.reference, base: base?.content ?? "", current: current.content,
    incoming: incoming.content, baseVersion: base ? documentVersion(definition, base) : null, currentLabel, incomingLabel }, definition.grammar);
  const entry = { ...current.entry, oid: await writeRefBlob(context, merged.content) };
  return { selected: { ...current, entry, content: merged.content, invalidIds: entryIdProblem(merged.content, definition.grammar) !== undefined },
    conflicts: merged.conflicts };
}

function sameDocument(left: EntryDocument | undefined, right: EntryDocument | undefined): boolean {
  return left === undefined || right === undefined ? left === right : left.content === right.content
    && left.entry.mode === right.entry.mode && left.formatVersion === right.formatVersion;
}

async function conflictValue(context: RefBackendContext, ref: string, definition: EntryDefinition,
  document: EntryDocument | undefined): Promise<ConflictRecordValue | null> {
  if (!document) return null;
  const { metadata, formatVersion, entry, content } = document;
  const side: SyncTreeSide = { tip: null, metadata, entries: new Map([[entry.path, entry]]) };
  const storedPlacement = metadata.primary?.placement ?? metadata.placement;
  if (storedPlacement?.kind === "completed" && metadata.primary?.role !== "work-item/record"
    && !await completeSyncPlacements(context, ref, [side], [await readSyncRefs(context, "refs/arc/")])) throw new RefSyncLabelError(ref);
  const placement = side.placement ?? storedPlacement;
  return ConflictRecordValueSchema.parse({ reference: definition.reference, content, version: documentVersion(definition, document), formatVersion,
    ...placement ? { placement } : {} });
}

function entryDefinition(context: RefBackendContext, ref: string, path: string,
  entries: ReadonlyMap<string, RefTreeEntry>, objects: ReadonlyMap<string, BatchObject | null>): EntryDefinition | undefined {
  const live = ref.replace("refs/arc/history/", "refs/arc/"), family = viewRefFamily(live);
  if (!family) return undefined;
  const prototype = refPrototype(context, live, family), home = expandStoredPath(prototype, { registry: context.registry });
  const metadataEntry = entries.get(home.metadataPath), metadata = parseRefMetadata(metadataEntry ? objects.get(metadataEntry.oid) : undefined);
  if (!metadata) return undefined;
  const reference = decodeReference(context, refOwner(live, family, metadata), family, path, metadata);
  if (!reference || !("owner" in reference)) return undefined;
  const grammar = context.registry[reference.kind].entry;
  return grammar ? { reference, grammar, metadataPath: home.metadataPath } : undefined;
}

function entryDocument(ref: string, definition: EntryDefinition, path: string, entries: ReadonlyMap<string, RefTreeEntry>,
  objects: ReadonlyMap<string, BatchObject | null>, source: EntrySource): EntryDocument | undefined {
  const entry = entries.get(path);
  if (!entry) return undefined;
  const stored = entries.get(definition.metadataPath), metadata = parseRefMetadata(stored ? objects.get(stored.oid) : undefined);
  if (!metadata) throw new RefSyncLabelError(ref, corruptRef(ref, false, true));
  const object = objects.get(entry.oid);
  if (object?.type !== "blob") throw new RefSyncLabelError(ref, corruptRef(ref, true));
  const content = decodeEntryBytes(ref, entry, object.bytes, source);
  return { entry, content, metadata, formatVersion: metadata.formats[refFormatKey(definition.reference)] ?? 1,
    invalidIds: entryIdProblem(content, definition.grammar) !== undefined };
}


/** Invalid stored UTF-8 is required namespace evidence, never a normalized text alternative. */
function decodeEntryBytes(ref: string, entry: RefTreeEntry, bytes: Uint8Array, source: EntrySource): string {
  try { return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch (error) {
    if (!(error instanceof TypeError) || !("code" in error) || error.code !== "ERR_ENCODING_INVALID_ENCODED_DATA") throw error;
    const historical = source !== "current" && source !== "published";
    throw new RefSyncLabelError(ref, { code: "namespace-corrupt", class: "terminal", namespace: ref,
      condition: `The ${source} entry document at ${ref}:${entry.path} (blob ${entry.oid}) cannot be decoded as UTF-8.`,
      remedy: { text: historical
        ? `The saved ${source} snapshot is immutable; a forward edit cannot change its bytes. Retain the damaged evidence and explicitly replace the unpublished lifecycle contribution using readable saved history, preserving every other batch write, then retry. A corrupt published common ancestor requires a genuinely readable common basis before reconstructing the unpublished end.`
        : `Repair the ${source} source ref ${ref} forward with a new commit containing valid UTF-8. For a published source, publish that repair and pull again. Retry the withdrawal only with readable saved original states too.` } });
  }
}

function documentVersion(definition: EntryDefinition, document: EntryDocument) {
  return refRecordVersion(definition.reference, document.entry.oid, document.metadata, document.formatVersion);
}

async function entryLabel(context: RefBackendContext, tip: string, path: string): Promise<SideLabel> {
  const { stdout } = await context.exec("git", ["log", "-1", "--format=%H", tip, "--", `:(literal)${path}`],
    { cwd: context.checkoutRoot, objectAccess: "local-only" });
  return readStoredMergeLabel(context, stdout.trim() || tip);
}
