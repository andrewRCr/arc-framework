/** Hold an archived edit that waits for an opening, at whichever route meets it. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { archivedEditWaits, waitingEditMark } from "./archive-admission.js";
import { ArchiveDestinationBlocked, readArchiveBytes } from "./archive-file.js";
import { gitBlobId } from "./blob-id.js";
import type { RefusedMark } from "./index-schema.js";
import type { ProjectionRootState } from "./process-state.js";
import { gateRead, projectionReadGate } from "./read-gate.js";
import { parseStampedFile } from "./stamp.js";
import { refuseProjectionEdit } from "./rights-binding.js";
import type { TakeInRequest, TakeInResult } from "./take-in-port.js";
import { finishAcceptedRecording } from "./write-back.js";

/**
 * Refuse an archived edit that waits for an opening, or answer null where the route admits it. An absent or emptied
 * file holds no edit. Bytes the store already accepted are not an edit either: an unfinished recording whose retained
 * input the file still holds goes on to finish, and one the file has moved past is recorded first, so only the bytes
 * beyond it wait.
 */
export async function holdWaitingArchiveEdit(root: ProjectionRootState, request: TakeInRequest): Promise<TakeInResult | null> {
  if (!archivedEditWaits(request)) return null;
  const located = request.copy ?? request.path;
  let gate: Awaited<ReturnType<typeof gateRead>>;
  try {
    gate = await gateRead({ path: join(request.checkout, located), markdown: request.path.endsWith(".md") },
      projectionReadGate(request.checkout, located));
  } catch (error) {
    if (!(error instanceof ArchiveDestinationBlocked)) throw error;
    return holdEdit(root, request, request.entry, error.mark);
  }
  if (gate.kind === "absent" || gate.kind === "no-edit" && gate.deleted === "emptied") return { answer: "no-edit", entry: request.entry };
  const persisted = request.entry.persisted;
  const recording = persisted?.recording === true && persisted.takenIn.kind === "copy" ? persisted.takenIn : null;
  if (recording !== null && await holdsAcceptedInput(root, request, persisted?.read, recording.blob)) return null;
  let entry = request.entry;
  if (recording !== null) {
    const finished = await finishAcceptedRecording(root.context, entry);
    if (finished.mark !== undefined) {
      root.unsent.add(request.path);
      root.context.report?.({ path: request.path, copy: request.copy, mark: finished.mark });
      return { answer: "pending", entry: { ...finished.entry, pending: true, refused: finished.mark } };
    }
    entry = finished.entry;
  }
  const mark = await root.rights?.({ ...request, entry }) ?? waitingEditMark(root.checkout, request.path, true);
  const refused = holdEdit(root, request, entry, mark);
  return gate.kind === "pending" ? { answer: "deferred", entry: refused.entry } : refused;
}

/** Leave the edit where it is, its entry pending under the mark, named in the command's report. */
function holdEdit(root: ProjectionRootState, request: TakeInRequest, entry: TakeInRequest["entry"], mark: RefusedMark): TakeInResult {
  root.unsent.add(request.path);
  root.context.report?.({ path: request.path, copy: request.copy, mark });
  return refuseProjectionEdit(entry, mark);
}

/**
 * Whether the file still holds the input the store accepted: the bytes it was read from where the recording names
 * them, and otherwise the retained text itself, with line endings normalized and a Markdown file's stamp removed.
 */
async function holdsAcceptedInput(root: ProjectionRootState, request: TakeInRequest, read: string | undefined,
  takenIn: string): Promise<boolean> {
  let bytes: Buffer;
  try {
    bytes = request.copy === null ? readArchiveBytes(root.checkout, request.path) : await readFile(join(request.checkout, request.copy));
  } catch (error) {
    if (error instanceof ArchiveDestinationBlocked || (error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
  const format = root.context.format;
  if (read !== undefined) return gitBlobId(bytes, format) === read;
  const text = bytes.toString("utf8");
  return gitBlobId(request.path.endsWith(".md") ? parseStampedFile(text).content : text.replaceAll("\r\n", "\n"), format) === takenIn;
}
