/** Reduce source deltas to paths without visiting unrelated settled archive partitions. */
import { refreshSubjectReferences } from "./refresh-conflicts.js";
import { loadFormerProjectionOwner, planOwnerRefresh } from "./refresh-owners.js";
import type { HistoryEntry } from "../contract.js";
import { recordReferences, sameOwner, sameReference, type RecordReference, type StateVersion } from "../identity.js";
import type { StoreRecord } from "../read.js";
import { isClaimedProjectionOwner, projectionRecordPath } from "./desired-paths.js";
import { familyOf } from "../catalog.js";
import { projectionListingComplete, projectionListingDiagnostics } from "./inventory.js";
import { planProjectionRebuild } from "./refresh-rebuild.js";
import type { ProjectionIndex } from "./index-schema.js";
import type { ProjectionRootState } from "./process-state.js";
import type { ProjectionSource } from "./record-source.js";
import { markStoreRefusal } from "./refusal-mark.js";
import type { StoreResult } from "../refusal.js";

/** Paths selected by deltas and by unsettled entries, with their logical source references. */
export interface ProjectionRefreshPlan {
  readonly paths: Map<string, RecordReference>;
  readonly unresolved: boolean;
  readonly removals: Set<string>;
  /** A rebuild plan, which settles files an earlier rebuild held by the rebuild rule. */
  readonly rebuild?: true;
}
/** Source window and destination evidence already held by the caller. */
export interface ProjectionRefreshPlanInput {
  readonly root: ProjectionRootState;
  readonly source: ProjectionSource;
  readonly index: ProjectionIndex;
  readonly version: StateVersion;
  readonly changes: readonly HistoryEntry[];
}

/** Keep pending entries and project newly added records without re-laying their unchanged neighbors. */
export async function planProjectionRefresh(input: ProjectionRefreshPlanInput): Promise<ProjectionRefreshPlan> {
  const { index } = input;
  if (index.state === null) return planProjectionRebuild(input);
  const paths = new Map<string, RecordReference>();
  for (const [path, entry] of Object.entries(index.entries)) {
    if (entry.kind === "record" && (entry.pending
      || input.changes.some(change => sameReference(change.reference, entry.reference)))) paths.set(path, entry.reference);
  }
  const plan: ProjectionRefreshPlan = { paths, removals: new Set(), unresolved: false };
  const retries = [...paths.values()];
  const reduced = input.changes.filter((change, at, all) => !all.slice(at + 1).some(other => sameReference(change.reference, other.reference)));
  const subjects = await refreshSubjectReferences(input, reduced);
  const primaries = [...reduced.map(change => change.reference), ...retries, ...subjects.references]
    .filter(reference => ["work-item/meta", "work-item/record", "cohort/document"].includes(reference.kind));
  // A held entry proves nothing about its owner's place in the view, so a work item's held record is planned from the view.
  const held = Object.values(index.entries).flatMap(entry => entry.kind === "record" && entry.pending
    && entry.reference.owner.type === "work-item" ? [entry.reference] : []);
  const owners = [...primaries, ...held].map(reference => reference.owner)
    .filter((owner, at, all) => all.findIndex(other => sameOwner(owner, other)) === at);
  let unresolved = subjects.unresolved;
  const uncertain: RecordReference[] = [];
  const references = [...subjects.references, ...retries]
    .filter((reference, at, all) => all.findIndex(other => sameReference(reference, other)) === at);
  for (const reference of references.filter(reference => !owners.some(owner => sameOwner(owner, reference.owner)))) {
    const added = await planChangedRecord(input, plan, reference);
    if (added) uncertain.push(reference);
    unresolved ||= added;
  }
  if (owners.length > 0) {
    const ownersUnresolved = await planOwnerRefresh(input, owners, plan);
    unresolved ||= ownersUnresolved;
  }
  for (const reference of uncertain) retainReferencePaths(index, plan, reference);
  return { ...plan, unresolved };
}

