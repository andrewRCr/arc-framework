/** Refresh every completed copy from the item's final retained history tree. */

import type { RefChange } from "../../git/ref-transaction.js";
import { canonicalize } from "../../kernel/canonical/canonical-json.js";
import type { ArchiveQuarter } from "../../kernel/index.js";
import type { BatchCreationReceipt } from "../creation-receipt.js";
import type { BatchInput } from "../write.js";
import type { StoreResult } from "../refusal.js";
import type { ReadPlacement } from "../placement.js";
import type { RefBackendContext } from "./context.js";
import { refWriteTargets, type ResolvedBatch } from "./write-resolution.js";
import type { PreparedRefMutation } from "./write-merge.js";
import { ownerPrimaryReference, refreshArchivedFolder, removeArchivedFolder, writeArchivedFolder } from "./archive-refresh.js";
import { latestArchivedFolders, latestFolderPlacement, type ArchivedFolder } from "./archive-read.js";
import { readRefTrees, type RefTreeEntry } from "./batch-read.js";
import { commitRefTree, type RefWriteGroup } from "./write-commits.js";
import { nextArchiveSequence, type RefArchivePlan } from "./write-archive.js";
import { cohortClosePlacement, preparedCohortParents } from "./cohort-coordinates.js";
import { corruptRef } from "./namespace-health.js";
import { writeRefBlob } from "./tree-write.js";
import { expandStoredPath } from "../stored-path.js";
import { quarterCommitReference } from "./quarter-provenance.js";
import { completedRoleReplacements, planCompletedRoleReplacements } from "./write-completed-role.js";

/** The archives and prepared writes a moved cohort's closeout reads, as a closing cohort's does. */
export interface CompletedMoveBasis { archives: readonly RefArchivePlan[]; writes: readonly PreparedRefMutation[] }

/** The other quarter a batch's completed primary put names for an ended owner, which moves its folder there. */
export function completedMoveQuarter(batch: ResolvedBatch, history: string): ArchiveQuarter | undefined {
  const current = latestFolderPlacement(batch.archived ?? [], history);
  if (current?.kind !== "completed") return undefined;
  for (const { mutation, home } of batch.writes) {
    if (home.ref !== history || mutation.action !== "put" || mutation.placement?.kind !== "completed"
      || !["work-item/meta", "work-item/record", "cohort/document"].includes(mutation.reference.kind)) continue;
    return mutation.placement.quarter === current.quarter ? undefined : mutation.placement.quarter;
  }
  return undefined;
}

/** Lock each quarter an ended owner moves into, beside the quarters its folders already hold. */
export function completedMoveLockRefs(batch: ResolvedBatch): string[] {
  const histories = new Set((batch.archived ?? []).map(({ liveRef }) => liveRef.replace("refs/arc/", "refs/arc/history/")));
  return [...histories].flatMap((history) => {
    const quarter = completedMoveQuarter(batch, history);
    return quarter ? [`refs/arc/archive/${quarter}`] : [];
  });
}

