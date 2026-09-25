/** Host-neutral read from an exact head to the delivery member it is bound to. */

import type { DeliveryPlanV1, DeliveryStateV1 } from "../../../lib/delivery/schema.js";
import type { DeliveryRenameEvidenceAuthority } from "../../../lib/delivery/plan-resolution.js";

/** One delivery member authoritatively bound to the requested head. */
export interface DeliveryMemberBinding {
  readonly planId: string;
  readonly deliverableId: string;
  readonly workUnitId: string;
  readonly base: string;
  readonly baseRef: string | null;
  readonly headRef: string | null;
  readonly head: string;
  readonly candidateHead: string | null;
  /**
   * Every recorded head bound above this member, nearest first, empty when none is bound.
   *
   * All of them rather than the nearest, because the stack is not transitive in practice: an approved review fix
   * republishes one member's coordinates alone, leaving the members above it on heads that no longer descend
   * from it. Reading only the nearest would then clear a head belonging to one of those, which is the
   * misattribution this bound exists to refuse. A head under review that contains any of these belongs to the
   * member that records it, and reviews under that member's vehicle.
   */
  readonly successorHeads: readonly string[];
  readonly isFinalMember: boolean;
}

/**
 * Closed answer to one member lookup.
 *
 * `unbound` and `unavailable` stay distinct: a head no member holds is a
 * different refusal from an answer that could not be established, and each
 * consumer maps them to its own vocabulary.
 */
export type DeliveryMemberLookupResult =
  | { readonly status: "resolved"; readonly member: DeliveryMemberBinding }
  | { readonly status: "unbound" }
  | { readonly status: "unavailable" };

/**
 * Storage-agnostic delivery read available to review.
 *
 * Total by construction — every failure arrives as `unavailable` rather than a
 * thrown error, so no caller inherits the store's failure vocabulary.
 */
export interface DeliveryMemberLookup {
  resolveMemberByHead(headObjectId: string): Promise<DeliveryMemberLookupResult>;
}

/** The member identity a deliverable-keyed lookup is asked about. */
export interface DeliveryMemberIdentity {
  readonly planId: string;
  readonly deliverableId: string;
  readonly workUnitId: string;
}

/**
 * Closed answer to one deliverable-keyed member lookup.
 *
 * Every miss keeps its own arm, because a caller acts differently on each: a
 * member the plan holds with no binding, a deliverable the resolved plan does
 * not hold, a work unit no plan carries, and an asserted plan that is not the
 * resolved one are four distinct answers. Only `unavailable` reports that the
 * read could not establish one.
 */
export type DeliveryMemberIdentityLookupResult =
  | { readonly status: "bound"; readonly member: DeliveryMemberBinding }
  | { readonly status: "in-plan-unbound" }
  | { readonly status: "not-in-plan" }
  | { readonly status: "no-plan" }
  | { readonly status: "plan-mismatch" }
  | { readonly status: "unavailable" };

/**
 * Member resolution keyed by the identity a caller already holds.
 *
 * Total by construction like the head-keyed lookup beside it, and separate from
 * it so neither interface grows a second method.
 */
export interface DeliveryMemberIdentityLookup {
  resolveMemberByIdentity(identity: DeliveryMemberIdentity): Promise<DeliveryMemberIdentityLookupResult>;
}

/** One retained member target available to hosted-review discharge. */
export interface DeliveryDischargeTargetBinding {
  readonly planId: string;
  readonly deliverableId: string;
  readonly workUnitId: string;
  readonly position: number;
  readonly memberCount: number;
  readonly chunkKey: string;
  readonly title: string;
  readonly ref: string | null;
  readonly providerId: string;
  readonly changeRequestId: string;
  readonly base: string;
  readonly head: string;
}

/** Closed read of every currently bound member for one work unit. */
export type DeliveryDischargeTargetLookupResult =
  | { readonly status: "resolved"; readonly targets: readonly DeliveryDischargeTargetBinding[] }
  | { readonly status: "unbound" }
  | { readonly status: "unavailable" };

/** Read-only delivery target enumeration used by hosted-review discharge. */
export interface DeliveryDischargeTargetLookup {
  resolveDischargeTargets(workUnitId: string): Promise<DeliveryDischargeTargetLookupResult>;
}

/** Closed pre-publication read that distinguishes authored intent from external binding. */
export type DeliveryReservationRecordLookupResult =
  | { readonly status: "absent" }
  | { readonly status: "planned"; readonly plan: DeliveryPlanV1 }
  | {
      readonly status: "bound";
      readonly plan: DeliveryPlanV1;
      readonly state: DeliveryStateV1;
    }
  | { readonly status: "unavailable" };

/** Read-only delivery record composition used to choose the pre-publication reservation vehicle. */
export interface DeliveryReservationRecordLookup {
  resolveReservationRecords(
    workUnitId: string,
    authority: DeliveryRenameEvidenceAuthority,
  ): Promise<DeliveryReservationRecordLookupResult>;
}

/** Closed read of the exact plan and active state needed by terminal integration. */
export type DeliveryTerminalRecordLookupResult =
  | {
      readonly status: "resolved";
      readonly plan: DeliveryPlanV1;
      readonly state: DeliveryStateV1;
      readonly stateRevision: number;
    }
  | { readonly status: "unbound" }
  | { readonly status: "unavailable" };

/** Read-only delivery record composition used by the integration checkpoint. */
export interface DeliveryTerminalRecordLookup {
  resolveTerminalRecords(workUnitId: string): Promise<DeliveryTerminalRecordLookupResult>;
}

/** Resolve the additional change-request base admitted by one bound delivery head. */
export async function resolveAcceptableDeliveryBaseRefs(
  lookup: DeliveryMemberLookup,
  headObjectId: string,
): Promise<readonly string[]> {
  try {
    const resolution = await lookup.resolveMemberByHead(headObjectId);
    return resolution.status === "resolved" && resolution.member.baseRef !== null
      ? [resolution.member.baseRef]
      : [];
  } catch {
    return [];
  }
}
