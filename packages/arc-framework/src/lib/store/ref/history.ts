/** Record history follows immutable ref commits and filters unrelated changes. */

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
import { readHistoryPaths } from "./history-paths.js";
import { retiredHistoryHome } from "./retired-history.js";
import { parseHistoryRows, orderHistoryCommits } from "./history-order.js";
import { readHistorySnapshots } from "./history-snapshots.js";

/** A landed state paired with the commit that changed it. */
export interface RefHistoryDetail { entry: HistoryEntry; revision: string }

/** Resolve a record and read its newest-first landed states from its own ref. */
export async function historyRefRecord(context: RefBackendContext, input: { reference: RecordReference }): Promise<StoreResult<HistoryEntry[]>> {
  const key = checkRefKey(input.reference, context.registry, false);
  if (key) return { status: "refused", refusal: key };
  const tips = await readRefTips(context, { includeHistory: true });
  const resolved = await resolveReadReference(context, input.reference, tips);
  if (resolved.status === "refused") return resolved;
  let reference = resolved.result;
  if (reference.owner.type === "project") {
    const owner = projectOwnerFromObjects(tips, await readBatchObjects(context, projectIdentityQueries(tips)));
    if (owner.status === "refused") return owner;
    const admitted = admitProjectReference(reference, owner.result);
    if (admitted.status === "refused") return admitted;
    reference = admitted.result;
  }
  const archived = await resolveArchivedReferences(context, [reference], tips);
  if (archived.status === "refused") return archived;
  const retired = archived.result.length ? { status: "ok" as const, result: null } : await retiredHistoryHome(context, reference, tips);
  if (retired.status === "refused") return retired;
  const home = retired.result ?? expandStoredPath(reference, { registry: context.registry, history: archived.result.length > 0 });
  const tip = tips.get(home.ref);
  return tip ? readRefHistory(context, reference, home, tip) : { status: "ok", result: [] };
}

/** Read a record log against one exact tip, also usable by a locked stale-base lookup. */
export async function readRefHistory(context: RefBackendContext, reference: RecordReference,
  home: StoredRecordHome, tip: string): Promise<StoreResult<HistoryEntry[]>> {
  const history = await readRefHistoryDetails(context, reference, home, tip);
  return history.status === "refused" ? history : { status: "ok", result: history.result.map(({ entry }) => entry) };
}

/** Retain change-commit identities for merge bases and stored-side labels. */
export async function readRefHistoryDetails(context: RefBackendContext, reference: RecordReference,
  home: StoredRecordHome, tip: string): Promise<StoreResult<RefHistoryDetail[]>> {
  const paths = await readHistoryPaths(context, reference, home, tip);
  const { stdout } = await context.exec("git", ["rev-list", "--full-history", "--parents", "--topo-order", tip, "--",
    ...paths.map((path) => `:(literal)${path}`)], { cwd: context.checkoutRoot, objectAccess: "local-only" });
  const rows = parseHistoryRows(stdout);
  const revisions = [...new Set(rows.flatMap((row) => [row.revision, ...row.parents]))];
  const snapshots = await readHistorySnapshots(context, reference, home, revisions, paths);
  if (snapshots.status === "refused") return snapshots;
  const entries: RefHistoryDetail[] = [];
  for (const row of orderHistoryCommits(rows).reverse()) {
    const after = snapshots.result.get(row.revision);
    if (!after) throw new Error("A historical commit has no captured state");
    const parent = row.parents[0] ? snapshots.result.get(row.parents[0])?.state : undefined;
    const before = row.parents.length > 1 ? entries.at(-1)?.entry ?? parent : parent;
    if (after.state.version === (before?.version ?? null)) continue;
    const selected = after.state.version === null ? before?.reference ?? after.state.reference : after.state.reference;
    entries.push({ revision: row.revision,
      entry: { ...after.state, reference: selected, provenance: parseStoreCommitProvenance(after.message, selected) } });
  }
  return { status: "ok", result: entries.reverse() };
}
