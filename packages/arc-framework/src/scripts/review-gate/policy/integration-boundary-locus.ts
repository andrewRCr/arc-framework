/** Typed operational loci at the Candidate-to-publication boundary. */

import { z } from "zod";

import { canonicalDigest } from "../../../lib/canonical/canonical-json.js";
import { SlugSchema } from "../../../lib/kernel/schema/slug.js";
import { GitObjectIdSchema } from "../core/gate-contract-v2-schema.js";
import { ReviewResolveEnvelopeSchema } from "./review-policy-driver.js";
import { StandardReviewObligationProjectionSchema } from "./standard-review-projection-schema.js";

const CandidateIdSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const CandidateSubjectDigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);

const ActionFields = {
  command: z.string().trim().min(1),
  interactionText: z.string().trim().min(1),
};
export const RunSelfReviewActionSchema = z.strictObject({
  kind: z.literal("run-self-review"),
  ...ActionFields,
});
export const ContinuePrePublicationActionSchema = z.strictObject({
  kind: z.literal("continue-pre-publication-review"),
  ...ActionFields,
});
export const RunConvergenceVerificationActionSchema = z.strictObject({
  kind: z.literal("run-convergence-verification"),
  ...ActionFields,
});
export const PublishCandidateActionSchema = z.strictObject({
  kind: z.literal("publish-candidate"),
  ...ActionFields,
});
export const ContinuePublicationActionSchema = z.strictObject({
  kind: z.literal("continue-publication"),
  ...ActionFields,
});

export const IntegrationBoundaryNextActionSchema = z.discriminatedUnion("kind", [
  RunSelfReviewActionSchema,
  ContinuePrePublicationActionSchema,
  RunConvergenceVerificationActionSchema,
  PublishCandidateActionSchema,
  ContinuePublicationActionSchema,
]);
export type IntegrationBoundaryNextAction = z.infer<typeof IntegrationBoundaryNextActionSchema>;

export const StandardReviewReservationV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  semanticsVersion: z.literal("standard-review-reservation/v1"),
  reservationId: CandidateIdSchema,
  sources: z.array(z.string().trim().min(1)).min(1),
  target: z.strictObject({
    repository: z.string().trim().min(1),
    headSha: GitObjectIdSchema,
  }),
  obligation: StandardReviewObligationProjectionSchema,
});
export type StandardReviewReservationV1 = z.infer<typeof StandardReviewReservationV1Schema>;

const BoundaryCommonShape = {
  schemaVersion: z.literal(1),
  mode: z.enum(["pre-publication-review", "integration-boundary"]),
  workUnit: SlugSchema,
  candidateId: CandidateIdSchema,
  /**
   * The reviewable subject the boundary was written for — what submission authorizes against.
   *
   * The reviewable subject, not the head: operational-only writes advance the head without changing
   * what review covered, and a boundary invalidated by its own ceremony's churn would send the
   * operator back through a review whose evidence never went stale.
   */
  candidateSubjectDigest: CandidateSubjectDigestSchema.nullable().default(null),
};

