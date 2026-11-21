/** Refuse merge-base consumption while accepted input still needs its landed identities recorded. */
import type { AsideCopyRecord, ProjectionIndex, RecordEntry, RefusedMark } from "./index-schema.js";
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

/** Older adoption recordings did not mark their guarded link, so they retain their previous fallback. */
export function archiveLayPhase(entry: RecordEntry): "pending" | "linking" | "installed" | undefined {
  const observation = entry.acceptedInputStat;
  return observation?.lay?.kind ?? (observation?.beforeLay === true && entry.adoption === undefined ? "pending" : undefined);
}

/** A guarded link can replace the live input. Bind only the copy of the bytes the receipt actually read. */
export function linkAcceptedArchiveInput(entry: RecordEntry, copy: AsideCopyRecord | null): RecordEntry {
  if (archiveLayPhase(entry) !== "pending") return entry;
  const originalCopy = copy !== null && copy.moving === entry.persisted?.read ? copy.name : null;
  return recordArchiveLay(entry, { kind: "linking", originalCopy });
}

/** The replacement reached its destination, so even its old raw bytes can now be a later edit. */
export function installedArchiveInput(entry: RecordEntry): RecordEntry {
  return archiveLayPhase(entry) === "linking" ? recordArchiveLay(entry, { kind: "installed" }) : entry;
}

/** Recovery returned the bound original, so exact accepted bytes at the path still qualify for their first lay. */
export function restoreAcceptedArchiveInput(entry: RecordEntry, copy: AsideCopyRecord): RecordEntry {
  const lay = entry.acceptedInputStat?.lay;
  if (lay?.kind !== "linking" || lay.originalCopy !== copy.name || copy.writeBackSent || copy.moving !== entry.persisted?.read) return entry;
  return recordArchiveLay(entry, { kind: "pending" });
}

type ArchiveLay = NonNullable<NonNullable<RecordEntry["acceptedInputStat"]>["lay"]>;

function recordArchiveLay(entry: RecordEntry, lay: ArchiveLay): RecordEntry {
  const observation = entry.acceptedInputStat;
  if (observation === undefined) return entry;
  const { ino, mtimeNs } = observation;
  return { ...entry, acceptedInputStat: { ino, mtimeNs, lay } };
}
