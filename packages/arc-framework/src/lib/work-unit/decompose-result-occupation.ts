/** Injectable branch-occupation seam for an immutable decomposition result plan. */

import type { CanonicalDigest } from "../canonical/canonical-json.js";
import type { ProtectionMode } from "../git/write-context.js";
import type { DecomposeTransientClaimStore } from "./decompose-transient-claim-store.js";
import {
  decomposeCandidateBranch,
  decomposeTransientClaimId,
  projectDecomposeTransientCandidateOwnership,
  type DecomposeTransientClaim,
  type DecomposeTransientClaimBinding,
  type DecomposeTransientOccupationEvidence,
} from "./decompose-transient-claim.js";
import type { ValidatedDecomposePlan } from "./decompose-v3-plan.js";

export interface DecomposeCandidateRegistration {
  path: string;
  candidateBranch: string;
  head: string;
  occupied: boolean;
  marker:
    | {
        claimId: CanonicalDigest;
        generation: number;
        candidateWorktree: CanonicalDigest;
      }
    | null;
}

export interface DecomposeCandidateObservation {
  branchHead: string | null;
  registrations: readonly DecomposeCandidateRegistration[];
}

export interface DecomposePartialProjection {
  baseHead: string | null;
  indexClean: boolean;
  worktreeClean: boolean;
}

export interface DecomposeCandidateCreationRequest {
  branch: string;
  baseHead: string;
  path: string;
  marker: {
    claimId: CanonicalDigest;
    generation: number;
    candidateWorktree: CanonicalDigest;
  };
}

export type DecomposeCandidateCreationResult =
  | { status: "ready"; observation: DecomposeCandidateObservation }
  | {
      status: "collision";
      noMutation: boolean;
      absence?: {
        registrationAbsent: boolean;
        markerAbsent: boolean;
        branchAbsent: boolean;
        pathAbsent: boolean;
      };
    };

export interface DecomposeResultOccupationAdapter {
  claims: Pick<
    DecomposeTransientClaimStore,
    "read" | "acquire" | "reserve" | "rollbackReservation" | "occupy"
  >;
  resolveBaseHead(baseBranch: string): Promise<string | null>;
  observeCandidate(candidateBranch: string): Promise<DecomposeCandidateObservation>;
  inspectPartial(
    baseBranch: string,
    relevantPaths: readonly string[],
  ): Promise<DecomposePartialProjection>;
  candidatePath(candidateWorktree: CanonicalDigest): Promise<string>;
  ensureCandidate(request: DecomposeCandidateCreationRequest): Promise<DecomposeCandidateCreationResult>;
}

export interface DecomposeResultOccupationInput {
  protection: ProtectionMode;
  configuredBase: string;
  plan: ValidatedDecomposePlan;
}

export type DecomposeResultOccupationRefusal =
  | "base-moved"
  | "partial-projection-dirty"
  | "branch-exists-unregistered"
  | "registered-at-wrong-path"
  | "occupied-path"
  | "duplicate-registration"
  | "candidate-binding-mismatch"
  | "candidate-head-mismatch"
  | "marker-mismatch"
  | "concurrent-creation"
  | "claim-conflict"
  | "recovery-required";

export type DecomposeResultOccupationResult =
  | {
      status: "occupied";
      protection: "partial";
      candidateOwnership: { kind: "not-applicable"; protection: "partial" };
    }
  | {
      status: "occupied";
      protection: "full";
      path: string;
      candidateOwnership: NonNullable<ReturnType<typeof projectDecomposeTransientCandidateOwnership>>;
    }
  | {
      status: "refused";
      reason: DecomposeResultOccupationRefusal;
      recovery?: {
        path: string;
        candidateOwnership: {
          kind: "claimed";
          protection: "full";
          claimId: CanonicalDigest;
          generation: number;
          candidateBranch: string;
          candidateWorktree: CanonicalDigest;
        };
      };
    };

function pendingCandidateRecovery(claim: DecomposeTransientClaim, path: string) {
  return {
    path,
    candidateOwnership: {
      kind: "claimed" as const,
      protection: "full" as const,
      claimId: claim.claimId,
      generation: claim.generation,
      candidateBranch: claim.binding.candidateBranch,
      candidateWorktree: claim.candidateWorktree,
    },
  };
}

function bindingFor(plan: ValidatedDecomposePlan): DecomposeTransientClaimBinding {
  return {
    origin: plan.prospectiveOverlay.origin,
    candidateBranch: decomposeCandidateBranch(plan.prospectiveOverlay.origin),
    sourceHead: plan.sourceHead,
    resultBaseHead: plan.expectedBaseHead,
    cutMapDigest: plan.cutMapDigest,
  };
}

