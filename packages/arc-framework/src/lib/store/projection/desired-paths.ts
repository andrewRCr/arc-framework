/** Choose canonical checkout paths from stored records and the target's active coordinates. */
import { deserializeTransientIdentityRecord } from "../../errand/identity-record.js";
import { cohortDocumentPath } from "../lifecycle-record-path.js";
import { addCurrentCohortCopies } from "./desired-cohorts.js";
import { SlugSchema, type Slug } from "../../kernel/index.js";
import { ParsedMetaRecordSchema } from "../../active/meta-schema.js";
import { identifyArcFileAddress, resolveArcPath, type ActiveLayoutContext, type WorkUnitPlacement, type WorkUnitArtifactKind } from "../../layout/index.js";
import type { KindId } from "../catalog.js";
import { recordReferences, OwnerIdentitySchema, sameOwner, type RecordReference, type OwnerIdentity } from "../identity.js";
import type { StoreRecord } from "../read.js";
import { WorkUnitReadPlacementSchema, ErrandReadPlacementSchema } from "../placement.js";
import type { ProjectionRootState } from "./process-state.js";
import type { ProjectionInventory } from "./inventory.js";
import { selectProjectionView, type ProjectionViewSelection } from "./view-selection.js";

const artifacts: Partial<Record<KindId, WorkUnitArtifactKind>> = {
  "work-item/meta": "meta", "work-item/task-list": "tasks", "work-item/draft": "draft", "work-item/spec": "spec", "work-item/notes": "notes",
};
/** Positive files selected from a materialization's inventory. */
export interface DesiredProjection {
  readonly files: ReadonlyMap<string, StoreRecord>;
  readonly own: OwnerIdentity | null;
  readonly unresolved: boolean;
  readonly placementKnown: (path: string, reference: RecordReference, active?: ActiveLayoutContext) => boolean;
}

/** The checkout's claim: its slug, with the marker's UID wherever the marker records one. */
export interface ProjectionClaim { readonly claim: string | null; readonly claimUid?: string }

/** Whether an owner is the claimed work unit, never another live unit that shares its slug. */
export function isClaimedProjectionOwner(claim: ProjectionClaim, owner: OwnerIdentity): boolean {
  if (owner.type !== "work-item" || claim.claim === null || owner.name !== claim.claim) return false;
  return claim.claimUid === undefined || owner.uid === undefined || owner.uid === claim.claimUid;
}

/** Project visible records through the same semantic layout addresses commands use. */
export async function desiredProjectionPaths(root: ProjectionRootState, inventory: ProjectionInventory,
  ownUnavailable?: boolean): Promise<DesiredProjection> {
  const primaries = inventory.records.filter(record => record.reference.kind === "work-item/meta" || isErrand(record));
  const matches = primaries.filter(record => isClaimedProjectionOwner(root, record.reference.owner) && record.placement?.kind === "active");
  const own = matches.length === 1 ? matches[0]?.reference.owner ?? null : null;
  const selection = await selectProjectionView({ store: inventory.source, identity: root.identity, view: root.view, own });
  if (selection.kind === "unavailable") for (const mark of selection.diagnostics) root.context.report?.({ path: root.checkout, copy: null, mark });
  const files = new Map<string, StoreRecord>();
  for (const record of inventory.records) {
    const path = projectionRecordPath(root, record, primaries, own, selection);
    if (path !== null) files.set(path, record);
  }
  const unavailableCohorts = await addCurrentCohortCopies(root, inventory, own, files);
  // Two live claimed primaries leave the own unit unknown whatever the caller learned of its own read.
  const unknownOwn = matches.length > 1 || (ownUnavailable ?? (root.claim !== null && own === null && !inventory.complete(
    recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name: root.claim })))));
  const unknownView = selection.kind === "unavailable" || unknownOwn && root.view.mode === "cohort";
  const placementKnown = (path: string, reference: RecordReference,
    active: ActiveLayoutContext = { claim: root.claim, layoutActive: root.layoutActive }): boolean => {
    const address = identifyArcFileAddress(path, { active });
    if (address?.kind === "cohort-copy") return !unknownOwn && !unavailableCohorts.has(address.cohort);
    return !unknownView || !path.startsWith(`${resolveArcPath({ kind: "placement-root", tier: "active" })}/`) || reference.owner.type !== "work-item"
      || own !== null && sameOwner(reference.owner, own)
      || !unknownOwn && selection.references.some(selected => sameOwner(selected.owner, reference.owner));
  };
  for (const [path, record] of files) if (!placementKnown(path, record.reference)) files.delete(path);
  return { files, own, placementKnown, unresolved: unknownOwn || unknownView || unavailableCohorts.size > 0 };
}

