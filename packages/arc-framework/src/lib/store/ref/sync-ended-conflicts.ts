/** Report clashes retained on ended items whose primary records are no longer readable. */

import { type RecordReference } from "../identity.js";
import type { PullNotice } from "../sync.js";
import type { RefBackendContext } from "./context.js";
import type { SyncMergedTree } from "./sync-tree.js";
import { readBatchObjects, readRefTrees } from "./batch-read.js";
import { readLineageOwners } from "./lineage-resolution.js";
import { decodeStoredReference } from "./path-decode.js";
import { parseRefMetadata } from "./metadata.js";

/** Observe the immutable result before applying either a fast-forward or a prepared merge. */
export async function observeSyncEndedConflicts(context: RefBackendContext, ref: string, tip: string,
  tips: ReadonlyMap<string, string>, prepared?: SyncMergedTree): Promise<PullNotice[]> {
  if (!ref.startsWith("refs/arc/history/work/") || prepared?.metadata?.primary || prepared?.metadata?.placement) return [];
  const entries = prepared?.entries ?? new Map((await readRefTrees(context, new Map([[ref, tip]]))).get(ref)?.map((entry) => [entry.path, entry]));
  const paths = [...entries.keys()].filter((path) => /^(?:review\/)?conflicts\/[^/]+\.json$/u.test(path));
  if (!paths.length) return [];
  const uid = ref.split("/").at(-1), metadataEntry = entries.get(`metadata-${uid}.json`);
  const objects = !prepared && metadataEntry ? await readBatchObjects(context, [metadataEntry.oid]) : undefined;
  const metadata = prepared?.metadata ?? parseRefMetadata(metadataEntry ? objects?.get(metadataEntry.oid) : undefined, ref);
  if (metadata?.primary || metadata?.placement) return [];
  const lineage = await readLineageOwners(context, tips);
  const origin = lineage.status === "ok" ? lineage.result.find((owner) => "uid" in owner && owner.uid === uid) : undefined;
  if (!origin) return [];
  const owner = { ...origin, name: metadata?.slug ?? origin.name };
  if (!metadata) return [];
  const conflicts = paths.flatMap((path) => {
    const reference = decodeStoredReference(context.registry, owner, "work-item", path, metadata);
    return reference && "owner" in reference && reference.kind.endsWith("/conflict-record") ? [reference] : [];
  });
  const first = conflicts[0];
  if (!first) return [];
  const commands = conflicts.map((reference) => inspectionArgv(reference).join(" "));
  return [{ kind: "ended-with-conflicts", item: owner, conflicts,
    condition: `Ended work item ${owner.name} (${uid}) retains conflicts: ${conflicts.map((reference) => `${reference.kind} ${conflictId(reference)}`).join(", ")}. The ordinary conflict view does not list these retained records.`,
    remedy: { argv: inspectionArgv(first), text: `Inspect each retained alternative: ${commands.join("; ")}. Preserve wanted content elsewhere before explicitly discarding an alternative with the same command and --discard. This accepts the end's current state; publication follows the next ordinary push.` } }];
}

function inspectionArgv(reference: RecordReference): string[] {
  if (reference.owner.type !== "work-item" || !reference.owner.uid) throw new Error("A retained conflict needs its owner's UID");
  return ["arc", "store", "conflict", reference.owner.uid, reference.kind, conflictId(reference)];
}

function conflictId(reference: RecordReference): string {
  if (typeof reference.key !== "string") throw new Error("A retained conflict needs its exact string ID");
  return reference.key;
}
