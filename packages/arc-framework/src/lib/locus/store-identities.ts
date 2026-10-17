/** Independent Store identity acquisitions and their public discovery projections. */
import { z } from "zod";
import type { Store } from "../store/contract.js";
import { ListingDiagnosticSchema, type StoreRecord } from "../store/read.js";
import { StateVersionSchema, sameReference } from "../store/identity.js";
import { CheckoutClaimSchema } from "../store/lookup.js";
import { deserializeTransientIdentityRecord, projectLocusIdentity, type TransientIdentityRecord } from "../errand/identity-record.js";
import type { OccupancySubject } from "./occupancy-marker.js";
import { acquireStoreErrands, acquireStoreClaims, type StoreIdentityAcquisition } from "../errand/store-discovery.js";
import type { TransientIdentitySnapshot } from "../errand/identity-snapshot.js";
import { LocusIdentityV1Schema } from "./schema/identity.js";
import type { DerivedCheckoutRow } from "./derived-roster.js";
import type { DormantMarkerGenerationEvidence } from "./derived-lifecycle-evidence.js";

const acquisition = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("absent"), asOf: StateVersionSchema.optional() }),
  z.strictObject({ kind: z.literal("error"), message: z.string() }),
  z.strictObject({ kind: z.literal("complete"), asOf: StateVersionSchema.optional(),
    identities: z.array(LocusIdentityV1Schema).readonly(), diagnostics: z.array(ListingDiagnosticSchema).readonly(),
    missed: z.boolean() }),
]);
/** Wire authority keeps each independently pinned acquisition visible. */
export const StoreIdentityDiscoverySchema = z.strictObject({ kind: z.literal("store"), errands: acquisition, claims: acquisition });
/** Discovery facts contain no backend record or mutable collection. */
export type StoreIdentityDiscovery = z.infer<typeof StoreIdentityDiscoverySchema>;
/** Internal acquisitions retain decoded records for exact marker corroboration. */
export interface StoreIdentityEvidence { errands: StoreIdentityAcquisition; claims: StoreIdentityAcquisition }

/** Acquire project Errands and this person's claims independently. */
export async function readStoreIdentityEvidence(store: Store, identity: string): Promise<StoreIdentityEvidence> {
  const [errands, claims] = await Promise.all([acquireStoreErrands(store), acquireStoreClaims(store, identity)]);
  return { errands, claims };
}

/** Select the acquisition that owns a checkout's marker, without borrowing another family's completeness. */
export async function markerIdentitySnapshot(evidence: StoreIdentityEvidence, marker: DormantMarkerGenerationEvidence, store?: Store): Promise<TransientIdentitySnapshot> {
  const kind = marker.kind === "present" ? marker.marker.createdFor.kind : null;
  const selected = kind === "errand" ? evidence.errands : evidence.claims;
  if (selected.kind !== "complete" || !selected.missed || marker.kind !== "present") return acquisitionSnapshot(selected);
  const subject = marker.marker.createdFor;
  if (subject.kind === "work-unit" || subject.kind === "partial-errand") return acquisitionSnapshot(selected);
  return corroborateMarkerIdentity(store, selected, subject);
}

type IdentityMarker = Extract<OccupancySubject, { kind: "errand" | "groom" | "housekeep" }>;
async function corroborateMarkerIdentity(store: Store | undefined, selected: Extract<StoreIdentityAcquisition, { kind: "complete" }>, subject: IdentityMarker): Promise<TransientIdentitySnapshot> {
  if (store === undefined) return incompleteIdentity("Bind an exact Store claim reader, then retry.");
  try {
    const found = await store.lookup({ kind: "claim", claim: CheckoutClaimSchema.parse(subject) });
    if (found.status === "refused") return incompleteIdentity(`${found.refusal.condition} ${found.refusal.remedy.text}`);
    const read = await store.read({ reference: found.result.reference, ...(selected.asOf === undefined ? {} : { asOf: selected.asOf }) });
    if (read.status === "refused") return incompleteIdentity(`${read.refusal.condition} ${read.refusal.remedy.text}`);
    const saved = read.result;
    if (saved.conflicts.length > 0) return incompleteIdentity(`Exact claim has unresolved conflicts: ${saved.conflicts.map(reference => JSON.stringify(reference)).join(", ")}. Resolve the named conflicts, then retry.`);
    const record = sameReference(saved.reference, found.result.reference) ? matchingMarkerRecord(saved, subject) : null;
    if (record === null) return incompleteIdentity("Exact claim does not agree with its record kind, generation or active placement. Repair the marker's exact claim evidence, then retry.");
    return acquisitionSnapshot({ ...selected, records: [saved], decoded: new Map([[record.slug, record]]), identities: [projectLocusIdentity(record)] });
  } catch (error) { return incompleteIdentity(`${error instanceof Error ? error.message : String(error)} Repair the exact claim evidence, then retry.`); }
}
function matchingMarkerRecord(saved: StoreRecord, subject: IdentityMarker): TransientIdentityRecord | null {
  const scopeMatches = subject.kind === "errand"
    ? saved.reference.kind === "work-item/record" && saved.reference.owner.name === subject.slug
    : saved.reference.kind === `claims/${subject.kind}` && saved.reference.key === subject.slug;
  if (!scopeMatches) return null;
  const decoded = deserializeTransientIdentityRecord(saved.content, subject.slug);
  if (decoded.kind !== "valid" || decoded.record.claimId !== subject.claimId) return null;
  const kind = decoded.record.kind === "groom" ? "groom" : decoded.record.purpose === "errand" ? "errand" : "housekeep";
  return kind !== subject.kind || (kind === "errand" && saved.placement?.kind !== "active") ? null : decoded.record;
}
function incompleteIdentity(reason: string): TransientIdentitySnapshot {
  return { kind: "error", stage: "tree", message: `Transient identity inventory is incomplete. ${reason}` };
}

/** Publish each acquisition while omitting identities already represented by checkout rows. */
export function projectStoreIdentityDiscovery(evidence: StoreIdentityEvidence, rows: readonly DerivedCheckoutRow[]): StoreIdentityDiscovery {
  const consumed = new Set(rows.flatMap(row => row.identity === null ? [] : [identityKey(row.identity)]));
  const project = (value: StoreIdentityAcquisition): z.infer<typeof acquisition> => value.kind === "complete"
    ? { kind: "complete", asOf: value.asOf, missed: value.missed, diagnostics: value.diagnostics,
      identities: value.identities.filter(identity => !consumed.has(identityKey(identity))) }
    : value;
  return { kind: "store", errands: project(evidence.errands), claims: project(evidence.claims) };
}

function identityKey(identity: z.infer<typeof LocusIdentityV1Schema>): string {
  return `${identity.kind === "groom" ? "groom" : identity.purpose}/${identity.key}/${identity.claimId}`;
}
function acquisitionSnapshot(value: StoreIdentityAcquisition): TransientIdentitySnapshot {
  if (value.kind === "absent") return { kind: "absent" };
  if (value.kind === "error") return { kind: "error", stage: "tree", message: value.message };
  return { kind: "complete", tip: value.asOf ?? "store", records: value.decoded,
    objects: new Map(value.records.map(record => [record.reference.owner.name, record.version])),
    projections: new Map(value.identities.map(identity => [identity.key, identity])),
    diagnostics: value.diagnostics.map(diagnostic => ({ kind: "malformed", key: diagnostic.key,
      message: `${diagnostic.condition} ${diagnostic.remedy.text}` })) };
}
