/** Recognize unchanged bytes left before an interrupted replacement installed its new rendering. */
import { readBaseContent } from "./base-content.js";
import { selectWriteBackBase } from "./base-selection.js";
import { createHistoryMemo } from "./base-recovery.js";
import { readStamplessFile } from "./stampless.js";
import { gitBlobId } from "./blob-id.js";
import { captureWriteBackFile, classifyLiveArchiveInput, type WriteBackContext } from "./write-back.js";
import type { TakeInRead, TakeInRequest } from "./take-in-port.js";
import { archiveLayPhase, liveArchiveReceipt, retainedArchiveInput } from "./recording-state.js";
import type { RefusedMark } from "./index-schema.js";

type CapturedFile = Extract<Awaited<ReturnType<typeof captureWriteBackFile>>, { kind: "read" }>;
type PendingInput = { readonly kind: "unchanged"; readonly read: TakeInRead; readonly accepted?: true }
  | { readonly kind: "inaccessible"; readonly mark: RefusedMark }
  | { readonly kind: "retained"; readonly mark: RefusedMark };

/** Distinguish settled bytes from a partial landing whose original file still needs repair. */
export async function readPendingProjectionInput(context: WriteBackContext, request: TakeInRequest): Promise<PendingInput | null> {
  if (!observesPendingInput(request)) return null;
  const { entry } = request;
  const receipt = liveArchiveReceipt(request);
  const recordedInput = entry.opened === true && entry.acceptedInputStat !== undefined ? entry.persisted?.read : undefined;
  const oldConflicts = entry.markers !== null || entry.unshown.length > 0;
  if (oldConflicts && recordedInput === undefined && receipt === null) return null;
  const file = await captureWriteBackFile(context, request);
  if (file.kind === "held") return file.archiveAccess === undefined ? null : { kind: "inaccessible", mark: file.archiveAccess };
  const acceptance = await classifyLiveArchiveInput(context, request, file);
  if (acceptance?.kind === "whole") return { kind: "unchanged", read: file.read, accepted: true };
  if (acceptance !== null) return acceptance;
  if (receipt !== null || entry.persisted?.recording === true) return null;
  return classifyPendingRendering(context, request, file, recordedInput, oldConflicts);
}

async function classifyPendingRendering(context: WriteBackContext, request: TakeInRequest, file: CapturedFile,
  recordedInput: string | undefined, oldConflicts: boolean): Promise<PendingInput | null> {
  const { entry } = request;
  const retained = retainedArchiveInput(entry, file.read.blob);
  if (retained !== undefined) return { kind: "retained", mark: retained };
  const installed = archiveLayPhase(entry) === "installed";
  if (installed && entry.persisted?.read === file.read.blob && !followsInstalledArchiveInput(request)) return null;
  if (!installed && recordedInput === file.read.blob && matchesAcceptedObservation(entry.acceptedInputStat, file.read)) {
    return { kind: "unchanged", read: file.read };
  }
  const read = oldConflicts ? null : await readUnchangedBase(context, request, file);
  return read === null ? null : { kind: "unchanged", read };
}

/** An older installed receipt cannot own the unchanged input to a later refresh. */
export function followsInstalledArchiveInput({ path, entry }: Pick<TakeInRequest, "path" | "entry">): boolean {
  return path.startsWith(".arc/completed/") && archiveLayPhase(entry) === "installed"
    && entry.persisted?.takenIn.version !== entry.base.version;
}

/** Pending input can be recognized only when no other recorded continuation owns the file. */
function observesPendingInput(request: TakeInRequest): boolean {
  const { entry, copy, resolution, adopting } = request;
  return entry.pending && copy === null && resolution === undefined && !adopting
    && entry.adoption === undefined && entry.handoff === undefined && entry.archiveSubmission === undefined
    && (entry.persisted?.recording !== true || liveArchiveReceipt(request) !== null)
    && entry.refused?.reason !== "bases-disagree";
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
