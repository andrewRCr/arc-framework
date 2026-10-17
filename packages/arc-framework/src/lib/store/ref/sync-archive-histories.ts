/** Discover completed groups whose held histories still lack an incoming folder refresh. */

import { canonicalize } from "../../kernel/canonical/canonical-json.js";
import { HistoryRefSchema } from "../refusal.js";
import type { RefBackendContext } from "./context.js";
import type { ArchivedFolder } from "./archive-read.js";
import { lifecycleBatches, readLifecycleFolders, type PendingRefEnd } from "./sync-lifecycle.js";

/** Keep concurrent completed writes pending across pulls until their history incorporates the incoming batch. */
export async function readPendingArchiveHistories(context: RefBackendContext, held: ReadonlyMap<string, string>,
  state: ReadonlyMap<string, string>, incoming: ReadonlyMap<string, string>): Promise<PendingRefEnd[]> {
  const remote = new Map((await readLifecycleFolders(context, incoming)).map((folder) => [folderKey(folder), folder]));
  const requested = new Map<string, PendingRefEnd>();
  for (const here of await readLifecycleFolders(context, state)) {
    const there = remote.get(folderKey(here));
    if (!there || canonicalize(here.entries) === canonicalize(there.entries)) continue;
    const history = HistoryRefSchema.parse(here.liveRef.replace("refs/arc/", "refs/arc/history/"));
    const batches = await lifecycleBatches(context, held.get(history), here.owner);
    if (here.metadata.batch && there.metadata.batch && batches.has(here.metadata.batch) && !batches.has(there.metadata.batch)) {
      requested.set(history, { live: here.liveRef, history, owner: here.owner });
    }
  }
  return [...requested.values()];
}

function folderKey(folder: ArchivedFolder): string { return `${folder.liveRef}\0${folder.metadata.endBatch ?? folder.root}`; }
