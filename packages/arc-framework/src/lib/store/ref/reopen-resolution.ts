/** Resolve reopen subjects from captured archive folders and retained history batches. */

import type { Mutation } from "../write.js";
import type { RecordReference } from "../identity.js";
import { sameOwner } from "../identity.js";
import { HistoryRefSchema, type StoreResult, type StoreRefusal } from "../refusal.js";
import { parseStoreCommitProvenance } from "../commit-provenance.js";
import { archivedFolders, isArchiveRef, type ArchivedFolder } from "./archive-read.js";
import { readBatchObjects, readRefTrees } from "./batch-read.js";
import type { RefBackendContext } from "./context.js";
import type { LiveRefOwner } from "./namespace-admission.js";
import type { ResolvedBatch } from "./write-resolution.js";

/** Find every folder belonging to a UID explicitly being reopened, validating its history basis. */
export async function resolveRefReopens(context: RefBackendContext, writes: readonly Mutation[], tips: ReadonlyMap<string, string>,
  live: readonly LiveRefOwner[]): Promise<StoreResult<ArchivedFolder[]>> {
  const requested = writes.filter((write) => write.action === "put" && write.placement && write.placement.kind !== "completed"
    && (write.reference.kind === "work-item/meta" || write.reference.kind === "work-item/record")
    && write.reference.owner.type === "work-item" && write.reference.owner.uid && !live.some(({ owner }) => sameOwner(owner, write.reference.owner)));
  if (!requested.length) return { status: "ok", result: [] };
  const selected = new Map([...tips].filter(([ref]) => isArchiveRef(ref)));
  if (!selected.size) return { status: "ok", result: [] };
  const trees = await readRefTrees(context, selected);
  const objects = await readBatchObjects(context, [...new Set([...trees.values()].flatMap((entries) => entries.map(({ oid }) => oid)))]);
  const folders = [...trees].flatMap(([ref, entries]) => archivedFolders("work-item", ref, entries, objects).folders)
    .filter(({ owner }) => requested.some(({ reference }) => sameOwner(owner, reference.owner)));
  for (const { reference } of requested) {
    const own = folders.filter(({ owner }) => sameOwner(owner, reference.owner));
    if (!own.length) continue;
    const history = own[0]?.liveRef.replace("refs/arc/", "refs/arc/history/");
    if (!history) throw new Error("An archived owner has no history coordinate");
    const tip = tips.get(history);
    if (!tip) return { status: "refused", refusal: missingReopenHistory(reference, history) };
    const { stdout } = await context.exec("git", ["log", "--format=%B%x00", tip], { cwd: context.checkoutRoot, objectAccess: "local-only" });
    const batches = new Set(stdout.split("\0").map((message) => parseStoreCommitProvenance(message.trimStart(), reference))
      .flatMap((entry) => "batchId" in entry ? [entry.batchId] : []));
    if (own.some(({ metadata }) => !metadata.batch || !batches.has(metadata.batch))) {
      return { status: "refused", refusal: missingReopenHistory(reference, history) };
    }
  }
  return { status: "ok", result: folders };
}

/** Lock both lifecycle ref names and every quarter holding a reopened owner. */
export function reopenLockRefs(batch: ResolvedBatch): string[] {
  return (batch.archived ?? []).flatMap((folder) => [folder.ref, folder.liveRef, folder.liveRef.replace("refs/arc/", "refs/arc/history/")]);
}

/** Re-resolve when the locked history or quarter capture differs from the validated basis. */
export function reopenBasisChanged(batch: ResolvedBatch, tips: ReadonlyMap<string, string>): boolean {
  if (!batch.archived?.length) return false;
  const histories = batch.archived.map(({ liveRef }) => liveRef.replace("refs/arc/", "refs/arc/history/"));
  const quarters = [...new Set([...batch.tips.keys(), ...tips.keys()])].filter(isArchiveRef);
  return [...histories, ...quarters].some((ref) => tips.get(ref) !== batch.tips.get(ref));
}

function missingReopenHistory(reference: RecordReference, history: string): StoreRefusal {
  return { code: "state-unresolvable", class: "recoverable", reference, historyRefs: [HistoryRefSchema.parse(history)],
    condition: "The retained history does not contain every batch named by this item's archive folders.",
    remedy: { text: `Pull ${history} by name, then retry the reopen. Restore the ref from a clone holding it if the remote no longer has it.` } };
}
