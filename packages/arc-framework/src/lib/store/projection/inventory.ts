/** Snapshot the families that project files, retaining listing completeness and listing-backed record reads. */
import type { FamilyId } from "../catalog.js";
import type { StoreRecord, ListInput, ListingOutcome } from "../read.js";
import type { StoreResult } from "../refusal.js";
import { OwnerIdentitySchema, sameReference, sameOwner, type RecordReference, type StateVersion } from "../identity.js";
import type { Slug } from "../../kernel/index.js";
import type { RefusedMark } from "./index-schema.js";
import { markStoreRefusal } from "./refusal-mark.js";
import type { ProjectionSource } from "./record-source.js";

const families: readonly FamilyId[] = ["work-item", "cohort", "project-inbox", "personal"];
/** A materialization's positive records, completeness evidence, and reads answered from its own listing. */
export interface ProjectionInventory {
  readonly records: readonly StoreRecord[];
  readonly diagnostics: readonly RefusedMark[];
  readonly source: ProjectionSource;
  readonly complete: (reference: RecordReference) => boolean;
}

/** Read each projected family once, anchored to the materialization's state. */
export async function readProjectionInventory(source: ProjectionSource, identity: Slug, version: StateVersion,
  options: { includeCompleted?: boolean } = {}): Promise<ProjectionInventory> {
  const results = await Promise.allSettled(families.map(async family => ({ family,
    listing: await source.list({ family, asOf: version,
      ...(family === "work-item" && options.includeCompleted === false ? { filter: { locations: ["active", "planned", "provisional"] as const } } : {}),
      ...(family === "personal" ? { owner: OwnerIdentitySchema.parse({ type: "person", name: identity }) } : {}) }) })));
  const listings = new Map<FamilyId, StoreResult<ListingOutcome>>();
  const records: StoreRecord[] = [], diagnostics: RefusedMark[] = [];
  for (const result of results) {
    if (result.status === "rejected") throw result.reason;
    const { family, listing } = result.value;
    listings.set(family, listing);
    diagnostics.push(...projectionListingDiagnostics(listing));
    if (listing.status === "ok" && listing.result.status === "complete") records.push(...listing.result.records);
  }
  const complete = (reference: RecordReference): boolean => reference.owner.type !== "person" || reference.owner.name === identity
    ? projectionListingComplete(listings.get(familyOf(reference))) : false;
  const listed: ProjectionSource = {
    version: () => Promise.resolve({ status: "ok", result: version }), changes: input => source.changes(input),
    read: async input => {
      if (input.asOf !== undefined && input.asOf !== version || !listings.has(familyOf(input.reference))) return source.read(input);
      if (input.reference.kind === "cohort/document" && input.reference.owner.type === "cohort" && input.reference.owner.uid === undefined) {
        return source.read({ ...input, asOf: version });
      }
      const record = records.find(record => sameReference(record.reference, input.reference));
      if (record !== undefined) return { status: "ok", result: record };
      if (options.includeCompleted === false && input.reference.owner.type === "work-item") return source.read(input);
      return { status: "refused", refusal: complete(input.reference)
        ? { code: "not-found", class: "recoverable", reference: input.reference, condition: "The projection inventory holds no such record.",
          remedy: { text: "Restore the record through its owning command, then refresh." } }
        : { code: "record-malformed", class: "recoverable", reference: input.reference, rule: "projection.inventory",
          condition: "An incomplete projection inventory cannot establish this record.",
          remedy: { text: "Repair the inventory's reported failures, then refresh again." } } };
    },
    list: async input => {
      if (options.includeCompleted === false && input.family === "work-item"
        && (input.filter?.locations === undefined || input.filter.locations.includes("completed"))) return source.list(input);
      const listing = listings.get(input.family);
      if (listing === undefined || input.asOf !== undefined && input.asOf !== version || input.filter?.heldHere !== undefined) return source.list(input);
      return filterListing(listing, input);
    },
  };
  return { records, diagnostics, source: listed, complete };
}

function familyOf(reference: RecordReference): FamilyId { return reference.kind.split("/")[0] as FamilyId; }

/** Whether a listing proves every record present or absent without omissions. */
export function projectionListingComplete(listing: StoreResult<ListingOutcome> | undefined): boolean {
  return listing?.status === "ok" && (listing.result.status === "absent"
    || listing.result.status === "complete" && !listing.result.missed && listing.result.diagnostics.length === 0);
}

function filterListing(listing: StoreResult<ListingOutcome>, input: ListInput): StoreResult<ListingOutcome> {
  if (listing.status !== "ok" || listing.result.status !== "complete") return listing;
  const result = listing.result;
  const records = result.records.filter(record => (input.kind === undefined || record.reference.kind === input.kind)
    && (input.owner === undefined || sameOwner(record.reference.owner, input.owner))
    && (input.filter?.locations === undefined || input.filter.locations.some(location => location === (record.placement?.kind === "backlog"
      ? record.placement.commitment : record.placement?.kind))));
  return { status: "ok", result: records.length === 0 && projectionListingComplete(listing) ? { status: "absent" } : { ...result, records } };
}

/** Report incomplete source evidence without treating missing records as removed. */
export function projectionListingDiagnostics(listing: StoreResult<ListingOutcome>): RefusedMark[] {
  if (listing.status === "refused") return [markStoreRefusal(listing.refusal)];
  if (listing.result.status === "absent") return [];
  if (listing.result.status === "unreadable") return [{ reason: listing.result.condition, remedy: listing.result.remedy }];
  const diagnostics = listing.result.diagnostics.map(each => ({ reason: each.condition, remedy: each.remedy }));
  if (listing.result.missed) diagnostics.push({ reason: "The projection inventory missed records.",
    remedy: { text: "Restore a complete readable inventory, then refresh; omitted files have been preserved." } });
  return diagnostics;
}
