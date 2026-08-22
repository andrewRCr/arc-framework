/** Strict, storage-neutral Candidate applicability classification over D4 structural facts. */

import { z } from "zod";

import { canonicalDigest } from "../canonical/canonical-json.js";
import {
  DeliveryContributionEndpointsSchema,
  DeliveryContributionProofResultSchema,
} from "../delivery/contribution-proof.js";
import { isManagedPath } from "../kernel/canonical/managed-path.js";
import { CandidateLineageTargetSchema } from "./candidate-attestation.js";

const ObjectIdSchema = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u);
const DigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const ApplicabilityPathSchema = z.string().min(1).refine(isManagedPath, "must be a managed repository path");

export const MAX_CANDIDATE_APPLICABILITY_PATHS = 200;
export const MAX_CANDIDATE_APPLICABILITY_PATH_BYTES = 16_384;
export const CANDIDATE_APPLICABILITY_CHOICES = ["covered", "targeted-check", "changed"] as const;
export const CandidateApplicabilityChoicesSchema = z.tuple([
  z.literal("covered"),
  z.literal("targeted-check"),
  z.literal("changed"),
]);

const BoundedApplicabilityPathsSchema = z.array(ApplicabilityPathSchema)
  .min(1)
  .max(MAX_CANDIDATE_APPLICABILITY_PATHS)
  .superRefine((paths, context) => {
    const bytes = new TextEncoder().encode(paths.join("\0")).byteLength;
    if (bytes > MAX_CANDIDATE_APPLICABILITY_PATH_BYTES) {
      context.addIssue({ code: "custom", message: "path evidence exceeds the byte bound" });
    }
    let previous: string | undefined;
    const notStrictlyIncreasing = paths.some((path) => {
      const invalid = previous !== undefined && path <= previous;
      previous = path;
      return invalid;
    });
    if (new Set(paths).size !== paths.length || notStrictlyIncreasing) {
      context.addIssue({ code: "custom", message: "path evidence must be sorted and unique" });
    }
  });

export const CandidateApplicabilityRequestSchema = z.strictObject({
  candidateId: DigestSchema,
  baselineTarget: CandidateLineageTargetSchema,
  currentTarget: CandidateLineageTargetSchema,
  currentBase: ObjectIdSchema,
});
export type CandidateApplicabilityRequest = z.infer<typeof CandidateApplicabilityRequestSchema>;

export const CandidateApplicabilityTargetSchema = z.strictObject({
  revision: ObjectIdSchema,
  subjectDigest: DigestSchema,
});
export type CandidateApplicabilityTarget = z.infer<typeof CandidateApplicabilityTargetSchema>;

export const CandidateApplicabilityStructuralFactsSchema = z.strictObject({
  endpoints: DeliveryContributionEndpointsSchema,
  proof: DeliveryContributionProofResultSchema,
});
export type CandidateApplicabilityStructuralFacts = z.infer<
  typeof CandidateApplicabilityStructuralFactsSchema
>;

const ResultCommon = {
  schemaVersion: z.literal(1),
  mode: z.literal("candidate-applicability"),
  candidateId: DigestSchema,
  baselineTarget: CandidateApplicabilityTargetSchema,
  currentTarget: CandidateApplicabilityTargetSchema,
  currentBase: ObjectIdSchema,
};

const ObservedEndpointsSchema = z.strictObject({
  candidateHead: ObjectIdSchema,
  baseHead: ObjectIdSchema,
});

