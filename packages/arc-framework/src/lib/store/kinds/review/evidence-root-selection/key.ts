/** Stable repair identity independent of choice and attribution. */
import { canonicalDigest, type CanonicalDigest } from "../../../../kernel/index.js";
import { OwnerIdentitySchema, type OwnerIdentity } from "../../../identity.js";
import { ReviewIdentifierSchema } from "../../../../../scripts/review-gate/core/gate-contract-v2-schema.js";

/** Bind a selector to the exact work-item generation and immutable producer identity. */
export function reviewEvidenceRootSelectionKey(owner: OwnerIdentity, producerId: string): CanonicalDigest {
  const parsed = OwnerIdentitySchema.parse(owner);
  if (parsed.type !== "work-item" || parsed.uid === undefined) throw new Error("Root selection needs an exact work-item UID.");
  return canonicalDigest({ domain: "arc.review.evidence-root-selection/v1", ownerUid: parsed.uid,
    producerId: ReviewIdentifierSchema.parse(producerId) });
}
