/** Record history follows immutable ref commits and filters unrelated changes. */

import { StoreCreationReceiptReader } from "../commit-creation-receipt.js";
import { checkRefTip } from "./namespace-health.js";
import { restartOnVanishedStore } from "./repository.js";
import type { HistoryEntry } from "../contract.js";
import type { RecordReference } from "../identity.js";
import type { StoreResult } from "../refusal.js";
import { expandStoredPath, type StoredRecordHome } from "../stored-path.js";
import { parseStoreCommitProvenance } from "../commit-provenance.js";
import type { RefBackendContext } from "./context.js";
import { projectIdentityQueries, projectOwnerFromObjects, admitProjectReference } from "./project-identity.js";
import { readBatchObjects, readRefTips } from "./batch-read.js";
import { checkRefKey } from "./path-admission.js";
import { resolveReadReference } from "./read.js";
import { resolveArchivedReferences } from "./archive-resolution.js";
import type { ReadPlacement } from "../placement.js";
import { readHistoricalGraph, unavailableRefHistory } from "./history-graph.js";
import { readHistoryPaths } from "./history-paths.js";
import { retiredHistoryHome } from "./retired-history.js";
import { parseHistoryRows, orderHistoryCommits, type HistoryCommit } from "./history-order.js";
import { readHistorySnapshots, type HistoricalSnapshot } from "./history-snapshots.js";

/** A landed state paired with the commit that changed it. */
export interface RefHistoryDetail { entry: HistoryEntry; revision: string }

/** Resolve a record and read its newest-first landed states from its own ref. */
export async function historyRefRecord(context: RefBackendContext, input: { reference: RecordReference }): Promise<StoreResult<HistoryEntry[]>> {
  const key = checkRefKey(input.reference, context.registry, false);
  if (key) return { status: "refused", refusal: key };
  return restartOnVanishedStore(context, async (bound) => readCapturedRefHistory(bound, input.reference, await readRefTips(bound, { includeHistory: true })));
}

/** Resolve record history solely against the caller's immutable namespace capture. */
export async function readCapturedRefHistory(context: RefBackendContext, requested: RecordReference,
  tips: ReadonlyMap<string, string>): Promise<StoreResult<HistoryEntry[]>> {
  const key = checkRefKey(requested, context.registry, false);
  if (key) return { status: "refused", refusal: key };
  const resolved = await resolveReadReference(context, requested, tips);
  if (resolved.status === "refused") return resolved;
  let reference = resolved.result;
  if (reference.owner.type === "project") {
    const owner = projectOwnerFromObjects(tips, await readBatchObjects(context, projectIdentityQueries(tips)));
    if (owner.status === "refused") return owner;
    const admitted = admitProjectReference(reference, owner.result);
    if (admitted.status === "refused") return admitted;
    reference = admitted.result;
  }
  const evidence = new StoreCreationReceiptReader();
  const archived = await resolveArchivedReferences(context, [reference], tips, evidence);
  if (archived.status === "refused") return archived;
  const retired = archived.result.length ? { status: "ok" as const, result: null } : await retiredHistoryHome(context, reference, tips);
  if (retired.status === "refused") return retired;
  const home = retired.result ?? expandStoredPath(reference, { registry: context.registry, history: archived.result.length > 0 });
  const tip = tips.get(home.ref);
  return tip ? readRefHistory(context, reference, home, tip, evidence) : { status: "ok", result: [] };
}

/** Read a record log using the immutable metadata landed in every historical commit. */
async function readRefHistory(context: RefBackendContext, reference: RecordReference,
  home: StoredRecordHome, tip: string, evidence = new StoreCreationReceiptReader()): Promise<StoreResult<HistoryEntry[]>> {
  const history = await readRefHistoryDetails(context, reference, home, tip, evidence);
  return history.status === "refused" ? history : { status: "ok", result: history.result.map(({ entry }) => entry) };
}

/**
 * Retain change-commit identities for merge bases and stored-side labels. Stale-base comparisons may supply the
 * captured endpoint's folder placement for its tip; ordinary history reads use landed metadata throughout.
 */
export async function readRefHistoryDetails(context: RefBackendContext, reference: RecordReference,
  home: StoredRecordHome, tip: string, evidence = new StoreCreationReceiptReader(), ended?: ReadPlacement): Promise<StoreResult<RefHistoryDetail[]>> {
  const unhealthy = await checkRefTip(context, home.ref, tip, home.metadataPath);
  if (unhealthy) return { status: "refused", refusal: unhealthy };
  const paths = await readHistoryPaths(context, reference, home, tip);
  const graph = await readHistoricalGraph(context, ["rev-list", "--full-history", "--parents", "--topo-order", tip, "--",
    ...paths.map((path) => `:(literal)${path}`)], unavailableRefHistory(reference, home.ref));
  if (graph.status === "refused") return graph;
  const rows = parseHistoryRows(graph.result);
  const revisions = [...new Set(rows.flatMap((row) => [row.revision, ...row.parents]))];
  const snapshots = await readHistorySnapshots(context, reference, home, revisions, paths, evidence, ended, tip);
  if (snapshots.status === "refused") return snapshots;
  return { status: "ok", result: historyDetails(rows, snapshots.result) };
}

function historyDetails(rows: readonly HistoryCommit[], snapshots: ReadonlyMap<string, HistoricalSnapshot>): RefHistoryDetail[] {
  const entries: RefHistoryDetail[] = [];
  for (const row of orderHistoryCommits(rows).reverse()) {
    const after = snapshots.get(row.revision);
    if (!after) throw new Error("A historical commit has no captured state");
    const parent = row.parents[0] ? snapshots.get(row.parents[0])?.state : undefined;
    const before = row.parents.length > 1 ? entries.at(-1)?.entry ?? parent : parent;
    if (after.state.version === (before?.version ?? null)) continue;
    const selected = after.state.version === null ? before?.reference ?? after.state.reference : after.state.reference;
    entries.push({ revision: row.revision,
      entry: { ...after.state, reference: selected, provenance: parseStoreCommitProvenance(after.message, selected),
        ...(after.creationReceipt ? { creationReceipt: after.creationReceipt } : {}) } });
  }
  return entries.reverse();
}
