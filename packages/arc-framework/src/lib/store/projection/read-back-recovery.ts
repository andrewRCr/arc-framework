/** Resume a recorded accepted write's installation without submitting its content again. */
import type { ProjectionIndex, RecordEntry } from "./index-schema.js";
import type { ProjectionRootState } from "./process-state.js";
import type { TakeInRead } from "./take-in-port.js";
import type { ProjectionFileWriteObservation } from "./file-write-observation.js";
import { readUnchangedProjectionFile } from "./unchanged-file.js";
import { isOwnSaveLanding } from "./lay-mode.js";
import { pendingFileRequest } from "./pending-request.js";
import { installWriteBack } from "./read-back.js";
import { commitProjectionIndex } from "./index-file.js";
import { withProjectionEntry } from "./index-memory.js";

/** Recognize accepted bytes left before installation and finish their read-back when this save can authorize it. */
export async function checkUnchangedProjectionEdit(root: ProjectionRootState, index: ProjectionIndex, path: string,
  entry: RecordEntry, onFile?: (observation: ProjectionFileWriteObservation) => void): Promise<{
    index: ProjectionIndex; edited: false; reobserve?: true;
  } | null> {
  const read = await readUnchangedProjectionFile(root.context, pendingFileRequest(root.checkout, path, entry));
  if (read === null) return null;
  root.unsent.delete(path);
  const recovered = await recoverAcceptedReadBack(root, index, path, entry, read);
  if (recovered === null) return { index, edited: false };
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
