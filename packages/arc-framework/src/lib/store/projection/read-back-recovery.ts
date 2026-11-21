/** Resume a recorded accepted write's installation without submitting its content again. */
import type { ProjectionIndex, RecordEntry } from "./index-schema.js";
import type { ProjectionRootState } from "./process-state.js";
import type { TakeInRead } from "./take-in-port.js";
import type { ProjectionFileWriteObservation } from "./file-write-observation.js";
import { readPendingProjectionInput } from "./unchanged-file.js";
import { isOwnSaveLanding } from "./lay-mode.js";
import { pendingFileRequest } from "./pending-request.js";
import { installWriteBack } from "./read-back.js";
import { commitProjectionIndex } from "./index-file.js";
import { withProjectionEntry } from "./index-memory.js";
import { completeWriteBackRecording } from "./write-back-recording.js";
import { recoverArchiveSave } from "./archive-save-recording.js";
import { refuseUnreadArchiveScope } from "./archive-selection.js";

/** Settle a lost submission response before treating any live bytes as a new edit. */
export async function recoverSubmittedArchiveEdit(root: ProjectionRootState, index: ProjectionIndex, path: string,
  entry: RecordEntry, retainUnaccepted = false): Promise<{ index: ProjectionIndex; entry: RecordEntry; held: boolean }> {
  const recovered = await recoverArchiveSave(root.context, entry, retainUnaccepted);
  if (recovered.mark !== undefined) {
    root.unsent.add(path);
    root.context.report?.({ path, copy: null, mark: recovered.mark });
    return { index, entry, held: true };
  }
  if (recovered.entry === entry) return { index, entry, held: false };
  const updated = await commitProjectionIndex({ location: root.location, checkout: root.checkout,
    index: withProjectionEntry(index, path, recovered.entry), checkpoint: root.context.checkpoint });
  return { index: updated, entry: recovered.entry, held: false };
}

/** Finish recording accepted input without requiring the live file or trying to install it. */
export async function recordAcceptedProjectionInput(root: ProjectionRootState, index: ProjectionIndex, path: string,
  entry: RecordEntry): Promise<{ index: ProjectionIndex; entry: RecordEntry; held: boolean }> {
  const completed = await completeWriteBackRecording(root.context, entry, { checkout: root.checkout, path });
  entry = completed.mark === undefined ? completed.entry : { ...completed.entry, pending: true, refused: completed.mark };
  const updated = await commitProjectionIndex({ location: root.location, checkout: root.checkout,
    index: withProjectionEntry(index, path, entry), checkpoint: root.context.checkpoint });
  if (completed.mark !== undefined) {
    root.unsent.add(path);
    root.context.report?.({ path, copy: null, mark: completed.mark });
  }
  return { index: updated, entry, held: completed.mark !== undefined };
}

/** Recognize accepted bytes left before installation and finish their read-back when this save can authorize it. */
export async function checkUnchangedProjectionEdit(root: ProjectionRootState, index: ProjectionIndex, path: string,
  entry: RecordEntry, onFile?: (observation: ProjectionFileWriteObservation) => void): Promise<{
    index: ProjectionIndex; edited: boolean; reobserve?: true;
  } | null> {
  const completing = entry.opened === true && entry.persisted?.recording === true;
  if (completing) {
    const completed = await recordAcceptedProjectionInput(root, index, path, entry);
    ({ index, entry } = completed);
    if (completed.held) return { index, edited: false, reobserve: true };
  }
  const input = await readPendingProjectionInput(root.context, pendingFileRequest(root.checkout, path, entry));
  if (input === null) return completing
    ? { index: withProjectionEntry(index, path, { ...entry, changed: true }), edited: true, reobserve: true } : null;
  if (input.kind !== "unchanged") {
    root.unsent.add(path);
    if (input.kind === "inaccessible") refuseUnreadArchiveScope(root, path, input.mark);
    else root.context.report?.({ path, copy: null, mark: input.mark });
    return { index: withProjectionEntry(index, path, { ...entry, pending: true, refused: input.mark }), edited: false, reobserve: true };
  }
  root.unsent.delete(path);
  const recovered = await recoverAcceptedReadBack(root, index, path, entry, input.read);
  if (recovered === null) return { index, edited: false, ...(completing ? { reobserve: true } : {}) };
  onFile?.(recovered.observation);
  return { index: recovered.index, edited: false, reobserve: true };
}

/** Install only with durable acceptance evidence, an unchanged input proof, and current local authorization. */
async function recoverAcceptedReadBack(root: ProjectionRootState, index: ProjectionIndex, path: string,
  entry: RecordEntry, read: TakeInRead): Promise<{ index: ProjectionIndex; observation: ProjectionFileWriteObservation } | null> {
  if (!isOwnSaveLanding(root.context.verb, root.checkout) || entry.opened !== true || entry.persisted === null
    || entry.persisted.recording === true || !root.writable(path) || root.blockedByLink(path) !== null) return null;
  const request = pendingFileRequest(root.checkout, path, { ...entry, pending: false, refused: null });
  if (await root.rights?.(request) != null) return null;
  await root.checkpoint?.();
  const current = await root.store.read({ reference: entry.reference });
  if (current.status === "refused") {
    const mark = { reason: `The accepted edit's read-back is pending: ${current.refusal.condition}`, remedy: current.refusal.remedy };
    const held = { ...entry, pending: true, refused: mark };
    root.context.report?.({ path, copy: null, mark });
    root.unsent.add(path);
    const updated = await commitProjectionIndex({ location: root.location, checkout: root.checkout,
      index: withProjectionEntry(index, path, held), checkpoint: root.context.checkpoint });
    return { index: updated, observation: { path, installation: "attempted", result: { answer: "pending", entry: held } } };
  }
  await root.ports.hooks?.afterSaveRecoveryRead?.(path);
  const installed = await installWriteBack(root.context, index, request,
    { kind: "landed", record: current.result, result: { answer: "taken-in", entry: request.entry, read } });
  if (installed.result.answer !== "taken-in") root.unsent.add(path);
  const updated = await commitProjectionIndex({ location: root.location, checkout: root.checkout,
    index: installed.index, checkpoint: root.context.checkpoint });
  return { index: updated, observation: { path, result: installed.result, installation: "attempted", rebuilt: installed.rebuilt } };
}
