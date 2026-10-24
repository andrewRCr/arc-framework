/** Apply the saved-state namespace table to live, completed, reopened, and retired owners. */
import { StoreCreationReceiptReader } from "../commit-creation-receipt.js";
import { captureCommitReceipts } from "./history-receipts.js";
import type { ChangesInput } from "../contract.js";
import { OwnerIdentitySchema, RecordReferenceSchema, type OwnerIdentity, type StateVersion } from "../identity.js";
import type { StoreRefusal, StoreResult } from "../refusal.js";
import { indexHistoryBatches } from "./history-batches.js";
import type { RefBackendContext } from "./context.js";
import { readRefTips, readBatchObjects } from "./batch-read.js";
import { readItemEndBatches } from "./sync-lifecycle-log.js";
import { syncRefIsAncestor } from "./sync-graph.js";
import { buildRefManifest, readObjectFormat } from "./manifest.js";
import { readChangeEnds, isLifecycleRef, type ChangeEnds } from "./changes-ends.js";
import { includesLifecycleOwner } from "./changes-scope.js";
import { latestArchivedFolders, type ArchivedFolder } from "./archive-read.js";
import type { ReadPlacement } from "../placement.js";
import { missingChangeState, type RefChangeWindow, type RefChangeInterval, type ChangeWindowReader } from "./changes-graph.js";

/** Select one continuous history window per owner, excluding states before a reopen. */
export async function lifecycleChangeWindows(context: RefBackendContext, interval: RefChangeInterval, readWindow: ChangeWindowReader, evidence = new StoreCreationReceiptReader()): Promise<StoreResult<RefChangeWindow[]>> {
  const { input, before, after } = interval;
  const ends = await readChangeEnds(context, interval, readWindow);
  if (ends.status === "refused") return ends;
  const owners = new Set([...before.keys(), ...after.keys()].filter(isLifecycleRef));
  for (const ref of ends.result.changed.keys()) owners.add(ref);
  for (const ref of ends.result.origins) owners.add(ref);
  if (!owners.size) return { status: "ok", result: [] };
  const current = await readRefTips(context, { includeHistory: true });
  const windows: RefChangeWindow[] = [];
  for (const live of owners) {
    if (!includesLifecycleOwner(context, input.references, live)) continue;
    if (before.get(live) && before.get(live) === after.get(live)) continue;
    const planned = await ownerChangeWindow(context, input, live, before.get(live), after.get(live), ends.result, current, evidence);
    if (planned.status === "refused") return planned;
    if (planned.result) windows.push(planned.result);
  }
  return { status: "ok", result: windows };
}

async function ownerChangeWindow(context: RefBackendContext, input: ChangesInput, live: string, older: string | undefined, newer: string | undefined,
  ends: ChangeEnds, current: ReadonlyMap<string, string>, evidence: StoreCreationReceiptReader): Promise<StoreResult<RefChangeWindow | null>> {
  if (older && newer) return { status: "ok", result: { ref: live, upper: newer, lower: older, version: input.to } };
  const history = live.replace("refs/arc/", "refs/arc/history/");
  const from = latestArchivedFolders(ends.before.filter(({ liveRef }) => liveRef === live))[0];
  const to = latestArchivedFolders(ends.after.filter(({ liveRef }) => liveRef === live))[0];
  const batches = ends.changed.get(live) ?? new Set<string>();
  if (!older && !newer && !batches.size && !ends.origins.has(live)) return { status: "ok", result: null };
  if (newer && !from) return { status: "ok", result: { ref: live, upper: newer, version: input.to } };
  const source = newer ?? current.get(history) ?? current.get(live);
  if (!source) return { status: "refused", refusal: missingChangeState({ ref: history, version: input.to }) };
  const index = await lifecycleBatchIndex(context, history, source, input, evidence);
  if (index.status === "refused") return index;
  if (!hasLifecycleBatches(live, ends, index.result, batches)) return { status: "refused", refusal: missingChangeState({ ref: history, version: input.to }) };
  const lower = older ?? (from?.metadata.batch ? index.result.get(from.metadata.batch) : undefined);
  const end = await endCommit(context, { newer, history, source, index: index.result, to, lower, version: input.to, current });
  if (end.status === "refused") return end;
  const upper = end.result;
  if (!upper) return { status: "refused", refusal: missingChangeState({ ref: history, version: input.to }) };
  const placements = boundPlacements([from, to], index.result, [upper, lower]);
  return { status: "ok", result: upper === lower ? null : { ref: newer ? live : history, upper, lower, version: input.to, placements } };
}

