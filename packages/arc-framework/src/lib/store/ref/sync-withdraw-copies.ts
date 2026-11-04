/** Refresh surviving completed copies from the final inverse without recapturing live refs. */

import { parseStoreCommitProvenance } from "../commit-provenance.js";
import { expandStoredPath } from "../stored-path.js";
import { archiveOwnerTrees, archivedFolders, firstOwnedArchiveDiagnostic, isArchiveMetadataPath, isArchiveRef, type ArchivedFolder } from "./archive-read.js";
import { ownerPrimaryReference, refreshArchivedFolder } from "./archive-refresh.js";
import { readBatchObjects, type RefTreeEntry } from "./batch-read.js";
import type { RefBackendContext } from "./context.js";
import { isUnavailableGraphFailure } from "./history-graph.js";
import { refDiagnosticRefusal } from "./object-fault.js";
import { refPrototype } from "./read.js";
import { RefSyncLabelError } from "./sync-label.js";
import { readLifecycleLog } from "./sync-lifecycle-evidence.js";
import { UnavailableWithdrawJournal, type WithdrawJournalDescription, type WithdrawJournalStep } from "./sync-withdraw-journal.js";
import type { WithdrawalBasis } from "./sync-withdraw-prepare.js";
import { withdrawSnapshotMetadata } from "./sync-withdraw-records.js";
import { planWithdrawCopyRoles, type WithdrawCompletedCopy } from "./sync-withdraw-role.js";

