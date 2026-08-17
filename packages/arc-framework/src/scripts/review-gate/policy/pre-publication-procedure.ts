/** Typed pre-publication review, delta verification, and Candidate convergence procedure. */

import { z } from "zod";

import { SlugSchema } from "../../../lib/kernel/schema/slug.js";
import {
  CandidateLineageTargetSchema,
  CandidateManagedRecordV1Schema,
  CandidateSubjectDeltaSchema,
  CandidateVerificationApplicabilitySchema,
  createCandidateReviewResponseEvidence,
  diffCandidateSubjectSnapshots,
  type CandidateManagedRecordV1,
  type CandidateReviewResponseEvidenceV1,
} from "../../../lib/work-unit/candidate-attestation.js";
import {
  ReviewPolicyRequestSchema,
  ReviewResolveEnvelopeSchema,
  resolveReviewPolicy,
} from "./review-policy-driver.js";
import {
  createStandardReviewReservation as buildStandardReviewReservation,
  IntegrationBoundaryLocusSchema,
  IntegrationBoundaryNextActionSchema,
  StandardReviewReservationV1Schema,
  type StandardReviewReservationV1,
} from "./integration-boundary-locus.js";

const CandidateIdSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const CandidateSubjectDigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const ReviewEvidenceReferenceSchema = z.string().trim().min(1);
const FrontlinePolicyRequestSchema = ReviewPolicyRequestSchema.refine(
  ({ lane }) => lane === "frontline",
  "frontline policy input must select the frontline lane",
);
const StandardPolicyRequestSchema = ReviewPolicyRequestSchema.refine(
  ({ lane }) => lane === "standard",
  "standard policy input must select the standard lane",
);

export const PrePublicationReviewRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  workUnit: SlugSchema,
  candidateId: CandidateIdSchema,
  selfReview: z.enum(["inactive", "pending", "settled"]),
  frontline: FrontlinePolicyRequestSchema,
  standard: StandardPolicyRequestSchema,
  candidate: z.strictObject({
    subjectDigest: CandidateSubjectDigestSchema,
    implementationChanged: z.boolean(),
    convergenceVerification: z.enum(["satisfied", "pending"]),
  }),
}).superRefine((request, context) => {
  if (!samePolicyTarget(request.frontline.target, request.standard.target)) {
    context.addIssue({ code: "custom", path: ["standard", "target"], message: "must match the frontline target" });
  }
});
export type PrePublicationReviewRequest = z.infer<typeof PrePublicationReviewRequestSchema>;

const PrePublicationNextActionSchema = IntegrationBoundaryNextActionSchema.refine(
  ({ kind }) => kind !== "continue-publication",
  "pre-publication action must remain before submission",
);

export { StandardReviewReservationV1Schema } from "./integration-boundary-locus.js";
export type { StandardReviewReservationV1 } from "./integration-boundary-locus.js";

export const PrePublicationReviewEnvelopeSchema = z.strictObject({
  schemaVersion: z.literal(1),
  mode: z.literal("pre-publication-review"),
  workUnit: SlugSchema,
  candidateId: CandidateIdSchema,
  candidateSubjectDigest: CandidateSubjectDigestSchema,
  locus: z.enum([
    "candidate-review-pending",
    "candidate-fix-pending",
    "candidate-convergence-verification-pending",
    "candidate-submit-ready",
  ]),
  nextAction: PrePublicationNextActionSchema,
  policy: ReviewResolveEnvelopeSchema.nullable(),
  reservation: StandardReviewReservationV1Schema.nullable(),
}).superRefine((value, context) => {
  const parsed = IntegrationBoundaryLocusSchema.safeParse(value);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      context.addIssue({ code: "custom", path: issue.path, message: issue.message });
    }
  }
});
export type PrePublicationReviewEnvelope = z.infer<typeof PrePublicationReviewEnvelopeSchema>;

