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
