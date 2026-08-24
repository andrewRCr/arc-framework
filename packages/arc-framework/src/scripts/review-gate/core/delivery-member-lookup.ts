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
  readonly candidateHead: string;
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

/** One retained member target available to hosted-review discharge. */
export interface DeliveryDischargeTargetBinding {
  readonly planId: string;
  readonly deliverableId: string;
  readonly workUnitId: string;
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
  | { readonly status: "resolved"; readonly plan: DeliveryPlanV1; readonly state: DeliveryStateV1 }
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
