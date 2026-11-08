/** Select active record generations for an explicit in-flight projection view consumer. */
import type { Slug } from "../../kernel/index.js";
import type { Store } from "../contract.js";
import { sameOwner, type OwnerIdentity, type RecordReference, type StateVersion } from "../identity.js";
import type { ProjectionIndex, RefusedMark } from "./index-schema.js";
import { listLifecycleIndex } from "../lifecycle-index.js";
import { markStoreRefusal } from "./refusal-mark.js";
import { deserializeTransientIdentityRecord } from "../../errand/identity-record.js";
import type { ListingDiagnostic } from "../read.js";

/** Desired view inputs, kept separately from the index's last-projected settings. */
export interface ProjectionViewSelectionInput {
  readonly store: Store;
  readonly identity: Slug;
  readonly view: ProjectionIndex["projectedUnder"]["view"];
  readonly own: OwnerIdentity | null;
}

/** A complete selection, or evidence that prevents treating omitted records as absent. */
export type ProjectionViewSelection =
  | { readonly kind: "selected"; readonly references: readonly RecordReference[]; readonly missingPins: readonly Slug[] }
  | { readonly kind: "unavailable"; readonly diagnostics: readonly RefusedMark[] };

interface ViewCandidate {
  readonly reference: RecordReference;
  readonly owner: string | null;
  readonly cohort: string | null;
}
type ViewInventory = { readonly kind: "complete"; readonly items: readonly ViewCandidate[] }
  | Extract<ProjectionViewSelection, { kind: "unavailable" }>;

/** Read the active inventory only when a status, refresh, or materialization consumer requests it. */
export async function selectProjectionView(input: ProjectionViewSelectionInput): Promise<ProjectionViewSelection> {
  const inventory = await readViewInventory(input.store);
  if (inventory.kind === "unavailable") return inventory;
  const own = input.own;
  const cohort = own === null ? null : inventory.items.find(item => sameOwner(item.reference.owner, own))?.cohort ?? null;
  const pins = new Set(input.view.pins);
  const references = inventory.items.filter(item => matchesView(item, input, cohort, pins))
    .filter(item => own === null || !sameOwner(item.reference.owner, own)).map(item => item.reference)
    .sort((left, right) => left.owner.name.localeCompare(right.owner.name));
  const names = new Set(inventory.items.map(item => item.reference.owner.name));
  return { kind: "selected", references, missingPins: input.view.pins.filter(pin => !names.has(pin)) };
}

function matchesView(item: ViewCandidate, input: ProjectionViewSelectionInput, cohort: string | null, pins: ReadonlySet<string>): boolean {
  if (input.view.mode === "all" || pins.has(item.reference.owner.name)) return true;
  return input.view.mode === "cohort" ? cohort !== null && item.cohort === cohort : item.owner === input.identity;
}

async function readViewInventory(store: Store): Promise<ViewInventory> {
  const anchor = await store.version();
  if (anchor.status === "refused") return { kind: "unavailable", diagnostics: [markStoreRefusal(anchor.refusal)] };
  const reads = await Promise.allSettled([readActiveWorkUnits(store, anchor.result), readActiveErrands(store, anchor.result)]);
  const items: ViewCandidate[] = [], diagnostics: RefusedMark[] = [];
  for (const read of reads) {
    if (read.status === "rejected") throw read.reason;
    if (read.value.kind === "unavailable") diagnostics.push(...read.value.diagnostics);
    else items.push(...read.value.items);
  }
  return diagnostics.length > 0 ? { kind: "unavailable", diagnostics } : { kind: "complete", items };
}

async function readActiveWorkUnits(store: Store, asOf: StateVersion): Promise<ViewInventory> {
  const listing = await listLifecycleIndex(store, { locations: ["active"], asOf });
  if (listing.status === "refused") return { kind: "unavailable", diagnostics: [markStoreRefusal(listing.refusal)] };
  const result = listing.result;
  if (result.status === "absent") return { kind: "complete", items: [] };
  if (result.status === "unreadable") return { kind: "unavailable", diagnostics: [{ reason: result.condition, remedy: result.remedy }] };
  const diagnostics = listingProblems(result);
  if (diagnostics.length > 0) return { kind: "unavailable", diagnostics };
  return { kind: "complete", items: result.index.entries().map(entry => ({ reference: entry.reference,
    owner: entry.fields.owner, cohort: entry.fields.cohort })) };
}

async function readActiveErrands(store: Store, asOf: StateVersion): Promise<ViewInventory> {
  const listing = await store.list({ family: "work-item", kind: "work-item/record", filter: { locations: ["active"] }, asOf });
  if (listing.status === "refused") return { kind: "unavailable", diagnostics: [markStoreRefusal(listing.refusal)] };
  const result = listing.result;
  if (result.status === "absent") return { kind: "complete", items: [] };
  if (result.status === "unreadable") return { kind: "unavailable", diagnostics: [{ reason: result.condition, remedy: result.remedy }] };
  const diagnostics = listingProblems(result), items: ViewCandidate[] = [];
  for (const record of result.records) {
    const decoded = deserializeTransientIdentityRecord(record.content, record.reference.owner.name);
    if (decoded.kind !== "valid") {
      diagnostics.push({ reason: `Active work-item identity ${record.reference.owner.name} is ${decoded.kind}.`,
        remedy: { text: "Repair the named active identity record, then retry the view selection." } });
      continue;
    }
    if (decoded.record.kind !== "errand" || decoded.record.purpose !== "errand") continue;
    items.push({ reference: record.reference, owner: decoded.record.owner ?? null, cohort: null });
  }
  return diagnostics.length > 0 ? { kind: "unavailable", diagnostics } : { kind: "complete", items };
}

function listingProblems(result: { readonly diagnostics: readonly ListingDiagnostic[]; readonly missed: boolean }): RefusedMark[] {
  if (result.diagnostics.length > 0) return result.diagnostics.map(entry => ({ reason: entry.condition, remedy: entry.remedy }));
  return result.missed ? [{ reason: "The active work-item inventory is incomplete.",
    remedy: { text: "Restore a complete active work-item inventory, then retry the view selection." } }] : [];
}
