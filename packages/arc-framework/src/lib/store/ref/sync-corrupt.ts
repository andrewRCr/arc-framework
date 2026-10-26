/** Preserve item lifecycle coordinates when unreadable shared evidence obscures an end. */

import type { PullNotice } from "../sync.js";
import type { RefBackendContext } from "./context.js";
import { archivedFolders, archiveOwnerTrees, isArchiveRef, isArchiveMetadataPath } from "./archive-read.js";
import { checkSyncRefTip } from "./sync-tip.js";
import { readUnpublishedRefBatches, expandRefBatchExclusion, type UnpublishedRefCommit } from "./sync-batches.js";
import { syncRefIsAncestor } from "./sync-graph.js";
import { readBatchObjects, readRefTrees, type RefTreeEntry, type BatchObject } from "./batch-read.js";
import { refPrototype } from "./read.js";
import { corruptRef } from "./namespace-health.js";
import { readLineageOwners } from "./lineage-resolution.js";
import { holdLifecycleRef, lifecycleRefHeld } from "./sync-lifecycle-holds.js";
import { isUnavailableGraphFailure } from "./history-graph.js";

/** Unreadable archive or lineage evidence holds potentially affected item refs until repair. */
export async function readCorruptLifecycleBatchRefs(context: RefBackendContext, held: ReadonlyMap<string, string>,
  incoming: ReadonlyMap<string, string>, previous: ReadonlyMap<string, string>,
  blocked: Set<string>): Promise<{ refs: Set<string>; notices: PullNotice[] }> {
  const tracking = new Map([...previous, ...incoming]);
  const { refs, notices } = await incomingArchiveHolds(context, held, tracking);
  const lineage = await incomingLineageHolds(context, held, incoming);
  for (const ref of lineage.refs) refs.add(ref);
  notices.push(...lineage.notices);
  if (!await hasCompetingHistory(context, held, tracking, blocked, notices)) return { refs, notices };
  for (const [ref, tip] of held) {
    if (!isArchiveRef(ref)) continue;
    const refusal = await checkSyncRefTip(context, ref, tip);
    if (!refusal) continue;
    refs.add(ref);
    notices.push({ kind: "namespace-corrupt", ref, condition: refusal.condition, remedy: refusal.remedy });
  }
  if (refs.size) {
    const changes = [...held].filter(([ref, tip]) => tracking.get(ref) !== tip).map(([ref, next]) => ({ ref, next }));
    const batches = await readUnpublishedRefBatches(context, { local: held, tracking, changes });
    if (batches.status === "ok") appendArchiveHolds(refs, notices, batches.result);
    else for (const { ref } of changes) {
      refs.add(ref);
      notices.push({ kind: "namespace-corrupt", ref,
        condition: `Unpublished batch membership cannot be established for ${ref}. ${batches.refusal.condition}`,
        remedy: batches.refusal.remedy });
    }
  }
  return { refs, notices };
}

