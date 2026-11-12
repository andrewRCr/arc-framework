/** Storage-neutral review applicability projected from D4 contribution facts. */

import { z } from "zod";

import {
  DeliveryContributionEndpointsSchema,
  DeliveryContributionProofResultSchema,
  type DeliveryContributionEndpoints,
} from "../../../lib/delivery/contribution-proof.js";
import {
  BoundedEvidenceResidualSchema,
  MAX_EVIDENCE_APPLICABILITY_PATH_BYTES,
  MAX_EVIDENCE_APPLICABILITY_PATHS,
} from "../../../lib/evidence-applicability/schema.js";
import {
  boundApplicabilityResidual,
  type ApplicabilityResidual,
} from "../../../lib/evidence-applicability/applicability-residual.js";
import {
  composeEvidenceDelta,
  EvidenceApplicabilityResultSchema,
  reduceEvidenceApplicability,
} from "../../../lib/evidence-applicability/index.js";
import { canonicalDigest, CanonicalDigestSchema, type CanonicalDigest } from "../../../lib/kernel/index.js";
import {
  ReviewContributionApplicabilitySelectorSchema,
  type ReviewContributionApplicabilitySelector,
} from "../../../lib/work-unit/review-applicability-selector.js";

export {
  ReviewContributionApplicabilitySelectorSchema,
  type ReviewContributionApplicabilitySelector,
} from "../../../lib/work-unit/review-applicability-selector.js";

const ObjectIdSchema = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u);
const DigestSchema = CanonicalDigestSchema;

export const MAX_REVIEW_APPLICABILITY_PATHS = MAX_EVIDENCE_APPLICABILITY_PATHS;
export const MAX_REVIEW_APPLICABILITY_PATH_BYTES = MAX_EVIDENCE_APPLICABILITY_PATH_BYTES;

export const ReviewContributionStructuralFactsSchema = z.strictObject({
  endpoints: DeliveryContributionEndpointsSchema,
  proof: DeliveryContributionProofResultSchema,
});
export type ReviewContributionStructuralFacts = z.infer<typeof ReviewContributionStructuralFactsSchema>;

const ResultCommon = {
  schemaVersion: z.literal(1),
  mode: z.literal("review-contribution-applicability"),
  selector: ReviewContributionApplicabilitySelectorSchema,
  baseMoved: z.boolean(),
  contributionChanged: z.boolean().nullable(),
};

export const ReviewContributionApplicabilityResultSchema = z.union([
  z.strictObject({
    ...ResultCommon,
    state: z.literal("applicable"),
    nextAction: z.literal("recognize-prior-review"),
    proof: z.enum(["head-unchanged", "tree-equality", "mechanical-reapply"]),
    projection: DeliveryContributionEndpointsSchema.nullable(),
    paths: z.tuple([]),
    projectionDigest: DigestSchema,
    residualDigest: DigestSchema,
  }),
  z.strictObject({
    ...ResultCommon,
    state: z.literal("decision-required"),
    nextAction: z.literal("request-authority"),
    verdict: z.enum(["clean-divergence", "interaction"]),
    applicability: EvidenceApplicabilityResultSchema,
    projection: DeliveryContributionEndpointsSchema,
    paths: BoundedEvidenceResidualSchema,
    projectionDigest: DigestSchema,
    residualDigest: DigestSchema,
  }),
  z.strictObject({
    ...ResultCommon,
    state: z.literal("rerun-checkpoint"),
    nextAction: z.literal("rerun-checkpoint"),
    reason: z.enum(["head-moved", "base-moved", "head-and-base-moved", "snapshot-invalidated"]),
    observed: z.strictObject({ head: ObjectIdSchema, base: ObjectIdSchema }).nullable(),
  }),
  z.strictObject({
    ...ResultCommon,
    state: z.literal("classification-failed"),
    nextAction: z.literal("stop"),
    reason: z.enum(["git-failure", "malformed-evidence"]),
    detail: z.string().min(1),
  }),
  z.strictObject({
    ...ResultCommon,
    state: z.literal("classification-unsupported"),
    nextAction: z.literal("upgrade"),
    reason: z.literal("merge-tree-write-tree-unsupported"),
  }),
  z.strictObject({
    ...ResultCommon,
    state: z.literal("classification-unavailable"),
    nextAction: z.literal("stop"),
    reason: z.enum([
      "projection-evidence-missing",
      "merge-base-missing",
      "merge-base-ambiguous",
      "residual-empty",
      "residual-unbounded",
    ]),
    detail: z.string().min(1),
  }),
]);
export type ReviewContributionApplicabilityResult = z.infer<
  typeof ReviewContributionApplicabilityResultSchema
>;

/** Compose the exact selector context shared by every review applicability result. */
export function reviewContributionApplicabilityResultBase(
  selector: ReviewContributionApplicabilitySelector,
) {
  return {
    schemaVersion: 1 as const,
    mode: "review-contribution-applicability" as const,
    selector,
    baseMoved: selector.priorBase !== selector.currentBase,
  };
}

