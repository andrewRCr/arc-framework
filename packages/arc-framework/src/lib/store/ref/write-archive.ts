/** Plan local archive folders under their locks and publish them with the owning history refs. */

import { ArchiveSequenceSchema } from "../../kernel/index.js";
import type { RefChange } from "../../git/ref-transaction.js";
import type { RecordReference } from "../identity.js";
import type { StoreResult } from "../refusal.js";
import type { ReadPlacement } from "../placement.js";
import type { BatchInput } from "../write.js";
import { expandStoredPath, type StoredRecordHome } from "../stored-path.js";
import { readRefTrees, type RefTreeEntry } from "./batch-read.js";
import type { RefBackendContext } from "./context.js";
import type { ResolvedBatch, ResolvedMutation } from "./write-resolution.js";
import type { PreparedRefMutation } from "./write-merge.js";
import { preparedCohortParents, cohortClosePlacement } from "./cohort-coordinates.js";
import { commitRefTree, type RefWriteGroup } from "./write-commits.js";

/** One item's assigned destination, resolved from the locked quarter tree. */
export interface RefArchivePlan {
  source: string; history: string; reference: RecordReference; home: StoredRecordHome;
  placement: ReadPlacement; entries: Map<string, RefTreeEntry>;
}

/** Include every archive destination before the writer acquires its sorted ref locks. */
export function archiveLockRefs(batch: ResolvedBatch): string[] {
  return archiveWrites(batch.writes).flatMap(({ mutation, home }) => mutation.action === "put" && mutation.placement?.kind === "completed"
    ? [home.ref.replace("refs/arc/", "refs/arc/history/"), `refs/arc/archive/${mutation.placement.quarter}`] : []);
}

/** Assign folders from captured quarter tips and stamp the final item metadata before checks. */
export async function planRefArchives(context: RefBackendContext, writes: readonly PreparedRefMutation[],
  groups: ReadonlyMap<string, RefWriteGroup>, tips: ReadonlyMap<string, string>, batchId: string,
  sharedQuarters?: Map<string, Map<string, RefTreeEntry>>): Promise<StoreResult<RefArchivePlan[]>> {
  const selected = archiveWrites(writes);
  if (selected.length === 0) return { status: "ok", result: [] };
  const captured = await readArchiveQuarters(context, selected, tips, sharedQuarters);
  if (captured.status === "refused") return captured;
  const entries = captured.result;
  const parents = selected.some(({ mutation }) => mutation.reference.kind === "cohort/document")
    ? await preparedCohortParents(context, tips, groups) : { status: "ok" as const, result: new Set<string>() };
  if (parents.status === "refused") return parents;
  const plans: RefArchivePlan[] = [];
  const ordered = [...selected.filter(({ mutation }) => mutation.reference.kind !== "cohort/document"),
    ...selected.filter(({ mutation }) => mutation.reference.kind === "cohort/document")];
  for (const { mutation, home } of ordered) {
    if (mutation.action !== "put" || mutation.placement?.kind !== "completed") continue;
    const quarterRef = `refs/arc/archive/${mutation.placement.quarter}`;
    const quarter = entries.get(quarterRef), group = groups.get(home.ref);
    if (!quarter || !group) throw new Error("An archive has no captured group or quarter");
    const placement: ReadPlacement = mutation.reference.kind === "cohort/document"
      ? cohortClosePlacement(context, mutation.reference, mutation.placement.quarter, { plans, writes, parents: parents.result, fallback: nextArchiveSequence(quarter.values()) })
      : mutation.reference.kind === "work-item/meta" ? { ...mutation.placement, sequence: nextArchiveSequence(quarter.values()) } : mutation.placement;
    const destination = expandStoredPath(mutation.reference, { registry: context.registry, placement });
    group.metadata.endBatch = batchId;
    group.metadata.batch = batchId;
    group.readPlacement = placement;
    // Reserve the folder for any later archive in this same batch.
    quarter.set(destination.metadataPath, { path: destination.metadataPath, mode: "100644", oid: "" });
    plans.push({ source: home.ref, history: home.ref.replace("refs/arc/", "refs/arc/history/"), reference: mutation.reference,
      home: destination, placement, entries: quarter });
  }
  return { status: "ok", result: plans };
}

