/** Recognize unchanged bytes left before an interrupted replacement installed its new rendering. */
import { readBaseContent } from "./base-content.js";
import { selectWriteBackBase } from "./base-selection.js";
import { createHistoryMemo } from "./base-recovery.js";
import { readStamplessFile } from "./stampless.js";
import { gitBlobId } from "./blob-id.js";
import { captureWriteBackFile, type WriteBackContext } from "./write-back.js";
import type { TakeInRead, TakeInRequest } from "./take-in-port.js";

/** Establish no new edit using the file's selected base, including a persisted take-in's newer basis. */
export async function readUnchangedProjectionFile(context: WriteBackContext, request: TakeInRequest): Promise<TakeInRead | null> {
  const entry = request.entry;
  if (!entry.pending || request.copy !== null || request.resolution !== undefined || request.adopting
    || entry.adoption !== undefined || entry.handoff !== undefined || entry.markers !== null
    || entry.unshown.length > 0 || entry.archiveSubmission !== undefined
    || entry.persisted?.recording === true || entry.refused?.reason === "bases-disagree") return null;
  const file = await captureWriteBackFile(context, request);
  if (file.kind !== "read") return null;
  if (!request.path.endsWith(".md")) {
    if (matchesAcceptedText(entry, file, context.format)) return file.read;
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

function matchesAcceptedText(entry: TakeInRequest["entry"], file: Extract<Awaited<ReturnType<typeof captureWriteBackFile>>, { kind: "read" }>,
  format: WriteBackContext["format"]): boolean {
  const accepted = entry.persisted;
  if (!entry.opened || accepted?.inputBlob === undefined) return false;
  // Earlier records only prove the input while the original basis is still journaled.
  const original = entry.acceptedInputStat ?? (entry.inProgress === null && entry.base.blob === accepted.stamp ? entry.stat : null);
  return original?.ino === file.read.stat.ino && original.mtimeNs === file.read.stat.mtimeNs
    && accepted.inputBlob === gitBlobId(file.content, format);
}
