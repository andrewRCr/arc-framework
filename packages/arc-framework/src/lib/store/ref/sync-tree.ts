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
import { canonicalize } from "../../kernel/canonical/canonical-json.js";

/** One immutable side's raw entries and validated group metadata. */
export interface SyncTreeSide { tip: string | null; entries: Map<string, RefTreeEntry>; metadata: RefMetadata }
/** Prepared entries retain untouched blob identities and the provenance's actual owner. */
export interface SyncMergedTree { entries: Map<string, RefTreeEntry>; reference: RecordReference }

/** Merge independently changed tree entries and metadata over their captured common ancestor. */
export async function mergeSyncTree(context: RefBackendContext, ref: string, local: string, incoming: string): Promise<StoreResult<SyncMergedTree>> {
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
  const [previous, current, remote] = sides;
  if (!previous || !current || !remote) throw new Error("A reconciliation lacks one captured side");
  const { metadata, conflicts } = mergeSyncMetadata(base ? previous.metadata : undefined, current.metadata, remote.metadata);
  const entries = new Map<string, RefTreeEntry>();
  for (const path of new Set([...previous.entries.keys(), ...current.entries.keys(), ...remote.entries.keys()])) {
    const before = previous.entries.get(path), here = current.entries.get(path), there = remote.entries.get(path);
    const selected = sameEntry(here, before) ? there : here;
    if (selected) entries.set(path, selected);
  }
  await reconcileSyncRecords(context, ref, previous, current, remote, objects, { entries, metadata }, conflicts);
  entries.set(home.metadataPath, { path: home.metadataPath, mode: "100644", oid: await writeRefBlob(context, canonicalize(metadata)) });
  return { status: "ok", result: { entries, reference: RecordReferenceSchema.parse({ ...prototype, owner: refOwner(live, family, metadata) }) } };
}

function metadataAt(entries: readonly RefTreeEntry[] | undefined, objects: ReadonlyMap<string, BatchObject | null>, path: string, ref: string): RefMetadata | null {
  const entry = entries?.find((candidate) => candidate.path === path);
  return parseRefMetadata(entry ? objects.get(entry.oid) : null, ref);
}

function sameEntry(left: RefTreeEntry | undefined, right: RefTreeEntry | undefined): boolean {
  return left?.oid === right?.oid && left?.mode === right?.mode;
}
