/** Bind a classified adoption target to the exact work item held by its checkout. */
import { ArcLayoutAddressSchema, identifyArcFileAddress } from "../../layout/index.js";
import { OwnerIdentitySchema, RecordReferenceSchema, type OwnerIdentity, type RecordReference } from "../identity.js";
import { classifyStoreAddress } from "../target-classification.js";
import type { ClassifiedStoreTarget } from "../target-classification.js";
import type { ProjectionRootState } from "./process-state.js";
import type { ProjectionIndex, RefusedMark } from "./index-schema.js";
import { resolveEstablishedContainer } from "./container-ownership.js";
import { readAdoptionClaim } from "./adoption-claim.js";
import { resolveCohortAdoption } from "./cohort-adoption.js";
import { resolveProjectInboxAdoption } from "./project-adoption.js";

/** A classified file still needs generation authority before it can be created. */
export type AdoptionReference = { kind: "reference"; reference: RecordReference } | { kind: "refused"; mark: RefusedMark };

/** Resolve this checkout's own folder through its marker claim, preserving refusal diagnostics. */
export async function resolveLocatedAdoption(root: ProjectionRootState, index: ProjectionIndex, path: string): Promise<AdoptionReference> {
  const address = identifyArcFileAddress(path, { active: { claim: root.claim, layoutActive: root.layoutActive } });
  if (address?.kind === "cohort-copy" || address?.kind === "cohort-document") return resolveCohortAdoption(root, path, address);
  const target = address === null ? null : classifyStoreAddress(address);
  if (target?.kind === "project-inbox/inbox") return resolveProjectInboxAdoption(root);
  if (target?.identity !== undefined) return bindReference(target, OwnerIdentitySchema.parse({ type: "person", name: target.identity }));
  if (target?.workItem === undefined) return misplaced(path);
  if (address === null || !("placement" in address)) return misplaced(path);
  const own = address.placement.kind === "active" && address.placement.scope.kind === "project"
    && address.placement.scope.location?.kind === "own";
  if (!own) {
    const container = ArcLayoutAddressSchema.parse({ kind: "work-unit-container", slug: target.workItem, placement: address.placement });
    if (container.kind !== "work-unit-container") return misplaced(path);
    const established = await resolveEstablishedContainer({ checkout: root.checkout, store: root.store,
      identity: root.identity, path, index }, container);
    if (established.kind === "refused") return established;
    return established.kind === "absent" ? misplaced(path) : bindReference(target, established.record.reference.owner);
  }
  return resolveCurrentReference(root, target);
}

async function resolveCurrentReference(root: ProjectionRootState, target: { kind: RecordReference["kind"]; key?: string }): Promise<AdoptionReference> {
  const current = await readAdoptionClaim(root);
  return current.kind === "refused" ? current : bindReference(target, current.record.reference.owner);
}

function bindReference(target: Pick<ClassifiedStoreTarget, "kind" | "key">, owner: OwnerIdentity): AdoptionReference {
  return { kind: "reference", reference: RecordReferenceSchema.parse({ kind: target.kind, owner,
    ...(target.key === undefined ? {} : { key: target.key }) }) };
}

function misplaced(path: string): Extract<AdoptionReference, { kind: "refused" }> {
  return { kind: "refused", mark: { reason: `No record owns ${path}.`,
    remedy: { text: "Move the file into active/current/, a work item's folder, or your identity's scratch/ folder, then retry." } } };
}
