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
import { readStat } from "./change-detection.js";
import { join } from "node:path";

/** Record the returned creation basis with prepared content before attempting read-back. */
export async function recordAdoptionAcceptance(root: ProjectionRootState, index: ProjectionIndex, path: string,
  accepted: WriteResult, input: string | ArchiveSaveSubmission, read: TakeInRead,
  onFile?: (observation: ProjectionFileWriteObservation) => void): Promise<ProjectionIndex> {
  if (accepted.version === undefined) throw new Error("An accepted content creation returned no version");
  const blob = typeof input === "string" ? gitBlobId(input, root.context.format) : input.blob;
  const entry: RecordEntry = { ...(index.entries[path]?.opened === true ? { opened: true as const } : {}), kind: "record", reference: accepted.reference, stat: read.stat, written: read.blob,
    base: { blob, version: accepted.version }, markers: null, notices: [],
    unshown: accepted.conflicts, protected: false, changed: true, pending: true, withheld: false, refused: null,
    persisted: null, inProgress: null, copies: [], adoption: { kind: "read-back", read } };
  const pending: RecordEntry = typeof input === "string"
    ? await recordPendingWriteBack({ ...root.context, entry, stamp: blob, takenIn: input, version: accepted.version })
    : { ...entry, ...acceptedArchiveRecording(input, accepted.version) };
  const recorded = await commitProjectionIndex({ location: root.location, checkout: root.checkout,
    index: withProjectionEntry(index, path, pending), checkpoint: root.context.checkpoint });
  return resumeAdoptionReadBack(root, recorded, path, pending, onFile);
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
  const request = { checkout: root.checkout, path, copy: null, entry: { ...entry, refused: null, pending: false },
    base: { kind: "blob" as const, blob: entry.base.blob } };
  const baseline = await adoptionBaseline(root, path, entry, adoption.read);
  const installed = await installWriteBack(root.context, index, request, { kind: "landed", record: read.result,
    result: { answer: "taken-in", entry: request.entry, read: baseline } });
  if (installed.result.answer === "taken-in") root.unsent.delete(path);
  const completed = await commitProjectionIndex({ location: root.location, checkout: root.checkout,
    index: completeReadBack(installed.index, path), checkpoint: root.context.checkpoint });
  onFile?.({ path, result: installed.result, installation: "attempted", rebuilt: installed.rebuilt });
  return completed;
}

async function adoptionBaseline(root: ProjectionRootState, path: string, entry: RecordEntry, original: TakeInRead): Promise<TakeInRead> {
  if (entry.opened !== true || !path.startsWith(".arc/completed/") || entry.inProgress === null || entry.stat === null) return original;
  const current = await readStat(join(root.checkout, path));
  // After the original file leaves, compare edits to the rendering journaled by the swap.
  return current?.ino === original.stat.ino && current.mtimeNs === original.stat.mtimeNs
    ? original : { stat: entry.stat, blob: entry.written };
}

async function completeAdoptionRecording(root: ProjectionRootState, index: ProjectionIndex, path: string,
  entry: RecordEntry, record: StoreRecord): Promise<ProjectionIndex> {
  const adoption = entry.adoption;
  if (adoption?.kind !== "read-back" || entry.persisted?.recording !== true) return index;
  const recorded = await completeWriteBackRecording(root.context, entry, record);
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
  mark: RefusedMark): Promise<ProjectionIndex> {
  root.context.report?.({ path, copy: null, mark });
  return commitProjectionIndex({ location: root.location, checkout: root.checkout,
    index: withProjectionEntry(index, path, { ...entry, pending: true, refused: mark }),
    checkpoint: root.context.checkpoint });
}
