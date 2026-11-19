/** Adopt a discovered file through established ownership and the ordinary hand-edit checks. */
import type { ProjectionFileWriteObservation } from "./file-write-observation.js";
import { withProjectionEntry } from "./index-memory.js";
import { renderRemedyArgument } from "../../../scripts/integration/spine-refusal.js";
import { join } from "node:path";
import type { RecordReference } from "../identity.js";
import type { ProjectionRootState } from "./process-state.js";
import type { FileStat, OwnerlessEntry, ProjectionIndex, RecordEntry, RefusedMark } from "./index-schema.js";
import { gateRead, projectionReadGate } from "./read-gate.js";
import { prepareAdoptedProjectionSubmission, submitProjectionBatch } from "./submission.js";
import { markStoreRefusal } from "./refusal-mark.js";
import { commitProjectionIndex } from "./index-file.js";
import { publishAdoptionAcceptance, recordAdoptionAcceptance, resumeAdoptionReadBack } from "./adoption-read-back.js";
import { mintProjectionMetadata, resumeProjectionStub } from "./stub-mint.js";
import { attachExistingProjectionFile } from "./adoption-existing.js";
import { inspectProjectionAdoption, missingMintedMetadataMark } from "./adoption-verdict.js";
import { resolveProjectionAdoptionIntent, resolveOwnedAdoptionReference } from "./adoption-intent.js";
import { findArchiveSaveAcceptance, retainArchiveSubmission } from "./archive-save-recording.js";
import { gitBlobId } from "./blob-id.js";
import type { TakeInRead } from "./take-in-port.js";
import type { PreparedProjectionSubmission } from "./submission.js";
import { ArchiveDestinationBlocked, archiveDestinationRefusal, requireArchiveDestination } from "./archive-file.js";

/** Take in one unindexed path, retaining bytes and a repairable ownerless entry when admission refuses. */
export async function adoptProjectionFile(root: ProjectionRootState, index: ProjectionIndex, path: string, onFile?: (observation: ProjectionFileWriteObservation) => void): Promise<ProjectionIndex> {
  root.unsent.add(path);
  const entry = index.entries[path];
  if (entry?.kind === "ownerless" && entry.archiveSubmission !== undefined) {
    const recovered = await recoverSubmittedArchiveAdoption(root, index, path, entry);
    if (recovered.kind === "accepted") return resumeAdoptionReadBack(root, recovered.index, path, recovered.entry, onFile);
    if (recovered.kind === "held") return recovered.index;
    index = recovered.index;
  }
  try { return await adoptObservedFile(root, index, path, onFile); }
  catch (error) {
    if (error instanceof ArchiveDestinationBlocked) return refuse(root, index, path, entry?.stat ?? null, error.mark);
    throw error;
  }
}

async function adoptObservedFile(root: ProjectionRootState, index: ProjectionIndex, path: string,
  onFile?: (observation: ProjectionFileWriteObservation) => void): Promise<ProjectionIndex> {
  await root.context.checkpoint?.();
  const gate = await gateRead({ path: join(root.checkout, path), markdown: false }, projectionReadGate(root.checkout, path));
  requireArchiveDestination(root.checkout, path);
  if (gate.kind === "absent") {
    root.unsent.delete(path);
    return reconcileAbsentAdoption(root, index, path);
  }
  if (gate.kind === "no-edit") return index;
  const held = index.entries[path];
  if (held?.withheld) return reportWithheld(root, index, path, held.refused ?? null);
  root.discovered.push(path);
  if (gate.kind === "pending") return refuse(root, index, path, null, { reason: `pending: ${gate.reason}`,
    remedy: { text: "Let the editor finish saving, then retry adoption." } });
  const target = await resolveAdoptionReference(root, index, path);
  index = target.index;
  if (target.kind === "refused") return refuse(root, index, path, gate.stat, target.mark);
  if (target.kind === "bound") return index;
  const verdict = await inspectProjectionAdoption(root, path, target.reference, gate.stat);
  if (verdict.kind === "refused") return refuse(root, index, path, verdict.stat, verdict.mark);
  if (verdict.kind === "existing") return attachExistingProjectionFile(root, index, path, verdict.record, verdict.read);
  await root.context.checkpoint?.();
  const submission = await prepareAdoptedProjectionSubmission(root.context, root.checkout, path, verdict.file, index);
  if (submission.status === "refused") return refuse(root, index, path, gate.stat, markStoreRefusal(submission.refusal, root.context.verb));
  return submitAdoption(root, index, path, verdict.read, submission.result, onFile);
}

