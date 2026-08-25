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

export type {
  LocalReviewAuthority,
  LocalReviewAuthorityResolution,
} from "../../core/local-review-authority.js";

export interface LocalReviewLiveContext {
  activeIdentity: string | null;
  workUnit: { identity: string; owner: string } | null;
  errand: { identity: string } | null;
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
): Promise<DeliveryMemberBinding> {
  if (lookup === undefined) {
    throw new LocalReviewAuthorityError("delivery-state-unavailable");
  }
  const resolution = await lookup.resolveMemberByHead(headObjectId);
  if (resolution.status === "unavailable") {
    throw new LocalReviewAuthorityError("delivery-state-unavailable");
  }
  if (resolution.status === "unbound") {
    throw new LocalReviewAuthorityError("delivery-member-unbound");
  }
  if (resolution.member.workUnitId !== workUnitIdentity) {
    throw new LocalReviewAuthorityError("delivery-member-work-unit-mismatch");
  }
  // The final member's change set is its work unit's own, so it reviews under the
  // work-unit vehicle. Same boundary the readiness lane applies.
  if (resolution.member.isFinalMember) {
    throw new LocalReviewAuthorityError("delivery-member-terminal");
  }
  return resolution.member;
}

/**
 * Resolves review authority from live ARC state and the installed runtime.
 *
 * The evaluator and an optional member selector are the only caller-selected
 * inputs. Vehicle, author, and attesting runtime are read through trusted
 * dependencies.
 *
 * @param input - Explicit evaluator selection, and the member's exact head when one is named.
 * @param dependencies - Live ARC-state, installed-runtime, and delivery readers.
 * @returns The actor-separated local review authority, plus member coordinates when one was named.
 */
export async function resolveLocalReviewAuthority(
  input: { evaluatorIdentity: string; memberHeadObjectId?: string },
  dependencies: LocalReviewAuthorityDependencies,
): Promise<LocalReviewAuthorityResolution> {
  const evaluatorIdentity = ReviewIdentifierSchema.parse(input.evaluatorIdentity);
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
    if (input.memberHeadObjectId === undefined) {
      vehicle = { kind: "work-unit", identity: workUnitIdentity };
    } else {
      const binding = await authenticateMember(
        input.memberHeadObjectId,
        workUnitIdentity,
        dependencies.memberLookup,
      );
      vehicle = {
        kind: "delivery-member",
        identity: ReviewIdentifierSchema.parse(binding.deliverableId),
      };
      member = { base: binding.base, head: binding.head };
    }
  } else {
    // Naming a member is what failed here, not the vehicle resolution — an Errand
    // context has no work unit to authenticate the member against.
    if (input.memberHeadObjectId !== undefined) {
      throw new LocalReviewAuthorityError("delivery-member-requires-work-unit");
    }
    vehicle = {
      kind: "errand",
      identity: ReviewIdentifierSchema.parse(context.errand?.identity),
    };
    authorIdentity = activeIdentity;
  }

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
