/** Exact-head admission contract for local standard-review carriers. */

import { z } from "zod";

import {
  createReviewRequest,
  validateReviewTarget,
} from "./gate-contract-v2.js";
import {
  GitObjectIdSchema,
  ReviewCanonicalDigestSchema,
  ReviewIdentifierSchema,
  ReviewTargetSchema,
  type ReviewRequestV2,
  type ReviewTarget,
} from "./gate-contract-v2-schema.js";
import {
  laneSubjectLineageId,
  LaneSubjectLineageSchema,
} from "./lane-admission.js";

export const LocalChangeSetSnapshotSchema = z.strictObject({
  state: z.enum(["exact", "uncommitted", "unborn"]),
  repositoryId: ReviewIdentifierSchema,
  baseRef: ReviewIdentifierSchema,
  diffBaseSha: GitObjectIdSchema,
  diffBaseTree: GitObjectIdSchema,
  headSha: GitObjectIdSchema,
  headTree: GitObjectIdSchema,
});
export type LocalChangeSetSnapshot = z.infer<typeof LocalChangeSetSnapshotSchema>;

export const LocalAttestationBindingSchema = z.strictObject({
  evaluatorIdentity: ReviewIdentifierSchema,
  runtimeIdentity: ReviewIdentifierSchema,
  mechanism: ReviewIdentifierSchema,
});
export type LocalAttestationBinding = z.infer<typeof LocalAttestationBindingSchema>;

export const LocalChangeSetCarrierInputSchema = z.strictObject({
  target: ReviewTargetSchema,
  requirementId: ReviewCanonicalDigestSchema,
  snapshot: LocalChangeSetSnapshotSchema,
  authorIdentity: ReviewIdentifierSchema,
  evaluatorIdentity: ReviewIdentifierSchema,
  attestation: LocalAttestationBindingSchema,
  lineage: LaneSubjectLineageSchema,
  logicalPass: z.number().int().positive(),
  generation: z.number().int().nonnegative(),
  requestMechanism: ReviewIdentifierSchema,
  errandClaimId: ReviewIdentifierSchema.optional(),
});
export type LocalChangeSetCarrierInput = z.infer<typeof LocalChangeSetCarrierInputSchema>;

/** One admitted local request plus the attestation identities later receipt production must retain. */
export interface LocalChangeSetCarrierContract {
  target: ReviewTarget;
  request: ReviewRequestV2;
  attestation: LocalAttestationBinding;
}

function snapshotMatchesTarget(snapshot: LocalChangeSetSnapshot, target: ReviewTarget): boolean {
  return snapshot.repositoryId === target.repositoryId
    && snapshot.baseRef === target.baseRef
    && snapshot.diffBaseSha === target.diffBaseSha
    && snapshot.diffBaseTree === target.diffBaseTree
    && snapshot.headSha === target.headSha
    && snapshot.headTree === target.headTree;
}

/**
 * Admit a local request only for one committed snapshot and separated evaluator/attestor identities.
 *
 * @param input - Exact target, observed Git coordinates, and local actor bindings.
 * @returns The validated target, derived local request, and retained attestation binding.
 */
export function createLocalChangeSetCarrier(
  input: LocalChangeSetCarrierInput,
): LocalChangeSetCarrierContract {
  const parsed = LocalChangeSetCarrierInputSchema.parse(input);
  if (parsed.snapshot.state !== "exact") {
    throw new Error(`unsupported local review state: ${parsed.snapshot.state}`);
  }
  const target = validateReviewTarget(parsed.target);
  if (!snapshotMatchesTarget(parsed.snapshot, target)) {
    throw new Error("local review snapshot does not match the exact target");
  }
  if (parsed.attestation.evaluatorIdentity !== parsed.evaluatorIdentity) {
    throw new Error("local attestation evaluator does not match the admitted evaluator");
  }
  if (parsed.attestation.runtimeIdentity === parsed.evaluatorIdentity
    || parsed.attestation.runtimeIdentity === parsed.authorIdentity) {
    throw new Error("local attesting runtime must remain distinct from review actors");
  }
  const request = createReviewRequest(target, {
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    repositoryId: target.repositoryId,
    targetId: target.targetId,
    requirementId: parsed.requirementId,
    carrier: {
      kind: "local-change-set",
      adapterId: "local",
      changeRequestId: null,
      ...(parsed.errandClaimId === undefined ? {} : { errandClaimId: parsed.errandClaimId }),
    },
    authorIdentity: parsed.authorIdentity,
    evaluatorIdentity: parsed.evaluatorIdentity,
    lineageId: laneSubjectLineageId(parsed.lineage),
    logicalPass: parsed.logicalPass,
    generation: parsed.generation,
    requestMechanism: parsed.requestMechanism,
  });
  return { target, request, attestation: parsed.attestation };
}
