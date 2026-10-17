/** Refresh every completed copy from the item's final retained history tree. */

import type { RefChange } from "../../git/ref-transaction.js";
import { canonicalize } from "../../kernel/canonical/canonical-json.js";
import type { RecordReference } from "../identity.js";
import type { BatchInput } from "../write.js";
import type { StoreResult } from "../refusal.js";
import { expandStoredPath } from "../stored-path.js";
import type { RefBackendContext } from "./context.js";
import { refWriteTargets, type ResolvedBatch } from "./write-resolution.js";
import type { ArchivedFolder } from "./archive-read.js";
import type { PreparedRefMutation } from "./write-merge.js";
import type { RefMetadata } from "./metadata.js";
import { readRefTrees, type RefTreeEntry } from "./batch-read.js";
import { commitRefTree, type RefWriteGroup } from "./write-commits.js";
import { writeRefBlob } from "./tree-write.js";

/** Stamp writes that keep the item completed, preserving its original end batch. */
export async function stampCompletedWrites(context: RefBackendContext, batch: ResolvedBatch, writes: readonly PreparedRefMutation[],
  groups: ReadonlyMap<string, RefWriteGroup>, batchId: string): Promise<void> {
  const refs = new Set((batch.archived ?? []).map(({ liveRef }) => liveRef.replace("refs/arc/", "refs/arc/history/")));
  for (const ref of refs) {
    const group = groups.get(ref), target = refWriteTargets(context, batch).find(({ home }) => home.ref === ref);
    if (!group || !target || group.viewRef) continue;
    const metadataOid = await writeRefBlob(context, canonicalize(group.metadata));
    const sameEntries = group.entries.size === group.original.size && [...group.entries].every(([path, entry]) =>
      group.original.get(path)?.oid === entry.oid && group.original.get(path)?.mode === entry.mode);
    if (!sameEntries || group.original.get(target.home.metadataPath)?.oid !== metadataOid || writes.some((write) => write.home.ref === ref && write.conflicts.length)) {
      group.metadata.batch = batchId;
    }
  }
}

/** Refresh every folder in the same transaction, composing with other quarter changes. */
export async function refreshCompletedChanges(context: RefBackendContext, changes: readonly RefChange[], batch: ResolvedBatch,
  groups: ReadonlyMap<string, RefWriteGroup>, provenance: BatchInput["provenance"], batchId: string): Promise<StoreResult<RefChange[]>> {
  const folders = (batch.archived ?? []).filter(({ liveRef }) => {
    const history = liveRef.replace("refs/arc/", "refs/arc/history/");
    return changes.some(({ ref }) => ref === history) && !groups.get(history)?.viewRef;
  });
  if (!folders.length) return { status: "ok", result: [...changes] };
  const refs = new Set(folders.map(({ ref }) => ref));
  const captured = await completedQuarterTrees(context, changes, batch, refs);
  if (captured.status === "refused") return captured;
  const quarters = captured.result;
  for (const folder of folders) {
    const history = folder.liveRef.replace("refs/arc/", "refs/arc/history/");
    const group = groups.get(history), entries = quarters.get(folder.ref);
    const reference = refWriteTargets(context, batch).find(({ home }) => home.ref === history)?.reference;
    if (!group || !entries || !reference) throw new Error("A completed write has no final history tree, quarter, or subject");
    await refreshFolder(context, folder, group, entries, reference);
  }
  const result = changes.filter(({ ref }) => !refs.has(ref));
  const identity = await context.identity(), actor = identity === null ? undefined : await context.actor(identity);
  const reference = batch.writes[0]?.mutation.reference;
  if (!reference) throw new Error("A completed batch has no mutation");
  for (const [ref, entries] of quarters) result.push({ ref,
    next: await commitRefTree(context, entries.values(), batch.tips.get(ref), provenance, reference, batchId, actor), expected: batch.tips.get(ref) ?? null });
  return { status: "ok", result };
}

async function completedQuarterTrees(context: RefBackendContext, changes: readonly RefChange[], batch: ResolvedBatch, refs: ReadonlySet<string>):
Promise<StoreResult<Map<string, Map<string, RefTreeEntry>>>> {
  const tips = new Map([...refs].map((ref) => {
    const change = changes.find((change) => change.ref === ref);
    const tip = change && "next" in change ? change.next : batch.tips.get(ref);
    if (!tip) throw new Error("A completed folder has no quarter tip");
    return [ref, tip];
  }));
  const trees = await readRefTrees(context, tips);
  const quarters = new Map<string, Map<string, RefTreeEntry>>();
  for (const ref of refs) {
    const entries = trees.get(ref);
    if (!entries) return { status: "refused", refusal: { code: "namespace-corrupt", class: "terminal", namespace: ref,
      condition: "The archive quarter's captured tree is unavailable.", remedy: { text: `Restore or fetch the missing objects for ${ref}, then retry the write.` } } };
    quarters.set(ref, new Map(entries.map((entry) => [entry.path, entry])));
  }
  return { status: "ok", result: quarters };
}

async function refreshFolder(context: RefBackendContext, folder: ArchivedFolder, group: RefWriteGroup,
  entries: Map<string, RefTreeEntry>, reference: RecordReference): Promise<void> {
  const home = expandStoredPath(reference, { registry: context.registry });
  for (const path of entries.keys()) if (path.startsWith(folder.root)) entries.delete(path);
  const metadata: RefMetadata = { ...group.metadata, endBatch: folder.metadata.endBatch };
  if (folder.placement.kind !== "completed") throw new Error("A completed folder has no completed placement");
  if (metadata.primary) metadata.primary = { ...metadata.primary, placement: { kind: "completed", quarter: folder.placement.quarter } };
  for (const entry of group.entries.values()) {
    if (entry.path === home.manifestPath.slice(0, -1) || entry.path.startsWith(home.manifestPath)) continue;
    const path = folder.root + entry.path;
    entries.set(path, { ...entry, path, ...(entry.path === home.metadataPath ? { oid: await writeRefBlob(context, canonicalize(metadata)) } : {}) });
  }
}
