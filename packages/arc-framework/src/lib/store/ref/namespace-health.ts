/** Admission of exact ref tips before traversing potentially damaged history. */
import type { StoreRefusal } from "../refusal.js";
import type { RefBackendContext } from "./context.js";
import { readBatchObjects, readRefTrees } from "./batch-read.js";
import { holdsNoRecord, type StoredRecordHome } from "../stored-path.js";
import { readRefMetadata, unparsedMetadata } from "./metadata.js";
import { refObjectFault } from "./object-fault.js";
import { missingHistoryRefs } from "./missing-history.js";

/** Report unusable metadata without admitting missing objects through this terminal refusal. */
export function corruptRef(ref: string, options: { saved?: boolean } = {}): StoreRefusal {
  return { code: "namespace-corrupt", class: "terminal", namespace: ref, ...unparsedMetadata(ref, options.saved ?? false) };
}

/** Refuse an unreadable endpoint before Git's history walker can abort the operation. */
export async function checkRefTip(context: RefBackendContext, ref: string, tip: string, home: StoredRecordHome,
  saved = false, current?: ReadonlyMap<string, string>): Promise<StoreRefusal | undefined> {
  const trees = await readRefTrees(context, new Map([[ref, tip]]));
  const entries = trees.get(ref);
  if (!entries) return refObjectFault(ref, "missing", {
    condition: `The tip or a tree of ${ref} is unavailable locally.`, historyRefs: await missingHistoryRefs(context, [ref], current),
  }).refusal;
  if (holdsNoRecord(home, entries.map(({ path }) => path))) return undefined;
  const entry = entries.find(({ path }) => path === home.metadataPath);
  const objects = await readBatchObjects(context, entry ? [entry.oid] : []);
  const read = readRefMetadata(ref, entry, objects);
  if (read.kind === "parsed") return undefined;
  return refObjectFault(ref, read.kind === "absent" ? "no-metadata" : read.kind, {
    saved, historyRefs: read.kind === "missing" ? await missingHistoryRefs(context, [ref], current) : undefined,
  }).refusal;
}
