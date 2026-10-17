/** Report independently published end records until their owner repairs the ambiguity. */

import { LineageRecordSchema } from "../kinds/lineage/index.js";
import type { PullNotice } from "../sync.js";
import type { OwnerIdentity } from "../identity.js";
import type { RefBackendContext } from "./context.js";
import { readBatchObjects } from "./batch-read.js";
import { readLifecycleFolders, refEndPublished, type RefEndPublished } from "./sync-lifecycle.js";

/** Inspect the final merged records, retaining publication as a separate requirement. */
export async function observeSyncEndedTwice(context: RefBackendContext, state: ReadonlyMap<string, string>,
  incoming: ReadonlyMap<string, string>, published: RefEndPublished = refEndPublished(context, incoming)): Promise<PullNotice[]> {
  const remote = await readLifecycleFolders(context, incoming);
  const grouped = new Map<string, Awaited<ReturnType<typeof readLifecycleFolders>>>();
  for (const folder of await readLifecycleFolders(context, state)) {
    const batch = folder.metadata.endBatch;
    const history = folder.liveRef.replace("refs/arc/", "refs/arc/history/");
    if (!batch || !remote.some((other) => other.liveRef === folder.liveRef && other.metadata.endBatch === batch)
      && !await published(folder.liveRef, history, batch, folder.owner)) continue;
    const folders = grouped.get(folder.liveRef) ?? [];
    folders.push(folder); grouped.set(folder.liveRef, folders);
  }
  const notices: PullNotice[] = [];
  for (const folders of grouped.values()) {
    const first = folders[0];
    if (!first) continue;
    const lineage = await publishedTerminalLineage(context, state, incoming, first.owner);
    if (new Set(folders.map(({ metadata }) => metadata.endBatch)).size + Number(lineage) < 2) continue;
    const ends = folders.map(({ ref, metadata }) => `${ref} (batch ${metadata.endBatch})`);
    if (lineage) ends.push("terminal lineage");
    notices.push({ kind: "ended-twice", item: first.owner,
      condition: `The item holds independently published ends: ${ends.join("; ")}.`,
      remedy: { text: "If the retained histories diverged, merge both through a forced fetch of the tracking history and a pull by name first. Remove the item's lineage record where present, then reopen it to remove every archived folder, and end it once." } });
  }
  return notices;
}

async function publishedTerminalLineage(context: RefBackendContext, state: ReadonlyMap<string, string>,
  incoming: ReadonlyMap<string, string>, owner: OwnerIdentity): Promise<boolean> {
  if (owner.type !== "work-item" || !owner.uid) return false;
  const ref = "refs/arc/project/registry", local = state.get(ref), remote = incoming.get(ref);
  if (!local || !remote) return false;
  const path = `lineage/${owner.uid}.json`, a = `${local}:${path}`, b = `${remote}:${path}`;
  const objects = await readBatchObjects(context, [a, b]), content = objects.get(a);
  if (!content || content.oid !== objects.get(b)?.oid) return false;
  try {
    const parsed = LineageRecordSchema.safeParse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(content.bytes)));
    return parsed.success && parsed.data.kind !== "rename";
  } catch { return false; }
}
