/** Captured archive folders refreshed alongside a merge of their retained history ref. */

import type { RefBackendContext } from "./context.js";
import { archivedFolders, isArchiveRef, type ArchivedFolder } from "./archive-read.js";
import { readBatchObjects, readRefTrees, type RefTreeEntry } from "./batch-read.js";
import { parseStoreCommitProvenance } from "../commit-provenance.js";
import { RecordReferenceSchema } from "../identity.js";
import type { SyncMergedTree } from "./sync-tree.js";
import { readSyncRefs } from "./sync-graph.js";
import { refreshArchivedFolder } from "./archive-refresh.js";
import { parseRefMetadata } from "./metadata.js";
import { writeRefBlob } from "./tree-write.js";
import { canonicalize } from "../../kernel/canonical/canonical-json.js";
import type { StoreResult } from "../refusal.js";
import { corruptRef } from "./namespace-health.js";
import { checkSyncRefTip } from "./sync-tip.js";

/** Stamp a history fast-forward only when its retained folders need a paired refresh. */
export async function prepareSyncHistoryFastForward(context: RefBackendContext, ref: string, tip: string,
  quarters: readonly SyncHistoryQuarter[], batchId: string): Promise<StoreResult<SyncMergedTree | undefined>> {
  const folder = quarters[0]?.folders[0];
  if (!folder || !("uid" in folder.owner)) {
    const refusal = await checkSyncRefTip(context, ref, tip);
    return refusal ? { status: "refused", refusal } : { status: "ok", result: undefined };
  }
  const path = `metadata-${folder.owner.uid}.json`;
  const entries = (await readRefTrees(context, new Map([[ref, tip]]))).get(ref);
  const entry = entries?.find((entry) => entry.path === path);
  const objects = await readBatchObjects(context, entry ? [entry.oid] : []);
  const metadata = parseRefMetadata(entry ? objects.get(entry.oid) : undefined, ref);
  if (!entries || !metadata) return { status: "refused", refusal: corruptRef(ref) };
  const reference = RecordReferenceSchema.parse({ owner: { ...folder.owner, name: metadata.slug ?? folder.owner.name },
    kind: metadata.primary?.role ?? "cohort/document" });
  const tree: SyncMergedTree = { entries: new Map(entries.map((entry) => [entry.path, entry])), metadata, reference };
  const preview = quarters.map((quarter) => ({ ...quarter, entries: new Map(quarter.entries) }));
  await prepareSyncHistoryQuarters(context, preview, tree);
  if (preview.every((quarter, index) => sameEntries(quarter.entries, quarters[index]?.entries))) return { status: "ok", result: undefined };
  metadata.batch = batchId;
  tree.entries.set(path, { path, mode: "100644", oid: await writeRefBlob(context, canonicalize(metadata)) });
  return { status: "ok", result: tree };
}

/** One complete quarter snapshot and the owner's folders whose batches its history contains. */
export interface SyncHistoryQuarter { ref: string; tip: string; entries: Map<string, RefTreeEntry>; folders: ArchivedFolder[] }

/** Select only folders this captured history can refresh without discarding an unseen batch. */
export async function readSyncHistoryQuarters(context: RefBackendContext, ref: string,
  tips: ReadonlyMap<string, string>, additionalTips: readonly string[] = []): Promise<SyncHistoryQuarter[]> {
  const tip = tips.get(ref);
  if (!ref.startsWith("refs/arc/history/") || !tip && !additionalTips.length) return [];
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
  const { stdout } = await context.exec("git", ["log", "--format=%B%x00", ...new Set([...(tip ? [tip] : []), ...additionalTips])], { cwd: context.checkoutRoot, objectAccess: "local-only" });
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

function sameEntries(left: ReadonlyMap<string, RefTreeEntry>, right: ReadonlyMap<string, RefTreeEntry> | undefined): boolean {
  if (!right || left.size !== right.size) return false;
  return [...left].every(([path, entry]) => {
    const other = right.get(path);
    return entry.oid === other?.oid && entry.mode === other.mode;
  });
}
