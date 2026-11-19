/** Keep an opened archive save recoverable before its caller receives the store result. */
import { randomUUID } from "node:crypto";
import { sameReference, type RecordVersion } from "../identity.js";
import type { ProjectionIndex, RecordEntry, RefusedMark } from "./index-schema.js";
import type { TakeInRequest } from "./take-in-port.js";
import type { WriteBackContext } from "./write-back.js";
import { keepTakenInCopy } from "./taken-in.js";
import { commitProjectionIndex } from "./index-file.js";
import { withProjectionEntry } from "./index-memory.js";
import { markStoreRefusal } from "./refusal-mark.js";

/** Publish the captured input before submitting its single-write batch. */
export async function stageArchiveSave(context: WriteBackContext, index: ProjectionIndex, request: TakeInRequest,
  entry: RecordEntry, stamp: string, takenIn: string): Promise<{ entry: RecordEntry; id: string }> {
  const id = randomUUID();
  const archiveSubmission = { id, stamp, ...await keepTakenInCopy(context.location, takenIn, context.format, context.checkpoint) };
  const staged = { ...entry, archiveSubmission };
  await commitProjectionIndex({ location: context.location, checkout: request.checkout,
    index: withProjectionEntry(index, request.path, staged), checkpoint: context.checkpoint });
  return { entry: staged, id };
}

/** Bind a locally retained input to its exact accepted version. */
export function acceptArchiveSave(entry: RecordEntry, version: RecordVersion): RecordEntry {
  const { archiveSubmission, ...prior } = entry;
  if (archiveSubmission === undefined) throw new Error("An accepted archive save requires its staged input");
  const { stamp, name, blob } = archiveSubmission;
  return { ...prior, persisted: { stamp, recording: true, takenIn: { kind: "copy", name, blob, version } } };
}

/** Resolve the interrupted submission before the checkout can attempt another write for this file. */
export async function recoverArchiveSave(context: WriteBackContext, entry: RecordEntry): Promise<{
  entry: RecordEntry; mark?: RefusedMark;
}> {
  const { archiveSubmission, ...prior } = entry;
  if (archiveSubmission === undefined) return { entry };
  const receipt = await context.store.history({ reference: entry.reference, archiveSaveId: archiveSubmission.id });
  if (receipt.status === "refused") return { entry, mark: markStoreRefusal(receipt.refusal, context.verb) };
  const matches = receipt.result.filter(({ reference, provenance }) => sameReference(reference, entry.reference)
    && "verb" in provenance && provenance.verb === "save" && provenance.archiveSaveId === archiveSubmission.id);
  if (matches.length === 0) return { entry: prior };
  const version = matches[0]?.version;
  if (matches.length === 1 && version != null) return { entry: { ...acceptArchiveSave(entry, version), pending: true } };
  return { entry, mark: { reason: "The archive save's acceptance does not identify a single stored version.",
    remedy: { text: "Keep the file and the retained input, repair the store history, then retry arc save." } } };
}