/** Retain immutable provenance already acquired by lifecycle discovery, separately from locked object availability. */
export async function captureWithdrawCopyBatches(context: RefBackendContext, state: ReadonlyMap<string, string>,
  journal: readonly WithdrawJournalDescription[], endHistory: string): Promise<Map<string, ReadonlySet<string>>> {
  const result = new Map<string, ReadonlySet<string>>();
  for (const { ref } of journal) {
    const tip = state.get(ref);
    if (ref === endHistory || !tip || !/^refs\/arc\/history\/(?:work|cohort)\//u.test(ref)) continue;
    const reference = refPrototype(context, ref.replace("refs/arc/history/", "refs/arc/"), ref.includes("/work/") ? "work-item" : "cohort");
    try {
      const rows = await readLifecycleLog(context, tip);
      result.set(ref, new Set(rows.flatMap(({ message }) => {
        const provenance = parseStoreCommitProvenance(message.trimStart(), reference);
        return "batchId" in provenance && provenance.batchId ? [provenance.batchId] : [];
      })));
    } catch (error) {
      if (!await isUnavailableGraphFailure(context, error)) throw error;
      throw new UnavailableWithdrawJournal(ref, "Captured history required to refresh a completed copy is unavailable.", "missing");
    }
  }
  return result;
}

/** Owned quarter controls join the inverse's existing object acquisition; unrelated payloads need no read. */
export function withdrawCopyMetadata(context: RefBackendContext, basis: WithdrawalBasis,
  trees: ReadonlyMap<string, readonly RefTreeEntry[]>): RefTreeEntry[] {
  return [...ownedQuarterTrees(context, basis, trees).values()].flatMap(entries => entries.filter(({ path }) => isArchiveMetadataPath(path)));
}

/** Compose only surviving, witnessed folders, adding a previously unwritten quarter only when its tree changes. */
export async function refreshWithdrawCompletedCopies(context: RefBackendContext, basis: WithdrawalBasis,
  trees: ReadonlyMap<string, readonly RefTreeEntry[]>, prepared: Map<string, Map<string, RefTreeEntry>>,
  journal: readonly WithdrawJournalStep[]): Promise<void> {
  if (!basis.copyBatches.size) return;
  const quarters = ownedQuarterTrees(context, basis, trees);
  const objects = await readBatchObjects(context, [...new Set(withdrawCopyMetadata(context, basis, trees).map(({ oid }) => oid))]);
  const owners = copyOwners(context, basis);
  const broken = firstOwnedArchiveDiagnostic(quarters, owners, objects);
  if (broken) throw new RefSyncLabelError(broken.ref, refDiagnosticRefusal(broken.ref, broken.diagnostic));
  const folders = [...quarters].flatMap(([ref, entries]) => (["work-item", "cohort"] as const)
    .flatMap(family => archivedFolders(family, ref, entries, objects).folders));
  const originalRefs = new Set(prepared.keys());
  const copies: WithdrawCompletedCopy[] = [], groups = new Map<string, WithdrawCompletedCopy["group"]>();
  for (const folder of folders) {
    const history = folder.liveRef.replace("refs/arc/", "refs/arc/history/");
    if (!folder.metadata.batch || !basis.copyBatches.get(history)?.has(folder.metadata.batch)
      || folder.metadata.endBatch && basis.batches.has(folder.metadata.endBatch)) continue;
    const entries = prepared.get(folder.ref) ?? new Map((trees.get(folder.ref) ?? []).map(entry => [entry.path, entry]));
    if (![...entries.keys()].some(path => path.startsWith(folder.root))) continue;
    const group = prepared.get(history);
    if (!group) continue;
    let final = groups.get(history);
    if (!final) { final = await inverseCopyGroup(context, folder, history, group); groups.set(history, final); }
    copies.push({ folder, group: final });
    prepared.set(folder.ref, entries);
  }
  await planWithdrawCopyRoles(context, copies, trees, prepared, journal);
  await refreshPlannedCopies(context, copies, prepared);
  dropUnchangedQuarters(prepared, trees, originalRefs);
}

async function refreshPlannedCopies(context: RefBackendContext, copies: readonly WithdrawCompletedCopy[],
  prepared: ReadonlyMap<string, Map<string, RefTreeEntry>>): Promise<void> {
  for (const { folder, group } of copies) {
    const entries = prepared.get(folder.ref);
    if (!entries) throw new Error("A surviving withdrawal copy has no captured quarter");
    const placement = group.completedPlacements?.get(`${folder.ref}:${folder.root}`) ?? folder.placement;
    const refreshed = await refreshArchivedFolder(context, folder, group, entries, { placement, endBatch: folder.metadata.endBatch });
    if (refreshed.status === "refused") throw new RefSyncLabelError(folder.ref, {
      code: "namespace-corrupt", class: "terminal", namespace: folder.ref,
      condition: refreshed.refusal.condition, remedy: refreshed.refusal.remedy,
    });
  }
}

function dropUnchangedQuarters(prepared: Map<string, Map<string, RefTreeEntry>>,
  trees: ReadonlyMap<string, readonly RefTreeEntry[]>, originalRefs: ReadonlySet<string>): void {
  for (const [ref, entries] of prepared) {
    if (originalRefs.has(ref) || !isArchiveRef(ref)) continue;
    const original = trees.get(ref) ?? [];
    if (entries.size === original.length && original.every(entry => entries.get(entry.path)?.oid === entry.oid
      && entries.get(entry.path)?.mode === entry.mode)) prepared.delete(ref);
  }
}

async function inverseCopyGroup(context: RefBackendContext, folder: ArchivedFolder, history: string,
  group: Map<string, RefTreeEntry>): Promise<WithdrawCompletedCopy["group"]> {
  const home = expandStoredPath(ownerPrimaryReference(folder.owner, folder.metadata), { registry: context.registry });
  const entry = group.get(home.metadataPath);
  const objects = await readBatchObjects(context, entry ? [entry.oid] : []);
  const metadata = withdrawSnapshotMetadata(history, entry, objects, false);
  return { entries: group, metadata };
}

function copyOwners(context: RefBackendContext, basis: WithdrawalBasis) {
  return [...basis.copyBatches.keys()].map(ref => refPrototype(context, ref.replace("refs/arc/history/", "refs/arc/"),
    ref.includes("/work/") ? "work-item" : "cohort").owner);
}

function ownedQuarterTrees(context: RefBackendContext, basis: WithdrawalBasis, trees: ReadonlyMap<string, readonly RefTreeEntry[]>) {
  if (!basis.copyBatches.size) return new Map<string, RefTreeEntry[]>();
  return archiveOwnerTrees(new Map([...trees].filter(([ref]) => isArchiveRef(ref))), copyOwners(context, basis));
}
