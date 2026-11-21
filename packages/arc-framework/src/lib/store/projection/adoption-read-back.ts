/** Retain an accepted creation's exact basis until guarded read-back installs its projected file. */
import type { ProjectionFileWriteObservation } from "./file-write-observation.js";
import { withProjectionEntry } from "./index-memory.js";
import type { WriteResult } from "../write.js";
import type { ProjectionRootState } from "./process-state.js";
import type { ArchiveSaveSubmission, ProjectionIndex, RecordEntry, RefusedMark } from "./index-schema.js";
import type { TakeInRead } from "./take-in-port.js";
import { gitBlobId } from "./blob-id.js";
import { commitProjectionIndex } from "./index-file.js";
import { installWriteBack } from "./read-back.js";
import { recordPendingWriteBack } from "./taken-in.js";
import { completeWriteBackRecording } from "./write-back-recording.js";
import type { StoreRecord } from "../read.js";
import { heldConflictMarks, unshownConflicts } from "./held-conflicts.js";
import { acceptedArchiveRecording } from "./archive-save-recording.js";
import { projectionFileReader } from "./change-detection.js";
import { ArchiveDestinationBlocked } from "./archive-file.js";
import { refuseUnreadArchiveScope } from "./archive-selection.js";
import { adoptionResolutionHold, archiveAdoptionBasis, archiveLayPhase, awaitsArchiveInstallation, isPredecessorArchiveAdoption,
  provesArchiveInstallation } from "./recording-state.js";
import type { ReplaceGuardInput } from "./replace-guard.js";
import { join } from "node:path";

/** Record the returned creation basis with prepared content before attempting read-back. */
export async function recordAdoptionAcceptance(root: ProjectionRootState, index: ProjectionIndex, path: string,
  accepted: WriteResult, input: string | ArchiveSaveSubmission, read: TakeInRead,
  onFile?: (observation: ProjectionFileWriteObservation) => void): Promise<ProjectionIndex> {
  const { recorded, pending } = await publishAdoptionAcceptance(root, index, path, accepted, input, read);
  return resumeAdoptionReadBack(root, recorded, path, pending, onFile);
}

/** Record acceptance even where the destination cannot yet be observed or installed. */
export async function publishAdoptionAcceptance(root: ProjectionRootState, index: ProjectionIndex, path: string,
  accepted: WriteResult, input: string | ArchiveSaveSubmission, read: TakeInRead): Promise<{ recorded: ProjectionIndex; pending: RecordEntry }> {
  if (accepted.version === undefined) throw new Error("An accepted content creation returned no version");
  const blob = typeof input === "string" ? gitBlobId(input, root.context.format) : input.blob;
  const entry: RecordEntry = { ...(index.entries[path]?.opened === true ? { opened: true as const } : {}), kind: "record", reference: accepted.reference, stat: read.stat, written: read.blob,
    base: { blob, version: accepted.version }, markers: null, notices: [],
    unshown: accepted.conflicts, protected: false, changed: true, pending: true, withheld: false, refused: null,
    persisted: null, inProgress: null, copies: [], adoption: { kind: "read-back", read } };
  const pending: RecordEntry = typeof input === "string"
    ? await recordPendingWriteBack({ ...root.context, entry, stamp: blob, takenIn: input, read: read.blob, version: accepted.version })
    : { ...entry, ...acceptedArchiveRecording(input, accepted.version) };
  const recorded = await commitProjectionIndex({ location: root.location, checkout: root.checkout,
    index: withProjectionEntry(index, path, pending), checkpoint: root.context.checkpoint });
  return { recorded, pending };
}

/** Finish an accepted creation without sending another expected-absent write or rebinding its owner by name. */
export async function resumeAdoptionReadBack(root: ProjectionRootState, index: ProjectionIndex, path: string,
  entry: RecordEntry, onFile?: (observation: ProjectionFileWriteObservation) => void): Promise<ProjectionIndex> {
  const adoption = entry.adoption;
  if (adoption?.kind !== "read-back") throw new Error("Read-back requires an accepted adoption");
  root.unsent.add(path);
  const read = await root.store.read({ reference: entry.reference });
  if (read.status === "refused") return holdReadBack(root, index, path, entry, {
    reason: `The edit landed, but read-back failed: ${read.refusal.condition}`, remedy: read.refusal.remedy,
  });
  index = await completeAdoptionRecording(root, index, path, entry, read.result);
  const recorded = index.entries[path];
  if (recorded?.kind !== "record") throw new Error("Accepted adoption lost its record entry");
  if (recorded.persisted?.recording === true) return index;
  if (recorded.adoption === undefined) return index;
  entry = recorded;
  if (!root.writable(path)) return index;
  let baseline: NonNullable<ReplaceGuardInput["baseline"]>;
  try { baseline = await adoptionBaseline(root, path, entry, adoption.read, read.result); }
  catch (error) {
    // A folder that refuses the archived file's stat holds this read-back with that refusal, as the other archive reads do.
    if (!(error instanceof ArchiveDestinationBlocked)) throw error;
    if (error.access) refuseUnreadArchiveScope(root, path, error.mark);
    return holdReadBack(root, index, path, entry, error.mark, !error.access);
  }
  const hold = adoptionResolutionHold(entry);
  if (hold !== null) {
    root.context.report?.({ path, copy: null, mark: hold });
    return index;
  }
  const request = { checkout: root.checkout, path, copy: null, entry: { ...entry, refused: null, pending: false },
    base: { kind: "blob" as const, blob: entry.base.blob } };
  const installed = await installWriteBack(root.context, index, request, { kind: "landed", record: read.result,
    result: { answer: "taken-in", entry: request.entry, read: adoption.read } }, baseline);
  if (installed.result.answer === "taken-in") root.unsent.delete(path);
  const completed = await commitProjectionIndex({ location: root.location, checkout: root.checkout,
    index: completeReadBack(installed.index, path), checkpoint: root.context.checkpoint });
  onFile?.({ path, result: installed.result, installation: "attempted", rebuilt: installed.rebuilt });
  return completed;
}