const CandidateReviewBoundaryFields = {
  ...BoundaryCommonShape,
  locus: z.literal("candidate-review-pending"),
};
export const CandidateSelfReviewBoundarySchema = z.strictObject({
  ...CandidateReviewBoundaryFields,
  nextAction: RunSelfReviewActionSchema,
  policy: z.null(),
  reservation: z.null(),
});
export const CandidatePolicyReviewBoundarySchema = z.strictObject({
  ...CandidateReviewBoundaryFields,
  nextAction: ContinuePrePublicationActionSchema,
  policy: ReviewResolveEnvelopeSchema,
  reservation: z.null(),
});
export const CandidateReviewResumeBoundarySchema = z.strictObject({
  ...CandidateReviewBoundaryFields,
  nextAction: ContinuePrePublicationActionSchema,
  policy: z.null(),
  reservation: StandardReviewReservationV1Schema.nullable(),
});
export const CandidateReviewBoundarySchema = z.union([
  CandidateSelfReviewBoundarySchema,
  CandidatePolicyReviewBoundarySchema,
  CandidateReviewResumeBoundarySchema,
]);
export const CandidateFixBoundarySchema = z.strictObject({
  ...BoundaryCommonShape,
  locus: z.literal("candidate-fix-pending"),
  nextAction: ContinuePrePublicationActionSchema,
  policy: ReviewResolveEnvelopeSchema,
  reservation: z.null(),
});
export const CandidateConvergenceBoundarySchema = z.strictObject({
  ...BoundaryCommonShape,
  locus: z.literal("candidate-convergence-verification-pending"),
  nextAction: RunConvergenceVerificationActionSchema,
  policy: z.null(),
  reservation: StandardReviewReservationV1Schema.nullable(),
});
export const CandidatePublishReadyBoundarySchema = z.strictObject({
  ...BoundaryCommonShape,
  locus: z.literal("candidate-publish-ready"),
  nextAction: PublishCandidateActionSchema,
  policy: z.null(),
  reservation: StandardReviewReservationV1Schema.nullable(),
});
export const PublicationPendingBoundarySchema = z.strictObject({
  ...BoundaryCommonShape,
  mode: z.literal("integration-boundary"),
  locus: z.literal("publication-pending"),
  nextAction: ContinuePublicationActionSchema,
  policy: z.null(),
  reservation: StandardReviewReservationV1Schema.nullable(),
});
export const HostedReviewPendingBoundarySchema = z.strictObject({
  ...BoundaryCommonShape,
  mode: z.literal("integration-boundary"),
  locus: z.literal("hosted-review-pending"),
  nextAction: ContinuePrePublicationActionSchema,
  policy: z.null(),
  reservation: StandardReviewReservationV1Schema,
});

export const IntegrationBoundaryLocusSchema = z.union([
  CandidateReviewBoundarySchema,
  CandidateFixBoundarySchema,
  CandidateConvergenceBoundarySchema,
  CandidatePublishReadyBoundarySchema,
  PublicationPendingBoundarySchema,
  HostedReviewPendingBoundarySchema,
]);
export type IntegrationBoundaryLocus = z.infer<typeof IntegrationBoundaryLocusSchema>;

/** Parse one structural integration boundary. */
export function parseIntegrationBoundaryLocus(input: unknown): IntegrationBoundaryLocus {
  return IntegrationBoundaryLocusSchema.parse(input);
}

const PublicationBoundaryInputSchema = z.strictObject({
  workUnit: SlugSchema,
  branch: z.string().trim().min(1),
  candidateId: CandidateIdSchema,
  candidateSubjectDigest: CandidateSubjectDigestSchema.nullable().default(null),
  reservation: StandardReviewReservationV1Schema.nullable(),
  changeRequest: z.strictObject({
    repository: z.string().trim().min(1),
    pullRequest: z.number().int().positive(),
  }).nullable(),
});

/** Project the conservative exact Candidate entry point before review evidence is reduced. */
export function projectCandidateReviewBoundary(input: {
  workUnit: string;
  candidateId: string;
  candidateSubjectDigest?: string | null;
}): IntegrationBoundaryLocus {
  const workUnit = SlugSchema.parse(input.workUnit);
  const candidateId = CandidateIdSchema.parse(input.candidateId);
  return IntegrationBoundaryLocusSchema.parse({
    schemaVersion: 1,
    mode: "integration-boundary",
    workUnit,
    candidateId,
    candidateSubjectDigest: input.candidateSubjectDigest ?? null,
    locus: "candidate-review-pending",
    nextAction: {
      kind: "run-self-review",
      command: `arc review pre-publication ${workUnit} --json`,
      interactionText: "Run or resume the typed pre-publication review procedure.",
    },
    policy: null,
    reservation: null,
  });
}

/** Resume pre-publication after convergence without discarding its carried hosted-review authority. */
export function projectCandidateReviewResumeBoundary(input: {
  workUnit: string;
  candidateId: string;
  candidateSubjectDigest: string;
  reservation: StandardReviewReservationV1 | null;
}): IntegrationBoundaryLocus {
  const workUnit = SlugSchema.parse(input.workUnit);
  const candidateId = CandidateIdSchema.parse(input.candidateId);
  const candidateSubjectDigest = CandidateSubjectDigestSchema.parse(input.candidateSubjectDigest);
  return IntegrationBoundaryLocusSchema.parse({
    schemaVersion: 1,
    mode: "pre-publication-review",
    workUnit,
    candidateId,
    candidateSubjectDigest,
    locus: "candidate-review-pending",
    nextAction: {
      kind: "continue-pre-publication-review",
      command: `arc review pre-publication ${workUnit} --json`,
      interactionText: "Resume pre-publication review over the converged Candidate.",
    },
    policy: null,
    reservation: input.reservation,
  });
}

