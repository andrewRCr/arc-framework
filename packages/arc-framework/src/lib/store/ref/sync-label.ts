/** Last record-changing commits supply labels without validating published record content. */

import type { SideLabel } from "../conflict.js";
import { RecordReferenceSchema, type RecordReference } from "../identity.js";
import { expandStoredPath } from "../stored-path.js";
import type { RefBackendContext } from "./context.js";
import { readHistoryPaths } from "./history-paths.js";
import { orderHistoryCommits, parseHistoryRows } from "./history-order.js";
import { readRefTrees, readBatchObjects, type BatchObject, type RefTreeEntry } from "./batch-read.js";
import { parseRefMetadata } from "./metadata.js";
import { refFormatKey } from "./format-key.js";
import { refRecordVersion } from "./record-version.js";
import { refOwner } from "./codec.js";
import { readStoredMergeLabel } from "./side-labels.js";

/** Find the latest accepted state change on a competing side since its merge base. */
export async function readSyncRecordLabel(context: RefBackendContext, reference: RecordReference, ref: string,
  tip: string, base: string | null): Promise<SideLabel> {
  const home = expandStoredPath(reference, { registry: context.registry, history: ref.startsWith("refs/arc/history/") });
  const paths = await readHistoryPaths(context, reference, home, tip);
  const { stdout } = await context.exec("git", ["rev-list", "--full-history", "--parents", "--topo-order", tip,
    ...base ? [`^${base}`] : [], "--", ...paths.map((path) => `:(literal)${path}`)], { cwd: context.checkoutRoot, objectAccess: "local-only" });
  const rows = orderHistoryCommits(parseHistoryRows(stdout)).reverse();
  const revisions = [...new Set(rows.flatMap((row) => [row.revision, ...row.parents]))];
  const trees = revisions.length ? await readRefTrees(context, new Map(revisions.map((revision) => [revision, revision])), paths) : new Map<string, RefTreeEntry[]>();
  const objects = await readBatchObjects(context, [...new Set([...trees.values()].flatMap((entries: RefTreeEntry[]) =>
    entries.filter(({ path }) => path === home.metadataPath).map(({ oid }) => oid)))]);
  const versions = new Map(revisions.map((revision) => [revision,
    versionAt(context, reference, ref, home.metadataPath, trees.get(revision), objects)]));
  let latest: string | undefined, previous: string | null | undefined;
  for (const row of rows) {
    const after = versions.get(row.revision);
    const parent = versions.get(row.parents[0] ?? "") ?? null;
    const before = row.parents.length > 1 && previous !== undefined ? previous : parent;
    if (after !== before) { latest = row.revision; previous = after; }
  }
  if (!latest) throw new Error("A competing record side has no changed state after its merge base");
  return readStoredMergeLabel(context, latest);
}

function versionAt(context: RefBackendContext, reference: RecordReference, ref: string, metadataPath: string,
  entries: readonly RefTreeEntry[] | undefined, objects: ReadonlyMap<string, BatchObject | null>): string | null {
  if (!entries) throw new Error("A competing side's historical tree is unavailable");
  const metadataEntry = entries.find(({ path }) => path === metadataPath);
  const metadata = parseRefMetadata(metadataEntry ? objects.get(metadataEntry.oid) : null, ref);
  if (!metadata) {
    if (entries.every(({ path }) => path === metadataPath)) return null;
    throw new Error("A competing side's historical metadata is unavailable");
  }
  const family = context.registry[reference.kind].family;
  const owner = reference.owner.type === "project" || family === "lineage" ? reference.owner : refOwner(ref, family, metadata);
  const kind = ["work-item/meta", "work-item/record"].includes(reference.kind) ? metadata.primary?.role ?? reference.kind : reference.kind;
  reference = RecordReferenceSchema.parse({ ...reference, owner, kind });
  const path = expandStoredPath(reference, { registry: context.registry }).path, entry = entries.find((candidate) => candidate.path === path);
  return entry ? refRecordVersion(reference, entry.oid, metadata, metadata.formats[refFormatKey(reference)] ?? 1) : null;
}
