/** Derived-roster classification helpers for session cleanup surfaces. */

import { resolveStoreBranch, type StoreBranchOptions } from "./store-branch-classification.js";
import type { DerivedCheckoutRow } from "../locus/derived-roster.js";
import { branchToWorkUnitSlug } from "../work-unit/work-unit-slug.js";

/** True when an exact transient identity or derived work-unit role owns the branch. */
export function locusOwnsBranch(roster: readonly DerivedCheckoutRow[], branch: string): boolean;
export function locusOwnsBranch(roster: readonly DerivedCheckoutRow[], branch: string, options: StoreBranchOptions): Promise<boolean>;
export function locusOwnsBranch(roster: readonly DerivedCheckoutRow[], branch: string, options?: StoreBranchOptions): boolean | Promise<boolean> {
  if (options !== undefined) return options.store?.capabilities.stateOffBranch === true
    ? storeLocusOwnsBranch(roster, branch, options) : Promise.resolve(locusOwnsBranch(roster, branch));
  for (const row of roster) {
    if (row.identity !== null && row.identity.branch === branch) return true;
  }
  const slug = branchToWorkUnitSlug(branch);
  return slug !== null && roster.some((row) =>
    (row.kind === "work-unit" || row.kind === "retired")
    && row.subject.kind === "work-unit"
    && row.subject.key === slug,
  );
}

/** Exact derived WU role for one registered checkout, when authority is retained. */
export function locusWorkUnitAtPath(
  roster: readonly DerivedCheckoutRow[],
  checkoutPath: string,
): { name: string } | null {
  const matches = roster.filter((row) =>
    (row.kind === "work-unit" || row.kind === "retired")
    && row.checkout.path === checkoutPath
    && row.subject.kind === "work-unit",
  );
  const match = matches.length === 1 ? matches[0] : undefined;
  return match === undefined || match.subject?.kind !== "work-unit"
    ? null
    : { name: match.subject.key };
}

async function storeLocusOwnsBranch(roster: readonly DerivedCheckoutRow[], branch: string, options: StoreBranchOptions): Promise<boolean> {
  if (roster.some(row => row.identity?.branch === branch)) return true;
  if (options.store === undefined) return false;
  const resolved = await resolveStoreBranch(options.store, branch, options.projectId);
  return resolved.status === "ready" && resolved.record.reference.kind === "work-item/meta"
    && roster.some(row => (row.kind === "work-unit" || row.kind === "retired")
      && row.subject.kind === "work-unit" && row.subject.key === resolved.record.reference.owner.name);
}
