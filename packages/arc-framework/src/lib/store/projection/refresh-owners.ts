/** Re-lay changed owner primaries, loading historical coordinates only for those owners. */
import { OwnerIdentitySchema, recordReferences, sameOwner, sameReference, type OwnerIdentity } from "../identity.js";
import { identifyArcFileAddress } from "../../layout/index.js";
import type { StoreRecord } from "../read.js";
import { desiredProjectionPaths, isClaimedProjectionOwner, projectionRecordPath, type DesiredProjection } from "./desired-paths.js";
import { projectionListingComplete, projectionListingDiagnostics, type ProjectionInventory } from "./inventory.js";
import { loadProjectionPathGroup } from "./index-memory.js";
import { retainUncertainProjectionPaths } from "./placement-evidence.js";
import { markStoreRefusal } from "./refusal-mark.js";
import type { ProjectionRefreshPlanInput, ProjectionRefreshPlan } from "./refresh-plan.js";

/** Primary changes expand to every current owner record and every former indexed path. */
export async function planOwnerRefresh(input: ProjectionRefreshPlanInput, owners: readonly OwnerIdentity[],
  plan: ProjectionRefreshPlan): Promise<boolean> {
  const { records, complete, unresolved } = await readOwners(input, owners);
  const located = await readOwnPrimary(input, records);
  const own = located.primary;
  if (own !== null && !records.some(record => sameReference(record.reference, own.reference))) records.push(own);
  const inventory: ProjectionInventory = { records, source: input.source, diagnostics: [],
    complete: reference => complete.some(owner => sameOwner(reference.owner, owner)) };
  const desired = await desiredProjectionPaths(input.root, inventory, located.unavailable);
  const membership = ownMembershipChanged(input, complete, own);
  applyOwnerPaths({ input, owners, complete, plan, desired, membership });
  retainUncertainProjectionPaths(input.index, desired, plan);
  return unresolved || desired.unresolved;
}

function applyOwnerPaths(scope: { input: ProjectionRefreshPlanInput; owners: readonly OwnerIdentity[]; complete: readonly OwnerIdentity[];
  plan: ProjectionRefreshPlan; desired: DesiredProjection; membership: boolean }): void {
  const { input, owners, plan, desired, membership } = scope;
  for (const [path, record] of desired.files) {
    if (owners.some(owner => sameOwner(record.reference.owner, owner)) || membership && isOwnCohortCopy(input, path)) plan.paths.set(path, record.reference);
  }
  removeOwnerPaths(scope);
}

function removeOwnerPaths(scope: Parameters<typeof applyOwnerPaths>[0]): void {
  const { input, complete, plan, desired, membership } = scope;
  for (const [path, entry] of Object.entries(input.index.entries)) {
    if (entry.kind !== "record") continue;
    const arriving = desired.files.get(path);
    if (arriving !== undefined && sameReference(arriving.reference, entry.reference)) continue;
    const affected = complete.some(owner => sameOwner(entry.reference.owner, owner)) || membership && isOwnCohortCopy(input, path);
    if (affected) { if (arriving === undefined) plan.paths.delete(path); plan.removals.add(path); }
  }
}

function ownMembershipChanged(input: ProjectionRefreshPlanInput, owners: readonly OwnerIdentity[], own: StoreRecord | null): boolean {
  const prior = Object.values(input.index.entries).find(entry => entry.kind === "record"
    && entry.reference.kind === "work-item/meta" && isClaimedProjectionOwner(input.index.projectedUnder, entry.reference.owner));
  const reference = own?.reference ?? (prior?.kind === "record" ? prior.reference : null);
  return reference !== null && owners.some(owner => sameOwner(owner, reference.owner));
}

function isOwnCohortCopy(input: ProjectionRefreshPlanInput, path: string): boolean {
  return identifyArcFileAddress(path, { active: { claim: input.root.claim, layoutActive: input.root.layoutActive } })?.kind === "cohort-copy";
}

async function readOwners(input: ProjectionRefreshPlanInput, owners: readonly OwnerIdentity[]): Promise<{
  records: StoreRecord[]; complete: OwnerIdentity[]; unresolved: boolean;
}> {
  const records: StoreRecord[] = [], complete: OwnerIdentity[] = [];
  let unresolved = false;
  for (const owner of owners) {
    const listing = await input.source.list({ family: owner.type === "cohort" ? "cohort" : "work-item", owner });
    const diagnostics = projectionListingDiagnostics(listing);
    for (const mark of diagnostics) input.root.context.report?.({ path: input.root.checkout, copy: null, mark });
    if (listing.status === "ok" && listing.result.status === "complete") records.push(...listing.result.records);
    if (projectionListingComplete(listing)) complete.push(owner);
    const located = await loadFormerProjectionOwner(input, owner);
    unresolved ||= diagnostics.length > 0 || !located;
  }
  return { records, complete, unresolved };
}

async function readOwnPrimary(input: ProjectionRefreshPlanInput, records: readonly StoreRecord[]): Promise<{ primary: StoreRecord | null; unavailable: boolean }> {
  if (input.root.claim === null) return { primary: null, unavailable: false };
  const listed = records.find(record => (record.reference.kind === "work-item/meta" || record.reference.kind === "work-item/record")
    && isClaimedProjectionOwner(input.root, record.reference.owner) && record.placement?.kind === "active");
  if (listed !== undefined) return { primary: listed, unavailable: false };
  const reference = recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name: input.root.claim }));
  const read = await input.source.read({ reference });
  if (read.status === "ok") return { primary: read.result.placement?.kind === "active"
    && isClaimedProjectionOwner(input.root, read.result.reference.owner) ? read.result : null, unavailable: false };
  const unavailable = read.refusal.code !== "not-found";
  if (unavailable) input.root.context.report?.({ path: input.root.checkout, copy: null, mark: markStoreRefusal(read.refusal) });
  return { primary: null, unavailable };
}

/** Load only the partition identified by the owner’s primary at the saved anchor. */
export async function loadFormerProjectionOwner(input: ProjectionRefreshPlanInput, owner: OwnerIdentity): Promise<boolean> {
  if (input.index.state === null) return true;
  const reference = owner.type === "cohort" ? recordReferences["cohort/document"](owner)
    : recordReferences["work-item/meta"](owner);
  const read = await input.source.read({ reference, asOf: input.index.state });
  if (read.status === "refused") {
    if (read.refusal.code === "not-found") return true;
    input.root.context.report?.({ path: input.root.checkout, copy: null, mark: markStoreRefusal(read.refusal) });
    return false;
  }
  const old = read.result;
  const own = old.placement?.kind === "active" && isClaimedProjectionOwner(input.index.projectedUnder, old.reference.owner) ? old.reference.owner : null;
  const path = projectionRecordPath(input.root, old, [old], own, { kind: "selected", references: [old.reference], missingPins: [] });
  if (path !== null) loadProjectionPathGroup(input.index.entries, path);
  return true;
}
