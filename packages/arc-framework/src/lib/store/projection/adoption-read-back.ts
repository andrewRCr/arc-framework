/** Retain an accepted creation's exact basis until guarded read-back installs its projected file. */
import { withProjectionEntry } from "./index-memory.js";
import type { WriteResult } from "../write.js";
import type { ProjectionRootState } from "./process-state.js";
import type { ProjectionIndex, RecordEntry, RefusedMark } from "./index-schema.js";
import type { TakeInRead } from "./take-in-port.js";
import { gitBlobId } from "./blob-id.js";
import { commitProjectionIndex } from "./index-file.js";
import { installWriteBack } from "./read-back.js";
import { recordPendingWriteBack } from "./taken-in.js";
import { completeWriteBackRecording } from "./write-back-recording.js";
import type { StoreRecord } from "../read.js";
import { heldConflictMarks, unshownConflicts } from "./held-conflicts.js";

/** Record the returned creation basis with prepared content before attempting read-back. */
export async function recordAdoptionAcceptance(root: ProjectionRootState, index: ProjectionIndex, path: string,
  accepted: WriteResult, content: string, read: TakeInRead): Promise<ProjectionIndex> {
  if (accepted.version === undefined) throw new Error("An accepted content creation returned no version");
  const entry: RecordEntry = { kind: "record", reference: accepted.reference, stat: read.stat, written: read.blob,
    base: { blob: gitBlobId(content, root.context.format), version: accepted.version }, markers: null, notices: [],
    unshown: accepted.conflicts, protected: false, changed: true, pending: true, withheld: false, refused: null,
    persisted: null, inProgress: null, copies: [], adoption: { kind: "read-back", read } };
  const pending = await recordPendingWriteBack({ ...root.context, entry, stamp: entry.base.blob,
    takenIn: content, version: accepted.version });
  const recorded = await commitProjectionIndex({ location: root.location, checkout: root.checkout,
    index: withProjectionEntry(index, path, pending), checkpoint: root.context.checkpoint });
  return resumeAdoptionReadBack(root, recorded, path, pending);
}

/** Finish an accepted creation without sending another expected-absent write or rebinding its owner by name. */
export async function resumeAdoptionReadBack(root: ProjectionRootState, index: ProjectionIndex, path: string,
  entry: RecordEntry): Promise<ProjectionIndex> {
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
  const installed = await installWriteBack(root.context, index, request, { kind: "landed", record: read.result,
    result: { answer: "taken-in", entry: request.entry, read: adoption.read } });
  if (installed.result.answer === "taken-in") root.unsent.delete(path);
  return commitProjectionIndex({ location: root.location, checkout: root.checkout,
    index: completeReadBack(installed.index, path), checkpoint: root.context.checkpoint });
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
