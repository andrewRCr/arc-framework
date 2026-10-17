/** Apply the saved-state namespace table to live, completed, reopened, and retired owners. */
import type { ChangesInput } from "../contract.js";
import { RecordReferenceSchema } from "../identity.js";
import type { StoreResult } from "../refusal.js";
import { parseStoreCommitProvenance } from "../commit-provenance.js";
import type { RefBackendContext } from "./context.js";
import { readRefTips, readBatchObjects } from "./batch-read.js";
import { readChangeEnds, isLifecycleRef, type ChangeEnds } from "./changes-ends.js";
import { includesLifecycleOwner } from "./changes-scope.js";
import { latestArchivedFolders } from "./archive-read.js";
import { missingChangeState, type RefChangeWindow, type RefChangeInterval, type ChangeWindowReader } from "./changes-graph.js";

/** Select one continuous history window per owner, excluding states before a reopen. */
export async function lifecycleChangeWindows(context: RefBackendContext, interval: RefChangeInterval, readWindow: ChangeWindowReader): Promise<StoreResult<RefChangeWindow[]>> {
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
    const planned = await ownerChangeWindow(context, input, live, before.get(live), after.get(live), ends.result, current);
    if (planned.status === "refused") return planned;
    if (planned.result) windows.push(planned.result);
  }
  return { status: "ok", result: windows };
}

async function ownerChangeWindow(context: RefBackendContext, input: ChangesInput, live: string, older: string | undefined, newer: string | undefined,
  ends: ChangeEnds, current: ReadonlyMap<string, string>): Promise<StoreResult<RefChangeWindow | null>> {
  if (older && newer) return { status: "ok", result: { ref: live, upper: newer, lower: older, version: input.to } };
  const history = live.replace("refs/arc/", "refs/arc/history/");
  const from = latestArchivedFolders(ends.before.filter(({ liveRef }) => liveRef === live))[0];
  const to = latestArchivedFolders(ends.after.filter(({ liveRef }) => liveRef === live))[0];
  const batches = ends.changed.get(live) ?? new Set<string>();
  if (!older && !newer && !batches.size && !ends.origins.has(live)) return { status: "ok", result: null };
  if (newer && !from) return { status: "ok", result: { ref: live, upper: newer, version: input.to } };
  const source = newer ?? current.get(history) ?? current.get(live);
  if (!source) return { status: "refused", refusal: missingChangeState({ ref: history, version: input.to }) };
  const index = await lifecycleBatchIndex(context, history, source, input);
  if (index.status === "refused") return index;
  if (!hasLifecycleBatches(live, ends, index.result, batches)) return { status: "refused", refusal: missingChangeState({ ref: history, version: input.to }) };
  const upper = newer ?? (to?.metadata.batch ? index.result.get(to.metadata.batch) : source);
  const lower = older ?? (from?.metadata.batch ? index.result.get(from.metadata.batch) : undefined);
  if (!upper) return { status: "refused", refusal: missingChangeState({ ref: history, version: input.to }) };
  return { status: "ok", result: upper === lower ? null : { ref: newer ? live : history, upper, lower, version: input.to } };
}

async function lifecycleBatchIndex(context: RefBackendContext, history: string, tip: string, input: ChangesInput): Promise<StoreResult<Map<string, string>>> {
  const object = (await readBatchObjects(context, [tip])).get(tip);
  if (object?.type !== "commit") return { status: "refused", refusal: missingChangeState({ ref: history, version: input.to }) };
  const cohort = history.startsWith("refs/arc/history/cohort/");
  const reference = RecordReferenceSchema.parse({ kind: cohort ? "cohort/document" : "work-item/meta",
    owner: { type: cohort ? "cohort" : "work-item", name: "unresolved", uid: history.split("/").at(-1) } });
  const { stdout } = await context.exec("git", ["log", "--topo-order", "--format=%H%x00%B%x00", tip], { cwd: context.checkoutRoot, objectAccess: "local-only" });
  const values = stdout.split("\0"), batches = new Map<string, string>();
  for (let index = 0; index + 1 < values.length; index += 2) {
    const revision = values[index]?.trim(), message = values[index + 1];
    if (!revision || message === undefined) continue;
    const provenance = parseStoreCommitProvenance(message, reference);
    if ("batchId" in provenance && provenance.batchId && !batches.has(provenance.batchId)) batches.set(provenance.batchId, revision);
  }
  return { status: "ok", result: batches };
}

function hasLifecycleBatches(live: string, ends: ChangeEnds, index: ReadonlyMap<string, string>, batches: ReadonlySet<string>): boolean {
  const folders = [...ends.before, ...ends.after].filter(({ liveRef }) => liveRef === live);
  return folders.every(({ metadata }) => metadata.batch !== undefined && index.has(metadata.batch)) && [...batches].every((batch) => index.has(batch));
}
