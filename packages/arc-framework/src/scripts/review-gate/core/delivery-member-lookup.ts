/** Host-neutral read from an exact head to the delivery member it is bound to. */

/** One delivery member authoritatively bound to the requested head. */
export interface DeliveryMemberBinding {
  readonly planId: string;
  readonly deliverableId: string;
  readonly workUnitId: string;
  readonly base: string;
  readonly head: string;
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
