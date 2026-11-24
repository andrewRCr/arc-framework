/** Recognize unchanged bytes left before an interrupted replacement installed its new rendering. */
import { readBaseContent } from "./base-content.js";
import { selectWriteBackBase } from "./base-selection.js";
import { createHistoryMemo } from "./base-recovery.js";
import { readStamplessFile } from "./stampless.js";
import { captureWriteBackFile, type WriteBackContext } from "./write-back.js";
import type { TakeInRead, TakeInRequest } from "./take-in-port.js";

/** Establish no new edit using the file's selected base, including a persisted take-in's newer basis. */
export async function readUnchangedProjectionFile(context: WriteBackContext, request: TakeInRequest): Promise<TakeInRead | null> {
  const entry = request.entry;
  if (!entry.pending || request.copy !== null || request.resolution !== undefined || request.adopting
    || entry.adoption !== undefined || entry.handoff !== undefined || entry.markers !== null
    || entry.unshown.length > 0 || entry.persisted?.recording === true || entry.refused?.reason === "bases-disagree") return null;
  const file = await captureWriteBackFile(context, request);
  if (file.kind !== "read") return null;
  if (!request.path.endsWith(".md")) {
    const observed = await readStamplessFile({ entry, text: file.content, mtimeNs: file.read.stat.mtimeNs,
      format: context.format, memo: context.memo ?? createHistoryMemo(context.store) });
    return observed.status === "ok" && observed.result.kind === "unedited" ? file.read : null;
  }
  if (file.stamp === null) return null;
  const selected = await selectWriteBackBase(context, request, file.content, file.stamp);
  if (selected.status !== "ok" || selected.result.kind !== "selected") return null;
  const base = await readBaseContent(context, entry, selected.result.base);
  return base.status === "ok" && base.result === file.content ? file.read : null;
}
