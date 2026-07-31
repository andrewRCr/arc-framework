/** Occupancy authority over the exact Errand a close is about to finalize. */

import { projectTrustedLocusRow, untrustedRefusalReason } from "../locus/trusted-row.js";
import type { LocusRefusalReason, LocusRowV1, LocusStateV1 } from "../locus/schema/index.js";

export type CloseOccupancyVerdict =
  | { kind: "clear" }
  | { kind: "refused"; reason: LocusRefusalReason; message: string };

/**
 * Decide whether close may delete the Errand's refs, capture, and identity.
 *
 * Foreign occupancy — not plain occupancy — is what refuses: an Errand may finalize from inside its
 * own still-occupied checkout, leaving the role to the recovery replay path, so requiring absence
 * would refuse the one terminal an in-place merge has. When a proven base switch prevents the reader
 * from resolving that locus, the caller supplies the base checkout's path-derived generation and the
 * projection still has to prove the exact ordinary-Errand claim plus its live self-held lease.
 *
 * @param options - Complete locus projection plus the exact Errand subject close resolved.
 * @returns Clearance, or the single refusal reason the claiming occupancy carries.
 */
export function classifyErrandCloseOccupancy(options: {
  state: LocusStateV1;
  slug: string;
  claimId: string | null;
  baseCheckoutRecordId: string | null;
}): CloseOccupancyVerdict {
  const claims = options.state.roster.rows.filter((row) => row.role?.subject.kind === "errand"
    && row.role.subject.key === options.slug && row.role.subject.claimId === options.claimId);
  if (claims.length === 0) return { kind: "clear" };
  const claim = claims.length === 1 ? claims[0] : undefined;
  if (claim === undefined) {
    return refused("duplicate-locus", `Errand '${options.slug}' is claimed by more than one checkout.`);
  }

  const current = options.state.current;
  if (current.kind === "resolved" && claim.recordId !== null && current.activeRecordId === claim.recordId) {
    return { kind: "clear" };
  }
  if (isExactSelfHeldBaseCheckout(claim, options.baseCheckoutRecordId)) return { kind: "clear" };

  const trusted = projectTrustedLocusRow(claim);
  if (trusted.kind === "untrusted") {
    return refused(
      untrustedRefusalReason(trusted.reasons),
      `Errand '${options.slug}' is claimed by occupancy whose authority is not established.`,
    );
  }
  return refused(foreignReason(claim.lease), foreignMessage(options.slug, claim));
}

function isExactSelfHeldBaseCheckout(claim: LocusRowV1, baseCheckoutRecordId: string | null): boolean {
  const diagnostic = claim.diagnostics.length === 1 ? claim.diagnostics[0] : undefined;
  return baseCheckoutRecordId !== null
    && claim.kind === "managed-role"
    && claim.recordId === baseCheckoutRecordId
    && claim.checkoutPath !== null
    && claim.primary === true
    && claim.role?.kind === "errand"
    && claim.lease?.state === "live"
    && claim.lease.selfHeld
    && diagnostic?.code === "subject-unresolved"
    && diagnostic.source.kind === "record";
}

function foreignReason(lease: LocusRowV1["lease"]): LocusRefusalReason {
  if (lease === null || lease.state === "dead") return "role-conflict";
  return lease.state === "live" ? "lease-live" : "lease-unknown";
}

function foreignMessage(slug: string, claim: LocusRowV1): string {
  const where = claim.checkoutPath ?? "another checkout";
  return claim.lease?.state === "live"
    ? `Errand '${slug}' is occupied by another session at '${where}'; resume or close it there.`
    : `Errand '${slug}' still holds a checkout at '${where}'; resolve that occupancy before closing.`;
}

function refused(reason: LocusRefusalReason, message: string): CloseOccupancyVerdict {
  return { kind: "refused", reason, message };
}