/** Project the next pre-publication action while delegating lane mechanics to the review-policy driver. */
export function projectPrePublicationReview(input: unknown): PrePublicationReviewEnvelope {
  const request = PrePublicationReviewRequestSchema.parse(input);
  if (request.selfReview === "pending") {
    return envelope(request, {
      locus: "candidate-review-pending",
      nextAction: action(request.workUnit, "run-self-review", "Run the active author self-review method."),
    });
  }

  const frontline = resolveReviewPolicy(request.frontline);
  if (!isSettledFrontline(frontline.state)) {
    return policyEnvelope(request, "frontline", frontline);
  }

  const standard = resolveReviewPolicy(request.standard);
  if (standard.state === "findings") return policyEnvelope(request, "standard", standard);
  if (!isSettledStandard(standard.state)) return policyEnvelope(request, "standard", standard);
  const reservation = standard.state === "awaiting-change-request"
    ? createStandardReviewReservation(request, firstWaitingSource(standard.payload.waitingSources))
    : null;

  if (request.candidate.implementationChanged
    && request.candidate.convergenceVerification === "pending") {
    return envelope(request, {
      locus: "candidate-convergence-verification-pending",
      nextAction: action(
        request.workUnit,
        "run-convergence-verification",
        "Run one final Tier 3 over the converged Candidate lineage, then invoke arc propose.",
      ),
      reservation,
    });
  }
  return envelope(request, {
    locus: "candidate-submit-ready",
    nextAction: action(request.workUnit, "submit-candidate", "Submit the current Candidate for publication."),
    reservation,
  });
}

export const CandidateDeltaVerificationProjectionSchema = z.strictObject({
  schemaVersion: z.literal(1),
  candidateId: CandidateIdSchema,
  oldTarget: CandidateLineageTargetSchema,
  newTarget: CandidateLineageTargetSchema,
  delta: CandidateSubjectDeltaSchema,
  priorEvidenceRefs: z.array(ReviewEvidenceReferenceSchema),
  allowedApplicability: z.tuple([
    z.literal("targeted"),
    z.literal("focused"),
    z.literal("full"),
  ]),
});
export type CandidateDeltaVerificationProjection = z.infer<typeof CandidateDeltaVerificationProjectionSchema>;

/** Supply the exact Candidate delta and prior evidence before the primary chooses verification applicability. */
export function projectCandidateDeltaVerification(input: {
  record: CandidateManagedRecordV1;
  current: z.input<typeof CandidateLineageTargetSchema>;
}): CandidateDeltaVerificationProjection {
  const record = CandidateManagedRecordV1Schema.parse(input.record);
  const current = CandidateLineageTargetSchema.parse(input.current);
  const lastResponse = record.responses.at(-1);
  const oldTarget = lastResponse?.newTarget ?? {
    revision: record.attestation.baseRevision,
    subject: record.subject,
  };
  return CandidateDeltaVerificationProjectionSchema.parse({
    schemaVersion: 1,
    candidateId: record.attestation.candidateId,
    oldTarget,
    newTarget: current,
    delta: diffCandidateSubjectSnapshots(oldTarget.subject, current.subject),
    priorEvidenceRefs: [
      record.attestation.verificationEvidenceRef,
      ...record.responses.flatMap(({ verificationEvidenceRefs }) => verificationEvidenceRefs),
      ...record.lineageAttestations.map(({ verificationEvidenceRef }) => verificationEvidenceRef),
    ],
    allowedApplicability: ["targeted", "focused", "full"],
  });
}

export const RecordCandidateVerifiedResponseInputSchema = z.strictObject({
  projection: CandidateDeltaVerificationProjectionSchema,
  dispositionId: CandidateIdSchema,
  approvedBy: z.string().trim().min(1),
  appliedBy: z.string().trim().min(1),
  applicability: CandidateVerificationApplicabilitySchema,
  verificationEvidenceRefs: z.array(ReviewEvidenceReferenceSchema).min(1),
});

/** Record one primary-selected verification applicability over an approved exact Candidate delta. */
export function recordCandidateVerifiedResponse(input: unknown): CandidateReviewResponseEvidenceV1 {
  const request = RecordCandidateVerifiedResponseInputSchema.parse(input);
  const exactDelta = diffCandidateSubjectSnapshots(
    request.projection.oldTarget.subject,
    request.projection.newTarget.subject,
  );
  if (!sameDelta(exactDelta, request.projection.delta)) {
    throw new Error("Candidate delta verification projection does not match its exact targets");
  }
  return createCandidateReviewResponseEvidence({
    candidateId: request.projection.candidateId,
    oldTarget: request.projection.oldTarget,
    newTarget: request.projection.newTarget,
    dispositionId: request.dispositionId,
    approvedBy: request.approvedBy,
    appliedBy: request.appliedBy,
    applicability: request.applicability,
    verificationEvidenceRefs: request.verificationEvidenceRefs,
    implementationChanged: deltaChanged(exactDelta),
  });
}

