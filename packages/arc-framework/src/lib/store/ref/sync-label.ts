/** Last record-changing commits supply labels without validating published record content. */

import type { SideLabel } from "../conflict.js";
import type { ReadPlacement } from "../placement.js";
import { completeSyncPlacements } from "./sync-placement.js";
import type { SyncTreeSide } from "./sync-tree.js";
import { RecordReferenceSchema, type RecordReference } from "../identity.js";
import { expandStoredPath } from "../stored-path.js";
import type { RefBackendContext } from "./context.js";
import { readHistoryPaths } from "./history-paths.js";
import { orderHistoryCommits, parseHistoryRows } from "./history-order.js";
import { readRefTrees, readBatchObjects, type BatchObject, type RefTreeEntry } from "./batch-read.js";
import { canonicalPrimaryKind, historicalMetadataFailure, parseRefMetadata, type RefMetadata } from "./metadata.js";
import type { StoreRefusal } from "../refusal.js";
import { refFormatKey } from "./format-key.js";
import { refRecordVersion } from "./record-version.js";
import { refOwner } from "./codec.js";
import { readStoredMergeLabel } from "./side-labels.js";
import { corruptRef } from "./namespace-health.js";
import { captureHistoricalNamespaces } from "./historical-namespace.js";
import { readHistoricalGraph } from "./history-graph.js";

/** An unreadable historical label refuses its ref without masking other reconciliation failures. */
export class RefSyncLabelError extends Error {
  readonly refusal: StoreRefusal;
  constructor(ref: string, refusal: StoreRefusal = { code: "namespace-corrupt", class: "terminal", namespace: ref, ...historicalMetadataFailure(ref) }) {
    super(refusal.condition);
    this.refusal = refusal;
  }
}

/** Find the latest accepted state change on a competing side since its merge base. */
export async function readSyncRecordLabel(context: RefBackendContext, reference: RecordReference, ref: string,
  tip: string, base: string | null): Promise<SideLabel> {
  const { rows, states } = await captureSyncRecordHistory(context, reference, ref, tip, base);
  let latest: string | undefined, previous: string | null | undefined;
  for (const row of rows) {
    const after = states.get(row.revision)?.version;
    const parent = states.get(row.parents[0] ?? "")?.version ?? null;
    const before = row.parents.length > 1 && previous !== undefined ? previous : parent;
    if (after !== before) { latest = row.revision; previous = after; }
  }
  if (!latest) throw new RefSyncLabelError(ref, { code: "namespace-corrupt", class: "terminal", namespace: ref,
    condition: `No saved state on ${ref} since the merge base changes ${reference.kind}, though that side's record differs from the base.`,
    remedy: historicalMetadataFailure(ref).remedy });
  return readStoredMergeLabel(context, latest);
}

/** Recover real placement from a saved state with the exact retained record version. */
export async function readSyncRecordPlacement(context: RefBackendContext, reference: RecordReference, ref: string,
  tip: string | null, version: string, tipSets: readonly ReadonlyMap<string, string>[]): Promise<ReadPlacement> {
  if (!tip) throw new RefSyncLabelError(ref);
  const { states } = await captureSyncRecordHistory(context, reference, ref, tip, null);
  for (const [revision, state] of states) {
    const metadata = state.metadata, placement = metadata?.primary?.placement ?? metadata?.placement;
    if (state.version !== version || !metadata || !placement) continue;
    const side: SyncTreeSide = { tip: revision, metadata, entries: new Map(state.entries.map(entry => [entry.path, entry])) };
    if (await completeSyncPlacements(context, ref, [side], tipSets)) return side.placement ?? placement;
  }
  throw new RefSyncLabelError(ref, { code: "namespace-corrupt", class: "terminal", namespace: ref,
    condition: `No readable saved state on ${ref} supplies placement for retained record ${JSON.stringify(reference)} at version ${version}.`,
    remedy: { text: `Restore original placement evidence for this exact version, or correct or remove the unwitnessed retained record forward on its source ref ${ref} while preserving other records; then retry the pull. Do not infer placement.` } });
}

async function captureSyncRecordHistory(context: RefBackendContext, reference: RecordReference, ref: string,
  tip: string, base: string | null) {
  const home = expandStoredPath(reference, { registry: context.registry, history: ref.startsWith("refs/arc/history/") });
  const paths = await readHistoryPaths(context, reference, home, tip);
  const walked = await readHistoricalGraph(context, ["rev-list", "--full-history", "--parents", "--topo-order", tip,
    ...base ? [`^${base}`] : [], "--", ...paths.map((path) => `:(literal)${path}`)], corruptRef(ref, true));
  if (walked.status === "refused") throw new RefSyncLabelError(ref, walked.refusal);
  const rows = orderHistoryCommits(parseHistoryRows(walked.result)).reverse();
  const revisions = [...new Set(rows.flatMap((row) => [row.revision, ...row.parents]))];
  const trees = revisions.length ? await readRefTrees(context, new Map(revisions.map((revision) => [revision, revision])), paths) : new Map<string, RefTreeEntry[]>();
  const objects = await readBatchObjects(context, [...new Set([...trees.values()].flatMap((entries: RefTreeEntry[]) =>
    entries.filter(({ path }) => path === home.metadataPath).map(({ oid }) => oid)))]);
  const namespaces = await captureHistoricalNamespaces(context, home, trees, objects, false);
  if (namespaces.unavailable.size) throw new RefSyncLabelError(ref, corruptRef(ref, true));
  if (namespaces.corrupt.size) throw new RefSyncLabelError(ref);
  const states = new Map(revisions.map((revision) => [revision, {
    ...versionAt(context, reference, ref, home.metadataPath, trees.get(revision), objects, namespaces.recordFree.has(revision)),
    entries: trees.get(revision) ?? [],
  }]));
  return { rows, states };
}

function versionAt(context: RefBackendContext, reference: RecordReference, ref: string, metadataPath: string,
  entries: readonly RefTreeEntry[] | undefined, objects: ReadonlyMap<string, BatchObject | null>, recordFree: boolean): { version: string | null; metadata?: RefMetadata } {
  if (!entries) throw new RefSyncLabelError(ref, corruptRef(ref, true));
  const metadataEntry = entries.find(({ path }) => path === metadataPath);
  const metadata = parseRefMetadata(metadataEntry ? objects.get(metadataEntry.oid) : null, ref);
  if (!metadata) {
    if (recordFree) return { version: null };
    throw new RefSyncLabelError(ref);
  }
  const family = context.registry[reference.kind].family;
  const owner = reference.owner.type === "project" || family === "lineage" ? reference.owner : refOwner(ref, family, metadata);
  const kind = canonicalPrimaryKind(reference.kind, metadata);
  reference = RecordReferenceSchema.parse({ ...reference, owner, kind });
  const path = expandStoredPath(reference, { registry: context.registry }).path, entry = entries.find((candidate) => candidate.path === path);
  return { metadata, version: entry ? refRecordVersion(reference, entry.oid, metadata, metadata.formats[refFormatKey(reference)] ?? 1) : null };
}