export const CandidateApplicabilityResultSchema = z.union([
  z.strictObject({
    ...ResultCommon,
    state: z.literal("applicable"),
    nextAction: z.literal("recognize-current"),
    proof: z.enum(["subject-equality", "tree-equality", "mechanical-reapply"]),
    projection: DeliveryContributionEndpointsSchema.nullable(),
    projectionDigest: DigestSchema,
    residualDigest: DigestSchema,
  }),
  z.strictObject({
    ...ResultCommon,
    state: z.literal("decision-required"),
    nextAction: z.literal("request-authority"),
    verdict: z.enum(["clean-divergence", "interaction"]),
    projection: DeliveryContributionEndpointsSchema,
    paths: BoundedApplicabilityPathsSchema,
    choices: CandidateApplicabilityChoicesSchema,
    selectionOfferText: z.string().min(1),
    recommendedActionText: z.string().min(1),
    projectionDigest: DigestSchema,
    residualDigest: DigestSchema,
  }),
  z.strictObject({
    ...ResultCommon,
    state: z.literal("rerun-checkpoint"),
    nextAction: z.literal("rerun-checkpoint"),
    reason: z.enum(["candidate-moved", "base-moved", "candidate-and-base-moved"]),
    observed: ObservedEndpointsSchema,
  }),
  z.strictObject({
    ...ResultCommon,
    state: z.literal("rerun-checkpoint"),
    nextAction: z.literal("rerun-checkpoint"),
    reason: z.literal("snapshot-invalidated"),
    observed: z.null(),
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
      "merge-base-missing",
      "merge-base-ambiguous",
      "residual-empty",
      "residual-unbounded",
    ]),
    detail: z.string().min(1),
  }),
]);
export type CandidateApplicabilityResult = z.infer<typeof CandidateApplicabilityResultSchema>;

function target(revision: string, subjectDigest: string): CandidateApplicabilityTarget {
  return CandidateApplicabilityTargetSchema.parse({ revision, subjectDigest });
}

function decisionPresentation(input: {
  request: CandidateApplicabilityRequest;
  verdict: "clean-divergence" | "interaction";
  paths: readonly string[];
  projectionDigest: string;
  residualDigest: string;
}): { selectionOfferText: string; recommendedActionText: string } {
  return {
    selectionOfferText: [
      `Candidate applicability is not mechanically decidable for ${input.request.candidateId}.`,
      `Prior target: ${input.request.baselineTarget.revision} `
        + `(${input.request.baselineTarget.subject.subjectDigest})`,
      `Current target: ${input.request.currentTarget.revision} `
        + `(${input.request.currentTarget.subject.subjectDigest})`,
      `Current base: ${input.request.currentBase}`,
      `Structural verdict: ${input.verdict}`,
      `Bounded residual (${String(input.paths.length)} paths): ${input.paths.join(", ")}`,
      `Projection digest: ${input.projectionDigest}`,
      `Residual digest: ${input.residualDigest}`,
      "Select one explicit authority outcome: covered | targeted-check | changed.",
    ].join("\n"),
    recommendedActionText:
      "Recommend `covered` only when existing settled review and verification already cover the bounded residual; "
      + "recommend `targeted-check` when a completed bounded check can settle it; otherwise recommend `changed`. "
      + "Record only the operator's explicit selection.",
  };
}

/** Compose the exact request context shared by every Candidate applicability result. */
export function candidateApplicabilityResultBase(request: CandidateApplicabilityRequest) {
  return {
    schemaVersion: 1 as const,
    mode: "candidate-applicability" as const,
    candidateId: request.candidateId,
    baselineTarget: target(request.baselineTarget.revision, request.baselineTarget.subject.subjectDigest),
    currentTarget: target(request.currentTarget.revision, request.currentTarget.subject.subjectDigest),
    currentBase: request.currentBase,
  };
}