async function incomingLineageHolds(context: RefBackendContext, held: ReadonlyMap<string, string>,
  incoming: ReadonlyMap<string, string>): Promise<{ refs: Set<string>; notices: PullNotice[] }> {
  const refs = new Set<string>(), notices: PullNotice[] = [];
  const lineage = await readLineageOwners(context, incoming);
  if (lineage.status === "ok") return { refs, notices };
  const items = new Set([...held.keys()].filter(ref => /^refs\/arc\/(?:history\/)?work\//u.test(ref))
    .map(ref => ref.replace("refs/arc/history/", "refs/arc/")));
  for (const live of items) {
    if (incoming.has(live)) continue;
    refs.add(live); refs.add(live.replace("refs/arc/", "refs/arc/history/"));
    notices.push({ kind: "namespace-corrupt", ref: live,
      condition: `${live} remains held until incoming refs/arc/project/registry can establish its lifecycle evidence. ${lineage.refusal.condition}`,
      remedy: lineage.refusal.remedy });
  }
  return { refs, notices };
}

async function incomingArchiveHolds(context: RefBackendContext, held: ReadonlyMap<string, string>,
  incoming: ReadonlyMap<string, string>): Promise<{ refs: Set<string>; notices: PullNotice[] }> {
  const refs = new Set<string>(), notices: PullNotice[] = [];
  // History-only owners are already ended; history reconciliation checks the quarters a merge would change.
  const items = new Set([...held.keys()].filter(ref => /^refs\/arc\/(?:work|cohort)\//u.test(ref)));
  if (!items.size) return { refs, notices };
  const quarters = new Map([...incoming].filter(([ref]) => isArchiveRef(ref)));
  const trees = await readRefTrees(context, quarters);
  const objects = await readBatchObjects(context, [...new Set([...trees.values()]
    .flatMap(entries => entries.filter(({ path }) => isArchiveMetadataPath(path)).map(({ oid }) => oid)))]);
  for (const [ref, tip] of quarters) {
    const entries = trees.get(ref);
    if (entries && (["work-item", "cohort"] as const).every(family => archivedFolders(family, ref, entries, objects).diagnostics.length === 0)) continue;
    const repair = held.get(ref);
    if (repair && repair !== tip && !await checkSyncRefTip(context, ref, repair)
      && await provedArchiveRepair(context, tip, repair)) continue;
    const affected = incomingArchiveNotices(context, ref, entries, objects, items);
    notices.push(...affected);
    for (const notice of affected) { refs.add(notice.ref); refs.add(notice.ref.replace("refs/arc/", "refs/arc/history/")); }
  }
  return { refs, notices };
}

async function provedArchiveRepair(context: RefBackendContext, damaged: string, repair: string): Promise<boolean> {
  try { return await syncRefIsAncestor(context, damaged, repair); }
  catch (error) {
    if (!await isUnavailableGraphFailure(context, error)) throw error;
    return false;
  }
}

function incomingArchiveNotices(context: RefBackendContext, ref: string, entries: readonly RefTreeEntry[] | undefined,
  objects: ReadonlyMap<string, BatchObject | null>, items: ReadonlySet<string>): Extract<PullNotice, { kind: "namespace-corrupt" }>[] {
  const notices: Extract<PullNotice, { kind: "namespace-corrupt" }>[] = [];
  for (const live of items) {
    const family = live.startsWith("refs/arc/cohort/") ? "cohort" : "work-item";
    const owner = refPrototype(context, live, family).owner;
    const own = entries ? archiveOwnerTrees(new Map([[ref, entries]]), [owner]).get(ref) : undefined;
    if (entries && !own?.length) continue;
    const diagnostic = own ? archivedFolders(family, ref, own, objects).diagnostics[0] : corruptRef(ref, true);
    if (!diagnostic) continue;
    notices.push({ kind: "namespace-corrupt", ref: live,
      condition: `${live} remains held until incoming ${ref} can establish its lifecycle evidence. ${diagnostic.condition}`,
      remedy: diagnostic.remedy });
  }
  return notices;
}

function appendArchiveHolds(refs: Set<string>, notices: PullNotice[], batches: ReadonlyMap<string, readonly UnpublishedRefCommit[]>): void {
  for (const notice of [...notices]) {
    if (notice.kind !== "namespace-corrupt") continue;
    const affected = new Set([notice.ref]);
    expandRefBatchExclusion(affected, batches);
    for (const ref of affected) {
      refs.add(ref);
      if (!/^refs\/arc\/(?:history\/)?(?:work|cohort)\//u.test(ref)) continue;
      notices.push({ kind: "namespace-corrupt", ref,
        condition: `${ref} remains held until ${notice.ref} is repaired. ${notice.condition}`, remedy: notice.remedy });
    }
  }
}

async function hasCompetingHistory(context: RefBackendContext, held: ReadonlyMap<string, string>,
  tracking: ReadonlyMap<string, string>, blocked: Set<string>, notices: PullNotice[]): Promise<boolean> {
  for (const [ref, tip] of held) {
    if (!/^refs\/arc\/history\/(work|cohort)\//u.test(ref)) continue;
    if (lifecycleRefHeld(blocked, ref)) continue;
    if (tracking.has(ref.replace("refs/arc/history/", "refs/arc/"))) return true;
    const published = tracking.get(ref);
    if (!published || published === tip) continue;
    const compared = await compareHeldHistory(context, tip, published);
    if (compared === "competing") return true;
    if (compared === "unavailable") {
      holdLifecycleRef(blocked, ref);
      const live = ref.replace("refs/arc/history/", "refs/arc/");
      notices.push({ kind: "namespace-corrupt", ref: live, condition: `Lifecycle history for ${live} is unavailable locally.`,
        remedy: corruptRef(ref, true).remedy });
    }
  }
  return false;
}

async function compareHeldHistory(context: RefBackendContext, held: string, published: string): Promise<"aligned" | "competing" | "unavailable"> {
  try {
    return await syncRefIsAncestor(context, held, published) || await syncRefIsAncestor(context, published, held) ? "aligned" : "competing";
  } catch (error) {
    if (!await isUnavailableGraphFailure(context, error)) throw error;
    return "unavailable";
  }
}
