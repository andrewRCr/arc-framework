/** Shared expansion of record homes into Git refs and tree paths. */

import type { OwnerIdentity, RecordReference } from "./identity.js";
import type { ReadPlacement } from "./placement.js";
import { FAMILY_REGISTRY, KIND_REGISTRY, type FamilyDefinition, type KindDefinition } from "./registry.js";
import type { KindId } from "./catalog.js";
import { isSlugSafe } from "../kernel/schema/slug.js";
import { companionArtifactName } from "./companion-name.js";

/** Resolved lifecycle facts; history retains the live tree layout. */
export interface StoredPathOptions {
  placement?: ReadPlacement;
  history?: boolean;
  registry?: Readonly<Record<KindId, KindDefinition>>;
}
/** One record's address and the containing group's auxiliary paths. */
export interface StoredRecordHome {
  ref: string;
  path: string;
  root: string;
  metadataPath: string;
  manifestPath: string;
}

function expandTemplate(template: string, reference: RecordReference): string {
  const { owner, key } = reference;
  return template.replace(/<(slug|uid|person|id|key)>/gu, (_, token: string) => {
    if (token === "uid") {
      if (owner.type === "person" || !owner.uid) throw new Error(`Resolve the UID before expanding ${reference.kind}`);
      return owner.uid;
    }
    if (token === "key") return typeof key === "object" ? `${key.activity}-${key.number}` : key ?? "";
    return owner.name;
  });
}

function containingFamily(family: FamilyDefinition): FamilyDefinition {
  return family.ref && "subtreeOf" in family.ref ? FAMILY_REGISTRY[family.ref.subtreeOf] : family;
}

function familyRoot(family: FamilyDefinition, owner: OwnerIdentity): string {
  if (family.ref && "subtreeOf" in family.ref) return `${family.ref.path}/`;
  return family.id === "personal" ? `${owner.name}/` : "";
}

function metadataStem(family: FamilyDefinition, reference: RecordReference): string {
  if (family.id === "work-item" || family.id === "cohort") return expandTemplate("<uid>", reference);
  if (family.id === "personal") return reference.owner.name;
  if (family.id === "claims") return `claims-${reference.owner.name}`;
  return family.id === "project-inbox" ? "inbox" : "registry";
}

function archiveFolder(family: FamilyDefinition, reference: RecordReference, placement: ReadPlacement): string {
  if (placement.kind !== "completed") return "";
  const name = reference.owner.name;
  if (family.id === "cohort") {
    if (!("sequence" in placement) || !("closeout" in placement)) {
      throw new Error("Resolve the cohort closeout before expanding its archive path");
    }
    return `${placement.sequence}${placement.closeout}_cohort-${name}/`;
  }
  return "sequence" in placement ? `${placement.sequence}_${name}/` : `${name}-${expandTemplate("<uid>", reference).slice(0, 8)}/`;
}

/** Expand a resolved record reference using the registered storage home. */
export function expandStoredPath(reference: RecordReference, options: StoredPathOptions = {}): StoredRecordHome {
  const kind = (options.registry ?? KIND_REGISTRY)[reference.kind];
  if (!kind.ref) throw new Error(`No ref home for ${reference.kind}`);
  const family = FAMILY_REGISTRY[kind.family];
  const parent = containingFamily(family);
  if (!parent.ref || !("pattern" in parent.ref)) throw new Error(`No ref home for ${reference.kind}`);
  let ref = expandTemplate(parent.ref.pattern, reference);
  let folder = "";
  if (parent.retention === "archive-and-history") {
    if (options.history) ref = ref.replace("refs/arc/", "refs/arc/history/");
    else if (options.placement?.kind === "completed") {
      ref = `refs/arc/archive/${options.placement.quarter}`;
      folder = archiveFolder(parent, reference, options.placement);
    }
  }
  const { owner, key } = reference;
  const path = reference.kind === "work-item/companion" && typeof key === "string"
    ? isSlugSafe(key) ? companionArtifactName(owner.name, key) : key
    : expandTemplate(kind.ref.path, reference);
  const prefix = parent.id === "personal" ? `${owner.name}/` : "";
  const stem = metadataStem(parent, reference);
  return { ref, path: folder + path, root: folder + familyRoot(family, owner),
    metadataPath: `${folder}${prefix}metadata-${stem}.json`, manifestPath: `${folder}${prefix}state-${stem}/` };
}