/**
 * Project one post-submission resume point from the evidence that decides it.
 *
 * The locus is derived rather than supplied, because a caller asserting it can only repeat what it
 * was told: a carried reservation names a hosted review that cannot run until a change request
 * exists to run it against, so those two facts together — and only together — place the work unit
 * at the hosted resume point. Every other combination continues publication, including a
 * reservation still waiting for its change request.
 */
export function projectPublicationBoundary(input: unknown): IntegrationBoundaryLocus {
  const value = PublicationBoundaryInputSchema.parse(input);
  const hosted = value.reservation !== null && value.changeRequest !== null;
  return IntegrationBoundaryLocusSchema.parse({
    schemaVersion: 1,
    mode: "integration-boundary",
    workUnit: value.workUnit,
    candidateId: value.candidateId,
    candidateSubjectDigest: value.candidateSubjectDigest,
    locus: hosted ? "hosted-review-pending" : "publication-pending",
    nextAction: {
      kind: hosted ? "continue-pre-publication-review" : "continue-publication",
      command: hosted
        ? `arc review pre-publication ${value.workUnit} --json`
        : `git push -u origin ${value.branch}`,
      interactionText: hosted
        ? "Continue the reserved hosted standard review."
        : "Resume publication at the idempotent push, then resolve or open the change request.",
    },
    policy: null,
    reservation: value.reservation,
  });
}

/** Recover the public integration projection without dropping same-Candidate prepublication authority. */
export function recoverPublicationBoundary(input: {
  stored: IntegrationBoundaryLocus | null;
  workUnit: string;
  branch: string;
  candidateId: string;
  candidateSubjectDigest: string;
}): IntegrationBoundaryLocus | null {
  const stored = input.stored;
  if (stored === null
    || stored.workUnit !== input.workUnit
    || stored.candidateId !== input.candidateId
    || stored.candidateSubjectDigest === null) return null;
  if (stored.locus === "publication-pending" || stored.locus === "hosted-review-pending") {
    // The Candidate record's latest response subject is authoritative for the current lineage.
    // Rebind the carried publication authority instead of treating that approved advance as stale.
    return IntegrationBoundaryLocusSchema.parse({
      ...stored,
      candidateSubjectDigest: input.candidateSubjectDigest,
    });
  }
  if (stored.locus !== "candidate-publish-ready") return null;
  return projectPublicationBoundary({
    workUnit: input.workUnit,
    branch: input.branch,
    candidateId: input.candidateId,
    candidateSubjectDigest: input.candidateSubjectDigest,
    reservation: stored.reservation,
    changeRequest: null,
  });
}

/** Create the exact hosted-first reservation carried across publication. */
export function createStandardReviewReservation(input: {
  candidateId: string;
  sourceId: string;
  sources?: readonly string[];
  repository: string;
  headSha: string;
  obligation: z.input<typeof StandardReviewObligationProjectionSchema>;
}): StandardReviewReservationV1 {
  const candidateId = CandidateIdSchema.parse(input.candidateId);
  const sourceId = z.string().trim().min(1).parse(input.sourceId);
  const configuredSources = z.array(z.string().trim().min(1)).min(1).parse(input.sources ?? [sourceId]);
  const selectedSourceIndex = configuredSources.indexOf(sourceId);
  if (selectedSourceIndex < 0) {
    throw new Error("reserved source must belong to the ordered standard-review sources");
  }
  const sources = configuredSources.slice(selectedSourceIndex);
  const fields = {
    schemaVersion: 1 as const,
    semanticsVersion: "standard-review-reservation/v1" as const,
    sources,
    target: { repository: input.repository, headSha: input.headSha },
    obligation: input.obligation,
  };
  return StandardReviewReservationV1Schema.parse({
    ...fields,
    reservationId: canonicalDigest({
      domain: "arc.standard-review.reservation/v1",
      candidateId,
      selectedSource: sourceId,
      ...fields,
    }),
  });
}
