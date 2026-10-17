/** Capture and combine published trees without changing the index or live refs. */

import type { RefBackendContext } from "./context.js";
import { readRefTrees, readBatchObjects, type RefTreeEntry, type BatchObject } from "./batch-read.js";
import { parseRefMetadata, type RefMetadata } from "./metadata.js";
import { viewRefFamily } from "./view-state.js";
import { refPrototype } from "./read.js";
import { refOwner } from "./codec.js";
import { RecordReferenceSchema, type RecordReference } from "../identity.js";
import { expandStoredPath } from "../stored-path.js";
import { corruptRef } from "./namespace-health.js";
import type { StoreResult } from "../refusal.js";
import { syncRefMergeBase } from "./sync-graph.js";
import { reconcileSyncRecords } from "./sync-records.js";
import { mergeSyncMetadata } from "./sync-metadata.js";
import { writeRefBlob } from "./tree-write.js";
import { isArchiveRef } from "./archive-read.js";
import { mergeArchiveTree } from "./sync-archive.js";
import type { ReadPlacement } from "../placement.js";
import { completeSyncPlacements } from "./sync-placement.js";
import { observeSyncChecks } from "./sync-checks.js";
import type { PullNotice } from "../sync.js";
import { canonicalize } from "../../kernel/canonical/canonical-json.js";

/** One immutable side's raw entries and validated group metadata. */
export interface SyncTreeSide { tip: string | null; entries: Map<string, RefTreeEntry>; metadata: RefMetadata; placement?: ReadPlacement }
/** Exact incoming tips and the side a lifecycle merge must preserve at a clash. */
export interface SyncTreeMergeScope { currentSide?: "local" | "incoming"; incoming?: ReadonlyMap<string, string>; batchId?: string; reopening?: boolean }
/** Prepared entries retain untouched blob identities and the provenance's actual owner. */
export interface SyncMergedTree { entries: Map<string, RefTreeEntry>; reference: RecordReference; metadata?: RefMetadata; notices?: PullNotice[] }

/** Merge independently changed tree entries and metadata over their captured common ancestor. */
export async function mergeSyncTree(context: RefBackendContext, ref: string, local: string, incoming: string, tips: ReadonlyMap<string, string>, scope: SyncTreeMergeScope = {}): Promise<StoreResult<SyncMergedTree>> {
  return isArchiveRef(ref) ? mergeArchiveTree(context, ref, local, incoming) : mergeGroupTree(context, ref, local, incoming, tips, scope);
}

async function mergeGroupTree(context: RefBackendContext, ref: string, local: string, incoming: string, captured: ReadonlyMap<string, string>, scope: SyncTreeMergeScope): Promise<StoreResult<SyncMergedTree>> {
  const live = ref.replace("refs/arc/history/", "refs/arc/"), family = viewRefFamily(live);
  if (!family) return { status: "refused", refusal: corruptRef(ref) };
  const prototype = refPrototype(context, live, family);
  const home = expandStoredPath(prototype, { registry: context.registry });
  const base = await syncRefMergeBase(context, local, incoming);
  const tips = new Map([["local", local], ["incoming", incoming], ...base ? [["base", base] as const] : []]);
  const trees = await readRefTrees(context, tips);
  const objects = await readBatchObjects(context, [...new Set([...trees.values()].flatMap((entries) => entries.map(({ oid }) => oid)))]);
  const sides: SyncTreeSide[] = [];
  for (const key of ["base", "local", "incoming"]) {
    if (key === "base" && !base) { sides.push({ tip: null, entries: new Map(), metadata: { formatVersion: 1, formats: {} } }); continue; }
    const entries = trees.get(key);
    const metadata = metadataAt(entries, objects, home.metadataPath, live);
    if (!entries || !metadata) return { status: "refused", refusal: corruptRef(ref, !entries) };
    sides.push({ tip: tips.get(key) ?? null, entries: new Map(entries.map((entry) => [entry.path, entry])), metadata });
  }
  if (!await completeSyncPlacements(context, ref, sides, [captured, scope.incoming ?? captured])) {
    return { status: "refused", refusal: corruptRef(ref) };
  }
  const currentSide = scope.currentSide ?? "incoming";
  const [previous, current, remote] = sides;
  if (!previous || !current || !remote) throw new Error("A reconciliation lacks one captured side");
  const preferred = currentSide === "local" ? current : remote, other = currentSide === "local" ? remote : current;
  const { metadata, conflicts } = mergeSyncMetadata(base ? previous.metadata : undefined, preferred.metadata, other.metadata);
  const entries = mergeEntries(previous, preferred, other);
  const records = await reconcileSyncRecords(context, ref, previous, current, remote, objects, { entries, metadata }, conflicts, currentSide);
  finishSyncMetadata(ref, metadata, current.metadata, scope);
  entries.set(home.metadataPath, { path: home.metadataPath, mode: "100644", oid: await writeRefBlob(context, canonicalize(metadata)) });
  const notices = await observeSyncChecks(context, captured, ref, { entries, metadata, original: current.entries }, records);
  return { status: "ok", result: { entries, metadata, notices, reference: RecordReferenceSchema.parse({ ...prototype, owner: refOwner(live, family, metadata) }) } };
}

function finishSyncMetadata(ref: string, metadata: RefMetadata, local: RefMetadata, scope: SyncTreeMergeScope): void {
  if (scope.reopening) {
    delete metadata.endBatch;
    delete metadata.batch;
    if (metadata.primary && local.primary) metadata.primary = { ...metadata.primary, placement: local.primary.placement };
  } else if (ref.startsWith("refs/arc/history/") && scope.batchId) metadata.batch = scope.batchId;
}

function mergeEntries(base: SyncTreeSide, current: SyncTreeSide, incoming: SyncTreeSide): Map<string, RefTreeEntry> {
  const entries = new Map<string, RefTreeEntry>();
  for (const path of new Set([...base.entries.keys(), ...current.entries.keys(), ...incoming.entries.keys()])) {
    const before = base.entries.get(path), here = current.entries.get(path), there = incoming.entries.get(path);
    const selected = sameEntry(here, before) ? there : here;
    if (selected) entries.set(path, selected);
  }
  return entries;
}

function metadataAt(entries: readonly RefTreeEntry[] | undefined, objects: ReadonlyMap<string, BatchObject | null>, path: string, ref: string): RefMetadata | null {
  const entry = entries?.find((candidate) => candidate.path === path);
  return parseRefMetadata(entry ? objects.get(entry.oid) : null, ref);
}

function sameEntry(left: RefTreeEntry | undefined, right: RefTreeEntry | undefined): boolean {
  return left?.oid === right?.oid && left?.mode === right?.mode;
}
