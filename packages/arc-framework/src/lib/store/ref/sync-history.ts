/** Captured archive folders refreshed alongside a merge of their retained history ref. */

import type { RefBackendContext } from "./context.js";
import { archivedFolders, isArchiveRef, latestArchivedFolders, firstOwnedArchiveDiagnostic, type ArchivedFolder } from "./archive-read.js";
import type { ReadPlacement } from "../placement.js";
import { readBatchObjects, readRefTrees, type RefTreeEntry } from "./batch-read.js";
import { parseStoreCommitProvenance } from "../commit-provenance.js";
import { OwnerIdentitySchema } from "../identity.js";
import type { SyncRecordMergedTree } from "./sync-tree.js";
import { readSyncRefs } from "./sync-graph.js";
import { ownerPrimaryReference, refreshArchivedFolder } from "./archive-refresh.js";
import { parseRefMetadata } from "./metadata.js";
import { writeRefBlob } from "./tree-write.js";
import { canonicalize } from "../../kernel/canonical/canonical-json.js";
import type { StoreResult } from "../refusal.js";
import { corruptRef } from "./namespace-health.js";
import { checkSyncRefTip } from "./sync-tip.js";
import { readLifecycleFolders } from "./sync-lifecycle.js";
import { planCompletedRoleReplacements, type CompletedRoleReplacement } from "./write-completed-role.js";
import { readLifecycleLog } from "./sync-lifecycle-evidence.js";

/** Stamp a history fast-forward only when its retained folders need a paired refresh. */
export async function prepareSyncHistoryFastForward(context: RefBackendContext, ref: string, tip: string,
  quarters: readonly SyncHistoryQuarter[], batchId: string, preferred: ReadonlyMap<string, string>): Promise<StoreResult<SyncRecordMergedTree | undefined>> {
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
  const reference = ownerPrimaryReference(folder.owner, metadata);
  const tree: SyncRecordMergedTree = { kind: "record", entries: new Map(entries.map((entry) => [entry.path, entry])), metadata, reference };
  const preview = quarters.map((quarter) => ({ ...quarter, entries: new Map(quarter.entries) }));
  const prepared = await prepareSyncHistoryQuarters(context, preview, tree, preferred);
  if (prepared.status === "refused") return prepared;
  if (preview.every((quarter, index) => sameEntries(quarter.entries, quarters[index]?.entries))) return { status: "ok", result: undefined };
  metadata.batch = batchId;
  tree.entries.set(path, { path, mode: "100644", oid: await writeRefBlob(context, canonicalize(metadata)) });
  return { status: "ok", result: tree };
}

/** One complete quarter snapshot and the owner's folders whose batches its history contains. */
export interface SyncHistoryQuarter { ref: string; tip: string; entries: Map<string, RefTreeEntry>; folders: ArchivedFolder[] }
/** The quarters a history merge refreshes, and the placement of the owner's latest folder, which its version names. */
export interface SyncHistoryQuarters { quarters: SyncHistoryQuarter[]; latest?: ReadPlacement }

/** Select only folders this captured history can refresh without discarding an unseen batch. */
export async function readSyncHistoryQuarters(context: RefBackendContext, ref: string,
  tips: ReadonlyMap<string, string>, additionalTips: readonly string[] = []): Promise<StoreResult<SyncHistoryQuarters>> {
  const tip = tips.get(ref);
  if (!ref.startsWith("refs/arc/history/") || !tip && !additionalTips.length) return { status: "ok", result: { quarters: [] } };
  const quarters = new Map([...tips].filter(([name]) => isArchiveRef(name)));
  if (!quarters.size) return { status: "ok", result: { quarters: [] } };
  const trees = await readRefTrees(context, quarters);
  // A quarter whose tree or one of this item's folders cannot be read may hold a folder the merge must rebuild.
  const unreadable = [...quarters.keys()].find((quarter) => !trees.has(quarter));
  if (unreadable) return { status: "refused", refusal: corruptRef(unreadable, true) };
  const objects = await readBatchObjects(context, [...new Set([...trees.values()].flatMap((entries) => entries.map(({ oid }) => oid)))]);
  const family = ref.includes("/cohort/") ? "cohort" : "work-item", live = ref.replace("refs/arc/history/", "refs/arc/");
  const broken = firstOwnedArchiveDiagnostic(trees, [OwnerIdentitySchema.parse({ type: family, name: "unresolved", uid: live.split("/").at(-1) })], objects);
  if (broken) return { status: "refused", refusal: { code: "namespace-corrupt", class: "terminal", namespace: broken.ref,
    condition: broken.diagnostic.condition, remedy: broken.diagnostic.remedy } };
  const own = [...trees].map(([quarter, entries]) => ({ ref: quarter, entries,
    folders: archivedFolders(family, quarter, entries, objects).folders.filter((folder) => folder.liveRef === live) })).filter(({ folders }) => folders.length);
  const first = own[0]?.folders[0];
  if (!first) return { status: "ok", result: { quarters: [] } };
  const latest = latestArchivedFolders(own.flatMap(({ folders }) => folders))[0]?.placement;
  const reference = ownerPrimaryReference(first.owner, first.metadata);
  const messages: string[] = [];
  for (const captured of new Set([...(tip ? [tip] : []), ...additionalTips])) {
    for (const row of await readLifecycleLog(context, captured)) messages.push(row.message);
  }
  const batches = new Set(messages.map((message) => parseStoreCommitProvenance(message.trimStart(), reference))
    .flatMap((entry) => "batchId" in entry ? [entry.batchId] : []));
  return { status: "ok", result: { latest, quarters: own.flatMap(({ ref: quarter, entries, folders }) => {
    const tip = quarters.get(quarter);
    if (tip === undefined) throw new Error("An archive snapshot has no captured tip");
    const included = folders.filter(({ metadata }) => metadata.batch && batches.has(metadata.batch));
    return included.length ? [{ ref: quarter, tip, entries: new Map(entries.map((entry) => [entry.path, entry])), folders: included }] : [];
  }) } };
}

/** Compose each selected owner's new tree into its captured complete quarter entries. */
export async function prepareSyncHistoryQuarters(context: RefBackendContext, quarters: readonly SyncHistoryQuarter[], tree: SyncRecordMergedTree,
  preferred: ReadonlyMap<string, string>): Promise<StoreResult<undefined>> {
  if (!tree.metadata) throw new Error("A retained item merge has no group metadata");
  const group: CompletedRoleReplacement["group"] = { metadata: tree.metadata };
  const folders = quarters.flatMap(quarter => quarter.folders), role = tree.metadata.primary?.role;
  if (role) {
    const preferredFolders = folders.some(folder => folder.metadata.primary?.role !== role)
      ? await readLifecycleFolders(context, preferred) : [];
    const planned = planCompletedRoleReplacements(context, [{ group, role, folders }],
      new Map(quarters.map(quarter => [quarter.ref, quarter.entries])), preferredFolders);
    if (planned.status === "refused") return planned;
  }
  for (const quarter of quarters) for (const folder of quarter.folders) {
    const placement = group.completedPlacements?.get(`${folder.ref}:${folder.root}`) ?? folder.placement;
    await refreshArchivedFolder(context, folder, { entries: tree.entries, metadata: tree.metadata }, quarter.entries,
      { placement, endBatch: folder.metadata.endBatch });
  }
  return { status: "ok", result: undefined };
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
