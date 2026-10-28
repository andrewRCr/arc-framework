/** Keep selected withdrawal bytes and their registered per-record format together. */

import type { RecordReference } from "../identity.js";
import type { FamilyId } from "../catalog.js";
import { expandStoredPath } from "../stored-path.js";
import type { BatchObject, RefTreeEntry } from "./batch-read.js";
import type { RefBackendContext } from "./context.js";
import { decodeReference, refOwner } from "./codec.js";
import { refFormatKey } from "./format-key.js";
import { fixedStoredPathKind } from "./path-decode.js";
import { parseRefMetadata, type RefMetadata } from "./metadata.js";
import { corruptRef } from "./namespace-health.js";
import { refPrototype } from "./read.js";
import { RefSyncLabelError } from "./sync-label.js";
import { viewRefFamily } from "./view-state.js";

export interface WithdrawRecordDefinition { reference: RecordReference; metadataPath: string }
export interface WithdrawRecordFormat { path: string; selected?: RefTreeEntry; metadataPath: string; key: string; version?: number }

/** A matching published value preserves a contribution only when it changed from the captured ancestor. */
export function independentlyPublished<T>(after: T, published: T, ancestor: T, equalFn: (left: T, right: T) => boolean): boolean {
  return equalFn(after, published) && !equalFn(published, ancestor);
}

/** Classify admitted paths from genuine metadata, decoding a conflict target only when its owner requires it. */
export function withdrawRecordDefinition(context: RefBackendContext, ref: string, path: string,
  snapshots: readonly ReadonlyMap<string, RefTreeEntry>[], objects: ReadonlyMap<string, BatchObject | null>): WithdrawRecordDefinition | undefined {
  if (snapshots.some(entries => entries.get(path)?.invalidName)) return undefined;
  const live = ref.replace("refs/arc/history/", "refs/arc/"), family = viewRefFamily(live);
  if (!family) return undefined;
  const home = expandStoredPath(refPrototype(context, live, family), { registry: context.registry });
  if (path === home.metadataPath) return undefined;
  for (const entries of snapshots) {
    const stored = entries.get(home.metadataPath), metadata = parseRefMetadata(stored ? objects.get(stored.oid) : undefined, ref);
    if (!metadata) continue;
    const reference = capturedReference(context, live, family, path, metadata, entries, objects);
    if (reference) return { reference, metadataPath: home.metadataPath };
  }
  return undefined;
}

/** Lineage conflicts retain their target owner's identity in their real stored payload. */
function capturedReference(context: RefBackendContext, live: string, family: FamilyId, path: string, metadata: RefMetadata,
  entries: ReadonlyMap<string, RefTreeEntry>, objects: ReadonlyMap<string, BatchObject | null>): RecordReference | undefined {
  const owner = refOwner(live, family, metadata);
  let reference = decodeReference(context, owner, family, path, metadata);
  if (!reference && fixedStoredPathKind(context.registry, family, path) === "lineage/conflict-record") {
    const entry = entries.get(path), object = entry ? objects.get(entry.oid) : undefined;
    if (object?.type === "blob") reference = decodeReference(context, owner, family, path, metadata, object);
  }
  return reference && "owner" in reference ? reference : undefined;
}

/** Required metadata is strict; only an absent coordinate means the initial format version. */
export function withdrawRecordMetadata(ref: string, definition: WithdrawRecordDefinition, entries: ReadonlyMap<string, RefTreeEntry>,
  objects: ReadonlyMap<string, BatchObject | null>): { metadata: RefMetadata; formatVersion: number } {
  const stored = entries.get(definition.metadataPath), metadata = parseRefMetadata(stored ? objects.get(stored.oid) : undefined, ref);
  if (!metadata) throw new RefSyncLabelError(ref, corruptRef(ref, false, true));
  return { metadata, formatVersion: metadata.formats[refFormatKey(definition.reference)] ?? 1 };
}

/** Presence, blob, mode, and the record's own format determine generic selection. */
export function sameWithdrawRecord(ref: string, path: string, definition: WithdrawRecordDefinition | undefined,
  left: ReadonlyMap<string, RefTreeEntry>, right: ReadonlyMap<string, RefTreeEntry>, objects: ReadonlyMap<string, BatchObject | null>): boolean {
  const a = left.get(path), b = right.get(path);
  const aFormat = a && definition ? withdrawRecordMetadata(ref, definition, left, objects).formatVersion : undefined;
  const bFormat = b && definition ? withdrawRecordMetadata(ref, definition, right, objects).formatVersion : undefined;
  return a?.oid === b?.oid && a?.mode === b?.mode && aFormat === bFormat;
}

/** Replay the selected coordinate after the independent structural metadata inverse. */
export function selectedWithdrawFormat(ref: string, path: string, definition: WithdrawRecordDefinition,
  selected: ReadonlyMap<string, RefTreeEntry>, objects: ReadonlyMap<string, BatchObject | null>): WithdrawRecordFormat {
  return { path, selected: selected.get(path), metadataPath: definition.metadataPath, key: refFormatKey(definition.reference),
    version: selected.has(path) ? withdrawRecordMetadata(ref, definition, selected, objects).formatVersion : undefined };
}
