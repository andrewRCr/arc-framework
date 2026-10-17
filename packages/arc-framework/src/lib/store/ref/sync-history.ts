/** Captured archive folders refreshed alongside a merge of their retained history ref. */

import type { RefBackendContext } from "./context.js";
import { archivedFolders, isArchiveRef, type ArchivedFolder } from "./archive-read.js";
import { readBatchObjects, readRefTrees, type RefTreeEntry } from "./batch-read.js";
import { parseStoreCommitProvenance } from "../commit-provenance.js";
import { RecordReferenceSchema } from "../identity.js";
import type { SyncMergedTree } from "./sync-tree.js";
import { readSyncRefs } from "./sync-graph.js";
import { refreshArchivedFolder } from "./archive-refresh.js";

/** One complete quarter snapshot and the owner's folders whose batches its history contains. */
export interface SyncHistoryQuarter { ref: string; tip: string; entries: Map<string, RefTreeEntry>; folders: ArchivedFolder[] }

/** Select only folders this captured history can refresh without discarding an unseen batch. */
export async function readSyncHistoryQuarters(context: RefBackendContext, ref: string,
  tips: ReadonlyMap<string, string>): Promise<SyncHistoryQuarter[]> {
  const tip = tips.get(ref);
  if (!ref.startsWith("refs/arc/history/") || !tip) return [];
  const quarters = new Map([...tips].filter(([name]) => isArchiveRef(name)));
  if (!quarters.size) return [];
  const trees = await readRefTrees(context, quarters);
  const objects = await readBatchObjects(context, [...new Set([...trees.values()].flatMap((entries) => entries.map(({ oid }) => oid)))]);
  const family = ref.includes("/cohort/") ? "cohort" : "work-item", live = ref.replace("refs/arc/history/", "refs/arc/");
  const own = [...trees].map(([quarter, entries]) => ({ ref: quarter, entries,
    folders: archivedFolders(family, quarter, entries, objects).folders.filter((folder) => folder.liveRef === live) })).filter(({ folders }) => folders.length);
  const first = own[0]?.folders[0];
  if (!first) return [];
  const reference = RecordReferenceSchema.parse({ owner: first.owner, kind: first.metadata.primary?.role ?? "cohort/document" });
  const { stdout } = await context.exec("git", ["log", "--format=%B%x00", tip], { cwd: context.checkoutRoot, objectAccess: "local-only" });
  const batches = new Set(stdout.split("\0").map((message) => parseStoreCommitProvenance(message.trimStart(), reference))
    .flatMap((entry) => "batchId" in entry ? [entry.batchId] : []));
  return own.flatMap(({ ref: quarter, entries, folders }) => {
    const tip = quarters.get(quarter);
    if (tip === undefined) throw new Error("An archive snapshot has no captured tip");
    const included = folders.filter(({ metadata }) => metadata.batch && batches.has(metadata.batch));
    return included.length ? [{ ref: quarter, tip, entries: new Map(entries.map((entry) => [entry.path, entry])), folders: included }] : [];
  });
}

/** Compose each selected owner's new tree into its captured complete quarter entries. */
export async function prepareSyncHistoryQuarters(context: RefBackendContext, quarters: readonly SyncHistoryQuarter[], tree: SyncMergedTree): Promise<void> {
  if (!tree.metadata) throw new Error("A retained item merge has no group metadata");
  for (const quarter of quarters) for (const folder of quarter.folders) {
    await refreshArchivedFolder(context, folder, { entries: tree.entries, metadata: tree.metadata }, quarter.entries, tree.reference);
  }
}

/** Verify captured quarter tips again under the same ordered locks as their history ref. */
export async function unchangedSyncHistoryQuarters(context: RefBackendContext, quarters: readonly SyncHistoryQuarter[],
  targetRef?: (canonical: string) => string): Promise<boolean> {
  for (const quarter of quarters) {
    const target = targetRef?.(quarter.ref) ?? quarter.ref;
    if ((await readSyncRefs(context, target)).get(target) !== quarter.tip) return false;
  }
  return true;
}