/** Assign completed moves before checks, reserving after the batch's archives and reopens without changing their trees. */
export async function planCompletedMoves(context: RefBackendContext, batch: ResolvedBatch,
  groups: ReadonlyMap<string, RefWriteGroup>, basis: CompletedMoveBasis,
  reopened?: ReadonlyMap<string, ReadonlyMap<string, RefTreeEntry>>): Promise<StoreResult<undefined>> {
  const histories = new Set((batch.archived ?? []).map(({ liveRef }) => liveRef.replace("refs/arc/", "refs/arc/history/")));
  const moves = [...histories].flatMap(history => {
    const quarter = completedMoveQuarter(batch, history);
    return quarter ? [{ history, quarter }] : [];
  });
  const replacements = completedRoleReplacements(batch, groups, new Set(moves.map(({ history }) => history)));
  if (!moves.length && !replacements.length) return { status: "ok", result: undefined };
  const captured = await completedQuarterTrees(context, [], batch, new Set([...moves.map(({ quarter }) => `refs/arc/archive/${quarter}`),
    ...replacements.flatMap(({ folders }) => folders.map(({ ref }) => ref))]));
  if (captured.status === "refused") return captured;
  const quarters = captured.result;
  reservePreparedQuarters(quarters, basis, reopened);
  for (const { history, quarter } of moves) {
    const group = groups.get(history);
    const owned = (batch.archived ?? []).filter(({ liveRef }) => liveRef.replace("refs/arc/", "refs/arc/history/") === history);
    const [folder] = latestArchivedFolders(owned);
    if (!group || !folder) throw new Error("A completed move has no prepared group or captured folder");
    if (owned.length > 1) return { status: "refused", refusal: { code: "record-malformed", class: "recoverable",
      reference: ownerPrimaryReference(folder.owner, group.metadata), rule: "store.ended-twice-placement",
      condition: "This item holds more than one archived folder; moving it would discard an independently published end.",
      remedy: { text: "Remove terminal lineage where present, then reopen the item to remove every archived folder, and end it once in the requested quarter." } } };
    const target = quarterEntries(quarters, `refs/arc/archive/${quarter}`);
    const placement = await movedPlacement(context, { batch, groups, basis }, folder, group, quarter, target);
    if ("code" in placement) return { status: "refused", refusal: placement };
    group.readPlacement = placement;
    const home = expandStoredPath(ownerPrimaryReference(folder.owner, group.metadata), { registry: context.registry, placement });
    target.set(home.metadataPath, { path: home.metadataPath, mode: "100644", oid: "" });
  }
  return planCompletedRoleReplacements(context, replacements, quarters);
}

function reservePreparedQuarters(quarters: Map<string, Map<string, RefTreeEntry>>, basis: CompletedMoveBasis,
  reopened?: ReadonlyMap<string, ReadonlyMap<string, RefTreeEntry>>): void {
  for (const [ref, entries] of reopened ?? []) if (quarters.has(ref)) quarters.set(ref, new Map(entries));
  for (const plan of basis.archives) if (quarters.has(plan.home.ref)) quarters.set(plan.home.ref, new Map(plan.entries));
}

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

/** Refresh every folder in the same transaction, composing with other quarter changes; a move transfers one folder. */
export async function refreshCompletedChanges(context: RefBackendContext, changes: readonly RefChange[], batch: ResolvedBatch,
  groups: ReadonlyMap<string, RefWriteGroup>, provenance: BatchInput["provenance"], batchId: string, receipt: BatchCreationReceipt,
  actor: string | undefined): Promise<StoreResult<RefChange[]>> {
  const folders = (batch.archived ?? []).filter(({ liveRef }) => {
    const history = liveRef.replace("refs/arc/", "refs/arc/history/");
    return changes.some(({ ref }) => ref === history) && !groups.get(history)?.viewRef;
  });
  if (!folders.length) return { status: "ok", result: [...changes] };
  const histories = [...new Set(folders.map(({ liveRef }) => liveRef.replace("refs/arc/", "refs/arc/history/")))];
  const moves = new Map(histories.flatMap((history) => {
    const quarter = completedMoveQuarter(batch, history);
    return quarter ? [[history, quarter] as const] : [];
  }));
  const refs = new Set([...folders.map(({ ref }) => ref), ...[...moves.values()].map((quarter) => `refs/arc/archive/${quarter}`)]);
  const captured = await completedQuarterTrees(context, changes, batch, refs);
  if (captured.status === "refused") return captured;
  const quarters = captured.result;
  for (const history of histories) {
    const group = groups.get(history), owned = folders.filter(({ liveRef }) => liveRef.replace("refs/arc/", "refs/arc/history/") === history);
    if (!group) throw new Error("A completed write has no final history tree");
    const quarter = moves.get(history);
    if (quarter === undefined) {
      for (const folder of owned) {
        const placement = group.completedPlacements?.get(`${folder.ref}:${folder.root}`);
        await refreshArchivedFolder(context, folder, group, quarterEntries(quarters, folder.ref),
          placement ? { placement, endBatch: folder.metadata.endBatch } : undefined);
      }
      continue;
    }
    await moveArchivedFolders(context, quarters, owned, group, quarter);
  }
  const result = changes.filter(({ ref }) => !refs.has(ref));
  for (const [ref, entries] of quarters) {
    const reference = await quarterCommitReference(context, batch.writes, ref, entries.values(), batch.tips);
    result.push({ ref, next: await commitRefTree(context, entries.values(), batch.tips.get(ref), provenance, reference, batchId, actor, receipt),
      expected: batch.tips.get(ref) ?? null });
  }
  return { status: "ok", result };
}

