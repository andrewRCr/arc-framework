/** Entry updates made by test ports when an aside copy's content lands. */
import type { RecordEntry } from "../../../../src/lib/store/projection/index-schema.js";

/** Keep the landed blob beside the copy whose edit the port persisted. */
export function recordLandedCopy(entry: RecordEntry, copy: string | null, blob: string): RecordEntry {
  return { ...entry, copies: entry.copies.map((record) => record.name === copy ? { ...record, landed: blob } : record) };
}
