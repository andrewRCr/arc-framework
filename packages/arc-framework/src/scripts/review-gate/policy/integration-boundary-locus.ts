/** Typed operational loci at the Candidate-to-publication boundary. */

import { z } from "zod";

import { canonicalDigest } from "../../../lib/canonical/canonical-json.js";
import { SlugSchema } from "../../../lib/kernel/schema/slug.js";
import { ReviewResolveEnvelopeSchema } from "./review-policy-driver.js";
import { StandardReviewObligationProjectionSchema } from "./standard-review-projection-schema.js";

const CandidateIdSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const CandidateSubjectDigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);

export const IntegrationBoundaryNextActionSchema = z.strictObject({
  kind: z.enum([
    "run-self-review",
    "continue-pre-publication-review",
    "run-convergence-verification",
    "publish-candidate",
    "continue-publication",
  ]),
  command: z.string().trim().min(1),
  interactionText: z.string().trim().min(1),
});
export type IntegrationBoundaryNextAction = z.infer<typeof IntegrationBoundaryNextActionSchema>;

export const StandardReviewReservationV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  semanticsVersion: z.literal("standard-review-reservation/v1"),
  reservationId: CandidateIdSchema,
  candidateId: CandidateIdSchema,
  sourceId: z.string().trim().min(1),
  target: z.strictObject({
    repository: z.string().trim().min(1),
    headSha: z.string().regex(/^[a-f0-9]{40}$/u),
  }),
  obligation: StandardReviewObligationProjectionSchema,
});
export type StandardReviewReservationV1 = z.infer<typeof StandardReviewReservationV1Schema>;

export const IntegrationBoundaryLocusSchema = z.strictObject({
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
  locus: z.enum([
    "candidate-review-pending",
    "candidate-fix-pending",
    "candidate-convergence-verification-pending",
    "candidate-publish-ready",
    "publication-pending",
    "hosted-review-pending",
  ]),
  nextAction: IntegrationBoundaryNextActionSchema,
  policy: ReviewResolveEnvelopeSchema.nullable(),
  reservation: StandardReviewReservationV1Schema.nullable(),
}).superRefine((value, context) => {
  if (value.reservation !== null
    && value.locus !== "candidate-publish-ready"
    && value.locus !== "candidate-convergence-verification-pending"
    && value.locus !== "publication-pending"
    && value.locus !== "hosted-review-pending") {
    context.addIssue({
      code: "custom",
      path: ["reservation"],
      message: "deferred reservation is valid only after private review obligations settle",
    });
  }
  if (value.reservation !== null && value.reservation.candidateId !== value.candidateId) {
    context.addIssue({ code: "custom", path: ["reservation", "candidateId"], message: "must match the locus" });
  }
});
export type IntegrationBoundaryLocus = z.infer<typeof IntegrationBoundaryLocusSchema>;

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

/** Create the exact hosted-first reservation carried across publication. */
export function createStandardReviewReservation(input: {
  candidateId: string;
  sourceId: string;
  repository: string;
  headSha: string;
  obligation: z.input<typeof StandardReviewObligationProjectionSchema>;
}): StandardReviewReservationV1 {
  const fields = {
    schemaVersion: 1 as const,
    semanticsVersion: "standard-review-reservation/v1" as const,
    candidateId: input.candidateId,
    sourceId: input.sourceId,
    target: { repository: input.repository, headSha: input.headSha },
    obligation: input.obligation,
  };
  return StandardReviewReservationV1Schema.parse({
    ...fields,
    reservationId: canonicalDigest({ domain: "arc.standard-review.reservation/v1", ...fields }),
  });
}