/** Canonically bind the full selector, D4 projection, and residual. */
export function reviewContributionApplicabilityDigests(input: {
  selector: ReviewContributionApplicabilitySelector;
  projection: DeliveryContributionEndpoints | null;
  verdict: string;
  paths: readonly string[];
}): { projectionDigest: CanonicalDigest; residualDigest: CanonicalDigest } {
  const selector = ReviewContributionApplicabilitySelectorSchema.parse(input.selector);
  const projectionDigest = canonicalDigest({
    domain: "arc.review-gate.contribution-applicability.projection/v1",
    selector,
    projection: input.projection,
  });
  return {
    projectionDigest,
    residualDigest: canonicalDigest({
      domain: "arc.review-gate.contribution-applicability.residual/v1",
      projectionDigest,
      verdict: input.verdict,
      paths: [...input.paths],
    }),
  };
}

/** State a residual the applicability bounds refused, in review's own terms. */
function residualRefusal(residual: Exclude<ApplicabilityResidual, { status: "bounded" }>) {
  switch (residual.status) {
    case "empty":
      return {
        state: "classification-unavailable",
        nextAction: "stop",
        reason: "residual-empty",
        detail: "D4 returned a non-mechanical result without path evidence.",
      } as const;
    case "unbounded":
      return {
        state: "classification-unavailable",
        nextAction: "stop",
        reason: "residual-unbounded",
        detail: "D4 path evidence exceeds the review applicability bound.",
      } as const;
    case "malformed":
      return {
        state: "classification-failed",
        nextAction: "stop",
        reason: "malformed-evidence",
        detail: residual.issues,
      } as const;
  }
}

/** Classify one exact prior review against D4-derived contribution facts. */
export function classifyReviewContributionApplicability(
  input: ReviewContributionApplicabilitySelector,
  factsInput: ReviewContributionStructuralFacts | null,
): ReviewContributionApplicabilityResult {
  const selector = ReviewContributionApplicabilitySelectorSchema.parse(input);
  const base = reviewContributionApplicabilityResultBase(selector);
  if (selector.priorHead === selector.currentHead
    && selector.priorBase === selector.currentBase) {
    const digests = reviewContributionApplicabilityDigests({
      selector,
      projection: null,
      verdict: "head-unchanged",
      paths: [],
    });
    return ReviewContributionApplicabilityResultSchema.parse({
      ...base,
      state: "applicable",
      nextAction: "recognize-prior-review",
      proof: "head-unchanged",
      contributionChanged: false,
      projection: null,
      paths: [],
      ...digests,
    });
  }
  if (factsInput === null) {
    return ReviewContributionApplicabilityResultSchema.parse({
      ...base,
      state: "classification-unavailable",
      nextAction: "stop",
      reason: "projection-evidence-missing",
      detail: "No complete D4 contribution projection is available.",
      contributionChanged: null,
    });
  }
  const facts = ReviewContributionStructuralFactsSchema.parse(factsInput);
  if (facts.proof.status === "accepted") {
    const digests = reviewContributionApplicabilityDigests({
      selector,
      projection: facts.endpoints,
      verdict: facts.proof.proof,
      paths: [],
    });
    return ReviewContributionApplicabilityResultSchema.parse({
      ...base,
      state: "applicable",
      nextAction: "recognize-prior-review",
      proof: facts.proof.proof,
      contributionChanged: false,
      projection: facts.endpoints,
      paths: [],
      ...digests,
    });
  }
  if (facts.proof.reason === "contribution-diverged"
    || facts.proof.reason === "contribution-conflicted") {
    const residual = boundApplicabilityResidual(facts.proof.paths);
    if (residual.status !== "bounded") {
      return ReviewContributionApplicabilityResultSchema.parse({
        ...base,
        ...residualRefusal(residual),
        contributionChanged: null,
      });
    }
    const verdict = facts.proof.reason === "contribution-diverged"
      ? "clean-divergence" as const
      : "interaction" as const;
    const digests = reviewContributionApplicabilityDigests({
      selector,
      projection: facts.endpoints,
      verdict,
      paths: residual.paths,
    });
    const applicability = reduceEvidenceApplicability(composeEvidenceDelta({
      cause: "member-rewrite",
      endpoints: facts.endpoints,
      proof: { ...facts.proof, paths: residual.paths },
    }), "review-clearance");
    return ReviewContributionApplicabilityResultSchema.parse({
      ...base,
      state: "decision-required",
      nextAction: "request-authority",
      verdict,
      applicability,
      projection: facts.endpoints,
      paths: residual.paths,
      contributionChanged: true,
      ...digests,
    });
  }
  if (facts.proof.reason === "merge-tree-write-tree-unsupported") {
    return ReviewContributionApplicabilityResultSchema.parse({
      ...base,
      state: "classification-unsupported",
      nextAction: "upgrade",
      reason: facts.proof.reason,
      contributionChanged: null,
    });
  }
  if (facts.proof.reason === "git-failure") {
    return ReviewContributionApplicabilityResultSchema.parse({
      ...base,
      state: "classification-failed",
      nextAction: "stop",
      reason: "git-failure",
      detail: "D4 could not derive a valid structural contribution result.",
      contributionChanged: null,
    });
  }
  return ReviewContributionApplicabilityResultSchema.parse({
    ...base,
    state: "rerun-checkpoint",
    nextAction: "rerun-checkpoint",
    reason: "snapshot-invalidated",
    observed: null,
    contributionChanged: null,
  });
}
