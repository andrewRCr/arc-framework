/** Recognize unchanged bytes left before an interrupted replacement installed its new rendering. */
import { readBaseContent } from "./base-content.js";
import { selectWriteBackBase } from "./base-selection.js";
import { createHistoryMemo } from "./base-recovery.js";
import { readStamplessFile } from "./stampless.js";
import { gitBlobId } from "./blob-id.js";
import { captureWriteBackFile, type WriteBackContext } from "./write-back.js";
import type { TakeInRead, TakeInRequest } from "./take-in-port.js";
import { archiveLayPhase, hasAcceptedArchiveInput, retainedArchiveInput } from "./recording-state.js";
import type { RefusedMark } from "./index-schema.js";

type CapturedFile = Extract<Awaited<ReturnType<typeof captureWriteBackFile>>, { kind: "read" }>;
type PendingInput = { readonly kind: "unchanged"; readonly read: TakeInRead }
  | { readonly kind: "inaccessible"; readonly mark: RefusedMark }
  | { readonly kind: "retained"; readonly mark: RefusedMark };

/** Distinguish settled bytes from a partial landing whose original file still needs repair. */
export async function readPendingProjectionInput(context: WriteBackContext, request: TakeInRequest): Promise<PendingInput | null> {
  if (!observesPendingInput(request)) return null;
  const { entry } = request;
  const accepted = hasAcceptedArchiveInput(entry);
  const recordedInput = accepted || entry.opened === true && entry.acceptedInputStat !== undefined ? entry.persisted?.read : undefined;
  const oldConflicts = entry.markers !== null || entry.unshown.length > 0;
  if (oldConflicts && recordedInput === undefined && entry.persisted?.retained === undefined) return null;
  const file = await captureWriteBackFile(context, request);
  if (file.kind === "held") return file.archiveAccess === undefined ? null : { kind: "inaccessible", mark: file.archiveAccess };
  return classifyPendingInput(context, request, file, recordedInput, oldConflicts);
}

async function classifyPendingInput(context: WriteBackContext, request: TakeInRequest, file: CapturedFile,
  recordedInput: string | undefined, oldConflicts: boolean): Promise<PendingInput | null> {
  const { entry } = request;
  const retained = retainedArchiveInput(entry, file.read.blob);
  if (retained !== undefined) return { kind: "retained", mark: retained };
  if (recordedInput === file.read.blob) {
    const phase = archiveLayPhase(entry);
    if (phase === "installed") return null;
    if (phase === "pending" || matchesAcceptedObservation(entry.acceptedInputStat, file.read)) {
      return { kind: "unchanged", read: file.read };
    }
  }
  const read = oldConflicts || entry.opened !== true && hasAcceptedArchiveInput(entry)
    ? null : await readUnchangedBase(context, request, file);
  return read === null ? null : { kind: "unchanged", read };
}

/** Pending input can be recognized only when no other recorded continuation owns the file. */
function observesPendingInput({ entry, copy, resolution, adopting }: TakeInRequest): boolean {
  return entry.pending && copy === null && resolution === undefined && !adopting
    && entry.adoption === undefined && entry.handoff === undefined && entry.archiveSubmission === undefined
    && entry.persisted?.recording !== true && entry.refused?.reason !== "bases-disagree";
}

function matchesAcceptedObservation(original: TakeInRequest["entry"]["acceptedInputStat"], read: TakeInRead): boolean {
  return original?.ino === read.stat.ino && original.mtimeNs === read.stat.mtimeNs;
}

async function readUnchangedBase(context: WriteBackContext, request: TakeInRequest, file: CapturedFile): Promise<TakeInRead | null> {
  const { entry } = request;
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

function matchesAcceptedText(entry: TakeInRequest["entry"], file: CapturedFile,
  format: WriteBackContext["format"]): boolean {
  const accepted = entry.persisted;
  if (!entry.opened || accepted?.inputBlob === undefined || archiveLayPhase(entry) === "installed") return false;
  // Earlier records only prove the input while the original basis is still journaled.
  const original = entry.acceptedInputStat ?? (entry.inProgress === null && entry.base.blob === accepted.stamp ? entry.stat : null);
  return original?.ino === file.read.stat.ino && original.mtimeNs === file.read.stat.mtimeNs
    && accepted.inputBlob === gitBlobId(file.content, format);
}
