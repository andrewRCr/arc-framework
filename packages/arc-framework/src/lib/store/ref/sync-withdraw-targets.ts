/** Restore a withdrawn cohort close under its live ref unless a published close still stands. */

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

/** Select lifecycle destinations before acquiring the complete ordered lock set. */
export async function withdrawRefTargets(context: RefBackendContext, journal: readonly WithdrawJournalStep[],
  incoming: ReadonlyMap<string, string>, batches: ReadonlySet<string>): Promise<Map<string, string>> {
  const folders = await readLifecycleFolders(context, incoming), targets = new Map<string, string>();
  for (const step of journal) {
    if (!step.ref.startsWith("refs/arc/history/cohort/")) continue;
    const live = step.ref.replace("refs/arc/history/", "refs/arc/"), path = `metadata-${step.ref.split("/").at(-1)}.json`;
    const entry = step.after.get(path), objects = await readBatchObjects(context, entry ? [entry.oid] : []);
    const metadata = parseRefMetadata(entry ? objects.get(entry.oid) : undefined);
    if (metadata?.endBatch && batches.has(metadata.endBatch) && !folders.some((folder) => folder.liveRef === live)) targets.set(step.ref, live);
  }
  return targets;
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
