/** Keep an opened archive save recoverable before its caller receives the store result. */
import { randomUUID } from "node:crypto";
import { sameReference, type RecordReference, type RecordVersion } from "../identity.js";
import { HAND_EDIT_VERBS } from "../links.js";
import type { ArchiveSaveSubmission, ProjectionIndex, RecordEntry, RefusedMark } from "./index-schema.js";
import type { TakeInRead, TakeInRequest } from "./take-in-port.js";
import type { PreparedWriteBack, WriteBackContext } from "./write-back.js";
import { keepTakenInCopy } from "./taken-in.js";
import { commitProjectionIndex } from "./index-file.js";
import { withProjectionEntry } from "./index-memory.js";
import { markStoreRefusal } from "./refusal-mark.js";

/** Publish the captured input before submitting its single-write batch. */
export async function stageArchiveSave(context: WriteBackContext, index: ProjectionIndex, request: TakeInRequest,
  entry: RecordEntry, prepared: Extract<PreparedWriteBack, { kind: "ready" }>): Promise<{ entry: RecordEntry; id: string }> {
  const held = await retainArchiveSubmission(context, prepared.stamp, prepared.takenIn, prepared.read);
  const archiveSubmission = { ...held, ...(prepared.retained === undefined ? {} : { retained: prepared.retained }) };
  const staged = { ...entry, archiveSubmission };
  await commitProjectionIndex({ location: context.location, checkout: request.checkout,
    index: withProjectionEntry(index, request.path, staged), checkpoint: context.checkpoint });
  return { entry: staged, id: archiveSubmission.id };
}

/** Retain exactly the submitted text and its observation for interrupted read-back. */
export async function retainArchiveSubmission(context: WriteBackContext, stamp: string, takenIn: string, read: TakeInRead) {
  const copy = await keepTakenInCopy(context.location, takenIn, context.format, context.checkpoint);
  return { id: randomUUID(), stamp, read, ...copy };
}

/** Bind a locally retained input to its exact accepted version. */
export function acceptArchiveSave(entry: RecordEntry, version: RecordVersion): RecordEntry {
  const { archiveSubmission, ...prior } = entry;
  if (archiveSubmission === undefined) throw new Error("An accepted archive save requires its staged input");
  return { ...prior, ...acceptedArchiveRecording(archiveSubmission, version) };
}

/** Form the existing accepted-input recording from the copy retained before submission. */
export function acceptedArchiveRecording(submission: ArchiveSaveSubmission, version: RecordVersion): Pick<RecordEntry, "persisted" | "acceptedInputStat"> {
  const { stamp, name, blob, read } = submission;
  return { persisted: { stamp, recording: true, takenIn: { kind: "copy", name, blob, version } },
    acceptedInputStat: read === undefined ? undefined : { ino: read.stat.ino, mtimeNs: read.stat.mtimeNs } };
}

/** Resolve the interrupted submission before the checkout can attempt another write for this file. */
export async function recoverArchiveSave(context: WriteBackContext, entry: RecordEntry, retainUnaccepted = false): Promise<{
  entry: RecordEntry; mark?: RefusedMark;
}> {
  const { archiveSubmission, ...prior } = entry;
  if (archiveSubmission === undefined) return { entry };
  const receipt = await findArchiveSaveAcceptance(context, entry.reference, archiveSubmission.id);
  if (receipt.kind === "held") return { entry, mark: receipt.mark };
  if (receipt.kind === "unaccepted") return { entry: retainUnaccepted ? entry : prior };
  const accepted = { ...acceptArchiveSave(entry, receipt.version), pending: true };
  return { entry: entry.adoption !== undefined && archiveSubmission.read !== undefined
    ? { ...accepted, adoption: { kind: "read-back", read: archiveSubmission.read,
      ...(archiveSubmission.retained === undefined ? {} : { retained: archiveSubmission.retained }) } } : accepted };
}

/** Read the receipt for a staged submission without changing its local basis or submitting a write. */
export async function findArchiveSaveAcceptance(context: WriteBackContext, reference: RecordReference, id: string): Promise<
  { kind: "accepted"; reference: RecordReference; version: RecordVersion } | { kind: "unaccepted" } | { kind: "held"; mark: RefusedMark }> {
  const receipt = await context.store.history({ reference, archiveSaveId: id });
  if (receipt.status === "refused") return { kind: "held", mark: markStoreRefusal(receipt.refusal, context.verb) };
  const matches = receipt.result.filter(({ reference: record, provenance }) => sameReference(record, reference) && "verb" in provenance
    && HAND_EDIT_VERBS.some(verb => verb === provenance.verb) && provenance.archiveSaveId === id);
  if (matches.length === 0) return { kind: "unaccepted" };
  const [accepted] = matches;
  if (matches.length === 1 && accepted?.version != null) return { kind: "accepted", reference: accepted.reference, version: accepted.version };
  return { kind: "held", mark: { reason: "The archive save's acceptance does not identify a single stored version.",
    remedy: { text: "Keep the file and the retained input, repair the store history, then retry arc save." } } };
}
