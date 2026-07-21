/** Constructors for forward review-gate records and their exact semantic IDs. */

import {
  canonicalDigest,
  canonicalize,
  sortByCanonicalBytes,
} from "../../../lib/kernel/index.js";

import {
  ReviewRequestIdPreimageSchema,
  ReviewRequestInputSchema,
  ReviewRequestV2Schema,
  ReviewReceiptCreationInputSchema,
  ReviewReceiptV2Schema,
  ReviewRequirementCreationInputSchema,
  ReviewRequirementIdPreimageSchema,
  ReviewRequirementV2Schema,
  ReviewTargetIdPreimageSchema,
  ReviewTargetInputSchema,
  ReviewTargetSchema,
  type ReviewRequestInput,
  type ReviewRequestV2,
  type ReviewReceiptCreationInput,
  type ReviewReceiptV2,
  type ReviewRequirementCreationInput,
  type ReviewRequirementV2,
  type ReviewTarget,
  type ReviewTargetInput,
} from "./gate-contract-v2-schema.js";
import { computeReviewPolicyVersion } from "./identity.js";

function targetPreimage(target: ReviewTargetInput) {
  return ReviewTargetIdPreimageSchema.parse({
    domain: "arc.review-gate.target-id/v2",
    ...target,
  });
}

function requestPreimage(request: ReviewRequestInput) {
  return ReviewRequestIdPreimageSchema.parse({
    domain: "arc.review-gate.request-id/v2",
    ...request,
  });
}

function assertRequestBinding(target: ReviewTarget, request: ReviewRequestInput): void {
  if (request.repositoryId !== target.repositoryId) {
    throw new Error("review request repository does not match its target");
  }
  if (request.targetId !== target.targetId) {
    throw new Error("review request target identity does not match its target");
  }
}

function normalizedSet<T>(values: readonly T[]): T[] {
  const unique = new Map(values.map((value) => [canonicalize(value), value]));
  return sortByCanonicalBytes([...unique.values()]);
}

function requirementPreimage(requirement: Omit<ReviewRequirementV2, "requirementId">) {
  return ReviewRequirementIdPreimageSchema.parse({
    domain: "arc.review-gate.requirement-id/v2",
    ...requirement,
  });
}

function policyVersionFor(requirement: {
  obligation: "recommended" | "required";
  rubricVersion: string;
  rubricDigest: string;
  retrigger: ReviewRequirementV2["retrigger"];
  acceptableSources: ReviewRequirementV2["acceptableSources"];
  initialAdmission: ReviewRequirementV2["initialAdmission"];
}): string {
  return computeReviewPolicyVersion({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    kind: "independent-analysis",
    obligation: requirement.obligation,
    rubricVersion: requirement.rubricVersion,
    rubricDigest: requirement.rubricDigest,
    retrigger: requirement.retrigger,
    count: 1,
    acceptableSources: requirement.acceptableSources,
    initialAdmission: requirement.initialAdmission,
  });
}

/** Derive a review target only from its registered domain-separated preimage. */
export function createReviewTarget(input: ReviewTargetInput): ReviewTarget {
  const target = ReviewTargetInputSchema.parse(input);
  return validateReviewTarget({
    ...target,
    targetId: canonicalDigest(targetPreimage(target)),
  });
}

/** Validate target structure and recompute its exact semantic identity. */
export function validateReviewTarget(input: unknown): ReviewTarget {
  const target = ReviewTargetSchema.parse(input);
  const { targetId, ...fields } = target;
  if (canonicalDigest(targetPreimage(fields)) !== targetId) {
    throw new Error("review target ID does not match its preimage");
  }
  return target;
}

/** Derive one actor-separated request bound to one exact target and carrier. */
export function createReviewRequest(
  targetInput: ReviewTarget,
  input: ReviewRequestInput,
): ReviewRequestV2 {
  const target = ReviewTargetSchema.parse(targetInput);
  const request = ReviewRequestInputSchema.parse(input);
  assertRequestBinding(target, request);
  return validateReviewRequest(target, {
    ...request,
    requestId: canonicalDigest(requestPreimage(request)),
  });
}

/** Validate request structure, target binding, and exact semantic identity. */
export function validateReviewRequest(targetInput: unknown, input: unknown): ReviewRequestV2 {
  const target = validateReviewTarget(targetInput);
  const request = ReviewRequestV2Schema.parse(input);
  const { requestId, ...fields } = request;
  assertRequestBinding(target, fields);
  if (canonicalDigest(requestPreimage(fields)) !== requestId) {
    throw new Error("review request ID does not match its preimage");
  }
  return request;
}