async function currentPrimary(source: ProjectionSource, record: StoreRecord): Promise<StoreResult<StoreRecord | null>> {
  if (record.reference.owner.type !== "work-item") return { status: "ok", result: null };
  if (record.reference.kind === "work-item/meta" || record.reference.kind === "work-item/record") return { status: "ok", result: record };
  for (const reference of [recordReferences["work-item/meta"](record.reference.owner), recordReferences["work-item/record"](record.reference.owner)]) {
    const read = await source.read({ reference });
    if (read.status === "ok") return read;
    if (read.refusal.code !== "not-found") return read;
  }
  return { status: "ok", result: null };
}

function report(input: ProjectionRefreshPlanInput, refusal: Parameters<typeof markStoreRefusal>[0]): void {
  input.root.context.report?.({ path: input.root.checkout, copy: null, mark: markStoreRefusal(refusal) });
}

async function planChangedRecord(input: ProjectionRefreshPlanInput, plan: ProjectionRefreshPlan, reference: RecordReference): Promise<boolean> {
  const read = await input.source.read({ reference });
  if (read.status === "refused") {
    if (read.refusal.code === "not-found") return planMissingRecord(input, plan, reference);
    // The file walk already reported and retained an unsent edit's refusal.
    const held = [...plan.paths].some(([path, candidate]) => sameReference(candidate, reference) && input.root.unsent.has(path));
    if (!held) report(input, read.refusal);
    return true;
  }
  const located = await currentPrimary(input.source, read.result);
  if (located.status === "refused") {
    report(input, located.refusal);
    retainReferencePaths(input.index, plan, reference);
    return true;
  }
  const primary = located.result;
  const own = primary?.placement?.kind === "active" && isClaimedProjectionOwner(input.root, primary.reference.owner) ? primary.reference.owner : null;
  const visible = primary !== null && Object.values(input.index.entries).some(entry => entry.kind === "record"
    && sameOwner(entry.reference.owner, primary.reference.owner));
  const path = projectionRecordPath(input.root, read.result, primary === null ? [] : [primary], own,
    { kind: "selected", references: visible ? [primary.reference] : [], missingPins: [] });
  if (path !== null) plan.paths.set(path, read.result.reference);
  removeRelocatedEntries(input, plan, reference, path);
  return false;
}

function removeRelocatedEntries(input: ProjectionRefreshPlanInput, plan: ProjectionRefreshPlan,
  reference: RecordReference, path: string | null): void {
  for (const [old, entry] of Object.entries(input.index.entries)) {
    if (entry.kind !== "record" || old === path || !sameReference(entry.reference, reference)) continue;
    const candidate = plan.paths.get(old);
    if (candidate !== undefined && sameReference(candidate, reference)) plan.paths.delete(old);
    plan.removals.add(old);
  }
}

async function planMissingRecord(input: ProjectionRefreshPlanInput, plan: ProjectionRefreshPlan, reference: RecordReference): Promise<boolean> {
  const listing = await input.source.list({ family: familyOf(reference.kind), owner: reference.owner });
  for (const mark of projectionListingDiagnostics(listing)) input.root.context.report?.({ path: input.root.checkout, copy: null, mark });
  if (!projectionListingComplete(listing)) return true;
  if (listing.status === "ok" && listing.result.status === "complete"
    && listing.result.records.some(record => sameReference(record.reference, reference))) return true;
  if (reference.owner.type === "work-item" || reference.owner.type === "cohort") {
    if (!await loadFormerProjectionOwner(input, reference.owner)) return true;
  }
  for (const [path, entry] of Object.entries(input.index.entries)) {
    if (entry.kind === "record" && sameReference(entry.reference, reference)) { plan.paths.delete(path); plan.removals.add(path); }
  }
  return false;
}

function retainReferencePaths(index: ProjectionIndex, plan: ProjectionRefreshPlan, reference: RecordReference): void {
  for (const [path, entry] of Object.entries(index.entries)) {
    if (entry.kind !== "record" || !sameReference(entry.reference, reference)) continue;
    plan.paths.delete(path);
    plan.removals.delete(path);
  }
}
