/** Refuse merge-base consumption while accepted input still needs its landed identities recorded. */
import type { RecordEntry } from "./index-schema.js";
import type { StoreRefusal } from "../refusal.js";

/** Identify an unfinished mapping without reading its raw copy or choosing another base. */
export function unfinishedRecordingRefusal(entry: RecordEntry): StoreRefusal | null {
  return entry.persisted?.recording !== true ? null : { code: "state-unresolvable", class: "recoverable",
    reference: entry.reference, historyRefs: [], condition: "Accepted-input recording is unfinished.",
    remedy: { text: "Retry arc save to finish recording the accepted input before preparing another edit; keep the file and retained copy." } };
}
