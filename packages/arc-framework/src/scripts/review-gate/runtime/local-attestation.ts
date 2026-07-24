/** Exact-head attestation entrypoint for normalized local standard-review results. */

import {
  createReviewReceipt,
  validateReviewRequest,
  validateReviewRequirement,
  validateReviewTarget,
} from "../core/gate-contract-v2.js";
import {
  ReviewCanonicalDigestSchema,
  type ReviewReceiptV2,
  type ReviewRequirementV2,
  type ReviewTarget,
} from "../core/gate-contract-v2-schema.js";
import type { LocalChangeSetCarrierContract } from "../core/local-carrier.js";
import {
  NormalizedLocalReviewResultSchema,
  type NormalizedLocalReviewResult,
} from "../core/local-review-result.js";
import type { ForwardReviewReceiptStore } from "../core/ports.js";

export {
  NormalizedLocalReviewResultSchema,
  type NormalizedLocalReviewResult,
} from "../core/local-review-result.js";

/** Exact immutable bindings required to construct one local advisory receipt. */
export interface LocalReviewReceiptInput {
  target: ReviewTarget;
  requirement: ReviewRequirementV2;
  carrier: LocalChangeSetCarrierContract;
  result: NormalizedLocalReviewResult;
  runtimeIdentity: string;
  attestationMechanism: string;
  sourceDigest: string;
  guidanceDigest: string;
}

/** Dependencies and exact bindings required to attest one local terminal result. */
export interface LocalReviewAttestationInput extends LocalReviewReceiptInput {
  currentTarget: () => Promise<unknown>;
  store: ForwardReviewReceiptStore;
  expectedLedgerVersion: number;
}

/** Stable caller-input or durable-binding failure while composing a local receipt. */
export class LocalReviewReceiptError extends Error {
  constructor(
    readonly code: "invalid-input" | "corrupt-state",
    message: string,
  ) {
    super(message);
    this.name = "LocalReviewReceiptError";
  }
}

/** Revalidate one complete local result into its exact advisory receipt. */
export function createLocalReviewReceipt(input: LocalReviewReceiptInput): ReviewReceiptV2 {
  const target = validateReviewTarget(input.target);
  const requirement = validateReviewRequirement(target, input.requirement);
  const request = validateReviewRequest(target, input.carrier.request);
  if (request.requirementId !== requirement.requirementId) {
    throw new LocalReviewReceiptError("corrupt-state", "local review request does not match its requirement");
  }
  if (request.carrier.kind !== "local-change-set"
    || request.carrier.adapterId !== "local") {
    throw new LocalReviewReceiptError("corrupt-state", "local review request does not use the exact local carrier");
  }
  const result = NormalizedLocalReviewResultSchema.parse(input.result);
  if (result.status !== "complete" || result.result === null) {
    throw new LocalReviewReceiptError("invalid-input", "local review result is not attestable terminal evidence");
  }
  if (result.repositoryId !== target.repositoryId
    || result.targetId !== target.targetId
    || result.headSha !== target.headSha
    || result.headTree !== target.headTree) {
    throw new LocalReviewReceiptError("invalid-input", "local review result does not cover the exact target");
  }
  if (result.rubricVersion !== requirement.rubricVersion
    || result.rubricDigest !== requirement.rubricDigest) {
    throw new LocalReviewReceiptError("invalid-input", "local review result does not match the required rubric");
  }
  if (result.sourceDigest !== ReviewCanonicalDigestSchema.parse(input.sourceDigest)) {
    throw new LocalReviewReceiptError("invalid-input", "local review result source digest mismatch");
  }
  if (result.guidanceDigest !== ReviewCanonicalDigestSchema.parse(input.guidanceDigest)) {
    throw new LocalReviewReceiptError("invalid-input", "local review result guidance digest mismatch");
  }
  if (result.evaluatorIdentity !== request.evaluatorIdentity
    || input.carrier.attestation.evaluatorIdentity !== request.evaluatorIdentity) {
    throw new LocalReviewReceiptError("invalid-input", "local review result evaluator identity mismatch");
  }
  if (request.authorIdentity === result.evaluatorIdentity) {
    throw new LocalReviewReceiptError("corrupt-state", "local review author cannot attest self-review");
  }
  if (input.runtimeIdentity !== input.carrier.attestation.runtimeIdentity) {
    throw new LocalReviewReceiptError("corrupt-state", "local review attesting runtime identity mismatch");
  }
  if (input.attestationMechanism !== input.carrier.attestation.mechanism) {
    throw new LocalReviewReceiptError("corrupt-state", "local review attestation mechanism mismatch");
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
    findings: result.findings,
  });
  return receipt;
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
  const receipt = createLocalReviewReceipt(input);
  await input.store.appendReceipt(receipt, input.expectedLedgerVersion);
  return receipt;
}
