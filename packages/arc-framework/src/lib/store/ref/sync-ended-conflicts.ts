/** Report clashes retained on ended items whose primary records are no longer readable. */

import { RecordReferenceSchema } from "../identity.js";
import type { PullNotice } from "../sync.js";
import type { RefBackendContext } from "./context.js";
import type { SyncMergedTree } from "./sync-tree.js";
import { readBatchObjects, readRefTrees } from "./batch-read.js";
import { readLineageOwners } from "./lineage-resolution.js";
import { parseRefMetadata } from "./metadata.js";

/** Observe the immutable result before applying either a fast-forward or a prepared merge. */
export async function observeSyncEndedConflicts(context: RefBackendContext, ref: string, tip: string,
  tips: ReadonlyMap<string, string>, prepared?: SyncMergedTree): Promise<PullNotice[]> {
  if (!ref.startsWith("refs/arc/history/work/") || prepared?.metadata?.primary || prepared?.metadata?.placement) return [];
  const entries = prepared?.entries ?? new Map((await readRefTrees(context, new Map([[ref, tip]]))).get(ref)?.map((entry) => [entry.path, entry]));
  const paths = [...entries.keys()].filter((path) => /^conflicts\/[^/]+\.json$/u.test(path));
  if (!paths.length) return [];
  const uid = ref.split("/").at(-1), metadataEntry = entries.get(`metadata-${uid}.json`);
  const objects = !prepared && metadataEntry ? await readBatchObjects(context, [metadataEntry.oid]) : undefined;
  const metadata = prepared?.metadata ?? parseRefMetadata(metadataEntry ? objects?.get(metadataEntry.oid) : undefined, ref);
  if (metadata?.primary || metadata?.placement) return [];
  const lineage = await readLineageOwners(context, tips);
  const origin = lineage.status === "ok" ? lineage.result.find((owner) => "uid" in owner && owner.uid === uid) : undefined;
  if (!origin) return [];
  const owner = { ...origin, name: metadata?.slug ?? origin.name };
  const conflicts = paths.map((path) => RecordReferenceSchema.parse({ owner, kind: "work-item/conflict-record",
    key: path.slice("conflicts/".length, -".json".length) }));
  return [{ kind: "ended-with-conflicts", item: owner, conflicts }];
}
