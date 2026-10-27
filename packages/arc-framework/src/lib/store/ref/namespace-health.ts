/** Admission of exact ref tips before traversing potentially damaged history. */
import type { StoreRefusal } from "../refusal.js";
import type { RefBackendContext } from "./context.js";
import { readBatchObjects, readRefTrees } from "./batch-read.js";
import { holdsNoRecord, type StoredRecordHome } from "../stored-path.js";
import { parseRefMetadata, unparsedMetadata } from "./metadata.js";

/** Keep unavailable objects distinct from a present tree with unusable metadata. */
export function corruptRef(ref: string, missingObjects = false, saved = false): StoreRefusal {
  return { code: "namespace-corrupt", class: "terminal", namespace: ref, ...(missingObjects ? {
    condition: `The tip or a tree of ${ref} is unavailable locally.`,
    remedy: { text: `Restore or fetch the missing objects for ${ref} in the store repository, then retry.` },
  } : unparsedMetadata(ref, saved)) };
}

/** Refuse an unreadable endpoint before Git's history walker can abort the operation. */
export async function checkRefTip(context: RefBackendContext, ref: string, tip: string, home: StoredRecordHome, saved = false): Promise<StoreRefusal | undefined> {
  const trees = await readRefTrees(context, new Map([[ref, tip]]));
  const entries = trees.get(ref);
  if (!entries) return corruptRef(ref, true);
  if (holdsNoRecord(home, entries.map(({ path }) => path))) return undefined;
  const entry = entries.find(({ path }) => path === home.metadataPath);
  const objects = await readBatchObjects(context, entry ? [entry.oid] : []);
  return parseRefMetadata(entry ? objects.get(entry.oid) : null, ref) ? undefined : corruptRef(ref, false, saved);
}
