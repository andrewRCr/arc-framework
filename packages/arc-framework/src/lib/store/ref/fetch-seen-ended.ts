/** Release prune keepers only after published end records have moved the local item into history. */

import { updateRefTransaction } from "../../git/ref-transaction.js";
import type { RefBackendContext } from "./context.js";
import { readLineageOwners } from "./lineage-resolution.js";
import { readSyncRefs } from "./sync-graph.js";
import { readLifecycleFolders } from "./sync-lifecycle.js";

/** Absence alone never proves an end; require its published archive or lineage record and applied history. */
export async function releaseEndedRefKeepers(context: RefBackendContext, remote: string,
  incoming: ReadonlyMap<string, string>): Promise<void> {
  const prefix = `refs/arc/tmp/seen/${remote}/`, kept = await readSyncRefs(context, prefix);
  if (!kept.size) return;
  const state = await readSyncRefs(context, "refs/arc/");
  const ended = new Set((await readLifecycleFolders(context, incoming)).map(({ liveRef }) => liveRef));
  const lineage = await readLineageOwners(context, incoming);
  if (lineage.status === "ok") for (const owner of lineage.result) {
    if ("uid" in owner) ended.add(`refs/arc/work/${owner.uid}`);
  }
  for (const [ref, tip] of kept) {
    const live = `refs/arc/${ref.slice(prefix.length)}`, history = live.replace("refs/arc/", "refs/arc/history/");
    if (ended.has(live) && !state.has(live) && state.has(history)) {
      await updateRefTransaction(context, [{ ref, delete: true, expected: tip }], { cwd: context.checkoutRoot });
    }
  }
}
