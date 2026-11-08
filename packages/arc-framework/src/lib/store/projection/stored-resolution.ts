/** Validate the stored evidence selected by an explicit conflict resolution. */
import { ConflictRecordSchema } from "../conflict.js";
import type { Store } from "../contract.js";
import { sameReference, type RecordReference } from "../identity.js";
import type { StoreResult } from "../refusal.js";

/** Read the exact selected conflict even when the projection has no marker mapping for it. */
export async function checkStoredResolution(store: Pick<Store, "read">, subject: RecordReference,
  reference: RecordReference): Promise<StoreResult<void>> {
  const read = await store.read({ reference });
  if (read.status === "refused") return read;
  let value: unknown;
  try { value = JSON.parse(read.result.content); } catch { value = null; }
  const conflict = ConflictRecordSchema.safeParse(value);
  return conflict.success && sameReference(conflict.data.record, subject) ? { status: "ok", result: undefined }
    : { status: "refused", refusal: { code: "record-malformed", class: "recoverable", reference,
      rule: "projection.resolution-conflict", condition: "The selected conflict does not identify a readable conflict on this subject.",
      remedy: { text: "Repair the conflict record or restore its correct projection mapping, then retry." } } };
}
