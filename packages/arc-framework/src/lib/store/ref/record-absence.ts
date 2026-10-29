/** Distinguish absent record paths from unavailable objects at a captured tip. */
import type { RecordReference } from "../identity.js";
import type { StoredRecordHome } from "../stored-path.js";
import type { StoreResult } from "../refusal.js";
import type { RefBackendContext } from "./context.js";
import { readRefTrees } from "./batch-read.js";
import { corruptRef } from "./namespace-health.js";

/** Inspect the pinned tree before suggesting that an unavailable record should be created. */
export async function refRecordAbsence(context: RefBackendContext, reference: RecordReference,
  home: StoredRecordHome, tip: string): Promise<StoreResult<never>> {
  const entries = (await readRefTrees(context, new Map([[home.ref, tip]]))).get(home.ref);
  if (!entries) return { status: "refused", refusal: corruptRef(home.ref, true) };
  if (entries.some(({ path }) => path === home.path)) return { status: "refused", refusal: {
    code: "state-unresolvable", class: "recoverable", reference, historyRefs: [],
    condition: `The record blob at ${home.path} on ${home.ref} is unavailable locally.`,
    remedy: { text: `Restore or fetch the missing record objects for ${home.ref} in the store repository, then retry.` },
  } };
  return { status: "refused", refusal: { code: "not-found", class: "recoverable", reference,
    condition: "The record is not present in local state", remedy: { text: "Pull state or create the record, then retry." } } };
}
