/** Review-only resolution from an exact target to its owning work unit. */

import { branchToWorkUnitSlug } from "../../../lib/work-unit/completed-index.js";
import type {
  DeliveryMemberBinding,
  DeliveryMemberLookup,
} from "./delivery-member-lookup.js";

/** Closed ownership answer for one exact review target. */
export type ReviewSubjectResolution =
  | { readonly status: "resolved"; readonly workUnitId: string; readonly member: DeliveryMemberBinding | null }
  | { readonly status: "unbound" }
  | { readonly status: "unavailable" };

/**
 * Select the branch whose change request carries a resolved review subject.
 *
 * @param currentHeadRef - Attached branch of the originating review checkout
 * @param member - Exact-head delivery binding, or null for an ordinary work-unit subject
 * @returns The retained member branch when bound, otherwise the originating branch
 */
export function resolveReviewHeadRef(
  currentHeadRef: string,
  member: DeliveryMemberBinding | null,
): string {
  if (member === null) return currentHeadRef;
  if (member.headRef === null) {
    throw new Error("The delivery member has no retained branch ref for change-request resolution.");
  }
  return member.headRef;
}

/**
 * Resolve one exact review target without creating lifecycle or session authority.
 *
 * @param input - Exact branch/head coordinates and the delivery reverse lookup
 * @returns Ordinary or delivery ownership, an authoritative miss, or an unavailable read
 */
export async function resolveReviewSubject(input: {
  readonly headRef: string;
  readonly headSha: string;
  readonly memberLookup: DeliveryMemberLookup;
}): Promise<ReviewSubjectResolution> {
  const ordinary = branchToWorkUnitSlug(input.headRef);
  if (ordinary !== null) return { status: "resolved", workUnitId: ordinary, member: null };
  try {
    const delivery = await input.memberLookup.resolveMemberByHead(input.headSha);
    if (delivery.status !== "resolved") return delivery;
    return {
      status: "resolved",
      workUnitId: delivery.member.workUnitId,
      member: delivery.member,
    };
  } catch {
    return { status: "unavailable" };
  }
}
