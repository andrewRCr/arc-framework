/** Record history follows immutable ref commits and filters unrelated changes. */

import type { HistoryEntry } from "../contract.js";
import type { RecordReference } from "../identity.js";
import type { StoreResult } from "../refusal.js";
import { expandStoredPath, type StoredRecordHome } from "../stored-path.js";
import { parseStoreCommitProvenance } from "../commit-provenance.js";
import type { RefBackendContext } from "./context.js";
import { readRefTips } from "./batch-read.js";
import { checkRefKey } from "./path-admission.js";
import { resolveReadReference } from "./read.js";
import { readHistorySnapshots } from "./history-snapshots.js";

interface HistoryCommit { revision: string; parents: string[] }
/** A landed state paired with the commit that changed it. */
export interface RefHistoryDetail { entry: HistoryEntry; revision: string }

/** Resolve a record and read its newest-first landed states from its own ref. */
export async function historyRefRecord(context: RefBackendContext, input: { reference: RecordReference }): Promise<StoreResult<HistoryEntry[]>> {
  const key = checkRefKey(input.reference, context.registry);
  if (key) return { status: "refused", refusal: key };
  const resolved = await resolveReadReference(context, input.reference);
  if (resolved.status === "refused") return resolved;
  const reference = resolved.result;
  const home = expandStoredPath(reference, { registry: context.registry });
  const tips = await readRefTips(context);
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
  const { stdout } = await context.exec("git", ["rev-list", "--full-history", "--parents", "--topo-order", tip, "--",
    `:(literal)${home.path}`, `:(literal)${home.metadataPath}`], { cwd: context.checkoutRoot, objectAccess: "local-only" });
  const rows = parseHistoryRows(stdout);
  const revisions = [...new Set(rows.flatMap((row) => [row.revision, ...row.parents]))];
  const snapshots = await readHistorySnapshots(context, reference, home, revisions);
  if (snapshots.status === "refused") return snapshots;
  const entries: RefHistoryDetail[] = [];
  for (const row of orderHistoryCommits(rows)) {
    const after = snapshots.result.get(row.revision);
    if (!after) throw new Error("A historical commit has no captured state");
    const before = row.parents[0] ? snapshots.result.get(row.parents[0])?.state : undefined;
    if (after.state.version === (before?.version ?? null)) continue;
    const selected = after.state.version === null ? before?.reference ?? after.state.reference : after.state.reference;
    entries.push({ revision: row.revision,
      entry: { ...after.state, reference: selected, provenance: parseStoreCommitProvenance(after.message, selected) } });
  }
  return { status: "ok", result: entries };
}

function parseHistoryRows(stdout: string): HistoryCommit[] {
  return stdout.trim().split("\n").filter(Boolean).map((line) => {
    const [revision, ...parents] = line.split(" ");
    if (!revision || ![revision, ...parents].every((oid) => /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(oid))) throw new Error("Malformed Git history response");
    return { revision, parents };
  });
}

function orderHistoryCommits(rows: readonly HistoryCommit[]): HistoryCommit[] {
  const byId = new Map(rows.map((row) => [row.revision, row]));
  const seen = new Set<string>();
  const ordered: HistoryCommit[] = [];
  const stack = rows.map((row) => ({ row, closing: false })).reverse();
  while (stack.length > 0) {
    const frame = stack.pop();
    if (!frame) throw new Error("An active history traversal has no frame");
    if (frame.closing) { ordered.push(frame.row); continue; }
    if (seen.has(frame.row.revision)) continue;
    seen.add(frame.row.revision);
    stack.push({ row: frame.row, closing: true });
    for (const parent of [...frame.row.parents].reverse()) {
      const row = byId.get(parent);
      if (row) stack.push({ row, closing: false });
    }
  }
  return ordered.reverse();
}
