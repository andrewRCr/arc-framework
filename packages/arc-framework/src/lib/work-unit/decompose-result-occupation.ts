/** Injectable Git occupation seam for an immutable decomposition result plan. */

import type { ProtectionMode } from "../git/write-context.js";
import { decomposeCandidateBranch } from "./decompose-candidate.js";
import type { ValidatedDecomposePlan } from "./decompose-v3-plan.js";

export interface DecomposeCandidateRegistration {
  path: string;
  candidateBranch: string;
  head: string;
  occupied: boolean;
  markerOwned: boolean;
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
}

export type DecomposeCandidateCreationResult =
  | { status: "ready"; observation: DecomposeCandidateObservation }
  | { status: "collision"; noMutation: boolean };

export interface DecomposeResultOccupationAdapter {
  resolveBaseHead(baseBranch: string): Promise<string | null>;
  observeCandidate(candidateBranch: string, candidatePath: string): Promise<DecomposeCandidateObservation>;
  inspectPartial(
    baseBranch: string,
    relevantPaths: readonly string[],
  ): Promise<DecomposePartialProjection>;
  candidatePath(origin: string): Promise<string>;
  ensureCandidate(request: DecomposeCandidateCreationRequest): Promise<DecomposeCandidateCreationResult>;
}

export interface DecomposeResultOccupationInput {
  protection: ProtectionMode;
  configuredBase: string;
  origin: string;
  plan: ValidatedDecomposePlan;
}

export type DecomposeResultOccupationRefusal =
  | "base-moved"
  | "partial-projection-dirty"
  | "branch-exists-unregistered"
  | "registered-at-wrong-path"
  | "occupied-path"
  | "duplicate-registration"
  | "candidate-head-mismatch"
  | "marker-mismatch"
  | "concurrent-creation"
  | "recovery-required";

export type DecomposeResultOccupationResult =
  | { status: "occupied"; protection: "partial" }
  | {
      status: "occupied";
      protection: "full";
      path: string;
      candidateBranch: string;
    }
  | {
      status: "refused";
      reason: DecomposeResultOccupationRefusal;
      recovery?: { path: string; candidateBranch: string };
    };

function validateObservation(
  observation: DecomposeCandidateObservation,
  branch: string,
  path: string,
  baseHead: string,
): DecomposeResultOccupationRefusal | null {
  if (observation.registrations.length > 1) return "duplicate-registration";
  const registration = observation.registrations[0];
  if (registration === undefined) {
    return observation.branchHead === null ? null : "branch-exists-unregistered";
  }
  if (registration.path !== path || registration.candidateBranch !== branch) {
    return "registered-at-wrong-path";
  }
  if (registration.occupied) return "occupied-path";
  if (observation.branchHead !== baseHead || registration.head !== baseHead) {
    return "candidate-head-mismatch";
  }
  return registration.markerOwned ? null : "marker-mismatch";
}

/** Occupy the exact result locus without materializing any planned path. */
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
    return { status: "occupied", protection: "partial" };
  }

  const origin = input.origin;
  const branch = decomposeCandidateBranch(origin);
  const path = await adapter.candidatePath(origin);
  const observation = await adapter.observeCandidate(branch, path);
  const refusal = validateObservation(observation, branch, path, input.plan.expectedBaseHead);
  if (refusal !== null) return { status: "refused", reason: refusal };
  if (observation.registrations.length === 1) {
    return { status: "occupied", protection: "full", path, candidateBranch: branch };
  }

  const created = await adapter.ensureCandidate({
    branch,
    baseHead: input.plan.expectedBaseHead,
    path,
  });
  if (created.status === "collision") {
    return created.noMutation
      ? { status: "refused", reason: "concurrent-creation" }
      : {
          status: "refused",
          reason: "recovery-required",
          recovery: { path, candidateBranch: branch },
        };
  }
  const createdRefusal = validateObservation(
    created.observation,
    branch,
    path,
    input.plan.expectedBaseHead,
  );
  return createdRefusal === null
    ? { status: "occupied", protection: "full", path, candidateBranch: branch }
    : {
        status: "refused",
        reason: createdRefusal,
        recovery: { path, candidateBranch: branch },
      };
}