/** A bound its version's latest folder wrote reads, as that version's read did, with the folder's placement. */
function boundPlacements(folders: readonly (ArchivedFolder | undefined)[], index: ReadonlyMap<string, string>,
  bounds: readonly (string | undefined)[]): Map<string, ReadPlacement> {
  const placements = new Map<string, ReadPlacement>();
  for (const folder of folders) {
    const commit = folder?.metadata.batch ? index.get(folder.metadata.batch) : undefined;
    if (folder && commit && bounds.includes(commit)) placements.set(commit, folder.placement);
  }
  return placements;
}

interface EndEvidence {
  newer: string | undefined; history: string; source: string; index: ReadonlyMap<string, string>; to: ArchivedFolder | undefined;
  lower: string | undefined; version: StateVersion; current: ReadonlyMap<string, string>;
}

/**
 * The commit the newer holds the item at: its live tip, an archived or closed item's folder batch — its end or the latest
 * write since — else its retirement. Undefined when held history lacks it, which the caller refuses.
 */
async function endCommit(context: RefBackendContext, evidence: EndEvidence): Promise<StoreResult<string | undefined>> {
  const { newer, index, to } = evidence;
  if (newer) return { status: "ok", result: newer };
  if (to) return { status: "ok", result: to.metadata.batch ? index.get(to.metadata.batch) : undefined };
  return retirementCommit(context, evidence);
}

/**
 * The empty commit that ended a lineage-ended item: the sweep of whichever batch left it its lineage and no primary, or
 * the import's root, never a withdrawn end's. An item restored beside its lineage can end again, so the window takes the
 * one end its lower bound does not reach; past several, only the current state says it holds the latest.
 */
async function retirementCommit(context: RefBackendContext, evidence: EndEvidence): Promise<StoreResult<string | undefined>> {
  const { history, source, index, lower, version, current } = evidence;
  const retired = await readItemEndBatches(context, source, historyOwner(history), "retirement");
  // The index runs newest first, and each later end descends from the reopen before it.
  const ends = [...index].filter(([batch]) => retired.has(batch)).map(([, commit]) => commit).reverse();
  if (ends.length < 2) return { status: "ok", result: ends[0] };
  if (lower && (await readBatchObjects(context, [lower])).get(lower)?.type !== "commit") {
    return { status: "refused", refusal: missingChangeState({ ref: history, version }) };
  }
  const unreached: string[] = [];
  for (const end of ends) if (!lower || !await syncRefIsAncestor(context, end, lower)) unreached.push(end);
  if (unreached.length < 2) return { status: "ok", result: unreached[0] };
  if (buildRefManifest(current, await readObjectFormat(context)).version === version) return { status: "ok", result: unreached.at(-1) };
  return { status: "refused", refusal: unorderedEnds(history, version) };
}

function unorderedEnds(history: string, version: StateVersion): StoreRefusal {
  return { code: "state-unresolvable", class: "recoverable", stateVersion: version, historyRefs: [],
    condition: `${history} holds more than one end after the older state version, and the newer one does not record which it held.`,
    remedy: { text: "Compare against the current state version, which holds the item's latest end, or restrict the comparison to other records." } };
}

/** The owner a history ref names by UID alone, which its stored names resolve. */
function historyOwner(history: string): OwnerIdentity {
  const cohort = history.startsWith("refs/arc/history/cohort/");
  return OwnerIdentitySchema.parse({ type: cohort ? "cohort" : "work-item", name: "unresolved", uid: history.split("/").at(-1) });
}

async function lifecycleBatchIndex(context: RefBackendContext, history: string, tip: string, input: ChangesInput, evidence: StoreCreationReceiptReader): Promise<StoreResult<Map<string, string>>> {
  const object = (await readBatchObjects(context, [tip])).get(tip);
  if (object?.type !== "commit") return { status: "refused", refusal: missingChangeState({ ref: history, version: input.to }) };
  const headReceipt = captureCommitReceipts(new Map([[tip, object]]), history, evidence);
  if (headReceipt.status === "refused") return headReceipt;
  const owner = historyOwner(history);
  const reference = RecordReferenceSchema.parse({ kind: owner.type === "cohort" ? "cohort/document" : "work-item/meta", owner });
  return indexHistoryBatches(context, history, tip, reference, evidence);
}

function hasLifecycleBatches(live: string, ends: ChangeEnds, index: ReadonlyMap<string, string>, batches: ReadonlySet<string>): boolean {
  const folders = [...ends.before, ...ends.after].filter(({ liveRef }) => liveRef === live);
  return folders.every(({ metadata }) => metadata.batch !== undefined && index.has(metadata.batch)) && [...batches].every((batch) => index.has(batch));
}
