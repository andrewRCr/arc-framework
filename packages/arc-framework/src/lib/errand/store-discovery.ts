/** Independently pinned acquisitions for project Errands and one identity's claims. */
import type { Store } from "../store/contract.js";
import { OwnerIdentitySchema } from "../store/identity.js";
import type { StoreRecord, ListingDiagnostic } from "../store/read.js";
import type { Remedy, StoreRefusal } from "../store/refusal.js";
import type { StateVersion } from "../store/identity.js";
import { deserializeTransientIdentityRecord, projectLocusIdentity, type TransientIdentityRecord } from "./identity-record.js";
import type { LocusIdentityV1 } from "../locus/schema/index.js";

/** Completeness applies independently to each acquisition. */
export type StoreIdentityAcquisition =
  | { kind: "absent"; asOf?: StateVersion }
  | { kind: "error"; message: string }
  | { kind: "complete"; records: readonly StoreRecord[]; identities: readonly LocusIdentityV1[];
      decoded: ReadonlyMap<string, TransientIdentityRecord>; diagnostics: readonly ListingDiagnostic[]; missed: boolean; asOf?: StateVersion };
/** What stopped an acquisition: the store's own refusal, or a listing it could not read. */
export type StoreIdentityAcquisitionFailure =
  | { kind: "refused"; refusal: StoreRefusal }
  | { kind: "unreadable"; condition: string; remedy: Remedy };
/** An acquisition, with what stopped it when it failed. */
export type AcquisitionRead =
  | { acquisition: Exclude<StoreIdentityAcquisition, { kind: "error" }> }
  | { acquisition: Extract<StoreIdentityAcquisition, { kind: "error" }>; failure: StoreIdentityAcquisitionFailure };
const ERRAND_LISTINGS: Parameters<Store["list"]>[0][] = [{ family: "work-item", kind: "work-item/record", filter: { locations: ["active"] } }];
/** Read active project-scoped Errands, preserving malformed entries as diagnostics. */
export async function acquireStoreErrands(store: Store): Promise<StoreIdentityAcquisition> {
  return (await acquire(store, ERRAND_LISTINGS, true)).acquisition;
}
/** Read active project-scoped Errands, and what stopped the read when it failed, for a caller refusing with it. */
export async function acquireStoreErrandsWithFailure(store: Store): Promise<AcquisitionRead> {
  return acquire(store, ERRAND_LISTINGS, true);
}
/** Read both identity-scoped claim kinds at the same saved-state anchor. */
export async function acquireStoreClaims(store: Store, identity: string): Promise<StoreIdentityAcquisition> {
  const owner = OwnerIdentitySchema.parse({ type: "person", name: identity });
  return (await acquire(store, [{ family: "claims", kind: "claims/groom", owner }, { family: "claims", kind: "claims/housekeep", owner }],
    false)).acquisition;
}
function failed(failure: StoreIdentityAcquisitionFailure): AcquisitionRead {
  const { condition, remedy } = failure.kind === "refused" ? failure.refusal : failure;
  return { acquisition: { kind: "error", message: `${condition} ${remedy.text}` }, failure };
}
async function acquire(store: Store, inputs: Parameters<Store["list"]>[0][], errands: boolean): Promise<AcquisitionRead> {
  const anchor = await store.version();
  if (anchor.status === "refused") return failed({ kind: "refused", refusal: anchor.refusal });
  const records: StoreRecord[] = [], diagnostics: ListingDiagnostic[] = [], identities: LocusIdentityV1[] = [];
  const decoded = new Map<string, TransientIdentityRecord>(); let missed = false, present = false;
  for (const input of inputs) {
    const listing = await store.list({ ...input, asOf: anchor.result });
    if (listing.status === "refused") return failed({ kind: "refused", refusal: listing.refusal });
    const outcome = listing.result;
    if (outcome.status === "unreadable") return failed({ kind: "unreadable", condition: outcome.condition, remedy: outcome.remedy });
    if (outcome.status === "absent") continue;
    present = true; missed ||= outcome.missed; diagnostics.push(...outcome.diagnostics);
    for (const saved of outcome.records) {
      const projected = projectRecord(saved, errands);
      diagnostics.push(...projected.diagnostics);
      if (projected.record === undefined) { missed = true; continue; }
      records.push(saved); decoded.set(projected.record.slug, projected.record); identities.push(projectLocusIdentity(projected.record));
    }
  }
  return { acquisition: present ? { kind: "complete", records, decoded, identities, diagnostics, missed, asOf: anchor.result }
    : { kind: "absent", asOf: anchor.result } };
}

function projectRecord(saved: StoreRecord, errands: boolean): { record?: TransientIdentityRecord; diagnostics: ListingDiagnostic[] } {
  const slug = errands ? saved.reference.owner.name : typeof saved.reference.key === "string" ? saved.reference.key : "";
  const diagnostic = (condition: string): ListingDiagnostic => recordDiagnostic(saved, slug, condition);
  if (saved.conflicts.length > 0) return { diagnostics: [{
    ...diagnostic(`unresolved conflicts: ${saved.conflicts.map(reference => JSON.stringify(reference)).join(", ")}`),
    remedy: { text: "Resolve the named conflict records, then retry transient identity discovery." },
  }] };
  const read = deserializeTransientIdentityRecord(saved.content, slug);
  if (read.kind !== "valid") return { diagnostics: [diagnostic(read.kind)] };
  if (errands && (saved.placement?.kind !== "active" || read.record.kind !== "errand" || read.record.purpose !== "errand")) {
    return { diagnostics: [diagnostic("active ordinary Errand expected")] };
  }
  return { record: read.record, diagnostics: storeIdentityRecordDiagnostics(saved, read.record) };
}

/** Retain advisory problems on a valid decoded identity without withholding its role. */
export function storeIdentityRecordDiagnostics(saved: StoreRecord, record: TransientIdentityRecord): ListingDiagnostic[] {
  const ownerMissing = saved.reference.kind === "work-item/record" && record.kind === "errand"
    && record.purpose === "errand" && record.owner === undefined;
  return ownerMissing ? [recordDiagnostic(saved, record.slug, "Errand owner is missing")] : [];
}

function recordDiagnostic(saved: StoreRecord, slug: string, condition: string): ListingDiagnostic {
  return { kind: "malformed", key: slug, condition: `Malformed ${saved.reference.kind} ${slug}: ${condition}.`,
    remedy: { text: `Repair the ${saved.reference.kind} record ${slug}, then retry.` } };
}
