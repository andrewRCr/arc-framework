/** Locus-backed classification helpers for legacy session cleanup surfaces. */

import { branchToWorkUnitSlug } from "../work-unit/completed-index.js";
import type { LocusStateV1 } from "../locus/schema/index.js";

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
