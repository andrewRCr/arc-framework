/** Preserve item lifecycle coordinates when damaged quarter metadata obscures an unpublished end. */

import type { PullNotice } from "../sync.js";
import type { RefBackendContext } from "./context.js";
import { isArchiveRef } from "./archive-read.js";
import { checkSyncRefTip } from "./sync-tip.js";
import { readUnpublishedRefBatches, expandRefBatchExclusion } from "./sync-batches.js";

/** Broken folders cannot establish a reopen; hold their unpublished batch's item refs for repair. */
export async function readCorruptArchiveBatchRefs(context: RefBackendContext, held: ReadonlyMap<string, string>,
  tracking: ReadonlyMap<string, string>): Promise<{ refs: Set<string>; notices: PullNotice[] }> {
  const refs = new Set<string>(), notices: PullNotice[] = [];
  if (![...held.keys()].some((ref) => /^refs\/arc\/history\/(work|cohort)\//u.test(ref)
    && tracking.has(ref.replace("refs/arc/history/", "refs/arc/")))) return { refs, notices };
  for (const [ref, tip] of held) {
    if (!isArchiveRef(ref)) continue;
    const refusal = await checkSyncRefTip(context, ref, tip);
    if (!refusal) continue;
    refs.add(ref);
    notices.push({ kind: "namespace-corrupt", ref, condition: refusal.condition, remedy: refusal.remedy });
  }
  if (refs.size) {
    const changes = [...held].filter(([ref, tip]) => tracking.get(ref) !== tip).map(([ref, next]) => ({ ref, next }));
    expandRefBatchExclusion(refs, await readUnpublishedRefBatches(context, { local: held, tracking, changes }));
  }
  return { refs, notices };
}