async function adoptionBaseline(root: ProjectionRootState, path: string, entry: RecordEntry, original: TakeInRead,
  record: StoreRecord): Promise<NonNullable<ReplaceGuardInput["baseline"]>> {
  if (entry.opened !== true || !path.startsWith(".arc/completed/")) return original;
  const phase = archiveLayPhase(entry);
  if (path.endsWith(".md") && (phase === "installed" || awaitsArchiveInstallation(entry))) {
    const rendered = { stat: entry.stat, blob: entry.written };
    if (phase === "installed") return rendered;
    const current = await projectionFileReader(root.checkout, path).stat(join(root.checkout, path));
    const basis = archiveAdoptionBasis(entry, original.stat, current);
    return basis === "original" || basis === "indeterminate" && agreesWithAcceptedInput(root, entry, record) ? original : rendered;
  }
  return ordinaryAdoptionBaseline(root, path, entry, original);
}

/** Keep the existing read-back evidence for adoptions outside the Markdown installation journal. */
async function ordinaryAdoptionBaseline(root: ProjectionRootState, path: string, entry: RecordEntry, original: TakeInRead): Promise<TakeInRead> {
  if (entry.stat === null) return original;
  const phase = archiveLayPhase(entry);
  const predecessor = isPredecessorArchiveAdoption(entry);
  if (phase === "pending" || phase === undefined && !predecessor && entry.inProgress === null) return original;
  const rendered = { stat: entry.stat, blob: entry.written };
  if (phase === "installed") return rendered;
  const current = await projectionFileReader(root.checkout, path).stat(join(root.checkout, path));
  if (provesArchiveInstallation(entry, current)) return rendered;
  if (awaitsArchiveInstallation(entry) && current?.ino === original.stat.ino) return original;
  if (predecessor) {
    // The guard still hashes the live file against this basis if the writer only touched the original.
    return current?.ino === original.stat.ino || entry.stat.ino === original.stat.ino ? original : rendered;
  }
  return current?.ino === original.stat.ino && current.mtimeNs === original.stat.mtimeNs ? original : rendered;
}

/** The guarded read-back can install its current record directly if the old input made no effective change. */
function agreesWithAcceptedInput(root: ProjectionRootState, entry: RecordEntry, record: StoreRecord): boolean {
  if (record.conflicts.length > 0 || entry.persisted === null) return false;
  const { inputBlob, takenIn } = entry.persisted;
  const current = gitBlobId(record.content, root.context.format);
  return current === inputBlob || (takenIn.kind === "copy" ? current === takenIn.blob : record.version === takenIn.version);
}

async function completeAdoptionRecording(root: ProjectionRootState, index: ProjectionIndex, path: string,
  entry: RecordEntry, record: StoreRecord): Promise<ProjectionIndex> {
  const adoption = entry.adoption;
  if (adoption?.kind !== "read-back" || entry.persisted?.recording !== true) return index;
  const recorded = await completeWriteBackRecording(root.context, entry, { checkout: root.checkout, path }, record);
  if (recorded.mark !== undefined) return holdReadBack(root, index, path, recorded.entry, recorded.mark);
  const retained = adoption.retained;
  const updated: RecordEntry = { ...recorded.entry, refused: retained ?? null,
    adoption: retained === undefined ? { kind: "read-back", read: adoption.read } : undefined,
    unshown: unshownConflicts(entry, record.conflicts) };
  if (retained !== undefined) {
    root.unsent.add(path);
    for (const mark of [retained, ...heldConflictMarks(updated.unshown, retained)]) root.context.report?.({ path, copy: null, mark });
  }
  return commitProjectionIndex({ location: root.location, checkout: root.checkout,
    index: withProjectionEntry(index, path, updated), checkpoint: root.context.checkpoint });
}

function completeReadBack(index: ProjectionIndex, path: string): ProjectionIndex {
  const entry = index.entries[path];
  if (entry?.kind !== "record" || entry.pending) return index;
  return withProjectionEntry(index, path, { ...entry, adoption: undefined });
}

async function holdReadBack(root: ProjectionRootState, index: ProjectionIndex, path: string, entry: RecordEntry,
  mark: RefusedMark, report = true): Promise<ProjectionIndex> {
  if (report) root.context.report?.({ path, copy: null, mark });
  return commitProjectionIndex({ location: root.location, checkout: root.checkout,
    index: withProjectionEntry(index, path, { ...entry, pending: true, refused: adoptionResolutionHold(entry) ?? mark }),
    checkpoint: root.context.checkpoint });
}
