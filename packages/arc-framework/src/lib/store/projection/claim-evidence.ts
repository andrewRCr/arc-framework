/** Re-derive a captured checkout marker's exact claim using only store evidence. */
import type { Store } from "../contract.js";
import type { StoreRecord } from "../read.js";
import type { StoreResult } from "../refusal.js";
import type { ProjectionAdmission } from "../projection-admission.js";
import { CheckoutClaimSchema } from "../lookup.js";
import { workUnitCheckoutClaim } from "../work-unit-claim.js";

/** A captured marker grants no claim unless the current store establishes its exact active primary. */
export async function readFrozenProjectionClaim(store: Store, local: ProjectionAdmission["local"]): Promise<StoreResult<StoreRecord | null>> {
  const marker = local.marker;
  if (marker === null || marker.husk || marker.kind !== "current") return { status: "ok", result: null };
  const subject = marker.subject;
  let claim;
  let kind: "work-item/meta" | "work-item/record";
  if (subject.kind === "work-unit") {
    if (subject.name !== local.claim || subject.uid === undefined) return { status: "ok", result: null };
    claim = workUnitCheckoutClaim(store, subject.name, subject.uid);
    kind = "work-item/meta";
  } else if (subject.kind === "errand" && marker.provisioning === "ready" && subject.slug === local.claim) {
    claim = CheckoutClaimSchema.parse({ kind: "errand", slug: subject.slug, claimId: subject.claimId });
    kind = "work-item/record";
  } else return { status: "ok", result: null };
  const found = await store.lookup({ kind: "claim", claim });
  if (found.status === "refused") return found.refusal.code === "not-found" ? { status: "ok", result: null } : found;
  const current = await store.read({ reference: found.result.reference });
  if (current.status === "refused") return current;
  return { status: "ok", result: current.result.reference.kind === kind && current.result.placement?.kind === "active" ? current.result : null };
}
