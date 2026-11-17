/** Read an unindexed file's adoption feasibility without minting, attaching, or sending it. */
import { join } from "node:path";
import { checkSerializationRules } from "../serialization.js";
import type { FileStat, MintedStubReceipt, ProjectionIndex, RecordEntry } from "./index-schema.js";
import type { ProjectionRemovalGuard } from "./removal-observations.js";
import type { ReadOnlyProjectionRoot } from "./engine-read-only.js";
import { markedRemovalRefusal, projectionFeasibilityRefusal, retirementName, unobservedMarkDetail, unobservedRefusal, unresolvedRemovalConflicts,
  type ProjectionRemovalCheck, type ProjectionRetirement } from "./removal-verdict.js";
import { markStoreRefusal } from "./refusal-mark.js";
import { gateRead } from "./read-gate.js";
import { classifyBacklogAdoption, resolveOwnedAdoptionReference, resolveProjectionAdoptionIntent } from "./adoption-intent.js";
import { inspectProjectionAdoption, missingMintedMetadataMark } from "./adoption-verdict.js";
import { existingProjectionEntry } from "./adoption-existing.js";
import { prepareWriteBack } from "./write-back.js";
import { pendingFileRequest } from "./pending-request.js";
import { prepareAdoptedProjectionSubmission } from "./submission.js";
import type { AdoptionReference } from "./adoption-target.js";
import { readProjectionStubMetadata, readMintedProjectionBasis, mintedProjectionEntry } from "./stub-mint.js";
import { readProjectionProtection } from "./protection.js";

/**
 * Apply adoption's own verdict, then only the preparation the adopter would reach; a file adoption would go on to send
 * also answers the guard, since persistence cannot install it where the ignore check refuses its root.
 */
export async function checkProjectionAdoption(root: ReadOnlyProjectionRoot, index: ProjectionIndex, path: string,
  guard: ProjectionRemovalGuard, disposition: ProjectionRetirement): Promise<ProjectionRemovalCheck> {
  const gate = await gateRead({ path: join(root.checkout, path), markdown: false });
  if (gate.kind === "absent") {
    const entry = index.entries[path];
    return entry?.kind === "ownerless" && entry.minted !== undefined
      ? markedRemovalRefusal(root.checkout, path, missingMintedMetadataMark(), disposition) : { kind: "passes" };
  }
  if (gate.kind === "no-edit") return { kind: "passes" };
  if (gate.kind === "pending") return { kind: "would-refuse", remedy: { text: `Let ${path} in ${root.checkout} finish saving, then retry ${retirementName(disposition)}.` } };
  const checked = await checkReadableAdoption(root, index, path, gate.stat, disposition);
  return checked.kind === "passes" ? guard(path) : checked;
}

async function checkReadableAdoption(root: ReadOnlyProjectionRoot, index: ProjectionIndex, path: string,
  stat: FileStat, disposition: ProjectionRetirement): Promise<ProjectionRemovalCheck> {
  const target = await readRemovalAdoptionTarget(root, index, path, disposition);
  if (target.kind !== "reference") return target;
  const verdict = await inspectProjectionAdoption(root, path, target.reference, stat);
  if (verdict.kind === "refused") return markedRemovalRefusal(root.checkout, path, verdict.mark, disposition);
  if (verdict.kind === "existing") return checkExistingProjectionAdoption(root, path,
    existingProjectionEntry(verdict.record, verdict.read, root.context.format), disposition);
  const invalid = checkSerializationRules(verdict.reference, verdict.file.content);
  if (invalid !== undefined) return markedRemovalRefusal(root.checkout, path, markStoreRefusal(invalid), disposition);
  const prepared = await prepareAdoptedProjectionSubmission(root.context, root.checkout, path, verdict.file, index);
  if (prepared.status === "ok") return { kind: "passes" };
  return prepared.nativeRefusal === true ? unobservedRefusal(root.checkout, path, prepared.refusal)
    : markedRemovalRefusal(root.checkout, path, markStoreRefusal(prepared.refusal), disposition);
}

async function readRemovalAdoptionTarget(root: ReadOnlyProjectionRoot, index: ProjectionIndex,
  path: string, disposition: ProjectionRetirement): Promise<Extract<AdoptionReference, { kind: "reference" }> | ProjectionRemovalCheck> {
  const intent = await resolveProjectionAdoptionIntent(root, index, path);
  if (intent.kind === "resume") return checkPendingProjectionStub(root, path, intent.receipt, disposition);
  let target: AdoptionReference | { readonly kind: "bound" };
  if (intent.kind === "ownership") {
    const ownership = intent.ownership;
    if (ownership.kind === "prospective") {
      const classified = classifyBacklogAdoption(path, ownership.container);
      return classified.kind === "refused" ? markedRemovalRefusal(root.checkout, path, classified.mark, disposition) : { kind: "passes" };
    }
    target = resolveOwnedAdoptionReference(index, path, ownership);
  } else target = intent;
  if (target.kind === "bound") return { kind: "passes" };
  // A refusal resting on a failed read leaves the file unjudged.
  if (target.kind === "refused") return target.readFailure === true
    ? { kind: "unobservable", detail: unobservedMarkDetail(root.checkout, path, target.mark) }
    : markedRemovalRefusal(root.checkout, path, target.mark, disposition);
  return target;
}

async function checkExistingProjectionAdoption(root: ReadOnlyProjectionRoot, path: string, entry: RecordEntry,
  disposition: ProjectionRetirement): Promise<ProjectionRemovalCheck> {
  const prepared = await prepareWriteBack(root.context, pendingFileRequest(root.checkout, path, entry));
  if (prepared.kind !== "ready") return projectionFeasibilityRefusal(prepared, root.checkout, path, disposition) ?? { kind: "passes" };
  const conflict = unresolvedRemovalConflicts(root.checkout, path, entry.unshown, prepared.write.resolves ?? [], disposition);
  if (conflict !== null) return conflict;
  const invalid = checkSerializationRules(entry.reference, prepared.write.content);
  return invalid === undefined ? { kind: "passes" } : markedRemovalRefusal(root.checkout, path, markStoreRefusal(invalid), disposition);
}

async function checkPendingProjectionStub(root: ReadOnlyProjectionRoot, path: string, receipt: MintedStubReceipt,
  disposition: ProjectionRetirement): Promise<ProjectionRemovalCheck> {
  const observed = await readProjectionStubMetadata(root, path);
  if (observed.kind === "refused") return markedRemovalRefusal(root.checkout, path, observed.mark, disposition);
  const basis = await readMintedProjectionBasis(root, receipt);
  if (basis.kind === "refused") return basis.readFailure === true
    ? { kind: "unobservable", detail: unobservedMarkDetail(root.checkout, path, basis.mark) }
    : markedRemovalRefusal(root.checkout, path, basis.mark, disposition);
  const denied = await readProjectionProtection({ store: root.store, checkout: root.checkout, identity: root.identity,
    exec: root.ports.exec, verb: root.context.verb }, receipt.reference);
  if (denied !== null) return markedRemovalRefusal(root.checkout, path, denied, disposition);
  return checkExistingProjectionAdoption(root, path, mintedProjectionEntry(receipt, basis, observed.read, root.context.format), disposition);
}
