/** Trusted actor, vehicle, and runtime binding for local review preparation. */

import type {
  DeliveryMemberBinding,
  DeliveryMemberLookup,
} from "../../core/delivery-member-lookup.js";
import {
  ReviewIdentifierSchema,
} from "../../core/gate-contract-v2-schema.js";
import type {
  LocalReviewAuthority,
  LocalReviewAuthorityResolution,
  LocalReviewMemberCoordinates,
} from "../../core/local-review-authority.js";
import {
  DeliveryLocalReviewAdmissionSchema,
  type DeliveryLocalReviewAdmission,
} from "../../policy/delivery-local-review-admission.js";

export type {
  LocalReviewAuthority,
  LocalReviewAuthorityResolution,
} from "../../core/local-review-authority.js";

export interface LocalReviewLiveContext {
  activeIdentity: string | null;
  workUnit: { identity: string; owner: string } | null;
  errand: { identity: string; claimId: string } | null;
}

export interface LocalReviewRuntimeBinding {
  kind: string;
  identity: string;
}

export interface LocalReviewAuthorityDependencies {
  readLiveContext(): Promise<LocalReviewLiveContext>;
  resolveRuntimeBinding(): Promise<LocalReviewRuntimeBinding>;
  /**
   * Optional delivery read. Absent where no delivery state is bound, in which
   * case naming a member fails closed rather than admitting an unauthenticated
   * one.
   */
  memberLookup?: DeliveryMemberLookup;
}

/** Stable invalid-input failure at the local actor authority boundary. */
export class LocalReviewAuthorityError extends Error {
  readonly code = "invalid-input" as const;

  constructor(public readonly reason: string) {
    super(reason);
    this.name = "LocalReviewAuthorityError";
  }
}

/**
 * Authenticate one named member against the work unit resolved at this checkout.
 *
 * @param headObjectId - The member's exact head object id, as named by the operator.
 * @param workUnitIdentity - The work unit the originating locus resolves to.
 * @param lookup - Delivery read, or `undefined` where none is bound.
 * @returns The authenticated member binding.
 */
async function authenticateMember(
  headObjectId: string,
  workUnitIdentity: string,
  lookup: DeliveryMemberLookup | undefined,
  admission?: DeliveryLocalReviewAdmission,
): Promise<DeliveryMemberBinding> {
  if (lookup === undefined) {
    throw new LocalReviewAuthorityError("delivery-state-unavailable");
  }
  const resolution = admission !== undefined
    ? await lookup.resolveMemberByVehicle(admission.vehicle)
    : await lookup.resolveMemberByHead(headObjectId);
  if (resolution.status === "unavailable") {
    throw new LocalReviewAuthorityError("delivery-state-unavailable");
  }
  if (resolution.status === "unbound") {
    throw new LocalReviewAuthorityError("delivery-member-unbound");
  }
  if (resolution.member.workUnitId !== workUnitIdentity) {
    throw new LocalReviewAuthorityError("delivery-member-work-unit-mismatch");
  }
  if (admission !== undefined
    && (admission.vehicle.planId !== resolution.member.planId
      || admission.vehicle.deliverableId !== resolution.member.deliverableId
      || admission.vehicle.workUnitId !== resolution.member.workUnitId
      || admission.vehicle.head !== resolution.member.head)) {
    throw new LocalReviewAuthorityError("delivery-member-admission-mismatch");
  }
  // Direct review of the final member remains the work-unit review. Only an exact
  // standard-lane admission may address that same head as a delivery member.
  if (resolution.member.isFinalMember && admission === undefined) {
    throw new LocalReviewAuthorityError("delivery-member-terminal");
  }
  return resolution.member;
}

/**
 * Resolve the review vehicle and author before fresh evaluator selection.
 *
 * @param input - Optional authenticated delivery member selector.
 * @param dependencies - Live ARC-state and delivery readers.
 * @returns The exact vehicle, author, and selected member coordinates.
 */
