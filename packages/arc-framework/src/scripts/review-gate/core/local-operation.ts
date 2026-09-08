/** Deterministic admission identity and retry lookup for local review operations. */

import { z } from "zod";

import { canonicalDigest, canonicalize } from "../../../lib/kernel/index.js";
import {
  createLocalChangeSetCarrier,
  type LocalChangeSetCarrierContract,
} from "./local-carrier.js";
import type { LocalReviewAuthority } from "./local-review-authority.js";
import {
  validateReviewRequirement,
  validateReviewTarget,
} from "./gate-contract-v2.js";
import {
  ReviewCanonicalDigestSchema,
  ReviewIdentifierSchema,
  type ReviewRequirementV2,
  type ReviewTarget,
} from "./gate-contract-v2-schema.js";
import {
  LaneSubjectLineageSchema,
  type LaneSubjectLineage,
} from "./lane-admission.js";
import type { LocalReviewState } from "./operation-state-schema.js";
import type { ReviewOperationStateStore } from "./ports.js";
import type { DeliveryLocalReviewAdmission } from "../policy/delivery-local-review-admission.js";

const LocalOperationIdentityPreimageSchema = z.strictObject({
  domain: z.literal("arc.review-gate.local-operation-id/v1"),
  targetId: ReviewCanonicalDigestSchema,
  requirementId: ReviewCanonicalDigestSchema,
  authorIdentity: ReviewIdentifierSchema,
  evaluatorIdentity: ReviewIdentifierSchema,
  laneSourceId: ReviewIdentifierSchema,
  policyBindingDigest: ReviewCanonicalDigestSchema,
  requestMechanism: ReviewIdentifierSchema,
  deliveryAdmissionDigest: ReviewCanonicalDigestSchema.nullable(),
  lineage: LaneSubjectLineageSchema,
  logicalPass: z.number().int().positive(),
  retryGeneration: z.number().int().nonnegative(),
});

export interface LocalReviewAdmissionInput {
  target: ReviewTarget;
  requirement: ReviewRequirementV2;
  authority: LocalReviewAuthority;
  laneSourceId: string;
  policyBindingDigest: string;
  requestMechanism: string;
  deliveryAdmission?: DeliveryLocalReviewAdmission;
  lineage: LaneSubjectLineage;
  logicalPass: number;
  retryGeneration: number;
}

export interface LocalReviewAdmission {
  operationId: string;
  target: ReviewTarget;
  requirement: ReviewRequirementV2;
  authority: LocalReviewAuthority;
  laneSourceId: string;
  policyBindingDigest: string;
  requestMechanism: string;
  deliveryAdmission?: DeliveryLocalReviewAdmission;
  lineage: LaneSubjectLineage;
  logicalPass: number;
  retryGeneration: number;
  carrier: LocalChangeSetCarrierContract;
}

export type LocalReviewAdmissionResolution =
  | (LocalReviewAdmission & { state: "new" })
  | (LocalReviewAdmission & {
      state: "existing";
      persistedVersion: number;
      persistedState: LocalReviewState;
    });

/** Stable corrupt-state failure for a derived operation record that contradicts its key. */
export class LocalReviewAdmissionError extends Error {
  readonly code = "corrupt-state" as const;

  constructor(public readonly reason: string) {
    super(reason);
    this.name = "LocalReviewAdmissionError";
  }
}

/**
 * Derives one local request and operation identity from canonical admission facts.
 *
 * @param input - Exact target, requirement, actors, policy binding, and mechanism.
 * @returns The pure admission record used by prepare and retry lookup.
 */
