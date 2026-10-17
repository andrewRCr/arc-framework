/** Independently pinned acquisitions for project Errands and one identity's claims. */
import type { Store } from "../store/contract.js";
import { OwnerIdentitySchema } from "../store/identity.js";
import type { StoreRecord, ListingDiagnostic } from "../store/read.js";
import type { StateVersion } from "../store/identity.js";
import { deserializeTransientIdentityRecord, projectLocusIdentity, type TransientIdentityRecord } from "./identity-record.js";
import type { LocusIdentityV1 } from "../locus/schema/index.js";

/** Completeness applies independently to each acquisition. */
export type StoreIdentityAcquisition =
  | { kind: "absent"; asOf?: StateVersion }
  | { kind: "error"; message: string }
  | { kind: "complete"; records: readonly StoreRecord[]; identities: readonly LocusIdentityV1[];
      decoded: ReadonlyMap<string, TransientIdentityRecord>; diagnostics: readonly ListingDiagnostic[]; missed: boolean; asOf?: StateVersion };
/** Read active project-scoped Errands, preserving malformed entries as diagnostics. */
export async function acquireStoreErrands(store: Store): Promise<StoreIdentityAcquisition> {
  return acquire(store, [{ family: "work-item", kind: "work-item/record", filter: { locations: ["active"] } }], true);
}
/** Read both identity-scoped claim kinds at the same saved-state anchor. */
export async function acquireStoreClaims(store: Store, identity: string): Promise<StoreIdentityAcquisition> {
  const owner = OwnerIdentitySchema.parse({ type: "person", name: identity });
  return acquire(store, [{ family: "claims", kind: "claims/groom", owner }, { family: "claims", kind: "claims/housekeep", owner }], false);
}
async function acquire(store: Store, inputs: Parameters<Store["list"]>[0][], errands: boolean): Promise<StoreIdentityAcquisition> {
  const anchor = await store.version();
  if (anchor.status === "refused") return { kind: "error", message: `${anchor.refusal.condition} ${anchor.refusal.remedy.text}` };
  const records: StoreRecord[] = [], diagnostics: ListingDiagnostic[] = [], identities: LocusIdentityV1[] = [];
  const decoded = new Map<string, TransientIdentityRecord>(); let missed = false, present = false;
  for (const input of inputs) {
    const listing = await store.list({ ...input, asOf: anchor.result });
    if (listing.status === "refused") return { kind: "error", message: `${listing.refusal.condition} ${listing.refusal.remedy.text}` };
    const outcome = listing.result;
    if (outcome.status === "unreadable") return { kind: "error", message: `${outcome.condition} ${outcome.remedy.text}` };
    if (outcome.status === "absent") continue;
    present = true; missed ||= outcome.missed; diagnostics.push(...outcome.diagnostics);
    for (const saved of outcome.records) {
      const projected = projectRecord(saved, errands);
      diagnostics.push(...projected.diagnostics);
      if (projected.record === undefined) { missed = true; continue; }
      records.push(saved); decoded.set(projected.record.slug, projected.record); identities.push(projectLocusIdentity(projected.record));
    }
  }
  return present ? { kind: "complete", records, decoded, identities, diagnostics, missed, asOf: anchor.result }
    : { kind: "absent", asOf: anchor.result };
}

function projectRecord(saved: StoreRecord, errands: boolean): { record?: TransientIdentityRecord; diagnostics: ListingDiagnostic[] } {
  const slug = errands ? saved.reference.owner.name : typeof saved.reference.key === "string" ? saved.reference.key : "";
  const diagnostic = (condition: string): ListingDiagnostic => ({ kind: "malformed", key: slug,
    condition: `Malformed ${saved.reference.kind} ${slug}: ${condition}.`, remedy: { text: `Repair the ${saved.reference.kind} record ${slug}, then retry.` } });
  if (saved.conflicts.length > 0) return { diagnostics: [{
    ...diagnostic(`unresolved conflicts: ${saved.conflicts.map(reference => JSON.stringify(reference)).join(", ")}`),
    remedy: { text: "Resolve the named conflict records, then retry transient identity discovery." },
  }] };
  const read = deserializeTransientIdentityRecord(saved.content, slug);
  if (read.kind !== "valid") return { diagnostics: [diagnostic(read.kind)] };
  if (errands && (saved.placement?.kind !== "active" || read.record.kind !== "errand" || read.record.purpose !== "errand")) {
    return { diagnostics: [diagnostic("active ordinary Errand expected")] };
  }
  const ownerMissing = errands && read.record.kind === "errand" && read.record.purpose === "errand" && read.record.owner === undefined;
  return { record: read.record, diagnostics: ownerMissing ? [diagnostic("Errand owner is missing")] : [] };
}
