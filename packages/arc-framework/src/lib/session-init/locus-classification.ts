/** Locus-backed classification helpers for legacy session cleanup surfaces. */

import { branchToWorkUnitSlug } from "../work-unit/completed-index.js";
import { projectTrustedLocusRow } from "../locus/trusted-row.js";
import type { LocusRowV1, LocusStateV1 } from "../locus/schema/index.js";

/** True when an exact v3 identity or retained work-unit role owns the branch. */
export function locusOwnsBranch(state: LocusStateV1, branch: string): boolean {
  for (const row of state.roster.rows) {
    if (row.identity !== null && row.identity.branch === branch) return true;
  }
  const slug = branchToWorkUnitSlug(branch);
  return slug !== null && state.roster.rows.some((row) =>
    row.kind === "managed-role"
    && row.role?.kind === "work-unit"
    && row.role.subject.kind === "work-unit"
    && row.role.subject.key === slug,
  );
}

/** Exact managed WU role for one registered checkout, when authority is retained. */
export function locusWorkUnitAtPath(
  state: LocusStateV1,
  checkoutPath: string,
): { name: string } | null {
  const matches = state.roster.rows.filter((row) =>
    row.kind === "managed-role"
    && row.checkoutPath === checkoutPath
    && row.role?.kind === "work-unit"
    && row.role.subject.kind === "work-unit",
  );
  const match = matches.length === 1 ? matches[0] : undefined;
  return match?.role === null || match?.role === undefined
    ? null
    : { name: match.role.subject.key };
}

/**
 * What locus occupancy permits at one registered checkout, before any surface offers its removal.
 *
 * - `clear` — no record claims the checkout, or the one that does is trusted and its lease is
 *   absent or dead. The surface's own removal predicates decide alone.
 * - `suppress` — a live lease occupies the checkout; a session is on it.
 * - `manual` — occupancy exists but its authority is not established: an unverifiable lease, an
 *   untrusted record, more than one claim on the checkout, or an unresolvable path. Uncertainty
 *   about occupancy is not absence of occupancy.
 */
export type LocusOccupancy = "clear" | "suppress" | "manual";

/** Rows that assert no claim over the checkout they name — a record-free checkout is not occupancy. */
const UNCLAIMED_ROW_KINDS: ReadonlySet<LocusRowV1["kind"]> = new Set(["free-primary", "unmanaged-checkout"]);

/**
 * Resolve what locus occupancy permits at one registered checkout.
 *
 * @param state - Complete locus projection as published by the reader.
 * @param checkoutPath - Registered checkout the caller is considering for removal.
 * @returns Whether removal may be offered, must be suppressed, or stays manual.
 */
export function locusOccupancyAtPath(state: LocusStateV1, checkoutPath: string): LocusOccupancy {
  const rows = state.roster.rows.filter((row) => row.checkoutPath === checkoutPath);
  // An unresolvable path cannot be joined to its records, so an empty claim set proves nothing.
  if (rows.some((row) => row.diagnostics.some((entry) => entry.code === "path-unavailable"))) return "manual";

  const claims = rows.filter((row) => !UNCLAIMED_ROW_KINDS.has(row.kind));
  const claim = claims.length === 1 ? claims[0] : undefined;
  if (claim === undefined) return claims.length === 0 ? "clear" : "manual";
  if (claim.lease !== null && claim.lease.state !== "dead") {
    return claim.lease.state === "live" ? "suppress" : "manual";
  }
  return projectTrustedLocusRow(claim).kind === "trusted" ? "clear" : "manual";
}

