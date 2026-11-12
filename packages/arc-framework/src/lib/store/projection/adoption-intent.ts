/** Resolve adoption's read-only intent before any minting or attachment continuation. */
import { identifyArcFileAddress } from "../../layout/index.js";
import { classifyStoreAddress, type ClassifiedStoreTarget } from "../target-classification.js";
import { RecordReferenceSchema } from "../identity.js";
import type { MintedStubReceipt, ProjectionIndex, RefusedMark } from "./index-schema.js";
import type { ProjectionSelectionContext } from "./selection-context.js";
import { resolveBacklogOwnership, type BacklogOwnership, type WorkItemContainer } from "./container-ownership.js";
import { resolveLocatedAdoption, type AdoptionReference } from "./adoption-target.js";

/** A retained receipt resumes exactly; a prospective owner needs a mint only in the writable continuation. */
export type ProjectionAdoptionIntent = AdoptionReference
  | { readonly kind: "resume"; readonly receipt: MintedStubReceipt }
  | { readonly kind: "ownership"; readonly ownership: Exclude<BacklogOwnership, { kind: "refused" }> };

/** Observe ownership and validated stub parameters without creating an owner or changing an index. */
export async function resolveProjectionAdoptionIntent(root: ProjectionSelectionContext, index: ProjectionIndex,
  path: string): Promise<ProjectionAdoptionIntent> {
  const held = index.entries[path];
  if (held?.kind === "ownerless" && held.minted !== undefined) return { kind: "resume", receipt: held.minted };
  const located = identifyArcFileAddress(path);
  if (!path.startsWith(".arc/backlog/") || located?.kind === "cohort-document" || located?.kind === "inbox") {
    return resolveLocatedAdoption(root, index, path);
  }
  const ownership = await resolveBacklogOwnership({ checkout: root.checkout, identity: root.identity, path, store: root.store, index });
  return ownership.kind === "refused" ? ownership : { kind: "ownership", ownership };
}

/** Classify the triggering pathname independently of whether its future owner has been minted. */
export function classifyBacklogAdoption(path: string, container: WorkItemContainer):
  { readonly kind: "target"; readonly target: ClassifiedStoreTarget } | { readonly kind: "refused"; readonly mark: RefusedMark } {
  const address = identifyArcFileAddress(path, { workItem: container });
  const target = address === null ? null : classifyStoreAddress(address);
  return target === null || target.kind === "cohort/document" ? { kind: "refused", mark: {
    reason: "This file has no adoptable record address.",
    remedy: { text: "Place prose in an established work-item folder; create metadata through arc stub." },
  } } : { kind: "target", target };
}

/** Bind an established owner's exact generation after the writable mint, where needed, has completed. */
export function resolveOwnedAdoptionReference(index: ProjectionIndex, path: string,
  ownership: Extract<BacklogOwnership, { kind: "owned" }>): AdoptionReference | { readonly kind: "bound" } {
  const classified = classifyBacklogAdoption(path, ownership.container);
  if (classified.kind === "refused") return classified;
  if (index.entries[path]?.kind === "record") return { kind: "bound" };
  const target = classified.target;
  return { kind: "reference", reference: RecordReferenceSchema.parse({ kind: target.kind, owner: ownership.record.reference.owner,
    ...(target.key === undefined ? {} : { key: target.key }) }) };
}
