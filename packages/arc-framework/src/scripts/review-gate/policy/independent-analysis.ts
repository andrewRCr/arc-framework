/** Canonical identity for the independent-analysis delivery standard. */

import { canonicalDigest, canonicalize } from "../../../lib/kernel/index.js";

import {
  IndependentAnalysisContractSchema,
  IndependentAnalysisRubricDigestPreimageSchema,
  ReviewRubricIdentitySchema,
  type IndependentAnalysisContract,
  type ReviewRubricIdentity,
} from "./independent-analysis-schema.js";

/** Typed baseline whose semantic fields determine the satisfying review standard. */
export const INDEPENDENT_ANALYSIS_BASELINE_CONTRACT = Object.freeze(IndependentAnalysisContractSchema.parse({
  version: "independent-analysis/v1",
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
export function deriveIndependentAnalysisRubricIdentity(input: unknown): ReviewRubricIdentity {
  const contract = IndependentAnalysisContractSchema.parse(input);
  if (contract.version === INDEPENDENT_ANALYSIS_BASELINE_CONTRACT.version
    && canonicalize(identityFields(contract))
      !== canonicalize(identityFields(INDEPENDENT_ANALYSIS_BASELINE_CONTRACT))) {
    throw new Error("independent-analysis semantic changes require a version change");
  }
  const preimage = IndependentAnalysisRubricDigestPreimageSchema.parse({
    domain: "arc.independent-analysis.rubric-digest/v1",
    ...contract,
  });
  return ReviewRubricIdentitySchema.parse({
    version: contract.version,
    digest: canonicalDigest(preimage),
  });
}

function identityFields(contract: IndependentAnalysisContract): Omit<IndependentAnalysisContract, "version"> {
  return {
    coverage: contract.coverage,
    evaluatorBoundary: contract.evaluatorBoundary,
    rubric: contract.rubric,
    findingFloor: contract.findingFloor,
    cleanRule: contract.cleanRule,
  };
}

/** Require a semantic contract change to advance the explicit standard version. */
export function validateIndependentAnalysisContractEvolution(
  previousInput: unknown,
  nextInput: unknown,
): ReviewRubricIdentity {
  const previous = IndependentAnalysisContractSchema.parse(previousInput);
  const next = IndependentAnalysisContractSchema.parse(nextInput);
  if (canonicalize(identityFields(previous)) !== canonicalize(identityFields(next))
    && previous.version === next.version) {
    throw new Error("independent-analysis semantic changes require a version change");
  }
  return deriveIndependentAnalysisRubricIdentity(next);
}

/** Canonical identity consumed by obligation, requirement, and carrier projections. */
export const INDEPENDENT_ANALYSIS_RUBRIC_IDENTITY = Object.freeze(
  deriveIndependentAnalysisRubricIdentity(INDEPENDENT_ANALYSIS_BASELINE_CONTRACT),
);
