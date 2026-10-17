/** Prepare reopen metadata and remove every archived copy in the owning ref transaction. */

import type { RefChange } from "../../git/ref-transaction.js";
import type { BatchInput } from "../write.js";
import type { RecordReference } from "../identity.js";
import { sameOwner } from "../identity.js";
import type { StoreResult } from "../refusal.js";
import { readRefTrees, type RefTreeEntry } from "./batch-read.js";
import type { RefBackendContext } from "./context.js";
import type { ResolvedBatch } from "./write-resolution.js";
import type { ArchivedFolder } from "./archive-read.js";
import { commitRefTree, type RefWriteGroup } from "./write-commits.js";

/** One history ref becoming live, sharing mutable quarter trees with the other reopens. */
export interface RefReopenPlan {
  history: string; live: string; reference: RecordReference; quarters: Map<string, Map<string, RefTreeEntry>>;
}

/** Clear end stamps and remove every owned folder from complete captured quarter trees. */
export async function planRefReopens(context: RefBackendContext, batch: ResolvedBatch, groups: ReadonlyMap<string, RefWriteGroup>,
  tips: ReadonlyMap<string, string>): Promise<StoreResult<RefReopenPlan[]>> {
  if (!batch.archived?.length) return { status: "ok", result: [] };
  const refs = new Set(batch.archived.map(({ ref }) => ref));
  const captured = await readReopenQuarters(context, refs, tips);
  if (captured.status === "refused") return captured;
  const quarters = captured.result;
  const plans: RefReopenPlan[] = [];
  for (const [history, group] of groups) {
    const folders = batch.archived.filter(({ liveRef }) => liveRef.replace("refs/arc/", "refs/arc/history/") === history);
    const first = folders[0];
    if (!first || !batch.writes.some(({ mutation, home }) => home.ref === history && mutation.action === "put"
      && (mutation.reference.kind === "work-item/meta" || mutation.reference.kind === "work-item/record")
      && mutation.placement?.kind !== "completed")) continue;
    const reference = batch.writes.find(({ mutation }) => sameOwner(mutation.reference.owner, first.owner))?.mutation.reference;
    if (!reference) throw new Error("A reopened owner has no mutation");
    delete group.metadata.endBatch;
    delete group.metadata.batch;
    group.viewRef = first.liveRef;
    removeOwnedFolders(quarters, folders);
    plans.push({ history, live: first.liveRef, reference, quarters });
  }
  return { status: "ok", result: plans };
}

/** Move each prepared history commit live and publish all quarter removals in that transaction. */
export async function reopenRefChanges(context: RefBackendContext, changes: readonly RefChange[], plans: readonly RefReopenPlan[],
  tips: ReadonlyMap<string, string>, provenance: BatchInput["provenance"], batchId: string): Promise<RefChange[]> {
  if (!plans.length) return [...changes];
  const result = changes.filter(({ ref }) => !plans.some(({ history, quarters }) => history === ref || quarters.has(ref)));
  for (const plan of plans) {
    const change = changes.find(({ ref }) => ref === plan.history), prior = tips.get(plan.history);
    if (!change || !("next" in change) || !prior) throw new Error("A reopen has no final history commit or captured parent");
    result.push({ ref: plan.live, next: change.next, expected: null }, { ref: plan.history, delete: true, expected: prior });
  }
  const first = plans[0];
  if (!first) throw new Error("A reopen has no quarter trees");
  const identity = await context.identity(), actor = identity === null ? undefined : await context.actor(identity);
  for (const [ref, entries] of first.quarters) {
    const parent = tips.get(ref);
    const next = await commitRefTree(context, entries.values(), parent, provenance, first.reference, batchId, actor);
    result.push({ ref, next, expected: parent ?? null });
  }
  return result;
}

async function readReopenQuarters(context: RefBackendContext, refs: ReadonlySet<string>, tips: ReadonlyMap<string, string>):
Promise<StoreResult<Map<string, Map<string, RefTreeEntry>>>> {
  const trees = await readRefTrees(context, new Map([...tips].filter(([ref]) => refs.has(ref))));
  const quarters = new Map<string, Map<string, RefTreeEntry>>();
  for (const ref of refs) {
    const tree = trees.get(ref);
    if (!tree) return { status: "refused", refusal: { code: "namespace-corrupt", class: "terminal", namespace: ref,
      condition: "The archive quarter's captured tree is unavailable.", remedy: { text: `Restore or fetch the missing objects for ${ref}, then retry the reopen.` } } };
    quarters.set(ref, new Map(tree.map((entry) => [entry.path, entry])));
  }
  return { status: "ok", result: quarters };
}

function removeOwnedFolders(quarters: ReadonlyMap<string, Map<string, RefTreeEntry>>, folders: readonly ArchivedFolder[]): void {
  for (const folder of folders) {
    const quarter = quarters.get(folder.ref);
    if (!quarter) throw new Error("A reopened folder has no captured quarter");
    for (const path of quarter.keys()) if (path.startsWith(folder.root)) quarter.delete(path);
  }
}
