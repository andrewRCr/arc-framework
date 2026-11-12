/** Distinguish absent record paths from unavailable objects at a captured tip. */
import type { RecordReference } from "../identity.js";
import type { StoredRecordHome } from "../stored-path.js";
import type { StoreResult } from "../refusal.js";
import type { RefBackendContext } from "./context.js";
import { resolveRefPointObject } from "./point-object.js";
import { refObjectFault } from "./object-fault.js";

/** Inspect the pinned tree before suggesting that an unavailable record should be created. */
export async function refRecordAbsence(context: RefBackendContext, reference: RecordReference,
  home: StoredRecordHome, tip: string): Promise<StoreResult<never>> {
  const resolved = await resolveRefPointObject(context, { ref: home.ref, tip, path: home.path }, null);
  if (resolved.kind === "missing") return { status: "refused", refusal: refObjectFault(home.ref, "missing", {
    reference, historyRefs: [],
    ...resolved.entries ? {
      condition: `The record blob at ${home.path} on ${home.ref} is unavailable locally.`,
      remedy: { text: `Restore or fetch the missing record objects for ${home.ref} in the store repository, then retry.` },
    } : {},
  }).refusal };
  return absentRefRecord(reference);
}

/** Report established path absence without suggesting restoration of an object that never occupied the tree. */
export function absentRefRecord(reference: RecordReference, condition = "The record is not present in local state",
  remedy = "Pull state or create the record, then retry."): StoreResult<never> {
  return { status: "refused", refusal: { code: "not-found", class: "recoverable", reference,
    condition, remedy: { text: remedy } } };
}
