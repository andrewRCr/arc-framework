/** Typed operational loci at the Candidate-to-publication boundary. */

import { z } from "zod";

import { canonicalDigest } from "../../../lib/canonical/canonical-json.js";
import { SlugSchema } from "../../../lib/kernel/schema/slug.js";
import { ReviewResolveEnvelopeSchema } from "./review-policy-driver.js";
import { StandardReviewObligationProjectionSchema } from "./standard-review-projection-schema.js";

const CandidateIdSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);

export const IntegrationBoundaryNextActionSchema = z.strictObject({
  kind: z.enum([
    "run-self-review",
    "continue-frontline-review",
    "continue-standard-review",
    "respond-to-findings",
    "run-convergence-verification",
    "submit-candidate",
    "continue-publication",
    "continue-hosted-review",
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
  locus: z.enum([
    "candidate-review-pending",
    "candidate-fix-pending",
    "candidate-convergence-verification-pending",
    "candidate-submit-ready",
    "publication-pending",
    "hosted-review-pending",
  ]),
  nextAction: IntegrationBoundaryNextActionSchema,
  policy: ReviewResolveEnvelopeSchema.nullable(),
  reservation: StandardReviewReservationV1Schema.nullable(),
}).superRefine((value, context) => {
  if (value.reservation !== null
    && value.locus !== "candidate-submit-ready"
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
  candidateId: CandidateIdSchema,
  state: z.enum(["publication-pending", "hosted-review-pending"]),
  reservation: StandardReviewReservationV1Schema.nullable(),
});

/** Project the conservative exact Candidate entry point before review evidence is reduced. */
export function projectCandidateReviewBoundary(input: {
  workUnit: string;
  candidateId: string;
}): IntegrationBoundaryLocus {
  const workUnit = SlugSchema.parse(input.workUnit);
  const candidateId = CandidateIdSchema.parse(input.candidateId);
  return IntegrationBoundaryLocusSchema.parse({
    schemaVersion: 1,
    mode: "integration-boundary",
    workUnit,
    candidateId,
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

/** Project one post-submission resume point. */
export function projectPublicationBoundary(input: unknown): IntegrationBoundaryLocus {
  const value = PublicationBoundaryInputSchema.parse(input);
  const hosted = value.state === "hosted-review-pending";
  return IntegrationBoundaryLocusSchema.parse({
    schemaVersion: 1,
    mode: "integration-boundary",
    workUnit: value.workUnit,
    candidateId: value.candidateId,
    locus: value.state,
    nextAction: {
      kind: hosted ? "continue-hosted-review" : "continue-publication",
      command: hosted
        ? `arc review pre-publication ${value.workUnit} --json`
        : `arc submit ${value.workUnit} --json`,
      interactionText: hosted
        ? "Continue the reserved hosted standard review."
        : "Continue publication from the typed submission resume point.",
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
