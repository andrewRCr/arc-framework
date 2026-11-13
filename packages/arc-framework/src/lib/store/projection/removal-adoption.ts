/** Read an unindexed file's adoption feasibility without minting, attaching, or sending it. */
import { join } from "node:path";
import { checkSerializationRules } from "../serialization.js";
import type { FileStat, MintedStubReceipt, ProjectionIndex, RecordEntry } from "./index-schema.js";
import type { ProjectionRemovalGuard } from "./removal-observations.js";
import type { ReadOnlyProjectionRoot } from "./engine-read-only.js";
import type { ProjectionRemovalCheck } from "./removal-verdict.js";
import { projectionFeasibilityRefusal, unresolvedRemovalConflicts } from "./removal-verdict.js";
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
  guard: ProjectionRemovalGuard): Promise<ProjectionRemovalCheck> {
  const gate = await gateRead({ path: join(root.checkout, path), markdown: false });
  if (gate.kind === "absent") {
    const entry = index.entries[path];
    return entry?.kind === "ownerless" && entry.minted !== undefined
      ? { kind: "would-refuse", remedy: missingMintedMetadataMark().remedy } : { kind: "passes" };
  }
  if (gate.kind === "no-edit") return { kind: "passes" };
  if (gate.kind === "pending") return { kind: "would-refuse", remedy: { text: `Let ${path} finish saving, then retry adoption and removal.` } };
  const checked = await checkReadableAdoption(root, index, path, gate.stat);
  return checked.kind === "passes" ? guard(path) : checked;
}

async function checkReadableAdoption(root: ReadOnlyProjectionRoot, index: ProjectionIndex, path: string,
  stat: FileStat): Promise<ProjectionRemovalCheck> {
  const target = await readRemovalAdoptionTarget(root, index, path);
  if (target.kind !== "reference") return target;
  const verdict = await inspectProjectionAdoption(root, path, target.reference, stat);
  if (verdict.kind === "refused") return { kind: "would-refuse", remedy: verdict.mark.remedy };
  if (verdict.kind === "existing") return checkExistingProjectionAdoption(root, path,
    existingProjectionEntry(verdict.record, verdict.read, root.context.format));
  const invalid = checkSerializationRules(verdict.reference, verdict.file.content);
  if (invalid !== undefined) return { kind: "would-refuse", remedy: invalid.remedy };
  const prepared = await prepareAdoptedProjectionSubmission(root.context, root.checkout, path, verdict.file, index);
  if (prepared.status === "ok") return { kind: "passes" };
  return prepared.nativeRefusal === true ? { kind: "unobservable", detail: prepared.refusal.remedy.text }
    : { kind: "would-refuse", remedy: prepared.refusal.remedy };
}

async function readRemovalAdoptionTarget(root: ReadOnlyProjectionRoot, index: ProjectionIndex,
  path: string): Promise<Extract<AdoptionReference, { kind: "reference" }> | ProjectionRemovalCheck> {
  const intent = await resolveProjectionAdoptionIntent(root, index, path);
  if (intent.kind === "resume") return checkPendingProjectionStub(root, path, intent.receipt);
  let target: AdoptionReference | { readonly kind: "bound" };
  if (intent.kind === "ownership") {
    const ownership = intent.ownership;
    if (ownership.kind === "prospective") {
      const classified = classifyBacklogAdoption(path, ownership.container);
      return classified.kind === "refused" ? { kind: "would-refuse", remedy: classified.mark.remedy } : { kind: "passes" };
    }
    target = resolveOwnedAdoptionReference(index, path, ownership);
  } else target = intent;
  if (target.kind === "bound") return { kind: "passes" };
  if (target.kind === "refused") return { kind: "would-refuse", remedy: target.mark.remedy };
  return target;
}

async function checkExistingProjectionAdoption(root: ReadOnlyProjectionRoot, path: string, entry: RecordEntry): Promise<ProjectionRemovalCheck> {
  const prepared = await prepareWriteBack(root.context, pendingFileRequest(root.checkout, path, entry));
  if (prepared.kind !== "ready") return projectionFeasibilityRefusal(prepared, path) ?? { kind: "passes" };
  const conflict = unresolvedRemovalConflicts(path, entry.unshown, prepared.write.resolves ?? []);
  if (conflict !== null) return conflict;
  const invalid = checkSerializationRules(entry.reference, prepared.write.content);
  return invalid === undefined ? { kind: "passes" } : { kind: "would-refuse", remedy: invalid.remedy };
}

async function checkPendingProjectionStub(root: ReadOnlyProjectionRoot, path: string, receipt: MintedStubReceipt): Promise<ProjectionRemovalCheck> {
  const observed = await readProjectionStubMetadata(root, path);
  if (observed.kind === "refused") return { kind: "would-refuse", remedy: observed.mark.remedy };
  const basis = await readMintedProjectionBasis(root, receipt);
  if (basis.kind === "refused") return { kind: "would-refuse", remedy: basis.mark.remedy };
  const denied = await readProjectionProtection({ store: root.store, checkout: root.checkout, identity: root.identity,
    exec: root.ports.exec, verb: root.context.verb }, receipt.reference);
  if (denied !== null) return { kind: "would-refuse", remedy: denied.remedy };
  return checkExistingProjectionAdoption(root, path, mintedProjectionEntry(receipt, basis, observed.read, root.context.format));
}