function claimMatchesBinding(
  claim: DecomposeTransientClaim,
  binding: DecomposeTransientClaimBinding,
): boolean {
  return claim.binding.origin === binding.origin
    && claim.binding.candidateBranch === binding.candidateBranch
    && claim.binding.sourceHead === binding.sourceHead
    && claim.binding.resultBaseHead === binding.resultBaseHead
    && claim.binding.cutMapDigest === binding.cutMapDigest;
}

function validateObservation(
  claim: DecomposeTransientClaim,
  observation: DecomposeCandidateObservation,
): DecomposeResultOccupationRefusal | null {
  if (observation.registrations.length > 1) return "duplicate-registration";
  const registration = observation.registrations[0];
  if (registration === undefined) return "branch-exists-unregistered";
  if (claim.registration.kind !== "intended" && claim.registration.kind !== "registered") {
    return "registered-at-wrong-path";
  }
  if (registration.path !== claim.registration.path) return "registered-at-wrong-path";
  if (registration.occupied) return "occupied-path";
  if (observation.branchHead !== claim.binding.resultBaseHead
    || registration.head !== claim.binding.resultBaseHead
    || registration.candidateBranch !== claim.binding.candidateBranch) {
    return "candidate-head-mismatch";
  }
  if (registration.marker === null
    || registration.marker.claimId !== claim.claimId
    || registration.marker.generation !== claim.generation
    || registration.marker.candidateWorktree !== claim.candidateWorktree) {
    return "marker-mismatch";
  }
  return null;
}

function validateRecoverableObservation(
  claim: DecomposeTransientClaim,
  observation: DecomposeCandidateObservation,
): DecomposeResultOccupationRefusal | null {
  if (observation.registrations.length > 1) return "duplicate-registration";
  const registration = observation.registrations[0];
  if (registration === undefined) {
    return observation.branchHead === null ? null : "branch-exists-unregistered";
  }
  if (claim.registration.kind !== "intended" && claim.registration.kind !== "registered") {
    return "registered-at-wrong-path";
  }
  if (registration.path !== claim.registration.path) return "registered-at-wrong-path";
  if (registration.occupied) return "occupied-path";
  if (observation.branchHead !== claim.binding.resultBaseHead
    || registration.head !== claim.binding.resultBaseHead
    || registration.candidateBranch !== claim.binding.candidateBranch) {
    return "candidate-head-mismatch";
  }
  if (registration.marker === null) {
    return claim.registration.kind === "intended" ? null : "marker-mismatch";
  }
  if (registration.marker.claimId !== claim.claimId
    || registration.marker.generation !== claim.generation
    || registration.marker.candidateWorktree !== claim.candidateWorktree) {
    return "marker-mismatch";
  }
  return null;
}

function occupationEvidence(
  observation: DecomposeCandidateObservation,
  claim: DecomposeTransientClaim,
): DecomposeTransientOccupationEvidence | null {
  const registration = observation.registrations[0];
  if (observation.branchHead === null
    || registration === undefined
    || registration.marker === null) return null;
  return {
    registrations: observation.registrations.map(({ path, candidateBranch, head }) => ({
      path,
      candidateBranch,
      head,
    })),
    branch: {
      candidateBranch: claim.binding.candidateBranch,
      head: observation.branchHead,
    },
    marker: registration.marker,
  };
}

/**
 * Occupy the exact result locus without materializing any planned path.
 *
 * @param input - Protection mode, configured base, and immutable plan.
 * @param adapter - Claim, Git-registration, marker, and clean-projection boundaries.
 * @returns Exact full/partial ownership or one typed pre-materialization refusal.
 */
