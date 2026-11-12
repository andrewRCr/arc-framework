/** Adopt a discovered file through established ownership and the ordinary hand-edit checks. */
import { withProjectionEntry } from "./index-memory.js";
import { join } from "node:path";
import type { RecordReference } from "../identity.js";
import type { ProjectionRootState } from "./process-state.js";
import type { FileStat, ProjectionIndex, RefusedMark } from "./index-schema.js";
import { gateRead } from "./read-gate.js";
import { prepareAdoptedProjectionSubmission, submitProjectionBatch } from "./submission.js";
import { markStoreRefusal } from "./refusal-mark.js";
import { commitProjectionIndex } from "./index-file.js";
import { recordAdoptionAcceptance } from "./adoption-read-back.js";
import { mintProjectionMetadata, resumeProjectionStub } from "./stub-mint.js";
import { attachExistingProjectionFile } from "./adoption-existing.js";
import { inspectProjectionAdoption, missingMintedMetadataMark } from "./adoption-verdict.js";
import { resolveProjectionAdoptionIntent, resolveOwnedAdoptionReference } from "./adoption-intent.js";

/** Take in one unindexed path, retaining bytes and a repairable ownerless entry when admission refuses. */
export async function adoptProjectionFile(root: ProjectionRootState, index: ProjectionIndex, path: string): Promise<ProjectionIndex> {
  root.unsent.add(path);
  await root.context.checkpoint?.();
  const gate = await gateRead({ path: join(root.checkout, path), markdown: false });
  if (gate.kind === "absent") {
    root.unsent.delete(path);
    return reconcileAbsentAdoption(root, index, path);
  }
  if (gate.kind === "no-edit") return index;
  const held = index.entries[path];
  if (held?.withheld) return reportWithheld(root, index, path, held.refused);
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
  const content = submission.result.plan.prepared.takenIn;
  const sent = await submitProjectionBatch(root.context, submission.result.batch);
  if (sent.status === "refused") return refuse(root, index, path, gate.stat, markStoreRefusal(sent.refusal, root.context.verb));
  return recordAdoptionAcceptance(root, index, path, sent.result, content,
    verdict.read);
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
    if (entry.stat === null && entry.refused.reason === mark.reason) return index;
    return commitProjectionIndex({ location: root.location, checkout: root.checkout, checkpoint: root.context.checkpoint,
      index: withProjectionEntry(index, path, { ...entry, stat: null, refused: mark }) });
  }
  return commitProjectionIndex({ location: root.location, checkout: root.checkout, checkpoint: root.context.checkpoint,
    index: withProjectionEntry(index, path, undefined) });
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