export function createLocalReviewAdmission(input: LocalReviewAdmissionInput): LocalReviewAdmission {
  const target = validateReviewTarget(input.target);
  const requirement = validateReviewRequirement(target, input.requirement);
  const policyBindingDigest = ReviewCanonicalDigestSchema.parse(input.policyBindingDigest);
  const requestMechanism = ReviewIdentifierSchema.parse(input.requestMechanism);
  const lineage = LaneSubjectLineageSchema.parse(input.lineage);
  const logicalPass = z.number().int().positive().parse(input.logicalPass);
  const retryGeneration = z.number().int().nonnegative().parse(input.retryGeneration);
  const carrier = createLocalChangeSetCarrier({
    target,
    requirementId: requirement.requirementId,
    snapshot: {
      state: "exact",
      repositoryId: target.repositoryId,
      baseRef: target.baseRef,
      diffBaseSha: target.diffBaseSha,
      diffBaseTree: target.diffBaseTree,
      headSha: target.headSha,
      headTree: target.headTree,
    },
    authorIdentity: input.authority.authorIdentity,
    evaluatorIdentity: input.authority.evaluatorIdentity,
    attestation: {
      evaluatorIdentity: input.authority.evaluatorIdentity,
      runtimeIdentity: input.authority.runtimeIdentity,
      mechanism: input.authority.attestationMechanism,
    },
    lineage,
    logicalPass,
    generation: retryGeneration,
    requestMechanism,
  });
  const preimage = LocalOperationIdentityPreimageSchema.parse({
    domain: "arc.review-gate.local-operation-id/v1",
    targetId: target.targetId,
    requirementId: requirement.requirementId,
    authorIdentity: input.authority.authorIdentity,
    evaluatorIdentity: input.authority.evaluatorIdentity,
    laneSourceId: input.laneSourceId,
    policyBindingDigest,
    requestMechanism,
    deliveryAdmissionDigest: input.deliveryAdmission === undefined
      ? null
      : canonicalDigest(input.deliveryAdmission),
    lineage,
    logicalPass,
    retryGeneration,
  });
  const operationId = `local-${canonicalDigest(preimage).slice("sha256:".length)}`;
  return {
    operationId,
    target,
    requirement,
    authority: input.authority,
    laneSourceId: input.laneSourceId,
    policyBindingDigest,
    requestMechanism,
    lineage,
    logicalPass,
    retryGeneration,
    ...(input.deliveryAdmission === undefined
      ? {}
      : { deliveryAdmission: input.deliveryAdmission }),
    carrier,
  };
}

/**
 * Looks up an admission by its deterministic identity.
 *
 * Existing records are re-verified through the caller-supplied source proof.
 * The resolver itself never republishes state; its prepare caller may renew
 * only the cleanup liveness of an expired, receipt-less operation.
 *
 * @param input - Canonical admission facts.
 * @param dependencies - Operation store and exact-source verifier.
 * @returns A new admission or the identical persisted operation.
 */
export async function resolveLocalReviewAdmission(
  input: LocalReviewAdmissionInput,
  dependencies: {
    store: ReviewOperationStateStore;
    verifyExisting(state: LocalReviewState): Promise<void>;
  },
): Promise<LocalReviewAdmissionResolution> {
  const admission = createLocalReviewAdmission(input);
  const persisted = await dependencies.store.readOperation(admission.operationId);
  if (persisted.state === null) return { state: "new", ...admission };
  if (persisted.state.kind !== "local-review"
    || persisted.state.operationId !== admission.operationId
    || persisted.state.targetId !== admission.target.targetId
    || persisted.state.requestId !== admission.carrier.request.requestId
    || persisted.state.policyVersion !== admission.requirement.policyVersion
    || persisted.state.policyBindingDigest !== admission.policyBindingDigest
    || persisted.state.repositoryId !== admission.target.repositoryId
    || persisted.state.laneSourceId !== admission.laneSourceId
    || canonicalize(persisted.state.lineage) !== canonicalize(admission.lineage)
    || persisted.state.logicalPass !== admission.logicalPass
    || persisted.state.retryGeneration !== admission.retryGeneration
    || canonicalize(persisted.state.deliveryAdmission ?? null)
      !== canonicalize(admission.deliveryAdmission ?? null)
    || canonicalize(persisted.state.vehicle) !== canonicalize(admission.authority.vehicle)
    || persisted.state.attestationRuntimeKind !== admission.authority.attestationRuntimeKind) {
    throw new LocalReviewAdmissionError("local-operation-key-mismatch");
  }
  await dependencies.verifyExisting(persisted.state);
  return {
    state: "existing",
    ...admission,
    persistedVersion: persisted.version,
    persistedState: persisted.state,
  };
}
