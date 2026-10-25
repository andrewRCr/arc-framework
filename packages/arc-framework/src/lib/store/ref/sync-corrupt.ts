/** Preserve item lifecycle coordinates when damaged quarter metadata obscures an unpublished end. */

import type { PullNotice } from "../sync.js";
import type { RefBackendContext } from "./context.js";
import { isArchiveRef } from "./archive-read.js";
import { checkSyncRefTip } from "./sync-tip.js";
import { readUnpublishedRefBatches, expandRefBatchExclusion } from "./sync-batches.js";
import { syncRefIsAncestor } from "./sync-graph.js";

/** Broken folders cannot establish a reopen; hold their unpublished batch's item refs for repair. */
export async function readCorruptArchiveBatchRefs(context: RefBackendContext, held: ReadonlyMap<string, string>,
  tracking: ReadonlyMap<string, string>): Promise<{ refs: Set<string>; notices: PullNotice[] }> {
  const refs = new Set<string>(), notices: PullNotice[] = [];
  if (!await hasCompetingHistory(context, held, tracking)) return { refs, notices };
  for (const [ref, tip] of held) {
    if (!isArchiveRef(ref)) continue;
    const refusal = await checkSyncRefTip(context, ref, tip);
    if (!refusal) continue;
    refs.add(ref);
    notices.push({ kind: "namespace-corrupt", ref, condition: refusal.condition, remedy: refusal.remedy });
  }
  if (refs.size) {
    const changes = [...held].filter(([ref, tip]) => tracking.get(ref) !== tip).map(([ref, next]) => ({ ref, next }));
    appendArchiveHolds(refs, notices, await readUnpublishedRefBatches(context, { local: held, tracking, changes }));
  }
  return { refs, notices };
}

function appendArchiveHolds(refs: Set<string>, notices: PullNotice[], batches: Awaited<ReturnType<typeof readUnpublishedRefBatches>>): void {
  for (const notice of [...notices]) {
    if (notice.kind !== "namespace-corrupt") continue;
    const affected = new Set([notice.ref]);
    expandRefBatchExclusion(affected, batches);
    for (const ref of affected) {
      refs.add(ref);
      if (!/^refs\/arc\/(?:history\/)?(?:work|cohort)\//u.test(ref)) continue;
      notices.push({ kind: "namespace-corrupt", ref,
        condition: `${ref} remains held until ${notice.ref} is repaired. ${notice.condition}`, remedy: notice.remedy });
    }
  }
}

async function hasCompetingHistory(context: RefBackendContext, held: ReadonlyMap<string, string>,
  tracking: ReadonlyMap<string, string>): Promise<boolean> {
  for (const [ref, tip] of held) {
    if (!/^refs\/arc\/history\/(work|cohort)\//u.test(ref)) continue;
    if (tracking.has(ref.replace("refs/arc/history/", "refs/arc/"))) return true;
    const published = tracking.get(ref);
    if (!published || published === tip) continue;
    if (!await syncRefIsAncestor(context, tip, published) && !await syncRefIsAncestor(context, published, tip)) return true;
  }
  return false;
}
