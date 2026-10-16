/** Independent Store identity acquisitions and their public discovery projections. */
import { z } from "zod";
import type { Store } from "../store/contract.js";
import { ListingDiagnosticSchema } from "../store/read.js";
import { StateVersionSchema } from "../store/identity.js";
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
export function markerIdentitySnapshot(evidence: StoreIdentityEvidence, marker: DormantMarkerGenerationEvidence): TransientIdentitySnapshot {
  const kind = marker.kind === "present" ? marker.marker.createdFor.kind : null;
  return acquisitionSnapshot(kind === "errand" ? evidence.errands : evidence.claims);
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
