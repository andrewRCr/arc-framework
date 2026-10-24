/** Apply the saved-state namespace table to live, completed, reopened, and retired owners. */
import { StoreCreationReceiptReader } from "../commit-creation-receipt.js";
import { captureCommitReceipts } from "./history-receipts.js";
import type { ChangesInput } from "../contract.js";
import { RecordReferenceSchema } from "../identity.js";
import type { StoreResult } from "../refusal.js";
import { readHistoryBatchIndex } from "./history-batches.js";
import type { RefBackendContext } from "./context.js";
import { readRefTips, readBatchObjects, readRefTrees } from "./batch-read.js";
import { expandStoredPath } from "../stored-path.js";
import { refPrototype } from "./read.js";
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
  for (const ref of ends.result.origins.keys()) owners.add(ref);
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
  const upper = newer ?? await endCommit(context, { live, history, source, index: index.result, to, ends });
  const lower = older ?? (from?.metadata.batch ? index.result.get(from.metadata.batch) : undefined);
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
  live: string; history: string; source: string; index: ReadonlyMap<string, string>; to: ArchivedFolder | undefined; ends: ChangeEnds;
}

/**
 * The retained-history commit an end inside the window wrote: the newest of its folder's batch and its lineage record's
 * batch, else its retirement's final sweep. Undefined when held history lacks that evidence, which the caller refuses.
 */
async function endCommit(context: RefBackendContext, evidence: EndEvidence): Promise<string | undefined> {
  const { live, history, source, index, to, ends } = evidence;
  const ended = ends.origins.has(live);
  const batches = new Set([to?.metadata.batch, ends.origins.get(live)].filter((batch): batch is string => batch !== undefined));
  if (!batches.size) return ended ? retirementSweep(context, live, history, source) : source;
  if (![...batches].every((batch) => index.has(batch))) return undefined;
  // The index runs newest first, so the first of these batches it names is the later end.
  const newest = [...index.keys()].find((batch) => batches.has(batch));
  return newest === undefined ? undefined : index.get(newest);
}

/** The newest retained commit whose tree holds no record, which a retirement's final commit leaves. */
async function retirementSweep(context: RefBackendContext, live: string, history: string, tip: string): Promise<string | undefined> {
  const home = expandStoredPath(refPrototype(context, live, history.includes("/cohort/") ? "cohort" : "work-item"), { registry: context.registry });
  const { stdout } = await context.exec("git", ["rev-list", "--topo-order", tip], { cwd: context.checkoutRoot, objectAccess: "local-only" });
  const revisions = stdout.split("\n").map((line) => line.trim()).filter(Boolean);
  const trees = await readRefTrees(context, new Map(revisions.map((revision) => [revision, revision])));
  return revisions.find((revision) => trees.get(revision)?.every(({ path }) => path === home.metadataPath || path.startsWith(home.manifestPath)));
}

async function lifecycleBatchIndex(context: RefBackendContext, history: string, tip: string, input: ChangesInput, evidence: StoreCreationReceiptReader): Promise<StoreResult<Map<string, string>>> {
  const object = (await readBatchObjects(context, [tip])).get(tip);
  if (object?.type !== "commit") return { status: "refused", refusal: missingChangeState({ ref: history, version: input.to }) };
  const headReceipt = captureCommitReceipts(new Map([[tip, object]]), history, evidence);
  if (headReceipt.status === "refused") return headReceipt;
  const cohort = history.startsWith("refs/arc/history/cohort/");
  const reference = RecordReferenceSchema.parse({ kind: cohort ? "cohort/document" : "work-item/meta",
    owner: { type: cohort ? "cohort" : "work-item", name: "unresolved", uid: history.split("/").at(-1) } });
  return await readHistoryBatchIndex(context, history, tip, reference, evidence)
    ?? { status: "refused", refusal: missingChangeState({ ref: history, version: input.to }) };
}

function hasLifecycleBatches(live: string, ends: ChangeEnds, index: ReadonlyMap<string, string>, batches: ReadonlySet<string>): boolean {
  const folders = [...ends.before, ...ends.after].filter(({ liveRef }) => liveRef === live);
  return folders.every(({ metadata }) => metadata.batch !== undefined && index.has(metadata.batch)) && [...batches].every((batch) => index.has(batch));
}