/** Bind logical lifecycle placement to this checkout's own and in-flight folders. */
export function projectionWorkUnitPlacement(root: Pick<ProjectionRootState, "claim" | "layoutActive">, primary: StoreRecord,
  own: OwnerIdentity | null): WorkUnitPlacement {
  const placement = WorkUnitReadPlacementSchema.parse(primary.placement);
  if (placement.kind === "completed") return placement;
  if (placement.kind === "backlog") {
    const fields = ParsedMetaRecordSchema.parse(primary.fields);
    return { ...placement, cohort: (fields.cohort ?? "").split("/").filter(Boolean).map(part => SlugSchema.parse(part)) };
  }
  const owned = own !== null && sameOwner(primary.reference.owner, own) && root.claim === primary.reference.owner.name;
  return { kind: "active", scope: { kind: "project", location: owned
    ? { kind: "own", claim: primary.reference.owner.name, layoutActive: root.layoutActive } : { kind: "another" } } };
}


function visibleActiveOwner(primary: StoreRecord, own: OwnerIdentity | null, selection: ProjectionViewSelection): boolean {
  return primary.placement?.kind !== "active" || own !== null && sameOwner(own, primary.reference.owner)
    || selection.references.some(reference => sameOwner(reference.owner, primary.reference.owner));
}

const personalPaths: Partial<Record<KindId, (identity: Slug, key: RecordReference["key"]) => string | null>> = {
  "personal/inbox": identity => resolveArcPath({ kind: "inbox", scope: { kind: "identity", identity } }),
  "personal/working-memory": identity => resolveArcPath({ kind: "user-document", identity, document: { kind: "working-memory" } }),
  "personal/session-context": (identity, key) => typeof key === "string" ? resolveArcPath({ kind: "user-document", identity,
    document: { kind: "session-notes", workUnit: SlugSchema.parse(key) } }) : null,
  "personal/document": (identity, key) => typeof key === "string" && key.startsWith("scratch/")
    ? resolveArcPath({ kind: "scratch-document", identity, key }) : null,
};

function personalProjectionPath(root: ProjectionRootState, record: StoreRecord): string | null {
  const { reference } = record;
  return reference.owner.type === "person" && reference.owner.name === root.identity
    ? personalPaths[reference.kind]?.(root.identity, reference.key) ?? null : null;
}


function workItemPath(record: StoreRecord, slug: Slug, placement: WorkUnitPlacement): string | null {
  const artifact = artifacts[record.reference.kind];
  if (artifact !== undefined) return resolveArcPath({ kind: "work-unit-artifact", slug, artifact, placement });
  if (record.reference.kind === "work-item/inbound") return resolveArcPath({ kind: "work-unit-inbound", slug, placement });
  if (record.reference.kind !== "work-item/companion" || typeof record.reference.key !== "string") return null;
  const key = record.reference.key;
  return key === "spec-prd" || key === "spec-rfc"
    ? resolveArcPath({ kind: "work-unit-spec-part", slug, placement, part: key === "spec-prd" ? "prd" : "rfc" })
    : resolveArcPath({ kind: "work-unit-companion", slug, placement, key });
}


function isErrand(record: StoreRecord): boolean {
  if (record.reference.kind !== "work-item/record") return false;
  const decoded = deserializeTransientIdentityRecord(record.content, record.reference.owner.name);
  return decoded.kind === "valid" && decoded.record.kind === "errand" && decoded.record.purpose === "errand";
}

function errandPath(root: ProjectionRootState, record: StoreRecord, primary: StoreRecord, own: OwnerIdentity | null): string | null {
  const logical = ErrandReadPlacementSchema.parse(primary.placement);
  const owned = own !== null && sameOwner(primary.reference.owner, own);
  const placement = logical.kind === "completed" ? logical : { kind: "active" as const, scope: { kind: "project" as const,
    location: owned ? { kind: "own" as const, claim: primary.reference.owner.name, layoutActive: root.layoutActive } : { kind: "another" as const } } };
  if (record.reference.kind === "work-item/description") return resolveArcPath({ kind: "errand-description", slug: primary.reference.owner.name, placement });
  return placement.kind === "active" && record.reference.kind === "work-item/inbound"
    ? resolveArcPath({ kind: "work-unit-inbound", slug: primary.reference.owner.name, placement }) : null;
}


/** Resolve one positive record with an already selected set of active owners. */
export function projectionRecordPath(root: ProjectionRootState, record: StoreRecord, primaries: readonly StoreRecord[],
  own: OwnerIdentity | null, selection: ProjectionViewSelection): string | null {
  const personal = personalProjectionPath(root, record);
  if (personal !== null) return personal;
  if (record.reference.kind === "cohort/document") return cohortDocumentPath(record);
  if (record.reference.kind === "project-inbox/inbox") {
    return resolveArcPath({ kind: "inbox", scope: { kind: "project" } });
  }
  const primary = primaries.find(primary => sameOwner(primary.reference.owner, record.reference.owner));
  if (primary === undefined) return null;
  if (!visibleActiveOwner(primary, own, selection)) return null;
  return primary.reference.kind === "work-item/record" ? errandPath(root, record, primary, own)
    : workItemPath(record, primary.reference.owner.name, projectionWorkUnitPlacement(root, primary, own));
}
