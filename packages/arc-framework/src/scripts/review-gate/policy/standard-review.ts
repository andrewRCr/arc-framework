/** Canonical identity for the standard-review delivery standard. */

import { canonicalDigest, canonicalize } from "../../../lib/kernel/index.js";

import {
  StandardReviewContractSchema,
  StandardReviewRubricDigestPreimageSchema,
  ReviewRubricIdentitySchema,
  type StandardReviewContract,
  type ReviewRubricIdentity,
} from "./standard-review-schema.js";

/** Typed baseline whose semantic fields determine the satisfying review standard. */
export const STANDARD_REVIEW_BASELINE_CONTRACT = Object.freeze(StandardReviewContractSchema.parse({
  version: "standard-review/v1",
  coverage: {
    scope: "complete-requested-change-set",
    targetBinding: "exact-review-target",
  },
  evaluatorBoundary: {
    actorSeparation: "non-author",
    contextSource: "source-and-governing-project-context",
    excludedContext: [
      "author-conclusions",
      "preferred-fixes",
      "self-verification-claims",
      "suspected-weak-spots",
    ],
  },
  rubric: {
    version: "implementation-audit/v1",
    dimensions: [
      "coherence-and-maintainability",
      "correctness-and-failure-behavior",
      "intent-and-scope",
      "trust-boundaries-and-compatibility",
      "verification-quality-and-missing-cases",
    ],
  },
  findingFloor: [
    "actionable-materiality",
    "rubric-failure-explanation",
    "source-grounded-evidence",
    "stable-locus",
  ],
  cleanRule: {
    requiredCoverage: "complete-requested-change-set",
    requiredDimensionTreatment: "all-rubric-dimensions-considered",
    nonCleanResults: ["ambiguous", "failed", "partial", "unavailable"],
  },
}));

/** Derive the standard version and rubric digest solely from its registered semantic preimage. */
export function deriveStandardReviewRubricIdentity(input: unknown): ReviewRubricIdentity {
  const contract = StandardReviewContractSchema.parse(input);
  if (contract.version === STANDARD_REVIEW_BASELINE_CONTRACT.version
    && canonicalize(identityFields(contract))
      !== canonicalize(identityFields(STANDARD_REVIEW_BASELINE_CONTRACT))) {
    throw new Error("standard-review semantic changes require a version change");
  }
  const preimage = StandardReviewRubricDigestPreimageSchema.parse({
    domain: "arc.standard-review.rubric-digest/v1",
    ...contract,
  });
  return ReviewRubricIdentitySchema.parse({
    version: contract.version,
    digest: canonicalDigest(preimage),
  });
}

function identityFields(contract: StandardReviewContract): Omit<StandardReviewContract, "version"> {
  return {
    coverage: contract.coverage,
    evaluatorBoundary: contract.evaluatorBoundary,
    rubric: contract.rubric,
    findingFloor: contract.findingFloor,
    cleanRule: contract.cleanRule,
  };
}

/** Require a semantic contract change to advance the explicit standard version. */
export function validateStandardReviewContractEvolution(
  previousInput: unknown,
  nextInput: unknown,
): ReviewRubricIdentity {
  const previous = StandardReviewContractSchema.parse(previousInput);
  const next = StandardReviewContractSchema.parse(nextInput);
  if (canonicalize(identityFields(previous)) !== canonicalize(identityFields(next))
    && previous.version === next.version) {
    throw new Error("standard-review semantic changes require a version change");
  }
  return deriveStandardReviewRubricIdentity(next);
}

/** Canonical identity consumed by obligation, requirement, and carrier projections. */
export const STANDARD_REVIEW_RUBRIC_IDENTITY = Object.freeze(
  deriveStandardReviewRubricIdentity(STANDARD_REVIEW_BASELINE_CONTRACT),
);
