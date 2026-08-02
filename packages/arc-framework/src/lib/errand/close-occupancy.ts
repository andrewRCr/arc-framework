/** Occupancy authority over the exact Errand a close is about to finalize. */

import { isDeepStrictEqual } from "node:util";

import { projectTrustedLocusRow, untrustedRefusalReason } from "../locus/trusted-row.js";
import type {
  LocusIdentityV1,
  LocusRefusalReason,
  LocusRowV1,
  LocusStateV1,
} from "../locus/schema/index.js";

export type CloseOccupancyVerdict =
  | { kind: "clear"; authority: "unclaimed" | "current-checkout" | "base-checkout" }
  | { kind: "refused"; reason: LocusRefusalReason; message: string };

/** Positive runtime evidence for the one unresolved subject state close may clear. */
export interface BaseCheckoutCloseProof {
  readonly recordId: string;
  readonly checkoutPath: string;
  readonly identity: LocusIdentityV1;
}

/**
 * Decide whether close may delete the Errand's refs, capture, and identity.
 *
 * Foreign occupancy — not plain occupancy — is what refuses: an Errand may finalize from inside its
 * own still-occupied checkout only when the entering process owns its exact live lease. When a proven
 * base switch prevents the reader from resolving that locus, the caller supplies the base checkout's
 * path-derived generation and the projection still has to prove the exact ordinary-Errand claim plus
 * its live self-held lease.
 *
 * @param options - Complete locus projection plus the exact Errand subject close resolved.
 * @returns Clearance, or the single refusal reason the claiming occupancy carries.
 */
export function classifyErrandCloseOccupancy(options: {
  state: LocusStateV1;
  slug: string;
  claimId: string | null;
  baseCheckoutProof: BaseCheckoutCloseProof | null;
}): CloseOccupancyVerdict {
  const claims = options.state.roster.rows.filter((row) => row.role?.subject.kind === "errand"
    && row.role.subject.key === options.slug && row.role.subject.claimId === options.claimId);
  if (claims.length === 0) return { kind: "clear", authority: "unclaimed" };
  const claim = claims.length === 1 ? claims[0] : undefined;
  if (claim === undefined) {
    return refused("duplicate-locus", `Errand '${options.slug}' is claimed by more than one checkout.`);
  }

  const current = options.state.current;
  if (isExactSelfHeldCurrentCheckout(claim, current)) {
    return { kind: "clear", authority: "current-checkout" };
  }
  if (isExactSelfHeldBaseCheckout(claim, options.state, options.baseCheckoutProof)) {
    return { kind: "clear", authority: "base-checkout" };
  }

  const trusted = projectTrustedLocusRow(claim);
  if (trusted.kind === "untrusted") {
    return refused(
      untrustedRefusalReason(trusted.reasons),
      `Errand '${options.slug}' is claimed by occupancy whose authority is not established.`,
    );
  }
  return refused(foreignReason(claim.lease), foreignMessage(options.slug, claim));
}

function isExactSelfHeldCurrentCheckout(
  claim: LocusRowV1,
  current: LocusStateV1["current"],
): boolean {
  return current.kind === "resolved"
    && claim.kind === "managed-role"
    && claim.recordId !== null
    && current.activeRecordId === claim.recordId
    && claim.role?.kind === "errand"
    && claim.lease?.state === "live"
    && claim.lease.selfHeld;
}

function isExactSelfHeldBaseCheckout(
  claim: LocusRowV1,
  state: LocusStateV1,
  proof: BaseCheckoutCloseProof | null,
): boolean {
  const diagnostic = claim.diagnostics.length === 1 ? claim.diagnostics[0] : undefined;
  return proof !== null
    && claim.kind === "managed-role"
    && claim.recordId === proof.recordId
    && claim.checkoutPath === proof.checkoutPath
    && claim.checkoutPath === state.roster.primaryPath
    && claim.primary === true
    && claim.role?.kind === "errand"
    && proof.identity.kind === "errand"
    && proof.identity.purpose === "errand"
    && proof.identity.key === claim.role.subject.key
    && proof.identity.claimId === claim.role.subject.claimId
    && hasExactInFlightIdentity(state, proof.identity)
    && claim.lease?.state === "live"
    && claim.lease.selfHeld
    && diagnostic?.code === "subject-unresolved"
    && diagnostic.source.kind === "record";
}

function hasExactInFlightIdentity(state: LocusStateV1, expected: LocusIdentityV1): boolean {
  return state.inFlightIdentities.filter(({ identity }) => isDeepStrictEqual(identity, expected)).length === 1;
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
