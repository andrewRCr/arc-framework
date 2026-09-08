/** Host-neutral actor, vehicle, and runtime authority for local review. */

export interface LocalReviewAuthority {
  vehicle:
    | { kind: "work-unit"; identity: string }
    | { kind: "errand"; identity: string }
    | { kind: "delivery-member"; identity: string };
  authorIdentity: string;
  evaluatorIdentity: string;
  attestationRuntimeKind: string;
  runtimeIdentity: string;
  attestationMechanism: "local-attestation";
}

/**
 * The recorded coordinates of the delivery member under review.
 *
 * Carried alongside the authority rather than inside its vehicle: the vehicle is
 * written verbatim into a strict persisted union, so an extra field there would
 * fail the operation's own parse.
 */
export interface LocalReviewMemberCoordinates {
  readonly base: string;
  readonly head: string;
  readonly planId: string;
  readonly workUnitId: string;
  readonly deliverableId: string;
}

/** One resolved authority, plus member coordinates when a member was named. */
export interface LocalReviewAuthorityResolution {
  readonly authority: LocalReviewAuthority;
  readonly member: LocalReviewMemberCoordinates | null;
}
