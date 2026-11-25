/** Plan role-restoration coordinates from captured withdrawal evidence before refreshing any surviving copy. */
import { archiveOwnerTrees, archivedFolders, isArchiveRef, isArchiveMetadataPath, type ArchivedFolder } from "./archive-read.js";
import { ownerPrimaryReference } from "./archive-refresh.js";
import { readBatchObjects, type RefTreeEntry } from "./batch-read.js";
import type { RefBackendContext } from "./context.js";
import { refDiagnosticRefusal } from "./object-fault.js";
import { RefSyncLabelError } from "./sync-label.js";
import type { WithdrawJournalStep } from "./sync-withdraw-journal.js";
import type { RefWriteGroup } from "./write-commits.js";
import { planCompletedRoleReplacements, type CompletedRoleReplacement } from "./write-completed-role.js";

/** One surviving folder and its shared final inverse history group. */
export interface WithdrawCompletedCopy {
  folder: ArchivedFolder;
  group: Pick<RefWriteGroup, "entries" | "metadata" | "completedPlacements" | "readPlacement">;
}

/** Reserve all owners together on private maps; only real refreshed entries reach publication. */
export async function planWithdrawCopyRoles(context: RefBackendContext, copies: readonly WithdrawCompletedCopy[],
  trees: ReadonlyMap<string, readonly RefTreeEntry[]>, prepared: ReadonlyMap<string, Map<string, RefTreeEntry>>,
  journal: readonly WithdrawJournalStep[]): Promise<void> {
  const changed = copies.filter(({ folder, group }) => group.metadata.primary?.role
    && group.metadata.primary.role !== folder.metadata.primary?.role);
  if (!changed.length) return;
  const original = await originalRoleFolders(context, changed, journal);
  const preferred = changed.flatMap(copy => preferredOriginal(copy, original));
  const groups = new Map<WithdrawCompletedCopy["group"], CompletedRoleReplacement>();
  const quarters = new Map<string, Map<string, RefTreeEntry>>();
  for (const { folder, group } of copies) {
    quarters.set(folder.ref, new Map(prepared.get(folder.ref) ?? (trees.get(folder.ref) ?? []).map(entry => [entry.path, entry])));
    const role = group.metadata.primary?.role;
    if (!role) continue;
    let replacement = groups.get(group);
    if (!replacement) { replacement = { group, role, folders: [] }; groups.set(group, replacement); }
    replacement.folders.push(folder);
  }
  const planned = planCompletedRoleReplacements(context, [...groups.values()], quarters, preferred);
  if (planned.status === "refused") {
    const ref = changed[0]?.folder.ref;
    if (!ref) throw new Error("A role restoration refusal has no completed folder");
    throw new RefSyncLabelError(ref, { code: "namespace-corrupt", class: "terminal", namespace: ref,
      condition: planned.refusal.condition, remedy: planned.refusal.remedy });
  }
}

async function originalRoleFolders(context: RefBackendContext, copies: readonly WithdrawCompletedCopy[],
  journal: readonly WithdrawJournalStep[]): Promise<ArchivedFolder[]> {
  const owners = copies.map(({ folder }) => folder.owner);
  const snapshots = journal.filter(step => isArchiveRef(step.ref)).flatMap(step =>
    [step.before, step.after, step.ancestor].map(entries => archiveOwnerTrees(new Map([[step.ref, [...entries.values()]]]), owners)));
  const objects = await readBatchObjects(context, [...new Set(snapshots.flatMap(snapshot => [...snapshot.values()]
    .flatMap(entries => entries.filter(entry => isArchiveMetadataPath(entry.path)).map(({ oid }) => oid))))]);
  const folders: ArchivedFolder[] = [];
  for (const snapshot of snapshots) for (const [ref, entries] of snapshot) for (const family of ["work-item", "cohort"] as const) {
    const decoded = archivedFolders(family, ref, entries, objects, true), diagnostic = decoded.diagnostics[0];
    if (diagnostic) throw new RefSyncLabelError(ref, refDiagnosticRefusal(ref, diagnostic));
    folders.push(...decoded.folders);
  }
  return folders;
}

function preferredOriginal({ folder, group }: WithdrawCompletedCopy, originals: readonly ArchivedFolder[]): ArchivedFolder[] {
  const matches = originals.filter(candidate => candidate.ref === folder.ref && candidate.liveRef === folder.liveRef
    && candidate.metadata.primary?.role === group.metadata.primary?.role
    && (candidate.metadata.endBatch ?? candidate.root) === (folder.metadata.endBatch ?? folder.root));
  const coordinates = new Map(matches.map(candidate => [candidate.root, candidate]));
  if (coordinates.size > 1) throw new RefSyncLabelError(folder.ref, { code: "record-malformed", class: "recoverable",
    reference: ownerPrimaryReference(folder.owner, group.metadata), rule: "store.ended-twice-placement",
    condition: `The captured original coordinates for ${folder.liveRef} in ${folder.ref} disagree for the same independent end.`,
    remedy: { text: "Write the intended primary role and completed placement forward through the owning item, preserving independent ends and conflicts, "
      + "then retry the pull. Do not choose an arbitrary historical folder or overwrite another end." } });
  return [...coordinates.values()];
}
