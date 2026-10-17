/** Lifecycle decisions from held records and exact captured item histories. */

import type { RefBackendContext } from "./context.js";
import { archivedFolders, isArchiveRef, type ArchivedFolder } from "./archive-read.js";
import { readBatchObjects, readRefTrees } from "./batch-read.js";
import { parseStoreCommitProvenance } from "../commit-provenance.js";
import { RecordReferenceSchema, type OwnerIdentity } from "../identity.js";
import { HistoryRefSchema, type HistoryRef } from "../refusal.js";
import { readLineageOwners } from "./lineage-resolution.js";
import { readItemEndBatches } from "./sync-lifecycle-log.js";

/** A record requiring a held item to incorporate its end before publication. */
export interface PendingRefEnd { live: string; history: HistoryRef; owner: OwnerIdentity; ownReopen?: boolean }

/** The caller defines publication for its pull source or isolated copy destination. */
export type RefEndPublished = (live: string, history: string, batch: string, owner: OwnerIdentity) => Promise<boolean>;

/** Resolve publication from both captured item namespaces, without consulting moving ref names. */
export function refEndPublished(context: RefBackendContext, incoming: ReadonlyMap<string, string>,
  previous: ReadonlyMap<string, string> = new Map()): RefEndPublished {
  let folders: ReturnType<typeof readLifecycleFolders> | undefined;
  return async (live, history, batch, owner) => {
    for (const tip of new Set([incoming.get(live), incoming.get(history), previous.get(live), previous.get(history)])) {
      if ((await lifecycleBatches(context, tip, owner)).has(batch)) return true;
    }
    folders ??= readLifecycleFolders(context, incoming);
    return (await folders).some((folder) => folder.liveRef === live && folder.metadata.endBatch === batch);
  };
}

/** An unpublished end still needs its record and an end absent from both published item tips. */
export async function hasOwnRefEnd(context: RefBackendContext, held: ReadonlyMap<string, string>, live: string,
  folders: readonly ArchivedFolder[], published: RefEndPublished): Promise<boolean> {
  const history = live.replace("refs/arc/", "refs/arc/history/");
  for (const folder of folders.filter((folder) => folder.liveRef === live)) {
    const batch = folder.metadata.endBatch;
    if (batch && (await lifecycleBatches(context, held.get(history), folder.owner)).has(batch)
      && !await published(live, history, batch, folder.owner)) return true;
  }
  const lineage = await readLineageOwners(context, held);
  const owner = lineage.status === "ok" ? lineage.result.find((owner) => "uid" in owner && live === `refs/arc/work/${owner.uid}`) : undefined;
  if (owner) for (const batch of await readItemEndBatches(context, held.get(history), owner, "retirement")) {
    if (!await published(live, history, batch, owner)) return true;
  }
  return false;
}

/** A local reopen is unpublished only while the incoming quarter still holds the removed folder. */
export async function readOwnRefReopens(context: RefBackendContext, held: ReadonlyMap<string, string>,
  incoming: ReadonlyMap<string, string>): Promise<Set<string>> {
  const local = new Set((await readLifecycleFolders(context, held)).map(({ liveRef }) => liveRef));
  return new Set((await readLifecycleFolders(context, incoming)).filter(({ liveRef }) => held.has(liveRef) && !local.has(liveRef))
    .map(({ liveRef }) => liveRef));
}

/** An old lineage end cannot undo a held unpublished reopen; only this pull's fetched later end can. */
export async function resolvePendingRefEnds(context: RefBackendContext, pending: readonly PendingRefEnd[],
  held: ReadonlyMap<string, string>, fetched: ReadonlyMap<string, string>): Promise<PendingRefEnd[]> {
  const result: PendingRefEnd[] = [];
  for (const end of pending) {
    if (!end.ownReopen) { result.push(end); continue; }
    const local = await lifecycleBatches(context, held.get(end.live), end.owner);
    const remote = await readItemEndBatches(context, fetched.get(end.history), end.owner);
    if ([...remote].some((batch) => !local.has(batch))) result.push(end);
  }
  return result;
}

