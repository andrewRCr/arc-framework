/** Exact whole-group removals and implicit conflict closures for cut cleanup. */
import type { StoreRecord } from "../store/read.js";
import type { Mutation } from "../store/write.js";
import { sameReference, type RecordReference } from "../store/identity.js";

/** Remove each ordinary subject once, resolving its conflicts through that removal. */
export function decomposeRemovalWrites(records: readonly StoreRecord[]): Mutation[] {
  return records.filter(record => !record.reference.kind.endsWith("/conflict-record"))
    .filter((record, index, all) => all.findIndex(other => sameReference(other.reference, record.reference)) === index)
    .map(record => ({ action: "remove", reference: record.reference, expected: record.version,
      ...(record.conflicts.length === 0 ? {} : { resolves: record.conflicts }) }));
}

/** Include the conflict records whose closures the explicit mutations authorize. */
export function decomposeRemovalReferences(writes: readonly Mutation[]): RecordReference[] {
  return writes.flatMap(write => write.action === "remove" ? [write.reference, ...write.resolves ?? []] : [])
    .filter((reference, index, all) => all.findIndex(other => sameReference(other, reference)) === index);
}