export async function occupyDecomposeResult(
  input: DecomposeResultOccupationInput,
  adapter: DecomposeResultOccupationAdapter,
): Promise<DecomposeResultOccupationResult> {
  const baseHead = await adapter.resolveBaseHead(input.configuredBase);
  if (baseHead !== input.plan.expectedBaseHead) {
    return { status: "refused", reason: "base-moved" };
  }

  if (input.protection === "partial") {
    const projection = await adapter.inspectPartial(input.configuredBase, input.plan.allowedPaths);
    if (projection.baseHead !== input.plan.expectedBaseHead
      || !projection.indexClean || !projection.worktreeClean) {
      return {
        status: "refused",
        reason: projection.baseHead === input.plan.expectedBaseHead
          ? "partial-projection-dirty"
          : "base-moved",
      };
    }
    return {
      status: "occupied",
      protection: "partial",
      candidateOwnership: { kind: "not-applicable", protection: "partial" },
    };
  }

  const binding = bindingFor(input.plan);
  const claimId = decomposeTransientClaimId(binding);
  let observation = await adapter.observeCandidate(binding.candidateBranch);
  const stored = await adapter.claims.read(claimId);
  const storedClaim = stored.status === "found" ? stored.claim : null;

  if (observation.registrations.length > 1) {
    return { status: "refused", reason: "duplicate-registration" };
  }
  if (observation.registrations.length > 0 && storedClaim === null) {
    return { status: "refused", reason: "registered-at-wrong-path" };
  }
  if (observation.branchHead !== null) {
    if (storedClaim === null) return { status: "refused", reason: "branch-exists-unregistered" };
    if (!claimMatchesBinding(storedClaim, binding)) {
      return { status: "refused", reason: "candidate-binding-mismatch" };
    }
    if (observation.registrations.length === 0) {
      return { status: "refused", reason: "branch-exists-unregistered" };
    }
  } else if (storedClaim?.state.kind === "occupied") {
    return storedClaim.registration.kind === "registered"
      ? {
          status: "refused",
          reason: "recovery-required",
          recovery: pendingCandidateRecovery(storedClaim, storedClaim.registration.path),
        }
      : { status: "refused", reason: "claim-conflict" };
  }

  const acquired = await adapter.claims.acquire(claimId, binding);
  if (acquired.status !== "acquired" && acquired.status !== "already-acquired-matching") {
    return { status: "refused", reason: "claim-conflict" };
  }
  let claim = acquired.claim;

  if (claim.state.kind === "occupied") {
    const refusal = validateObservation(claim, observation);
    if (refusal !== null) return { status: "refused", reason: refusal };
    if (claim.registration.kind !== "registered") {
      return { status: "refused", reason: "claim-conflict" };
    }
    const ownership = projectDecomposeTransientCandidateOwnership(claim);
    return ownership === null
      ? { status: "refused", reason: "claim-conflict" }
      : { status: "occupied", protection: "full", path: claim.registration.path, candidateOwnership: ownership };
  }
  if (claim.state.kind !== "pending") return { status: "refused", reason: "claim-conflict" };

  let path: string;
  if (claim.registration.kind === "intended") {
    path = claim.registration.path;
  } else if (claim.registration.kind === "unregistered") {
    observation = await adapter.observeCandidate(binding.candidateBranch);
    if (observation.branchHead !== null || observation.registrations.length > 0) {
      return { status: "refused", reason: "concurrent-creation" };
    }
    path = await adapter.candidatePath(claim.candidateWorktree);
    const reserved = await adapter.claims.reserve(claimId, claim.generation, path);
    if (reserved.status !== "reserved" && reserved.status !== "already-reserved-matching") {
      return { status: "refused", reason: "claim-conflict" };
    }
    claim = reserved.claim;
  } else {
    return { status: "refused", reason: "claim-conflict" };
  }

  const recoveryRefusal = validateRecoverableObservation(claim, observation);
  if (recoveryRefusal !== null) return { status: "refused", reason: recoveryRefusal };
  const created = await adapter.ensureCandidate({
    branch: binding.candidateBranch,
    baseHead: input.plan.expectedBaseHead,
    path,
    marker: {
      claimId,
      generation: claim.generation,
      candidateWorktree: claim.candidateWorktree,
    },
  });
  if (created.status === "collision") {
    if (created.noMutation && created.absence !== undefined) {
      const rolledBack = await adapter.claims.rollbackReservation(
        claimId,
        claim.generation,
        path,
        created.absence,
      );
      if (rolledBack.status === "rolled-back"
        || rolledBack.status === "already-unregistered-matching") {
        return { status: "refused", reason: "concurrent-creation" };
      }
    }
    return {
      status: "refused",
      reason: "recovery-required",
      recovery: pendingCandidateRecovery(claim, path),
    };
  }

  const refusal = validateObservation(claim, created.observation);
  if (refusal !== null) {
    return { status: "refused", reason: refusal, recovery: pendingCandidateRecovery(claim, path) };
  }
  const evidence = occupationEvidence(created.observation, claim);
  if (evidence === null) {
    return {
      status: "refused",
      reason: "recovery-required",
      recovery: pendingCandidateRecovery(claim, path),
    };
  }
  const occupied = await adapter.claims.occupy(
    claimId,
    claim.generation,
    path,
    evidence,
  );
  if (occupied.status !== "occupied" && occupied.status !== "already-occupied-matching") {
    return {
      status: "refused",
      reason: "recovery-required",
      recovery: pendingCandidateRecovery(claim, path),
    };
  }
  const ownership = projectDecomposeTransientCandidateOwnership(occupied.claim);
  return ownership === null
    ? { status: "refused", reason: "claim-conflict" }
    : { status: "occupied", protection: "full", path, candidateOwnership: ownership };
}
