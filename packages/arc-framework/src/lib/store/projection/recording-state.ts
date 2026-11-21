/** Refuse merge-base consumption while accepted input still needs its landed identities recorded. */
import type { AsideCopyRecord, FileStat, ProjectionIndex, RecordEntry, RefusedMark } from "./index-schema.js";
import type { StoreRefusal } from "../refusal.js";
import type { TakeInRead, TakeInRequest } from "./take-in-port.js";
import { gitBlobId, type ObjectFormat } from "./blob-id.js";

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
  return awaitsArchiveInstallation(entry) ? recordArchiveLay(entry, { kind: "installed" }) : entry;
}

/** A readable earlier adoption journal kept beforeLay set on both sides of installation. */
export function isPredecessorArchiveAdoption(entry: RecordEntry): boolean {
  return entry.adoption?.kind === "read-back" && entry.acceptedInputStat?.beforeLay === true && entry.acceptedInputStat.lay === undefined;
}

/** The durable journal may still precede an installation whose link has already succeeded. */
export function awaitsArchiveInstallation(entry: RecordEntry): boolean {
  return archiveLayPhase(entry) === "linking" || isPredecessorArchiveAdoption(entry);
}

/** Retain the first-lay proof when a temporary leaf link prevents observing the live file. */
export function retainsArchiveLayAcrossLeafLink(entry: RecordEntry): boolean {
  const phase = archiveLayPhase(entry);
  if (phase === "pending" && entry.acceptedInputStat !== undefined && entry.persisted?.read !== undefined) return true;
  return entry.adoption?.kind === "read-back" && (awaitsArchiveInstallation(entry) || phase === "installed");
}

/** A journal awaiting installation proof needs the live staged inode, distinct from the accepted input's inode. */
export function provesArchiveInstallation(entry: RecordEntry, stat: FileStat | null): boolean {
  return awaitsArchiveInstallation(entry)
    && stat?.type === "file" && stat.ino === entry.stat?.ino && stat.ino !== entry.acceptedInputStat?.ino;
}

/** Interpret the installation evidence before treating exact accepted Markdown bytes as an edit. */
export function archiveAdoptionBasis(entry: RecordEntry, original: FileStat, observed: FileStat | null):
  "original" | "installed" | "indeterminate" {
  if (archiveLayPhase(entry) === "installed" || provesArchiveInstallation(entry, observed)) return "installed";
  if (!awaitsArchiveInstallation(entry) || observed?.ino === original.ino || entry.stat?.ino === original.ino) return "original";
  return "indeterminate";
}

/** A standing adoption disagreement survives changes to the live buffer and transient read refusals. */
export function adoptionResolutionHold(entry: RecordEntry): RefusedMark | null {
  return entry.adoption?.kind === "read-back" && entry.refused?.reason === "bases-disagree" ? entry.refused : null;
}

/** An observation can leave a path pending without replacing its standing resolution. */
export function pendingObservedRefusal(entry: RecordEntry, mark: RefusedMark): RecordEntry {
  return { ...entry, pending: true, refused: adoptionResolutionHold(entry) ?? mark };
}

/** A returned ordinary text acceptance can prove its first lay even without a submission journal. */
export function recordAcceptedTextInput(request: TakeInRequest, entry: RecordEntry, read: TakeInRead,
  takenIn: string, format: ObjectFormat): RecordEntry {
  if (request.copy !== null || request.entry.opened !== true || !request.path.startsWith(".arc/completed/")
    || request.path.endsWith(".md") || entry.persisted === null || entry.acceptedInputStat !== undefined) return entry;
  const { ino, mtimeNs } = read.stat;
  return { ...entry, acceptedInputStat: { ino, mtimeNs, lay: { kind: "pending" } },
    persisted: { ...entry.persisted, read: read.blob, inputBlob: gitBlobId(takenIn, format) } };
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
