/** Refuse merge-base consumption while accepted input still needs its landed identities recorded. */
import type { ProjectionIndex, RecordEntry, RefusedMark } from "./index-schema.js";
import type { StoreRefusal } from "../refusal.js";

/** Identify an unfinished mapping without reading its raw copy or choosing another base. */
export function unfinishedRecordingRefusal(entry: RecordEntry): StoreRefusal | null {
  if (entry.persisted?.recording !== true && entry.archiveSubmission === undefined) return null;
  return { code: "state-unresolvable", class: "recoverable",
    reference: entry.reference, historyRefs: [], condition: entry.archiveSubmission === undefined
      ? "Accepted-input recording is unfinished." : "The interrupted archive save's acceptance has not been checked.",
    remedy: { text: "Retry arc save to finish recording the accepted input before preparing another edit; keep the file and retained copy." } };
}
/** A staged or accepted archive input still needs its exact installation continuation. */
export function hasArchiveRecording(path: string, entry: ProjectionIndex["entries"][string] | undefined): boolean {
  return entry?.archiveSubmission !== undefined
    || path.startsWith(".arc/completed/") && entry?.kind === "record" && entry.persisted?.recording === true;
}

/** The unchanged raw input of a partial landing still needs its local repair. */
export function retainedArchiveInput(entry: RecordEntry, blob: string): RefusedMark | undefined {
  return entry.persisted?.read === blob ? entry.persisted.retained : undefined;
}