/** Classify one exact Candidate projection from already-derived structural facts. */
export function classifyCandidateApplicability(
  input: CandidateApplicabilityRequest,
  facts: CandidateApplicabilityStructuralFacts | null,
): CandidateApplicabilityResult {
  const request = CandidateApplicabilityRequestSchema.parse(input);
  if (request.baselineTarget.subject.subjectDigest === request.currentTarget.subject.subjectDigest) {
    const digests = candidateApplicabilityDigests({
      request,
      projection: null,
      verdict: "subject-equality",
      paths: [],
    });
    return CandidateApplicabilityResultSchema.parse({
      ...candidateApplicabilityResultBase(request),
      state: "applicable",
      nextAction: "recognize-current",
      proof: "subject-equality",
      projection: null,
      ...digests,
    });
  }
  if (facts !== null) {
    const structural = CandidateApplicabilityStructuralFactsSchema.parse(facts);
    if (structural.proof.status === "accepted") {
      const digests = candidateApplicabilityDigests({
        request,
        projection: structural.endpoints,
        verdict: structural.proof.proof,
        paths: [],
      });
      return CandidateApplicabilityResultSchema.parse({
        ...candidateApplicabilityResultBase(request),
        state: "applicable",
        nextAction: "recognize-current",
        proof: structural.proof.proof,
        projection: structural.endpoints,
        ...digests,
      });
    }
    if (structural.proof.reason === "contribution-diverged"
      || structural.proof.reason === "contribution-conflicted") {
      const verdict = structural.proof.reason === "contribution-diverged"
        ? "clean-divergence" as const
        : "interaction" as const;
      const paths = structural.proof.paths;
      if (paths.length === 0) {
        return CandidateApplicabilityResultSchema.parse({
          ...candidateApplicabilityResultBase(request),
          state: "classification-unavailable",
          nextAction: "stop",
          reason: "residual-empty",
          detail: "D4 returned a non-mechanical result without path evidence.",
        });
      }
      const pathBytes = new TextEncoder().encode(paths.join("\0")).byteLength;
      if (paths.length > MAX_CANDIDATE_APPLICABILITY_PATHS
        || pathBytes > MAX_CANDIDATE_APPLICABILITY_PATH_BYTES) {
        return CandidateApplicabilityResultSchema.parse({
          ...candidateApplicabilityResultBase(request),
          state: "classification-unavailable",
          nextAction: "stop",
          reason: "residual-unbounded",
          detail: "D4 path evidence exceeds the Candidate applicability bound.",
        });
      }
      const bounded = BoundedApplicabilityPathsSchema.safeParse(paths);
      if (!bounded.success) {
        return CandidateApplicabilityResultSchema.parse({
          ...candidateApplicabilityResultBase(request),
          state: "classification-failed",
          nextAction: "stop",
          reason: "malformed-evidence",
          detail: bounded.error.issues.map(({ message }) => message).join("; "),
        });
      }
      const digests = candidateApplicabilityDigests({
        request,
        projection: structural.endpoints,
        verdict,
        paths: bounded.data,
      });
      const presentation = decisionPresentation({ request, verdict, paths: bounded.data, ...digests });
      return CandidateApplicabilityResultSchema.parse({
        ...candidateApplicabilityResultBase(request),
        state: "decision-required",
        nextAction: "request-authority",
        verdict,
        projection: structural.endpoints,
        paths: bounded.data,
        choices: CANDIDATE_APPLICABILITY_CHOICES,
        ...digests,
        ...presentation,
      });
    }
    if (structural.proof.reason === "merge-tree-write-tree-unsupported") {
      return CandidateApplicabilityResultSchema.parse({
        ...candidateApplicabilityResultBase(request),
        state: "classification-unsupported",
        nextAction: "upgrade",
        reason: structural.proof.reason,
      });
    }
    if (structural.proof.reason === "git-failure") {
      return CandidateApplicabilityResultSchema.parse({
        ...candidateApplicabilityResultBase(request),
        state: "classification-failed",
        nextAction: "stop",
        reason: "git-failure",
        detail: "D4 could not derive a valid structural contribution result.",
      });
    }
    return CandidateApplicabilityResultSchema.parse({
      ...candidateApplicabilityResultBase(request),
      state: "rerun-checkpoint",
      nextAction: "rerun-checkpoint",
      reason: "snapshot-invalidated",
      observed: null,
    });
  }
  return CandidateApplicabilityResultSchema.parse({
    ...candidateApplicabilityResultBase(request),
    state: "classification-failed",
    nextAction: "stop",
    reason: "malformed-evidence",
    detail: "Candidate applicability classification is not yet available.",
  });
}

/** Compute canonical exact-projection and bounded-residual digests for one classification. */
export function candidateApplicabilityDigests(input: {
  request: CandidateApplicabilityRequest;
  projection: z.infer<typeof DeliveryContributionEndpointsSchema> | null;
  verdict: string;
  paths: readonly string[];
}): { projectionDigest: string; residualDigest: string } {
  const projectionDigest = canonicalDigest({
    domain: "arc.candidate.applicability.projection/v1",
    candidateId: input.request.candidateId,
    baselineTarget: target(
      input.request.baselineTarget.revision,
      input.request.baselineTarget.subject.subjectDigest,
    ),
    currentTarget: target(
      input.request.currentTarget.revision,
      input.request.currentTarget.subject.subjectDigest,
    ),
    currentBase: input.request.currentBase,
    projection: input.projection,
  });
  return {
    projectionDigest,
    residualDigest: canonicalDigest({
      domain: "arc.candidate.applicability.residual/v1",
      projectionDigest,
      verdict: input.verdict,
      paths: [...input.paths],
    }),
  };
}
