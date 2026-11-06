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

/** Take in one unindexed path, retaining bytes and a repairable ownerless entry when admission refuses. */
export async function adoptProjectionFile(root: ProjectionRootState, index: ProjectionIndex, path: string): Promise<ProjectionIndex> {
  root.unsent.add(path);
  await root.context.checkpoint?.();
  const gate = await gateRead({ path: join(root.checkout, path), markdown: false });
  if (gate.kind === "absent") {
    root.unsent.delete(path);
    return forgetOwnerless(root, index, path);
  }
  if (gate.kind === "no-edit") return index;
  root.discovered.push(path);
  if (gate.kind === "pending") return refuse(root, index, path, null, { reason: `pending: ${gate.reason}`,
    remedy: { text: "Let the editor finish saving, then retry adoption." } });
  const target = await resolveAdoptionReference(root, index, path);
  if (target.kind === "refused") return refuse(root, index, path, gate.stat, target.mark);
  const reference = target.reference;
  const denied = await readProjectionProtection({ store: root.store, checkout: root.checkout,
    identity: root.identity, exec: root.ports.exec, verb: root.context.verb }, reference);
  if (denied !== null) return refuse(root, index, path, gate.stat, denied);
  const bytes = await readFile(join(root.checkout, path));
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
  { kind: "reference"; reference: RecordReference } | { kind: "refused"; mark: RefusedMark }
> {
  if (!path.startsWith(".arc/backlog/")) return resolveLocatedAdoption(root, index, path);
  const ownership = await resolveBacklogOwnership({ checkout: root.checkout, identity: root.identity, path, store: root.store, index });
  if (ownership.kind === "refused") return ownership;
  if (ownership.kind === "prospective") {
    const params = ownership.params;
    return { kind: "refused", mark: { reason: "This prospective stub has not yet been created.", remedy: {
      text: `Run arc stub ${params.name} --commitment ${params.commitment} --priority ${params.priority}`
        + (params.cls === undefined ? "" : ` --class ${params.cls}`)
        + (params.cohort === undefined ? "" : ` --cohort ${params.cohort}`) + ", then retry.",
    } } };
  }
  const address = identifyArcFileAddress(path, { workItem: ownership.container });
  const target = address === null ? null : classifyStoreAddress(address);
  if (target === null || target.kind === "work-item/meta" || target.kind === "cohort/document") return { kind: "refused", mark: {
    reason: "This file has no adoptable record address.",
    remedy: { text: "Place prose in an established work-item folder; create metadata through arc stub." },
  } };
  return { kind: "reference", reference: RecordReferenceSchema.parse({ kind: target.kind, owner: ownership.record.reference.owner,
    ...(target.key === undefined ? {} : { key: target.key }) }) };
}

async function forgetOwnerless(root: ProjectionRootState, index: ProjectionIndex, path: string): Promise<ProjectionIndex> {
  if (index.entries[path]?.kind !== "ownerless") return index;
  const entries = Object.fromEntries(Object.entries(index.entries).filter(([key]) => key !== path));
  return commitProjectionIndex({ location: root.location, checkout: root.checkout, checkpoint: root.context.checkpoint,
    index: { ...index, entries } });
}

async function refuse(root: ProjectionRootState, index: ProjectionIndex, path: string, stat: FileStat | null, mark: RefusedMark): Promise<ProjectionIndex> {
  root.context.report?.({ path, copy: null, mark });
  return commitProjectionIndex({ location: root.location, checkout: root.checkout, checkpoint: root.context.checkpoint,
    index: { ...index, entries: { ...index.entries, [path]: { kind: "ownerless", stat, refused: mark } } } });
}
