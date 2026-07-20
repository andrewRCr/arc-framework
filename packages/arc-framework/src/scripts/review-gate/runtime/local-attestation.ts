/** Exact-head attestation entrypoint for normalized local independent-analysis results. */

import { z } from "zod";

import {
  createReviewReceipt,
  validateReviewRequest,
  validateReviewRequirement,
  validateReviewTarget,
} from "../core/gate-contract-v2.js";
import {
  GitObjectIdSchema,
  ReviewCanonicalDigestSchema,
  ReviewIdentifierSchema,
  type ReviewReceiptV2,
  type ReviewRequirementV2,
  type ReviewTarget,
} from "../core/gate-contract-v2-schema.js";
import type { LocalChangeSetCarrierContract } from "../core/local-carrier.js";
import type { ForwardReviewReceiptStore } from "../core/ports.js";

export const NormalizedLocalReviewResultSchema = z.strictObject({
  status: z.enum(["complete", "partial", "unavailable", "failed"]),
  result: z.enum(["clean", "findings"]).nullable(),
  targetId: ReviewCanonicalDigestSchema,
  headSha: GitObjectIdSchema,
  headTree: GitObjectIdSchema,
  rubricVersion: ReviewIdentifierSchema,
  rubricDigest: ReviewCanonicalDigestSchema,
  evaluatorIdentity: ReviewIdentifierSchema,
  reviewRunId: ReviewIdentifierSchema,
  applicabilityId: ReviewCanonicalDigestSchema.nullable(),
});
export type NormalizedLocalReviewResult = z.infer<typeof NormalizedLocalReviewResultSchema>;

/** Dependencies and exact bindings required to attest one local terminal result. */
export interface LocalReviewAttestationInput {
  target: ReviewTarget;
  requirement: ReviewRequirementV2;
  carrier: LocalChangeSetCarrierContract;
  result: NormalizedLocalReviewResult;
  currentTarget: () => Promise<unknown>;
  runtimeIdentity: string;
  attestationMechanism: string;
  store: ForwardReviewReceiptStore;
  expectedLedgerVersion: number;
}

/** Revalidate and append only complete local clean/finding evidence for the still-current exact target. */
export async function attestLocalReviewResult(
  input: LocalReviewAttestationInput,
): Promise<ReviewReceiptV2> {
  const target = validateReviewTarget(input.target);
  const currentTarget = validateReviewTarget(await input.currentTarget());
  if (currentTarget.targetId !== target.targetId) {
    throw new Error("local review current target no longer matches the reviewed target");
  }
  const requirement = validateReviewRequirement(target, input.requirement);
  const request = validateReviewRequest(target, input.carrier.request);
  if (request.requirementId !== requirement.requirementId) {
    throw new Error("local review request does not match its requirement");
  }
  if (request.carrier.kind !== "local-change-set"
    || request.carrier.adapterId !== "local") {
    throw new Error("local review request does not use the exact local carrier");
  }
  const result = NormalizedLocalReviewResultSchema.parse(input.result);
  if (result.status !== "complete" || result.result === null) {
    throw new Error("local review result is not attestable terminal evidence");
  }
  if (result.targetId !== target.targetId
    || result.headSha !== target.headSha
    || result.headTree !== target.headTree) {
    throw new Error("local review result does not cover the exact target");
  }
  if (result.rubricVersion !== requirement.rubricVersion
    || result.rubricDigest !== requirement.rubricDigest) {
    throw new Error("local review result does not match the required rubric");
  }
  if (result.evaluatorIdentity !== request.evaluatorIdentity
    || input.carrier.attestation.evaluatorIdentity !== request.evaluatorIdentity) {
    throw new Error("local review result evaluator identity mismatch");
  }
  if (request.authorIdentity === result.evaluatorIdentity) {
    throw new Error("local review author cannot attest self-review");
  }
  if (input.runtimeIdentity !== input.carrier.attestation.runtimeIdentity) {
    throw new Error("local review attesting runtime identity mismatch");
  }
  if (input.attestationMechanism !== input.carrier.attestation.mechanism) {
    throw new Error("local review attestation mechanism mismatch");
  }
  const receipt = createReviewReceipt({
    target,
    requirement,
    request,
    applicabilityId: result.applicabilityId,
    reviewRunId: result.reviewRunId,
    evaluatorIdentity: result.evaluatorIdentity,
    attestingRuntimeIdentity: input.runtimeIdentity,
    attestationMechanism: input.attestationMechanism,
    providerEventIdentity: null,
    result: result.result,
  });
  await input.store.appendReceipt(receipt, input.expectedLedgerVersion);
  return receipt;
}
