/**
 * The changed mark's carriers at one path. A record this checkout wrote or moved is marked where the next step reads
 * it: the entry's own `changed`; a journaled arrival's `handoff.changed`, which its confirmation keeps; or, while
 * another record still leaves the path and no arrival is journaled, the leaving entry's `arrivingChanged`, which the
 * installation carries onto the arrival.
 */
import { sameReference, type RecordReference } from "../identity.js";
import type { RecordEntry } from "./index-schema.js";

/** Mark the record written at an entry's path, its journaled arrival or its own; null where the entry holds neither. */
export function markRecordChanged(entry: RecordEntry, reference: RecordReference): RecordEntry | null {
  if (entry.handoff !== undefined && sameReference(entry.handoff.reference, reference)) {
    return entry.handoff.changed ? entry : { ...entry, handoff: { ...entry.handoff, changed: true } };
  }
  if (sameReference(entry.reference, reference)) return entry.changed ? entry : { ...entry, changed: true };
  return null;
}

/** Mark a record arriving at an entry's path, parking the mark on the leaving entry until the arrival is installed. */
export function markArrivingRecord(entry: RecordEntry, reference: RecordReference): RecordEntry {
  return markRecordChanged(entry, reference) ?? { ...entry, arrivingChanged: reference };
}
