/** Typed pre-publication review, delta verification, and Candidate convergence procedure. */

import { z } from "zod";

import { SlugSchema } from "../../../lib/kernel/schema/slug.js";
import {
  CandidateLineageTargetSchema,
  CandidateManagedRecordV1Schema,
  CandidateSubjectDeltaSchema,
  CandidateVerificationApplicabilitySchema,
  candidateReviewResponses,
  createCandidateReviewResponseEvidence,
  diffCandidateSubjectSnapshots,
  type CandidateManagedRecordV1,
  type CandidateReviewResponseEvidenceV1,
} from "../../../lib/work-unit/candidate-attestation.js";
import { ReviewTargetSchema } from "../core/gate-contract-v2-schema.js";
import {
  ReviewPolicyRequestSchema,
  ReviewResolveEnvelopeSchema,
  resolveReviewPolicy,
} from "./review-policy-driver.js";
import {
  CandidateConvergenceBoundarySchema,
  CandidateFixBoundarySchema,
  CandidatePolicyReviewBoundarySchema,
  CandidatePublishReadyBoundarySchema,
  CandidateReviewResumeBoundarySchema,
  CandidateSelfReviewBoundarySchema,
  ContinuePrePublicationActionSchema,
  createStandardReviewReservation as buildStandardReviewReservation,
  PublishCandidateActionSchema,
  RunConvergenceVerificationActionSchema,
  RunSelfReviewActionSchema,
  StandardReviewReservationTargetSchema,
  parseIntegrationBoundaryLocus,
  type IntegrationBoundaryLocus,
  type PostAttestContinuation,
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
  reservationTarget: StandardReviewReservationTargetSchema,
  /**
   * The immutable review target composed from repository state, or `null` when it is not derivable.
   *
   * Every downstream review operation is exact-target — chunking resolution and a frontline run both
   * require the full identity, which the lane-policy target does not carry. Composing it here is what
   * makes those calls reachable from the procedure that routes to them; `null` reports that the
   * checkout cannot currently produce one rather than refusing a procedure that has other work to do.
   */
  target: ReviewTargetSchema.nullable().default(null),
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
  if (request.reservationTarget.repository.toLowerCase() !== request.standard.target.repository.toLowerCase()) {
    context.addIssue({
      code: "custom",
      path: ["reservationTarget", "repository"],
      message: "must match the standard review target repository",
    });
  }
});
export type PrePublicationReviewRequest = z.infer<typeof PrePublicationReviewRequestSchema>;

type PrePublicationNextAction =
  | z.infer<typeof RunSelfReviewActionSchema>
  | z.infer<typeof ContinuePrePublicationActionSchema>
  | z.infer<typeof RunConvergenceVerificationActionSchema>
  | z.infer<typeof PublishCandidateActionSchema>;
type RoutinePrePublicationNextAction = Exclude<
  PrePublicationNextAction,
  z.infer<typeof RunConvergenceVerificationActionSchema>
>;

export { StandardReviewReservationV1Schema } from "./integration-boundary-locus.js";
export type { StandardReviewReservationV1 } from "./integration-boundary-locus.js";

const PrePublicationEnvelopeFields = {
  mode: z.literal("pre-publication-review"),
  candidateSubjectDigest: CandidateSubjectDigestSchema,
  /** The immutable target the exact-target operations this envelope routes to require. */
  target: ReviewTargetSchema.nullable(),
};
export const PrePublicationReviewEnvelopeSchema = z.union([
  CandidateSelfReviewBoundarySchema.extend(PrePublicationEnvelopeFields),
  CandidatePolicyReviewBoundarySchema.extend(PrePublicationEnvelopeFields),
  CandidateReviewResumeBoundarySchema.extend(PrePublicationEnvelopeFields),
  CandidateFixBoundarySchema.extend(PrePublicationEnvelopeFields),
  CandidateConvergenceBoundarySchema.extend(PrePublicationEnvelopeFields),
  CandidatePublishReadyBoundarySchema.extend(PrePublicationEnvelopeFields),
]);
export type PrePublicationReviewEnvelope = z.infer<typeof PrePublicationReviewEnvelopeSchema>;

/**
 * The durable boundary an envelope carries, without the target composed alongside it.
 *
 * The target is derived live from the checkout on every call; persisting it would record a fact that
 * goes stale the moment the head moves, against a boundary deliberately keyed to the reviewable
 * subject instead.
 */
export function prePublicationBoundary(envelope: PrePublicationReviewEnvelope): IntegrationBoundaryLocus {
  const boundary: Record<string, unknown> = { ...envelope };
  delete boundary.target;
  return parseIntegrationBoundaryLocus(boundary);
}

