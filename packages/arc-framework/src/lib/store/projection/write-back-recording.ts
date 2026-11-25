/** Complete retained accepted-input recording without installing a live or aside file. */
import type { StoreRecord } from "../read.js";
import type { RecordEntry, RefusedMark } from "./index-schema.js";
import { createHistoryMemo } from "./base-recovery.js";
import { readRetainedBase, RetainedBaseUnavailable, recordWriteBack } from "./taken-in.js";
import { createKindRegistry } from "../registry.js";
import { PRODUCTION_REGISTRATIONS } from "../kinds/registrations.js";
import type { WriteBackContext } from "./write-back.js";

const kinds = createKindRegistry(PRODUCTION_REGISTRATIONS);

/** An updated mapping, or the evidence that must remain pending until repaired. */
export interface RecordingCompletion { readonly entry: RecordEntry; readonly mark?: RefusedMark }

/** Finish recording only; callers retain publication, installation and replacement-baseline ownership. */
export async function completeWriteBackRecording(context: WriteBackContext, entry: RecordEntry,
  readBack?: StoreRecord): Promise<RecordingCompletion> {
  const persisted = entry.persisted;
  if (persisted?.recording !== true) return { entry };
  if (readBack === undefined && entry.adoption?.kind === "read-back") return { entry, mark: {
    reason: "The accepted adoption is waiting for its read-back installation continuation.",
    remedy: { text: "Repair the reported read-back condition and retry the command before saving further edits." },
  } };
  if (persisted.takenIn.kind !== "copy") throw new Error("Unfinished recording requires a retained accepted-input copy");
  let takenIn: string;
  try { takenIn = await readRetainedBase(context.location, persisted.takenIn.name); }
  catch (error) {
    if (!(error instanceof RetainedBaseUnavailable)) throw error;
    return { entry, mark: error.mark };
  }
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