function policyEnvelope(
  request: PrePublicationReviewRequest,
  lane: "frontline" | "standard",
  policy: z.infer<typeof ReviewResolveEnvelopeSchema>,
): PrePublicationReviewEnvelope {
  const findings = policy.state === "findings";
  return envelope(request, {
    locus: findings ? "candidate-fix-pending" : "candidate-review-pending",
    nextAction: action(
      request.workUnit,
      "continue-pre-publication-review",
      findings
        ? `Disposition and respond to the ${lane} review findings as one bounded increment.`
        : `Continue the ${lane} review from the typed policy result '${policy.state}'.`,
    ),
    policy,
  });
}

function envelope(
  request: PrePublicationReviewRequest,
  projection: Pick<PrePublicationReviewEnvelope, "locus" | "nextAction">
    & Partial<Pick<PrePublicationReviewEnvelope, "policy" | "reservation">>,
): PrePublicationReviewEnvelope {
  return PrePublicationReviewEnvelopeSchema.parse({
    schemaVersion: 1,
    mode: "pre-publication-review",
    workUnit: request.workUnit,
    candidateId: request.candidateId,
    candidateSubjectDigest: request.candidate.subjectDigest,
    policy: null,
    reservation: null,
    ...projection,
  });
}

function action(
  workUnit: string,
  kind: z.infer<typeof PrePublicationNextActionSchema>["kind"],
  interactionText: string,
): z.infer<typeof PrePublicationNextActionSchema> {
  const command = kind === "submit-candidate"
    ? `arc submit ${workUnit} --json`
    : kind === "run-convergence-verification"
      ? `arc propose ${workUnit} --json`
      : `arc review pre-publication ${workUnit} --json`;
  return { kind, command, interactionText };
}

function isSettledFrontline(state: z.infer<typeof ReviewResolveEnvelopeSchema>["state"]): boolean {
  return state === "skipped" || state === "pass-complete";
}

function isSettledStandard(state: z.infer<typeof ReviewResolveEnvelopeSchema>["state"]): boolean {
  return state === "no-op" || state === "pass-complete" || state === "awaiting-change-request";
}

function samePolicyTarget(
  left: PrePublicationReviewRequest["frontline"]["target"],
  right: PrePublicationReviewRequest["standard"]["target"],
): boolean {
  return left.repository === right.repository
    && left.pullRequest === right.pullRequest
    && left.headSha === right.headSha;
}

function sameDelta(
  left: z.infer<typeof CandidateSubjectDeltaSchema>,
  right: z.infer<typeof CandidateSubjectDeltaSchema>,
): boolean {
  return left.added.join("\0") === right.added.join("\0")
    && left.removed.join("\0") === right.removed.join("\0")
    && left.changed.join("\0") === right.changed.join("\0");
}

function deltaChanged(delta: z.infer<typeof CandidateSubjectDeltaSchema>): boolean {
  return delta.added.length > 0 || delta.removed.length > 0 || delta.changed.length > 0;
}

function firstWaitingSource(sources: readonly string[]): string {
  const source = sources[0];
  if (source === undefined) throw new Error("awaiting-change-request requires one reserved source");
  return source;
}

function createStandardReviewReservation(
  request: PrePublicationReviewRequest,
  sourceId: string,
): StandardReviewReservationV1 {
  const fields = {
    schemaVersion: 1 as const,
    semanticsVersion: "standard-review-reservation/v1" as const,
    candidateId: request.candidateId,
    sourceId,
    target: {
      repository: request.standard.target.repository,
      headSha: request.standard.target.headSha,
    },
    obligation: request.standard.standardReview,
  };
  return buildStandardReviewReservation({
    candidateId: fields.candidateId,
    sourceId: fields.sourceId,
    repository: fields.target.repository,
    headSha: fields.target.headSha,
    obligation: fields.obligation,
  });
}
