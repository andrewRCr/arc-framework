/** Re-lay changed owner primaries, loading historical coordinates only for those owners. */
import { OwnerIdentitySchema, recordReferences, sameOwner, sameReference, type OwnerIdentity } from "../identity.js";
import { identifyArcFileAddress } from "../../layout/index.js";
import type { StoreRecord } from "../read.js";
import { desiredProjectionPaths, projectionRecordPath, type DesiredProjection } from "./desired-paths.js";
import { projectionListingComplete, projectionListingDiagnostics, type ProjectionInventory } from "./inventory.js";
import { loadProjectionPathGroup } from "./index-memory.js";
import type { ProjectionSource } from "./record-source.js";
import { markStoreRefusal } from "./refusal-mark.js";
import type { ProjectionRefreshPlanInput, ProjectionRefreshPlan } from "./refresh-plan.js";

/** Primary changes expand to every current owner record and every former indexed path. */
export async function planOwnerRefresh(input: ProjectionRefreshPlanInput, owners: readonly OwnerIdentity[],
  plan: ProjectionRefreshPlan): Promise<boolean> {
  const { records, complete, unresolved } = await readOwners(input, owners);
  const own = await readOwnPrimary(input, records);
  if (own !== null && !records.some(record => sameReference(record.reference, own.reference))) records.push(own);
  const ambiguous = new Set<string>();
  const inventory: ProjectionInventory = { records, source: watchAmbiguousNames(input.source, ambiguous), diagnostics: [],
    complete: reference => complete.some(owner => sameOwner(reference.owner, owner)) };
  const desired = await desiredProjectionPaths(input.root, inventory);
  const membership = ownMembershipChanged(input, complete, own);
  applyOwnerPaths({ input, owners, complete, plan, desired, membership, ambiguous });
  return unresolved;
}

function applyOwnerPaths(scope: { input: ProjectionRefreshPlanInput; owners: readonly OwnerIdentity[]; complete: readonly OwnerIdentity[];
  plan: ProjectionRefreshPlan; desired: DesiredProjection; membership: boolean; ambiguous: ReadonlySet<string> }): void {
  const { input, owners, plan, desired, membership } = scope;
  for (const [path, record] of desired.files) {
    if (owners.some(owner => sameOwner(record.reference.owner, owner)) || membership && isOwnCohortCopy(input, path)) plan.paths.set(path, record.reference);
  }
  removeOwnerPaths(scope);
}

function removeOwnerPaths(scope: Parameters<typeof applyOwnerPaths>[0]): void {
  const { input, complete, plan, desired, membership, ambiguous } = scope;
  for (const [path, entry] of Object.entries(input.index.entries)) {
    if (entry.kind !== "record") continue;
    const arriving = desired.files.get(path);
    if (arriving !== undefined && sameReference(arriving.reference, entry.reference)) continue;
    const address = identifyArcFileAddress(path, { active: { claim: input.root.claim, layoutActive: input.root.layoutActive } });
    if (address?.kind === "cohort-copy" && ambiguous.has(address.cohort)) { plan.paths.delete(path); continue; }
    const affected = complete.some(owner => sameOwner(entry.reference.owner, owner)) || membership && isOwnCohortCopy(input, path);
    if (affected) { if (arriving === undefined) plan.paths.delete(path); plan.removals.add(path); }
  }
}

function watchAmbiguousNames(source: ProjectionSource, ambiguous: Set<string>): ProjectionSource {
  return { ...source, read: async request => {
    const read = await source.read(request);
    if (read.status === "refused" && read.refusal.code === "ambiguous-match" && request.reference.kind === "cohort/document") {
      ambiguous.add(request.reference.owner.name);
    }
    return read;
  } };
}

function ownMembershipChanged(input: ProjectionRefreshPlanInput, owners: readonly OwnerIdentity[], own: StoreRecord | null): boolean {
  const prior = Object.values(input.index.entries).find(entry => entry.kind === "record"
    && entry.reference.kind === "work-item/meta" && entry.reference.owner.name === input.index.projectedUnder.claim);
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

async function readOwnPrimary(input: ProjectionRefreshPlanInput, records: readonly StoreRecord[]): Promise<StoreRecord | null> {
  if (input.root.claim === null) return null;
  const listed = records.find(record => (record.reference.kind === "work-item/meta" || record.reference.kind === "work-item/record")
    && record.reference.owner.name === input.root.claim && record.placement?.kind === "active");
  if (listed !== undefined) return listed;
  const reference = recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name: input.root.claim }));
  const read = await input.source.read({ reference });
  return read.status === "ok" && read.result.placement?.kind === "active" ? read.result : null;
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
  const own = old.placement?.kind === "active" && old.reference.owner.name === input.index.projectedUnder.claim ? old.reference.owner : null;
  const path = projectionRecordPath(input.root, old, [old], own, { kind: "selected", references: [old.reference], missingPins: [] });
  if (path !== null) loadProjectionPathGroup(input.index.entries, path);
  return true;
}