/** Project the next pre-publication action while delegating lane mechanics to the review-policy driver. */
export function projectPrePublicationReview(
  input: unknown,
  postAttestContinuation?: PostAttestContinuation,
): PrePublicationReviewEnvelope {
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
  const terminus = standard.state === "owner-accepted" ? standard.payload.terminus : null;

  if (request.candidate.implementationChanged
    && request.candidate.convergenceVerification === "pending") {
    return envelope(request, {
      locus: "candidate-convergence-verification-pending",
      nextAction: RunConvergenceVerificationActionSchema.parse({
        kind: "run-convergence-verification",
        command: `arc attest ${request.workUnit} --json`,
        interactionText: "Run one final Tier 3 over the converged Candidate lineage, then invoke arc attest.",
        postAttestContinuation,
      }),
      reservation,
      terminus,
    });
  }
  return envelope(request, {
    locus: "candidate-publish-ready",
    nextAction: action(request.workUnit, "publish-candidate", "Publish the current Candidate."),
    reservation,
    terminus,
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

/** Supply the exact Candidate delta and prior evidence before performed verification is recorded. */
export function projectCandidateDeltaVerification(input: {
  record: CandidateManagedRecordV1;
  current: z.input<typeof CandidateLineageTargetSchema>;
  oldTarget: z.input<typeof CandidateLineageTargetSchema>;
}): CandidateDeltaVerificationProjection {
  const record = CandidateManagedRecordV1Schema.parse(input.record);
  const current = CandidateLineageTargetSchema.parse(input.current);
  const oldTarget = CandidateLineageTargetSchema.parse(input.oldTarget);
  return CandidateDeltaVerificationProjectionSchema.parse({
    schemaVersion: 1,
    candidateId: record.attestation.candidateId,
    oldTarget,
    newTarget: current,
    delta: diffCandidateSubjectSnapshots(oldTarget.subject, current.subject),
    priorEvidenceRefs: [
      record.attestation.verificationEvidenceRef,
      ...candidateReviewResponses(record).flatMap(({ verificationEvidenceRefs }) => verificationEvidenceRefs),
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
  approvedVerification: CandidateVerificationApplicabilitySchema.optional(),
  applicability: CandidateVerificationApplicabilitySchema,
  verificationEvidenceRefs: z.array(ReviewEvidenceReferenceSchema).min(1),
});

/** Record one performed verification and any approved scope supplied by the response boundary. */
export function recordCandidateVerifiedResponse(input: unknown): CandidateReviewResponseEvidenceV1 {
  const request = RecordCandidateVerifiedResponseInputSchema.parse(input);
  const exactDelta = diffCandidateSubjectSnapshots(
    request.projection.oldTarget.subject,
    request.projection.newTarget.subject,
  );
  if (!sameDelta(exactDelta, request.projection.delta)) {
    throw new Error("Candidate delta verification projection does not match its exact targets");
  }
  const transitionInput = {
    candidateId: request.projection.candidateId,
    oldTarget: request.projection.oldTarget,
    newTarget: request.projection.newTarget,
    dispositionId: request.dispositionId,
    approvedBy: request.approvedBy,
    appliedBy: request.appliedBy,
    ...(request.approvedVerification === undefined
      ? {}
      : { approvedVerification: request.approvedVerification }),
    applicability: request.applicability,
    verificationEvidenceRefs: request.verificationEvidenceRefs,
    implementationChanged: deltaChanged(exactDelta),
  };
  return createCandidateReviewResponseEvidence(transitionInput);
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
    & Partial<Pick<PrePublicationReviewEnvelope, "policy" | "reservation" | "terminus">>,
): PrePublicationReviewEnvelope {
  return PrePublicationReviewEnvelopeSchema.parse({
    schemaVersion: 1,
    mode: "pre-publication-review",
    workUnit: request.workUnit,
    candidateId: request.candidateId,
    candidateSubjectDigest: request.candidate.subjectDigest,
    target: request.target,
    policy: null,
    reservation: null,
    terminus: null,
    ...projection,
  });
}

function action(
  workUnit: string,
  kind: RoutinePrePublicationNextAction["kind"],
  interactionText: string,
): RoutinePrePublicationNextAction {
  const command = kind === "publish-candidate"
    ? `arc publish ${workUnit} --json`
    : `arc review pre-publication ${workUnit} --json`;
  return z.union([
    RunSelfReviewActionSchema,
    ContinuePrePublicationActionSchema,
    PublishCandidateActionSchema,
  ]).parse({ kind, command, interactionText });
}

function isSettledFrontline(state: z.infer<typeof ReviewResolveEnvelopeSchema>["state"]): boolean {
  return state === "skipped" || state === "pass-complete";
}

function isSettledStandard(state: z.infer<typeof ReviewResolveEnvelopeSchema>["state"]): boolean {
  return state === "no-op"
    || state === "pass-complete"
    || state === "awaiting-change-request"
    || state === "owner-accepted";
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
    target: request.reservationTarget,
    obligation: request.standard.standardReview,
  };
  return buildStandardReviewReservation({
    candidateId: fields.candidateId,
    sourceId: fields.sourceId,
    sources: request.standard.sources,
    target: fields.target,
    obligation: fields.obligation,
  });
}
