/** Complete retained accepted-input recording without installing a live or aside file. */
import type { StoreRecord } from "../read.js";
import type { RecordEntry, RefusedMark } from "./index-schema.js";
import { createHistoryMemo } from "./base-recovery.js";
import { readRetainedBase, RetainedBaseUnavailable, recordWriteBack } from "./taken-in.js";
import { withheldProjectionMark } from "./materialization-file.js";
import { createKindRegistry } from "../registry.js";
import { PRODUCTION_REGISTRATIONS } from "../kinds/registrations.js";
import type { WriteBackContext } from "./write-back.js";
import { unfinishedRecordingRefusal } from "./recording-state.js";
import { gitBlobId } from "./blob-id.js";

const kinds = createKindRegistry(PRODUCTION_REGISTRATIONS);

/** An updated mapping, or the evidence that must remain pending until repaired. */
export interface RecordingCompletion { readonly entry: RecordEntry; readonly mark?: RefusedMark }

/** The file a recording belongs to, which a withheld file's remedy names. */
export interface RecordingSite { readonly checkout: string; readonly path: string }

/** Observe a pending recording's retained payload without completing or publishing it. */
export async function observeRecordingPayload(context: WriteBackContext, entry: RecordEntry, site: RecordingSite): Promise<
  { readonly kind: "input"; readonly content: string; readonly blob: string }
  | { readonly kind: "held"; readonly entry: RecordEntry; readonly mark: RefusedMark }
> {
  const copy = entry.persisted?.takenIn;
  if (copy?.kind !== "copy") throw new Error("Unfinished recording requires a retained accepted-input copy");
  let content: string;
  try { content = await readRetainedBase(context.location, copy.name); }
  catch (error) {
    if (!(error instanceof RetainedBaseUnavailable)) throw error;
    return { kind: "held", entry, mark: error.mark };
  }
  return gitBlobId(content, context.format) === copy.blob
    ? { kind: "input", content, blob: copy.blob } : { kind: "held", ...withheldRecording(entry, site) };
}

/** Finish recording only; callers retain publication, installation and replacement-baseline ownership. */
export async function completeWriteBackRecording(context: WriteBackContext, entry: RecordEntry, site: RecordingSite,
  readBack?: StoreRecord): Promise<RecordingCompletion> {
  if (entry.archiveSubmission !== undefined) {
    const refusal = unfinishedRecordingRefusal(entry);
    if (refusal === null) throw new Error("An unchecked archive submission requires a recording refusal");
    return { entry, mark: { reason: refusal.condition, remedy: refusal.remedy } };
  }
  const persisted = entry.persisted;
  if (persisted?.recording !== true) return { entry };
  if (readBack === undefined && entry.adoption?.kind === "read-back") return { entry, mark: {
    reason: "The accepted adoption is waiting for its read-back installation continuation.",
    remedy: { text: "Repair the reported read-back condition and retry the command before saving further edits." },
  } };
  if (persisted.takenIn.kind !== "copy") throw new Error("Unfinished recording requires a retained accepted-input copy");
  const observed = await observeRecordingPayload(context, entry, site);
  if (observed.kind === "held") return observed;
  const takenIn = observed.content;
  if (readBack === undefined) {
    const read = await context.store.read({ reference: entry.reference });
    if (read.status === "refused") return { entry, mark: {
      reason: `The edit landed, but recording read-back failed: ${read.refusal.condition}`, remedy: read.refusal.remedy,
    } };
    readBack = read.result;
  }
  return recordWriteBack({ location: context.location, checkpoint: context.checkpoint, entry,
    stamp: persisted.stamp, takenIn, outcome: { kind: "landed", version: persisted.takenIn.version }, readBack,
    grammar: kinds[entry.reference.kind].entry, format: context.format,
    memo: context.memo ?? createHistoryMemo(context.store) });
}

/**
 * A retained input that no longer matches its recorded bytes cannot be repaired, and the store already holds what it
 * accepted, so the recording ends and the file is withheld: once it is deleted, the next command lays the stored record.
 */
function withheldRecording(entry: RecordEntry, site: RecordingSite): Required<RecordingCompletion> {
  return { entry: { ...entry, persisted: null, adoption: undefined, withheld: true },
    mark: withheldProjectionMark(site.path, { checkout: site.checkout, known: true }) };
}