/** A published live item with its folders removed reopens a held history unless its own end still stands. */
export async function readPendingRefReopens(context: RefBackendContext, held: ReadonlyMap<string, string>,
  state: ReadonlyMap<string, string>, incoming: ReadonlyMap<string, string>,
  published: RefEndPublished = refEndPublished(context, incoming)): Promise<Map<string, string>> {
  const folders = await readLifecycleFolders(context, state), result = new Map<string, string>();
  for (const history of held.keys()) {
    if (!HistoryRefSchema.safeParse(history).success) continue;
    const live = history.replace("refs/arc/history/", "refs/arc/");
    if (incoming.has(live) && !folders.some((folder) => folder.liveRef === live)
      && !await hasOwnRefEnd(context, held, live, folders, published)) result.set(live, history);
  }
  return result;
}

/** Decode all complete archive folders from one immutable namespace snapshot. */
export async function readLifecycleFolders(context: RefBackendContext, tips: ReadonlyMap<string, string>): Promise<ArchivedFolder[]> {
  const quarters = new Map([...tips].filter(([ref]) => isArchiveRef(ref)));
  if (!quarters.size) return [];
  const trees = await readRefTrees(context, quarters);
  const objects = await readBatchObjects(context, [...new Set([...trees.values()].flatMap((entries) => entries.map(({ oid }) => oid)))]);
  return [...trees].flatMap(([ref, entries]) => (["work-item", "cohort"] as const)
    .flatMap((family) => archivedFolders(family, ref, entries, objects).folders));
}

/** Read batch reachability from the supplied tip, never a mutable tracking ref. */
export async function lifecycleBatches(context: RefBackendContext, tip: string | undefined, owner: OwnerIdentity): Promise<Set<string>> {
  if (!tip) return new Set();
  const reference = RecordReferenceSchema.parse({ owner, kind: owner.type === "cohort" ? "cohort/document" : "work-item/meta" });
  const { stdout } = await context.exec("git", ["log", "--format=%B%x00", tip], { cwd: context.checkoutRoot, objectAccess: "local-only" });
  return new Set(stdout.split("\0").map((message) => parseStoreCommitProvenance(message.trimStart(), reference))
    .flatMap((entry) => "batchId" in entry && entry.batchId ? [entry.batchId] : []));
}

/** Test end records against histories held before this pull, independent of which merge brought them. */
export async function readPendingRefEnds(context: RefBackendContext, held: ReadonlyMap<string, string>,
  state: ReadonlyMap<string, string>, incoming: ReadonlyMap<string, string>,
  published: RefEndPublished = refEndPublished(context, incoming)): Promise<PendingRefEnd[]> {
  const pending = new Map<string, PendingRefEnd>();
  for (const folder of await readLifecycleFolders(context, state)) {
    const live = folder.liveRef, history = HistoryRefSchema.parse(live.replace("refs/arc/", "refs/arc/history/"));
    if (!held.has(live) && !held.has(history)) continue;
    const batches = await lifecycleBatches(context, held.get(history), folder.owner);
    if (held.has(live) || !folder.metadata.endBatch || !batches.has(folder.metadata.endBatch)) {
      pending.set(live, { live, history, owner: folder.owner });
    }
  }
  await addPendingLineageEnds(context, held, incoming, pending, published);
  return [...pending.values()];
}

async function addPendingLineageEnds(context: RefBackendContext, held: ReadonlyMap<string, string>,
  incoming: ReadonlyMap<string, string>, pending: Map<string, PendingRefEnd>, published: RefEndPublished): Promise<void> {
  const lineage = await readLineageOwners(context, incoming);
  const ownReopens = await readOwnRefReopens(context, held, incoming);
  const folders = await readLifecycleFolders(context, held);
  if (lineage.status === "ok") for (const owner of lineage.result) {
    if (!("uid" in owner)) continue;
    const live = `refs/arc/work/${owner.uid}`;
    const history = HistoryRefSchema.parse(live.replace("refs/arc/", "refs/arc/history/"));
    if (!incoming.has(live) && !pending.has(live) && (held.has(live)
      || held.has(history) && await hasOwnRefEnd(context, held, live, folders, published))) pending.set(live, {
      live, history: HistoryRefSchema.parse(live.replace("refs/arc/", "refs/arc/history/")), owner, ownReopen: ownReopens.has(live),
    });
  }
}
