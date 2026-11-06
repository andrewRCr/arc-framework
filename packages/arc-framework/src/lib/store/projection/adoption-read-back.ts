/** Retain an accepted creation's exact basis until guarded read-back installs its projected file. */
import type { WriteResult } from "../write.js";
import type { ProjectionRootState } from "./process-state.js";
import type { ProjectionIndex, RecordEntry, RefusedMark } from "./index-schema.js";
import type { TakeInRead } from "./take-in-port.js";
import { gitBlobId } from "./blob-id.js";
import { commitProjectionIndex } from "./index-file.js";
import { installWriteBack } from "./read-back.js";
import { readTakenInCopy, recordWriteBack } from "./taken-in.js";
import { createHistoryMemo } from "./base-recovery.js";
import { createKindRegistry } from "../registry.js";
import { PRODUCTION_REGISTRATIONS } from "../kinds/registrations.js";
import type { StoreRecord } from "../read.js";
import { heldConflictMarks, unshownConflicts } from "./held-conflicts.js";

const kinds = createKindRegistry(PRODUCTION_REGISTRATIONS);

/** Record the returned creation basis with prepared content before attempting read-back. */
export async function recordAdoptionAcceptance(root: ProjectionRootState, index: ProjectionIndex, path: string,
  accepted: WriteResult, content: string, read: TakeInRead): Promise<ProjectionIndex> {
  if (accepted.version === undefined) throw new Error("An accepted content creation returned no version");
  const entry: RecordEntry = { kind: "record", reference: accepted.reference, stat: read.stat, written: read.blob,
    base: { blob: gitBlobId(content, root.context.format), version: accepted.version }, markers: null, notices: [],
    unshown: accepted.conflicts, protected: false, changed: true, pending: true, withheld: false, refused: null,
    persisted: null, inProgress: null, copies: [], adoption: { kind: "read-back", read } };
  const recorded = await commitProjectionIndex({ location: root.location, checkout: root.checkout,
    index: { ...index, entries: { ...index.entries, [path]: entry } }, checkpoint: root.context.checkpoint });
  return resumeAdoptionReadBack(root, recorded, path, entry);
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
  if (adoption?.kind !== "read-back" || !adoption.recording) return index;
  const persisted = entry.persisted;
  if (persisted?.takenIn.kind !== "copy") throw new Error("Unfinished adoption recording needs its accepted input copy");
  const takenIn = await readTakenInCopy(root.location, persisted.takenIn.name);
  const recorded = await recordWriteBack({ location: root.location, checkpoint: root.context.checkpoint, entry,
    stamp: persisted.stamp, takenIn, outcome: { kind: "landed", version: persisted.takenIn.version }, readBack: record,
    grammar: kinds[entry.reference.kind].entry, format: root.context.format,
    memo: root.context.memo ?? createHistoryMemo(root.store) });
  const retained = adoption.retained;
  const updated: RecordEntry = { ...recorded.entry, refused: retained ?? null,
    adoption: retained === undefined ? { kind: "read-back", read: adoption.read } : undefined,
    unshown: unshownConflicts(entry, record.conflicts) };
  if (retained !== undefined) {
    root.unsent.add(path);
    for (const mark of [retained, ...heldConflictMarks(updated.unshown, retained)]) root.context.report?.({ path, copy: null, mark });
  }
  return commitProjectionIndex({ location: root.location, checkout: root.checkout,
    index: { ...index, entries: { ...index.entries, [path]: updated } }, checkpoint: root.context.checkpoint });
}

function completeReadBack(index: ProjectionIndex, path: string): ProjectionIndex {
  const entry = index.entries[path];
  if (entry?.kind !== "record" || entry.pending) return index;
  return { ...index, entries: { ...index.entries, [path]: { ...entry, adoption: undefined } } };
}

async function holdReadBack(root: ProjectionRootState, index: ProjectionIndex, path: string, entry: RecordEntry,
  mark: RefusedMark): Promise<ProjectionIndex> {
  root.context.report?.({ path, copy: null, mark });
  return commitProjectionIndex({ location: root.location, checkout: root.checkout,
    index: { ...index, entries: { ...index.entries, [path]: { ...entry, pending: true, refused: mark } } },
    checkpoint: root.context.checkpoint });
}
