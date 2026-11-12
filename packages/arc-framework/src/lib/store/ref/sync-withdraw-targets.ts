/** Restore withdrawn lifecycle ends under live refs unless independently published ends still stand. */

import { RecordReferenceSchema, type RecordReference } from "../identity.js";
import { expandStoredPath } from "../stored-path.js";
import type { RefBackendContext } from "./context.js";
import { readBatchObjects, type RefTreeEntry } from "./batch-read.js";
import { readLifecycleFolders } from "./sync-lifecycle.js";
import { parseRefMetadata } from "./metadata.js";
import { refPrototype } from "./read.js";
import { viewRefFamily } from "./view-state.js";
import { refOwner } from "./codec.js";
import type { WithdrawJournalStep } from "./sync-withdraw-journal.js";
import { readItemEndBatches } from "./sync-lifecycle-log.js";

/** Select lifecycle destinations while holding the history refs and their possible live counterparts. */
export async function withdrawRefTargets(context: RefBackendContext, journal: readonly WithdrawJournalStep[],
  incoming: ReadonlyMap<string, string>, batches: ReadonlySet<string>): Promise<Map<string, string>> {
  const folders = await readLifecycleFolders(context, incoming), targets = new Map<string, string>();
  for (const step of journal) {
    const live = await restoredLiveRef(context, step, incoming, folders, batches);
    if (live) targets.set(step.ref, live);
  }
  return targets;
}

async function restoredLiveRef(context: RefBackendContext, step: WithdrawJournalStep, incoming: ReadonlyMap<string, string>,
  folders: Awaited<ReturnType<typeof readLifecycleFolders>>, batches: ReadonlySet<string>): Promise<string | undefined> {
  if (!/^refs\/arc\/history\/(?:work|cohort)\//u.test(step.ref)) return;
  const live = step.ref.replace("refs/arc/history/", "refs/arc/"), path = `metadata-${step.ref.split("/").at(-1)}.json`;
  const entry = step.after.get(path), before = step.before.get(path);
  const objects = await readBatchObjects(context, [...entry ? [entry.oid] : [], ...before ? [before.oid] : []]);
  const metadata = parseRefMetadata(entry ? objects.get(entry.oid) : undefined);
  const prior = parseRefMetadata(before ? objects.get(before.oid) : undefined);
  // The original batch's retirement sweep has no after metadata; its prior primary identifies the existing owner.
  const retired = step.ref.startsWith("refs/arc/history/work/") && step.after.size === 0 && prior?.primary !== undefined;
  if (!(metadata?.endBatch && batches.has(metadata.endBatch)) && !retired) return;
  if (folders.some((folder) => folder.liveRef === live)) return;
  if (retired && !incoming.has(live) && (await readItemEndBatches(context, incoming.get(step.ref),
    refOwner(live, "work-item", prior), "retirement")).size > 0) return;
  return live;
}

/** Use the affected group's owner for inverse provenance without importing a backend outside the store. */
export async function withdrawGroupReference(context: RefBackendContext, ref: string,
  entries: ReadonlyMap<string, RefTreeEntry>, fallback: RecordReference): Promise<RecordReference> {
  const live = ref.replace("refs/arc/history/", "refs/arc/"), family = viewRefFamily(live);
  if (!family || ref === "refs/arc/project/registry") return fallback;
  const prototype = refPrototype(context, live, family), path = expandStoredPath(prototype, { registry: context.registry }).metadataPath;
  const entry = entries.get(path), objects = await readBatchObjects(context, entry ? [entry.oid] : []);
  const metadata = parseRefMetadata(entry ? objects.get(entry.oid) : undefined);
  return RecordReferenceSchema.parse({ ...prototype, owner: metadata ? refOwner(live, family, metadata) : prototype.owner });
}
