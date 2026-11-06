/** Adopt a discovered file through established ownership and the ordinary hand-edit checks. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { identifyArcFileAddress } from "../../layout/index.js";
import { classifyStoreAddress } from "../target-classification.js";
import { RecordReferenceSchema, type RecordReference } from "../identity.js";
import type { ProjectionRootState } from "./process-state.js";
import type { FileStat, ProjectionIndex, RefusedMark } from "./index-schema.js";
import { resolveBacklogOwnership } from "./container-ownership.js";
import { gateRead } from "./read-gate.js";
import { parseStampedFile } from "./stamp.js";
import { gitBlobId } from "./blob-id.js";
import { prepareAdoptedContent } from "./check-edit.js";
import { readProjectionProtection } from "./protection.js";
import { markStoreRefusal } from "./refusal-mark.js";
import { commitProjectionIndex } from "./index-file.js";
import { recordAdoptionAcceptance } from "./adoption-read-back.js";
import { resolveLocatedAdoption } from "./adoption-target.js";
import { mintProjectionMetadata, resumeProjectionStub } from "./stub-mint.js";
import { attachExistingProjectionFile } from "./adoption-existing.js";

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
  root.discovered.push(path);
  if (gate.kind === "pending") return refuse(root, index, path, null, { reason: `pending: ${gate.reason}`,
    remedy: { text: "Let the editor finish saving, then retry adoption." } });
  const target = await resolveAdoptionReference(root, index, path);
  index = target.index;
  if (target.kind === "refused") return refuse(root, index, path, gate.stat, target.mark);
  if (target.kind === "bound") return index;
  const reference = target.reference;
  const denied = await readProjectionProtection({ store: root.store, checkout: root.checkout,
    identity: root.identity, exec: root.ports.exec, verb: root.context.verb }, reference);
  if (denied !== null) return refuse(root, index, path, gate.stat, denied);
  const bytes = await readFile(join(root.checkout, path));
  const existing = await root.store.read({ reference });
  if (existing.status === "ok") return attachExistingProjectionFile(root, index, path, existing.result,
    { stat: gate.stat, blob: gitBlobId(bytes, root.context.format) });
  if (existing.refusal.code !== "not-found") return refuse(root, index, path, gate.stat, markStoreRefusal(existing.refusal, root.context.verb));
  if (reference.kind === "work-item/meta") return refuse(root, index, path, gate.stat, {
    reason: "New work-unit metadata must be created through arc stub.",
    remedy: { text: "Create the stub in its backlog folder with arc stub, then retry adoption." },
  });
  const text = bytes.toString("utf8");
  const supplied = path.endsWith(".md") ? parseStampedFile(text).content : text.replaceAll("\r\n", "\n");
  const checked = await prepareAdoptedContent(root.context, reference, supplied);
  const content = checked.content, broken = checked.refusals;
  const first = broken[0];
  if (first !== undefined) {
    for (const mark of broken.slice(1)) root.context.report?.({ path, copy: null, mark });
    return refuse(root, index, path, gate.stat, first);
  }
  await root.context.checkpoint?.();
  const sent = await root.store.write({ action: "put", reference, content, expected: null,
    provenance: { verb: root.context.verb ?? "write-back", lifecycleAction: "edit" } });
  await root.context.checkpoint?.();
  if (sent.status === "refused") return refuse(root, index, path, gate.stat, markStoreRefusal(sent.refusal, root.context.verb));
  root.context.onWrite?.();
  return recordAdoptionAcceptance(root, index, path, sent.result, content,
    { stat: gate.stat, blob: gitBlobId(bytes, root.context.format) });
}

async function resolveAdoptionReference(root: ProjectionRootState, index: ProjectionIndex, path: string): Promise<
  ({ kind: "reference"; reference: RecordReference } | { kind: "refused"; mark: RefusedMark } | { kind: "bound" }) & { index: ProjectionIndex }
> {
  const held = index.entries[path];
  if (held?.kind === "ownerless" && held.minted !== undefined) {
    const resumed = await resumeProjectionStub(root, index, path, held.minted);
    return resumed.kind === "refused" ? { ...resumed, index: resumed.index ?? index } : { kind: "bound", index: resumed.index };
  }
  const located = identifyArcFileAddress(path);
  if (!path.startsWith(".arc/backlog/") || located?.kind === "cohort-document" || located?.kind === "inbox") {
    return { ...await resolveLocatedAdoption(root, index, path), index };
  }
  let ownership = await resolveBacklogOwnership({ checkout: root.checkout, identity: root.identity, path, store: root.store, index });
  if (ownership.kind === "refused") return { ...ownership, index };
  if (ownership.kind === "prospective") {
    const minted = await mintProjectionMetadata(root, index, ownership);
    if (minted.kind === "refused") return { ...minted, index: minted.index ?? index };
    ownership = minted.ownership;
    index = minted.index;
  }
  const address = identifyArcFileAddress(path, { workItem: ownership.container });
  const target = address === null ? null : classifyStoreAddress(address);
  if (target === null || target.kind === "cohort/document") return { kind: "refused", index, mark: {
    reason: "This file has no adoptable record address.",
    remedy: { text: "Place prose in an established work-item folder; create metadata through arc stub." },
  } };
  if (index.entries[path]?.kind === "record") return { kind: "bound", index };
  return { kind: "reference", index, reference: RecordReferenceSchema.parse({ kind: target.kind, owner: ownership.record.reference.owner,
    ...(target.key === undefined ? {} : { key: target.key }) }) };
}

async function reconcileAbsentAdoption(root: ProjectionRootState, index: ProjectionIndex, path: string): Promise<ProjectionIndex> {
  const entry = index.entries[path];
  if (entry?.kind !== "ownerless") return index;
  if (entry.minted !== undefined) {
    root.unsent.add(path);
    const mark = { reason: "The stub was created, but its authored metadata file is missing.",
      remedy: { text: "Restore the authored metadata file, then retry adoption." } };
    root.context.report?.({ path, copy: null, mark });
    if (entry.stat === null && entry.refused.reason === mark.reason) return index;
    return commitProjectionIndex({ location: root.location, checkout: root.checkout, checkpoint: root.context.checkpoint,
      index: { ...index, entries: { ...index.entries, [path]: { ...entry, stat: null, refused: mark } } } });
  }
  const entries = Object.fromEntries(Object.entries(index.entries).filter(([key]) => key !== path));
  return commitProjectionIndex({ location: root.location, checkout: root.checkout, checkpoint: root.context.checkpoint,
    index: { ...index, entries } });
}

async function refuse(root: ProjectionRootState, index: ProjectionIndex, path: string, stat: FileStat | null, mark: RefusedMark): Promise<ProjectionIndex> {
  root.context.report?.({ path, copy: null, mark });
  const previous = index.entries[path];
  return commitProjectionIndex({ location: root.location, checkout: root.checkout, checkpoint: root.context.checkpoint,
    index: { ...index, entries: { ...index.entries, [path]: { ...(previous?.kind === "ownerless" ? previous : {}),
      kind: "ownerless", stat, refused: mark } } } });
}