/** Replace ordinary live updates with one history move and one commit per touched quarter. */
export async function archiveRefChanges(context: RefBackendContext, changes: readonly RefChange[], plans: readonly RefArchivePlan[],
  groups: ReadonlyMap<string, RefWriteGroup>, completed: ReadonlyMap<string, RefWriteGroup>, writes: readonly PreparedRefMutation[],
  tips: ReadonlyMap<string, string>, provenance: BatchInput["provenance"], batchId: string): Promise<RefChange[]> {
  if (plans.length === 0) return [...changes];
  const result = changes.filter(({ ref }) => !plans.some(({ source }) => source === ref));
  const identity = await context.identity(), actor = identity === null ? undefined : await context.actor(identity);
  for (const plan of plans) {
    const change = changes.find(({ ref }) => ref === plan.source);
    if (!change || !("next" in change)) throw new Error("An archive has no final item commit");
    const group = writes.some((write) => write.home.ref === plan.source && write.conflicts.length > 0)
      ? completed.get(plan.source) : groups.get(plan.source);
    if (!group) throw new Error("An archive has no final item tree");
    copyArchiveEntries(context, plan, group);
    result.push({ ref: plan.history, next: change.next, expected: null });
    const prior = tips.get(plan.source);
    if (prior) result.push({ ref: plan.source, delete: true, expected: prior });
  }
  const quarters = new Map(plans.map((plan) => [plan.home.ref, plan]));
  for (const [ref, plan] of quarters) {
    const parent = tips.get(ref);
    const next = await commitRefTree(context, plan.entries.values(), parent, provenance, plan.reference, batchId, actor);
    result.push({ ref, next, expected: parent ?? null });
  }
  return result;
}

async function readArchiveQuarters(context: RefBackendContext, selected: readonly ResolvedMutation[], tips: ReadonlyMap<string, string>,
  sharedQuarters?: Map<string, Map<string, RefTreeEntry>>): Promise<StoreResult<Map<string, Map<string, RefTreeEntry>>>> {
  const quarters = new Set(selected.flatMap(({ mutation }) => mutation.action === "put" && mutation.placement?.kind === "completed"
    ? [`refs/arc/archive/${mutation.placement.quarter}`] : []));
  const captured = new Map([...tips].filter(([ref]) => quarters.has(ref)));
  const trees = captured.size ? await readRefTrees(context, captured) : new Map<string, RefTreeEntry[]>();
  for (const ref of captured.keys()) {
    if (!trees.has(ref)) return { status: "refused", refusal: { code: "namespace-corrupt", class: "terminal", namespace: ref,
      condition: "The archive quarter's captured tree is unavailable.", remedy: { text: `Restore or fetch the missing objects for ${ref}, then retry the archive.` } } };
  }
  const entries = sharedQuarters ?? new Map<string, Map<string, RefTreeEntry>>();
  for (const ref of quarters) if (!entries.has(ref)) entries.set(ref, new Map((trees.get(ref) ?? []).map((entry) => [entry.path, entry])));
  return { status: "ok", result: entries };
}

function copyArchiveEntries(context: RefBackendContext, plan: RefArchivePlan, group: RefWriteGroup): void {
  const live = expandStoredPath(plan.reference, { registry: context.registry });
  const folder = plan.home.metadataPath.slice(0, -live.metadataPath.length);
  for (const entry of group.entries.values()) {
    if (entry.path === live.manifestPath.slice(0, -1) || entry.path.startsWith(live.manifestPath)) continue;
    const path = folder + entry.path;
    plan.entries.set(path, { ...entry, path });
  }
}

function archiveWrites<T extends ResolvedBatch["writes"][number]>(writes: readonly T[]): T[] {
  return writes.filter(({ mutation, home }) => /^refs\/arc\/(?:work|cohort)\//u.test(home.ref) && mutation.action === "put"
    && (mutation.reference.kind === "work-item/meta" || mutation.reference.kind === "work-item/record" || mutation.reference.kind === "cohort/document") && mutation.placement?.kind === "completed");
}

function nextArchiveSequence(entries: Iterable<RefTreeEntry>): ReturnType<typeof ArchiveSequenceSchema.parse> {
  let highest = 0n;
  for (const { path } of entries) {
    const match = /^((?:0[1-9]|[1-9][0-9]+))[ab]?_/u.exec(path);
    if (match?.[1] && BigInt(match[1]) > highest) highest = BigInt(match[1]);
  }
  return ArchiveSequenceSchema.parse(String(highest + 1n).padStart(2, "0"));
}