/** Bind one non-exempt logical projection into a normalized exact-target requirement. */
export function createReviewRequirement(
  input: ReviewRequirementCreationInput,
): ReviewRequirementV2 | null {
  const creation = ReviewRequirementCreationInputSchema.parse(input);
  const target = validateReviewTarget(creation.target);
  if (creation.projection.obligation === "exempt") return null;
  const policyFields = {
    obligation: creation.projection.obligation,
    rubricVersion: creation.projection.rubricVersion,
    rubricDigest: creation.projection.rubricDigest,
    retrigger: creation.projection.retrigger,
    acceptableSources: normalizedSet(creation.acceptableSources),
    initialAdmission: creation.initialAdmission,
  };
  const fields = {
    schemaVersion: 2 as const,
    semanticsVersion: "review-gate/v2" as const,
    targetId: target.targetId,
    kind: "independent-analysis" as const,
    obligation: policyFields.obligation,
    reasons: normalizedSet(creation.projection.reasons),
    rubricVersion: policyFields.rubricVersion,
    rubricDigest: policyFields.rubricDigest,
    retrigger: policyFields.retrigger,
    count: 1 as const,
    acceptableSources: policyFields.acceptableSources,
    initialAdmission: policyFields.initialAdmission,
    policyVersion: policyVersionFor(policyFields),
  };
  return validateReviewRequirement(target, {
    ...fields,
    requirementId: canonicalDigest(requirementPreimage(fields)),
  });
}

/** Validate requirement structure, target binding, normalization, and semantic identity. */
export function validateReviewRequirement(targetInput: unknown, input: unknown): ReviewRequirementV2 {
  const target = validateReviewTarget(targetInput);
  const requirement = ReviewRequirementV2Schema.parse(input);
  if (requirement.targetId !== target.targetId) {
    throw new Error("review requirement target identity does not match its target");
  }
  const { requirementId, ...fields } = requirement;
  if (policyVersionFor(fields) !== requirement.policyVersion) {
    throw new Error("review requirement policy version does not match its semantic inputs");
  }
  if (canonicalDigest(requirementPreimage(fields)) !== requirementId) {
    throw new Error("review requirement ID does not match its preimage");
  }
  return requirement;
}

/** Create one receipt bound to an exact request, target, rubric, applicability proof, and runtime. */
export function createReviewReceipt(input: ReviewReceiptCreationInput): ReviewReceiptV2 {
  const creation = ReviewReceiptCreationInputSchema.parse(input);
  return validateReviewReceipt(creation.target, creation.requirement, creation.request, {
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    requestId: creation.request.requestId,
    targetId: creation.target.targetId,
    requirementId: creation.requirement.requirementId,
    applicabilityId: creation.applicabilityId,
    reviewRunId: creation.reviewRunId,
    evaluatorIdentity: creation.evaluatorIdentity,
    attestingRuntimeIdentity: creation.attestingRuntimeIdentity,
    attestationMechanism: creation.attestationMechanism,
    providerEventIdentity: creation.providerEventIdentity,
    rubricVersion: creation.requirement.rubricVersion,
    rubricDigest: creation.requirement.rubricDigest,
    result: creation.result,
    findings: creation.findings,
  });
}

/** Validate a receipt's exact request, requirement, target, rubric, and evaluator bindings. */
export function validateReviewReceipt(
  targetInput: unknown,
  requirementInput: unknown,
  requestInput: unknown,
  receiptInput: unknown,
): ReviewReceiptV2 {
  const receipt = ReviewReceiptV2Schema.parse(receiptInput);
  const target = validateReviewTarget(targetInput);
  const requirement = validateReviewRequirement(target, requirementInput);
  const request = validateReviewRequest(target, requestInput);
  if (request.requirementId !== requirement.requirementId) {
    throw new Error("review receipt request does not match its requirement");
  }
  if (receipt.requestId !== request.requestId
    || receipt.targetId !== target.targetId
    || receipt.requirementId !== requirement.requirementId) {
    throw new Error("review receipt identities do not match its request, target, and requirement");
  }
  if (receipt.evaluatorIdentity !== request.evaluatorIdentity) {
    throw new Error("review receipt evaluator does not match its request");
  }
  if (receipt.rubricVersion !== requirement.rubricVersion
    || receipt.rubricDigest !== requirement.rubricDigest) {
    throw new Error("review receipt rubric does not match its requirement");
  }
  return receipt;
}