async function submitAdoption(root: ProjectionRootState, index: ProjectionIndex, path: string, read: TakeInRead,
  submission: PreparedProjectionSubmission, onFile?: (observation: ProjectionFileWriteObservation) => void): Promise<ProjectionIndex> {
  const prepared = submission.plan.prepared;
  const entry = index.entries[path];
  requireArchiveDestination(root.checkout, path);
  const staged = path.startsWith(".arc/completed/") && entry?.kind === "ownerless" && entry.opened === true
    ? await retainArchiveSubmission(root.context, gitBlobId(prepared.takenIn, root.context.format), prepared.takenIn, read) : undefined;
  if (staged !== undefined && entry?.kind === "ownerless") {
    const journaled = await commitProjectionIndex({ location: root.location, checkout: root.checkout, checkpoint: root.context.checkpoint,
      index: withProjectionEntry(index, path, { ...entry, archiveSubmission: { ...staged, reference: prepared.reference } }) });
    const blocked = archiveDestinationRefusal(root.checkout, path);
    if (blocked !== null) return refuse(root, journaled, path, read.stat, blocked);
  }
  const sent = await submitProjectionBatch(root.context, submission.batch, staged?.id);
  if (sent.status === "refused") return refuse(root, index, path, read.stat, markStoreRefusal(sent.refusal, root.context.verb));
  return recordAdoptionAcceptance(root, index, path, sent.result, staged ?? prepared.takenIn, read, onFile);
}

/** Resolve the submission in the store without reading or installing the working file. */
export async function recoverSubmittedArchiveAdoption(root: ProjectionRootState, index: ProjectionIndex, path: string, entry: OwnerlessEntry,
  retainUnaccepted = false): Promise<{ kind: "held" | "retry"; index: ProjectionIndex }
    | { kind: "accepted"; index: ProjectionIndex; entry: RecordEntry }> {
  const { archiveSubmission, ...prior } = entry;
  if (archiveSubmission === undefined) throw new Error("An interrupted archive adoption requires its staged input");
  const receipt = await findArchiveSaveAcceptance(root.context, archiveSubmission.reference, archiveSubmission.id);
  if (receipt.kind === "held") {
    root.context.report?.({ path, copy: null, mark: receipt.mark });
    return { kind: "held", index };
  }
  if (receipt.kind === "accepted") {
    const { recorded, pending } = await publishAdoptionAcceptance(root, index, path,
      { reference: receipt.reference, version: receipt.version, conflicts: [] }, archiveSubmission, archiveSubmission.read);
    return { kind: "accepted", index: recorded, entry: pending };
  }
  if (retainUnaccepted) return { kind: "held", index };
  return { kind: "retry", index: await commitProjectionIndex({ location: root.location, checkout: root.checkout, checkpoint: root.context.checkpoint,
    index: withProjectionEntry(index, path, prior) }) };
}

async function resolveAdoptionReference(root: ProjectionRootState, index: ProjectionIndex, path: string): Promise<
  ({ kind: "reference"; reference: RecordReference } | { kind: "refused"; mark: RefusedMark } | { kind: "bound" }) & { index: ProjectionIndex }
> {
  const intent = await resolveProjectionAdoptionIntent(root, index, path);
  if (intent.kind === "resume") {
    const resumed = await resumeProjectionStub(root, index, path, intent.receipt);
    return resumed.kind === "refused" ? { ...resumed, index: resumed.index ?? index } : { kind: "bound", index: resumed.index };
  }
  if (intent.kind !== "ownership") return { ...intent, index };
  let ownership = intent.ownership;
  if (ownership.kind === "prospective") {
    const minted = await mintProjectionMetadata(root, index, ownership);
    if (minted.kind === "refused") return { ...minted, index: minted.index ?? index };
    ownership = minted.ownership;
    index = minted.index;
  }
  return { ...resolveOwnedAdoptionReference(index, path, ownership), index };
}

async function reconcileAbsentAdoption(root: ProjectionRootState, index: ProjectionIndex, path: string): Promise<ProjectionIndex> {
  const entry = index.entries[path];
  if (entry?.kind !== "ownerless") return index;
  if (entry.minted !== undefined) {
    root.unsent.add(path);
    const mark = missingMintedMetadataMark();
    root.context.report?.({ path, copy: null, mark });
    if (entry.stat === null && entry.refused?.reason === mark.reason) return index;
    return commitProjectionIndex({ location: root.location, checkout: root.checkout, checkpoint: root.context.checkpoint,
      index: withProjectionEntry(index, path, { ...entry, stat: null, refused: mark }) });
  }
  const dropped = await commitProjectionIndex({ location: root.location, checkout: root.checkout, checkpoint: root.context.checkpoint,
    index: withProjectionEntry(index, path, undefined) });
  if (entry.opened === true) root.context.report?.({ path, copy: null, mark: {
    reason: "The opened new file is absent; its opening was removed.",
    remedy: { text: `If the file returns, run arc edit ${renderRemedyArgument(path)} to open it again.` },
  } });
  return dropped;
}

async function refuse(root: ProjectionRootState, index: ProjectionIndex, path: string, stat: FileStat | null, mark: RefusedMark): Promise<ProjectionIndex> {
  root.context.report?.({ path, copy: null, mark });
  const previous = index.entries[path];
  return commitProjectionIndex({ location: root.location, checkout: root.checkout, checkpoint: root.context.checkpoint,
    index: withProjectionEntry(index, path, { ...(previous?.kind === "ownerless" ? previous : {}),
      kind: "ownerless", stat, refused: mark }) });
}

function reportWithheld(root: ProjectionRootState, index: ProjectionIndex, path: string, mark: RefusedMark | null): ProjectionIndex {
  if (mark !== null) root.context.report?.({ path, copy: null, mark });
  return index;
}
