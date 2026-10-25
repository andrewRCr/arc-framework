/** Release prune keepers only after a captured published end makes them unnecessary. */
import { updateRefTransaction } from "../../git/ref-transaction.js";
import type { RefBackendContext } from "./context.js";
import { readSyncRefs } from "./sync-graph.js";
import { readLifecycleFolders } from "./sync-lifecycle.js";
import { withRefFetchKeepers } from "./fetch-seen.js";
import { readRefTrees, readBatchObjects } from "./batch-read.js";
import { decodeCapturedRef } from "./read.js";

/** A read source needs fetched end proof and live absence; a merged source also needs applied local history. */
export async function releaseEndedRefKeepers(context: RefBackendContext, remote: string,
  incoming: ReadonlyMap<string, string>, readOnly = false): Promise<void> {
  if (readOnly) await withRefFetchKeepers(context, remote, () => releaseCapturedKeepers(context, remote, incoming, true));
  else await releaseCapturedKeepers(context, remote, incoming, false);
}

async function releaseCapturedKeepers(context: RefBackendContext, remote: string,
  incoming: ReadonlyMap<string, string>, readOnly: boolean): Promise<void> {
  const prefix = `refs/arc/tmp/seen/${remote}/`, kept = await readSyncRefs(context, prefix);
  if (!kept.size) return;
  const state = readOnly ? await capturedTracking(context, remote) : await readSyncRefs(context, "refs/arc/");
  const proof = readOnly ? new Map([...incoming].filter(([ref, tip]) => state.get(ref) === tip)) : incoming;
  const ended = new Set((await readLifecycleFolders(context, proof)).map(({ liveRef }) => liveRef));
  for (const ref of await publishedLineageRefs(context, proof)) ended.add(ref);
  for (const [ref, tip] of kept) {
    const live = `refs/arc/${ref.slice(prefix.length)}`, history = live.replace("refs/arc/", "refs/arc/history/");
    if (ended.has(live) && !state.has(live) && (readOnly || state.has(history))) {
      await updateRefTransaction(context, [{ ref, delete: true, expected: tip }], { cwd: context.checkoutRoot });
    }
  }
}

async function capturedTracking(context: RefBackendContext, remote: string): Promise<Map<string, string>> {
  const prefix = `refs/arc-remotes/${remote}/`;
  return new Map([...(await readSyncRefs(context, prefix))].map(([ref, tip]) => [`refs/arc/${ref.slice(prefix.length)}`, tip]));
}

async function publishedLineageRefs(context: RefBackendContext, incoming: ReadonlyMap<string, string>): Promise<string[]> {
  const ref = "refs/arc/project/registry", tip = incoming.get(ref);
  if (!tip) return [];
  const entries = (await readRefTrees(context, new Map([[ref, tip]]))).get(ref);
  if (!entries) return [];
  const objects = await readBatchObjects(context, [...new Set(entries.filter(({ path }) =>
    path === "metadata-registry.json" || path.startsWith("lineage/")).map(({ oid }) => oid))]);
  const decoded = decodeCapturedRef(context, { family: "lineage", kind: "lineage/transition" }, ref, entries, objects);
  return decoded.records.flatMap(({ reference }) => reference.owner.type === "work-item" && reference.owner.uid
    ? [`refs/arc/work/${reference.owner.uid}`] : []);
}
