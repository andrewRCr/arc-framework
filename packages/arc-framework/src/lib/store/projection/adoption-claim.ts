/** Read one ready checkout claim without rebinding its work item by a public name. */
import { decodeWorktreeMarkerOwnership, readWorktreeMarker } from "../../git/worktree-marker.js";
import { CheckoutClaimSchema, type CheckoutClaim } from "../lookup.js";
import { workUnitCheckoutClaim } from "../work-unit-claim.js";
import { nativeRefusalReport } from "../native-refusal.js";
import type { StoreRecord } from "../read.js";
import type { ProjectionRootState } from "./process-state.js";
import type { RefusedMark } from "./index-schema.js";
import { markStoreRefusal } from "./refusal-mark.js";

type ClaimOwner = { kind: "owned"; record: StoreRecord } | { kind: "refused"; mark: RefusedMark };
type ClaimInput = Pick<ProjectionRootState, "checkout" | "store" | "claim"> & {
  readonly context: Pick<ProjectionRootState["context"], "verb">;
};

/** Resolve the generation represented by the same physical claim used to classify the file. */
export async function readAdoptionClaim(root: ClaimInput): Promise<ClaimOwner> {
  try {
    const marker = await readWorktreeMarker(root.checkout);
    if (marker.kind !== "present") return missingClaim(marker.kind === "malformed" ? marker.message : undefined);
    if (marker.marker.husk !== undefined) return missingClaim();
    const ownership = decodeWorktreeMarkerOwnership(marker.marker);
    if (ownership.kind !== "current") return missingClaim();
    const subject = ownership.subject;
    if (subject.kind === "work-unit") {
      if (subject.name !== root.claim || subject.uid === undefined) return missingClaim();
      return await readClaimOwner(root, workUnitCheckoutClaim(root.store, subject.name, subject.uid), "work-item/meta");
    }
    if (subject.kind !== "errand" || ownership.provisioning !== "ready" || subject.slug !== root.claim) return missingClaim();
    return await readClaimOwner(root, CheckoutClaimSchema.parse({ kind: "errand", slug: subject.slug, claimId: subject.claimId }), "work-item/record");
  } catch (error) {
    const native = nativeRefusalReport(error);
    return native?.refusal === undefined ? missingClaim(error instanceof Error ? error.message : String(error))
      : { kind: "refused", mark: markStoreRefusal(native.refusal, root.context.verb) };
  }
}

async function readClaimOwner(root: ClaimInput, claim: CheckoutClaim, kind: "work-item/meta" | "work-item/record"): Promise<ClaimOwner> {
  const found = await root.store.lookup({ kind: "claim", claim });
  if (found.status === "refused") return found.refusal.code === "not-found" ? missingClaim()
    : { kind: "refused", mark: markStoreRefusal(found.refusal, root.context.verb) };
  const read = await root.store.read({ reference: found.result.reference });
  if (read.status === "refused") return { kind: "refused", mark: markStoreRefusal(read.refusal, root.context.verb) };
  return read.result.reference.kind === kind && read.result.placement?.kind === "active"
    ? { kind: "owned", record: read.result } : missingClaim();
}

function missingClaim(detail?: string): Extract<ClaimOwner, { kind: "refused" }> {
  return { kind: "refused", mark: { reason: detail ?? "This checkout has no active, bound work-item claim.",
    remedy: { text: "Repair the checkout's ownership marker or materialize the intended work item here with arc materialize, then retry." } } };
}