interface MoveScope {
  batch: ResolvedBatch; groups: ReadonlyMap<string, RefWriteGroup>; basis: CompletedMoveBasis;
}

/** Transfer the ended owner's one admitted folder to the quarter its put names, keeping its end batch. */
async function moveArchivedFolders(context: RefBackendContext, quarters: ReadonlyMap<string, Map<string, RefTreeEntry>>, owned: readonly ArchivedFolder[],
  group: RefWriteGroup, quarter: ArchiveQuarter): Promise<void> {
  const [latest] = latestArchivedFolders(owned);
  if (!latest) throw new Error("A moved owner has no folder");
  const target = quarterEntries(quarters, `refs/arc/archive/${quarter}`);
  const placement = group.readPlacement;
  if (placement?.kind !== "completed" || placement.quarter !== quarter) throw new Error("A completed move lacks its checked placement");
  for (const folder of owned) removeArchivedFolder(quarterEntries(quarters, folder.ref), folder);
  await writeArchivedFolder(context, { placement, endBatch: latest.metadata.endBatch }, group, target, latest.owner);
}

/** Number a moved owner as an end in that quarter numbers it: the next work unit, a record's own name, or a cohort's closeout. */
async function movedPlacement(context: RefBackendContext, scope: MoveScope, folder: ArchivedFolder, group: RefWriteGroup,
  quarter: ArchiveQuarter, target: ReadonlyMap<string, RefTreeEntry>): Promise<ReadPlacement | ReturnType<typeof corruptRef>> {
  const reference = ownerPrimaryReference(folder.owner, group.metadata);
  if (reference.kind === "work-item/record") return { kind: "completed", quarter };
  const fallback = nextArchiveSequence(target.values());
  if (reference.kind === "work-item/meta") return { kind: "completed", quarter, sequence: fallback };
  const parents = await preparedCohortParents(context, scope.batch.tips, scope.groups);
  if (parents.status === "refused") return parents.refusal;
  return cohortClosePlacement(context, reference, quarter, { plans: scope.basis.archives, writes: scope.basis.writes, parents: parents.result, fallback });
}

function quarterEntries(quarters: ReadonlyMap<string, Map<string, RefTreeEntry>>, ref: string): Map<string, RefTreeEntry> {
  const entries = quarters.get(ref);
  if (!entries) throw new Error("A completed write has no captured quarter");
  return entries;
}

async function completedQuarterTrees(context: RefBackendContext, changes: readonly RefChange[], batch: ResolvedBatch, refs: ReadonlySet<string>):
Promise<StoreResult<Map<string, Map<string, RefTreeEntry>>>> {
  // A quarter a move creates has no tip yet and starts empty.
  const tips = new Map([...refs].flatMap((ref) => {
    const change = changes.find((change) => change.ref === ref);
    const tip = change && "next" in change ? change.next : batch.tips.get(ref);
    return tip ? [[ref, tip] as const] : [];
  }));
  const trees = await readRefTrees(context, tips);
  const quarters = new Map<string, Map<string, RefTreeEntry>>();
  for (const ref of refs) {
    const entries = tips.has(ref) ? trees.get(ref) : [];
    if (!entries) return { status: "refused", refusal: corruptRef(ref, true) };
    quarters.set(ref, new Map(entries.map((entry) => [entry.path, entry])));
  }
  return { status: "ok", result: quarters };
}
