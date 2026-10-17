/** Select unpublished ends superseded by another machine's record-backed published end. */

import type { RefBackendContext } from "./context.js";
import type { RefMergeOptions, RefMergeResult } from "./sync-merge.js";
import { lifecycleBatches, readLifecycleFolders, refEndPublished, type RefEndPublished } from "./sync-lifecycle.js";
import { commitWithdrawEnd, type WithdrawEnd } from "./sync-withdraw-commit.js";
import { readLineageOwners } from "./lineage-resolution.js";
import { readItemEndBatches } from "./sync-lifecycle-log.js";

/** Withdraw one competing batch at a time, recapturing its effects before any further decision. */
export async function withdrawUnpublishedRefEnds(context: RefBackendContext, held: ReadonlyMap<string, string>,
  state: ReadonlyMap<string, string>, incoming: ReadonlyMap<string, string>, options: RefMergeOptions,
  published: RefEndPublished = refEndPublished(context, incoming)): Promise<RefMergeResult> {
  const remote = await readLifecycleFolders(context, incoming);
  const lineage = await readLineageOwners(context, incoming);
  for (const end of await ownEndCandidates(context, held)) {
    if (await published(end.live, end.history, end.batch, end.owner)) continue;
    const batches = await lifecycleBatches(context, incoming.get(end.history), end.owner);
    const local = await lifecycleBatches(context, held.get(end.history), end.owner);
    const archived = remote.some((folder) => folder.liveRef === end.live && folder.metadata.endBatch !== end.batch
      && folder.metadata.endBatch && batches.has(folder.metadata.endBatch) && !local.has(folder.metadata.endBatch));
    const retired = !incoming.has(end.live) && lineage.status === "ok" && lineage.result.some((owner) =>
      "uid" in owner && "uid" in end.owner && owner.uid === end.owner.uid)
      && [...await readItemEndBatches(context, incoming.get(end.history), end.owner, "retirement")].some((batch) => !local.has(batch));
    if (archived || retired) return commitWithdrawEnd(context, end, held, state, incoming, options);
  }
  return { status: "complete", changed: false, notices: [] };
}

async function ownEndCandidates(context: RefBackendContext, held: ReadonlyMap<string, string>): Promise<WithdrawEnd[]> {
  const candidates: WithdrawEnd[] = (await readLifecycleFolders(context, held)).flatMap((folder) => {
    const history = folder.liveRef.replace("refs/arc/", "refs/arc/history/");
    return folder.metadata.endBatch && held.has(history) ? [{ owner: folder.owner, live: folder.liveRef, history, batch: folder.metadata.endBatch }] : [];
  });
  const lineage = await readLineageOwners(context, held);
  if (lineage.status === "ok") for (const owner of lineage.result) {
    if (!("uid" in owner)) continue;
    const live = `refs/arc/work/${owner.uid}`, history = live.replace("refs/arc/", "refs/arc/history/");
    if (held.has(live) || !held.has(history)) continue;
    for (const batch of await readItemEndBatches(context, held.get(history), owner, "retirement")) candidates.push({ owner, live, history, batch });
  }
  return candidates;
}
