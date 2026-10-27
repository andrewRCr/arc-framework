/** Reconcile complete entry documents with the original write removed. */

import { mergeEntryText, type MergeTextResult } from "../concurrency/index.js";
import { expandStoredPath } from "../stored-path.js";
import type { RefBackendContext } from "./context.js";
import type { BatchObject, RefTreeEntry } from "./batch-read.js";
import { refPrototype } from "./read.js";
import { viewRefFamily } from "./view-state.js";
import { decodeReference, refOwner } from "./codec.js";
import { parseRefMetadata } from "./metadata.js";
import type { EntryConfig } from "../registry.js";
import type { RecordReference, RecordVersion } from "../identity.js";
import type { WithdrawJournalStep } from "./sync-withdraw-journal.js";
import { readStoredMergeLabel } from "./side-labels.js";
import type { SideLabel } from "../conflict.js";
import { refRecordVersion } from "./record-version.js";
import { refFormatKey } from "./format-key.js";
import { RefSyncLabelError } from "./sync-label.js";
import { corruptRef } from "./namespace-health.js";

/** The original write and the independently published and locally merged records. */
export interface WithdrawEntrySides {
  before?: RefTreeEntry; after?: RefTreeEntry; current?: RefTreeEntry; published?: RefTreeEntry; ancestor?: RefTreeEntry;
}

/** First preserve pre-batch and published changes, then replay the surrounding local changes. */
export async function inverseEntryDocument(context: RefBackendContext, step: WithdrawJournalStep, path: string, sides: WithdrawEntrySides,
  objects: ReadonlyMap<string, BatchObject | null>): Promise<MergeTextResult | undefined> {
  if (!sides.current || !sides.after) return undefined;
  const definition = entryDefinition(context, step.ref, path, step.after, objects);
  if (!definition) return undefined;
  const before = content(sides.before, objects), after = content(sides.after, objects), current = content(sides.current, objects);
  const published = content(sides.published, objects), ancestor = content(sides.ancestor, objects);
  const beforeLabel = await entryLabel(context, step.beforeTip ?? step.afterTip, path);
  const publishedLabel = step.publishedTip ? await entryLabel(context, step.publishedTip, path) : beforeLabel;
  const currentLabel = current === published ? publishedLabel : step.currentTip ? await entryLabel(context, step.currentTip, path) : beforeLabel;
  const input = { record: definition.reference, currentLabel: beforeLabel, incomingLabel: publishedLabel };
  const baseVersion = entryVersion(step.ref, definition, sides.ancestor, step.ancestor, objects);
  const afterVersion = entryVersion(step.ref, definition, sides.after, step.after, objects);
  const without = mergeEntryText({ ...input, baseVersion, base: ancestor, current: before, incoming: published }, definition.grammar);
  const inverse = mergeEntryText({ ...input, baseVersion: afterVersion, base: after, current, incoming: without.content, currentLabel,
    incomingLabel: without.content === published ? publishedLabel : beforeLabel }, definition.grammar);
  return { content: inverse.content, conflicts: [...without.conflicts, ...inverse.conflicts] };
}

interface EntryDefinition { grammar: EntryConfig; reference: RecordReference; metadataPath: string }

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
function entryVersion(ref: string, definition: EntryDefinition, entry: RefTreeEntry | undefined,
  entries: ReadonlyMap<string, RefTreeEntry>, objects: ReadonlyMap<string, BatchObject | null>): RecordVersion | null {
  if (!entry) return null;
  const stored = entries.get(definition.metadataPath), metadata = parseRefMetadata(stored ? objects.get(stored.oid) : undefined);
  if (!metadata) throw new RefSyncLabelError(ref, corruptRef(ref, false, true));
  return refRecordVersion(definition.reference, entry.oid, metadata, metadata.formats[refFormatKey(definition.reference)] ?? 1);
}
function content(entry: RefTreeEntry | undefined, objects: ReadonlyMap<string, BatchObject | null>): string {
  if (!entry) return "";
  const object = objects.get(entry.oid);
  if (object?.type !== "blob") throw new Error("A withdrawn entry document is unavailable");
  return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(object.bytes);
}
async function entryLabel(context: RefBackendContext, tip: string, path: string): Promise<SideLabel> {
  const { stdout } = await context.exec("git", ["log", "-1", "--format=%H", tip, "--", `:(literal)${path}`],
    { cwd: context.checkoutRoot, objectAccess: "local-only" });
  return readStoredMergeLabel(context, stdout.trim() || tip);
}
