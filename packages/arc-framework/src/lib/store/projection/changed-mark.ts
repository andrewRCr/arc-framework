/**
 * Changed and opened state follows its record: on its own entry, on a journaled arrival, or parked beside the
 * leaving entry until the arrival can be installed.
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

/** Mark an arriving record changed and optionally opened, parking its state until installation where needed. */
export function markArrivingRecord(entry: RecordEntry, reference: RecordReference, opened = false): RecordEntry {
  const changed = markRecordChanged(entry, reference) ?? { ...entry, arrivingChanged: reference };
  if (!opened) return changed;
  if (changed.handoff !== undefined && sameReference(changed.handoff.reference, reference)) {
    return { ...changed, handoff: { ...changed.handoff, opened: true } };
  }
  return sameReference(changed.reference, reference) ? { ...changed, opened: true } : { ...changed, arrivingOpened: reference };
}