export async function resolveLocalReviewVehicle(
  input: {
    memberHeadObjectId?: string;
    deliveryAdmission?: DeliveryLocalReviewAdmission;
  },
  dependencies: Pick<LocalReviewAuthorityDependencies, "readLiveContext" | "memberLookup">,
): Promise<{
  vehicle: LocalReviewAuthority["vehicle"];
  authorIdentity: string;
  member: LocalReviewMemberCoordinates | null;
}> {
  const deliveryAdmission = input.deliveryAdmission === undefined
    ? undefined
    : DeliveryLocalReviewAdmissionSchema.parse(input.deliveryAdmission);
  const memberHeadObjectId = deliveryAdmission?.vehicle.head ?? input.memberHeadObjectId;
  if (deliveryAdmission !== undefined
    && input.memberHeadObjectId !== undefined
    && input.memberHeadObjectId !== deliveryAdmission.vehicle.head) {
    throw new LocalReviewAuthorityError("delivery-member-admission-mismatch");
  }
  const context = await dependencies.readLiveContext();
  if (context.activeIdentity === null) {
    throw new LocalReviewAuthorityError("active-identity-missing");
  }
  const activeIdentity = ReviewIdentifierSchema.parse(context.activeIdentity);
  if ((context.workUnit === null) === (context.errand === null)) {
    throw new LocalReviewAuthorityError("vehicle-unresolved");
  }

  let vehicle: LocalReviewAuthority["vehicle"];
  let authorIdentity: string;
  let member: LocalReviewMemberCoordinates | null = null;
  if (context.workUnit !== null) {
    const owner = ReviewIdentifierSchema.parse(context.workUnit.owner);
    if (owner !== activeIdentity) {
      throw new LocalReviewAuthorityError("active-identity-owner-mismatch");
    }
    authorIdentity = owner;
    const workUnitIdentity = ReviewIdentifierSchema.parse(context.workUnit.identity);
    if (memberHeadObjectId === undefined) {
      vehicle = { kind: "work-unit", identity: workUnitIdentity };
    } else {
      const binding = await authenticateMember(
        memberHeadObjectId,
        workUnitIdentity,
        dependencies.memberLookup,
        deliveryAdmission,
      );
      vehicle = {
        kind: "delivery-member",
        identity: ReviewIdentifierSchema.parse(binding.deliverableId),
      };
      member = {
        base: binding.base,
        head: binding.head,
        planId: binding.planId,
        workUnitId: binding.workUnitId,
        deliverableId: binding.deliverableId,
      };
    }
  } else {
    // Naming a member is what failed here, not the vehicle resolution — an Errand
    // context has no work unit to authenticate the member against.
    if (memberHeadObjectId !== undefined) {
      throw new LocalReviewAuthorityError("delivery-member-requires-work-unit");
    }
    vehicle = {
      kind: "errand",
      identity: ReviewIdentifierSchema.parse(context.errand?.identity),
      claimId: ReviewIdentifierSchema.parse(context.errand?.claimId),
    };
    authorIdentity = activeIdentity;
  }

  return { vehicle, authorIdentity, member };
}

/** Bind the live vehicle to a distinct evaluator and installed attestation runtime. */
export async function resolveLocalReviewAuthority(
  input: {
    evaluatorIdentity: string;
    memberHeadObjectId?: string;
    deliveryAdmission?: DeliveryLocalReviewAdmission;
  },
  dependencies: LocalReviewAuthorityDependencies,
): Promise<LocalReviewAuthorityResolution> {
  const evaluatorIdentity = ReviewIdentifierSchema.parse(input.evaluatorIdentity);
  const { vehicle, authorIdentity, member } = await resolveLocalReviewVehicle(input, dependencies);
  if (authorIdentity === evaluatorIdentity) {
    throw new LocalReviewAuthorityError("author-evaluator-must-differ");
  }

  const runtime = await dependencies.resolveRuntimeBinding();
  const attestationRuntimeKind = ReviewIdentifierSchema.parse(runtime.kind);
  const runtimeIdentity = ReviewIdentifierSchema.parse(runtime.identity);
  if (runtimeIdentity === authorIdentity || runtimeIdentity === evaluatorIdentity) {
    throw new LocalReviewAuthorityError("runtime-actor-must-differ");
  }

  return {
    authority: {
      vehicle,
      authorIdentity,
      evaluatorIdentity,
      attestationRuntimeKind,
      runtimeIdentity,
      attestationMechanism: "local-attestation",
    },
    member,
  };
}
