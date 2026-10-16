/** Version-bound acquisition and atomic application of a work unit's complete record group. */
import type { Store } from "../store/contract.js";
import { sameReference, type RecordReference } from "../store/identity.js";
import type { StoreRecord } from "../store/read.js";
import type { StoreResult, StoreRefusal } from "../store/refusal.js";
import type { CallerProvenance } from "../store/links.js";
import type { BatchResult, Mutation } from "../store/write.js";
import { batchLifecycleWrites, readWorkUnit, recordPut } from "../store/lifecycle-write.js";
/** Every selected input keeps its exact version even when no edit is needed. */
export interface PreparedLifecycleWrite { records: readonly StoreRecord[]; writes: readonly Mutation[] }
/** Acquire the whole artifact group plus explicitly selected cohort documents. */
export async function acquireLifecycleRecords(store: Store, slug: string, additional: readonly RecordReference[] = []): Promise<StoreResult<readonly StoreRecord[]>> {
  const meta = await readWorkUnit(store, slug);
  if (meta.status === "refused") return meta;
  const listing = await store.list({ family: "work-item", owner: meta.result.reference.owner });
  if (listing.status === "refused") return listing;
  if (listing.result.status !== "complete" || listing.result.missed || listing.result.diagnostics.length > 0) {
    return { status: "refused", refusal: incomplete(meta.result.reference, "The whole artifact group could not be read completely.") };
  }
  const records = [...listing.result.records];
  for (const reference of additional) {
    if (records.some((record) => sameReference(record.reference, reference))) continue;
    const read = await store.read({ reference });
    if (read.status === "refused") return read;
    records.push(read.result);
  }
  return { status: "ok", result: records };
}
/** Apply edits under every acquired version guard in one backend batch. */
export async function applyPreparedLifecycleWrite(store: Store, prepared: PreparedLifecycleWrite, provenance: CallerProvenance): Promise<StoreResult<BatchResult>> {
  const valid = await revalidateLifecycleRecords(store, prepared.records);
  if (valid.status === "refused") return valid;
  const writes = [...prepared.writes];
  for (const record of prepared.records) {
    if (!writes.some((write) => sameReference(write.reference, record.reference))) writes.push(recordPut(record));
  }
  return batchLifecycleWrites(store, writes, provenance);
}
function incomplete(reference: RecordReference, condition: string): StoreRefusal {
  return { code: "record-malformed", class: "recoverable", reference, rule: "lifecycle.prepared-write", condition,
    remedy: { text: "Read the complete work-unit artifact group again, prepare against its current versions, then retry." } };
}

/** Validate every acquired input even when the prepared plan contains no edits. */
export async function revalidateLifecycleRecords(store: Store, records: readonly StoreRecord[]): Promise<StoreResult<true>> {
  for (const record of records) {
    const fresh = await store.read({ reference: record.reference });
    if (fresh.status === "refused") return fresh;
    if (fresh.result.version !== record.version) {
      return { status: "refused", refusal: { code: "version-conflict", class: "recoverable", records: [record.reference],
        condition: "An acquired record changed after preparation; no edits were applied.",
        remedy: { text: "Acquire the complete record group again, prepare against its current versions, then retry." } } };
    }
  }
  return { status: "ok", result: true };
}
