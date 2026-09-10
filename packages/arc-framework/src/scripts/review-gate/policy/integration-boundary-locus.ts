/** Typed operational loci at the Candidate-to-publication boundary. */

import { z } from "zod";

import { canonicalDigest } from "../../../lib/canonical/canonical-json.js";
import {
  DeliveryPublicReviewContinuationV1Schema,
  type DeliveryPublicReviewContinuationV1,
} from "../../../lib/delivery/public-review-continuation.js";
import { DeliveryPlanIdSchema } from "../../../lib/delivery/schema.js";
import { SlugSchema } from "../../../lib/kernel/schema/slug.js";
import { GitObjectIdSchema } from "../core/gate-contract-v2-schema.js";
import { ReviewResolveEnvelopeSchema } from "./review-policy-driver.js";
import { StandardReviewObligationProjectionSchema } from "./standard-review-projection-schema.js";
import {
  DeliveryReviewMemberTerminusSchema,
  OwnerAcceptedReviewTerminusSchema,
  type OwnerAcceptedReviewTerminus,
} from "./review-terminus.js";

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
export const ContinueHostedReviewActionSchema = z.strictObject({
  kind: z.literal("continue-hosted-review"),
  workUnitId: SlugSchema,
  ...ActionFields,
}).superRefine((action, context) => {
  if (action.command !== `arc review status --work-unit ${action.workUnitId} --json`) {
    context.addIssue({
      code: "custom",
      path: ["command"],
      message: "the hosted-review action must be self-contained for its work unit",
    });
  }
});
export const ResolveDeliveryStatusActionSchema = z.strictObject({
  kind: z.literal("resolve-delivery-status"),
  workUnitId: SlugSchema,
  ...ActionFields,
}).superRefine((action, context) => {
  if (action.command !== `arc review status --work-unit ${action.workUnitId} --json`) {
    context.addIssue({
      code: "custom",
      path: ["command"],
      message: "the delivery-status action must be self-contained for its work unit",
    });
  }
});
const LegacyContinueHostedReviewActionSchema = z.strictObject({
  kind: z.literal("continue-hosted-review"),
  command: z.literal("arc review status --target '{targetRef}' --json"),
  interactionText: z.string().trim().min(1),
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
  ResolveDeliveryStatusActionSchema,
  RunConvergenceVerificationActionSchema,
  PublishCandidateActionSchema,
  ContinuePublicationActionSchema,
]);
export type IntegrationBoundaryNextAction = z.infer<typeof IntegrationBoundaryNextActionSchema>;

export const StandardReviewReservationTargetSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("pinned-head"),
    repository: z.string().trim().min(1),
    headSha: GitObjectIdSchema,
  }),
  z.strictObject({
    kind: z.literal("delivery"),
    repository: z.string().trim().min(1),
    workUnitId: SlugSchema,
    planId: DeliveryPlanIdSchema,
  }),
]);
export type StandardReviewReservationTarget = z.infer<typeof StandardReviewReservationTargetSchema>;

export const StandardReviewReservationV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  semanticsVersion: z.literal("standard-review-reservation/v1"),
  reservationId: CandidateIdSchema,
  sources: z.array(z.string().trim().min(1)).min(1),
  target: StandardReviewReservationTargetSchema,
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
  terminus: OwnerAcceptedReviewTerminusSchema.nullable().default(null),
  deliveryReviewTermini: z.array(DeliveryReviewMemberTerminusSchema).default([]).superRefine((records, context) => {
    const seen = new Set<string>();
    for (const [index, record] of records.entries()) {
      const key = canonicalDigest(record.vehicle);
      if (seen.has(key)) {
        context.addIssue({
          code: "custom",
          path: [index, "vehicle"],
          message: "delivery-member review termini must have unique exact vehicles",
        });
      }
      seen.add(key);
    }
  }),
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
  policy: ReviewResolveEnvelopeSchema.nullable(),
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
}).superRefine((boundary, context) => {
  if (boundary.reservation.target.kind !== "pinned-head") {
    context.addIssue({
      code: "custom",
      path: ["reservation", "target", "kind"],
      message: "hosted-review-pending is reserved for a pinned singleton target",
    });
  }
});
export const DeliveryStatusRequiredBoundarySchema = z.strictObject({
  ...BoundaryCommonShape,
  mode: z.literal("integration-boundary"),
  locus: z.literal("delivery-status-required"),
  nextAction: ResolveDeliveryStatusActionSchema,
  policy: z.null(),
  reservation: StandardReviewReservationV1Schema,
  deliveryContinuation: DeliveryPublicReviewContinuationV1Schema.optional(),
}).superRefine((boundary, context) => {
  if (boundary.reservation.target.kind !== "delivery") {
    context.addIssue({
      code: "custom",
      path: ["reservation", "target", "kind"],
      message: "delivery status requires a delivery reservation",
    });
  }
  if (boundary.nextAction.workUnitId !== boundary.workUnit) {
    context.addIssue({
      code: "custom",
      path: ["nextAction", "workUnitId"],
      message: "the delivery-status action must identify the boundary work unit",
    });
  }
  if (boundary.deliveryContinuation !== undefined
    && (boundary.reservation.target.kind !== "delivery"
      || boundary.deliveryContinuation.planId !== boundary.reservation.target.planId)) {
    context.addIssue({
      code: "custom",
      path: ["deliveryContinuation"],
      message: "the delivery continuation must match the carried delivery reservation",
    });
  }
});

// Boundaries written before work-unit status existed carried an unresolvable target placeholder.
// This read-only migration schema stays outside the registered canonical schema because transforms
// cannot be represented in JSON Schema.
const LegacyHostedReviewPendingBoundarySchema = z.strictObject({
  ...BoundaryCommonShape,
  mode: z.literal("integration-boundary"),
  locus: z.literal("hosted-review-pending"),
  nextAction: z.union([
    ContinueHostedReviewActionSchema,
    LegacyContinueHostedReviewActionSchema,
  ]),
  policy: z.null(),
  reservation: StandardReviewReservationV1Schema,
  deliveryContinuation: DeliveryPublicReviewContinuationV1Schema.optional(),
}).superRefine((boundary, context) => {
  if (boundary.reservation.target.kind !== "delivery") {
    context.addIssue({
      code: "custom",
      path: ["reservation", "target", "kind"],
      message: "the legacy delivery continuation requires a delivery reservation",
    });
  }
  if ("workUnitId" in boundary.nextAction
    && boundary.nextAction.workUnitId !== boundary.workUnit) {
    context.addIssue({
      code: "custom",
      path: ["nextAction", "workUnitId"],
      message: "the legacy delivery action must identify the boundary work unit",
    });
  }
  if (boundary.deliveryContinuation !== undefined
    && (boundary.reservation.target.kind !== "delivery"
      || boundary.deliveryContinuation.planId !== boundary.reservation.target.planId)) {
    context.addIssue({
      code: "custom",
      path: ["deliveryContinuation"],
      message: "the legacy delivery continuation must match its reservation",
    });
  }
});

export const IntegrationBoundaryLocusSchema = z.union([
  CandidateReviewBoundarySchema,
  CandidateFixBoundarySchema,
  CandidateConvergenceBoundarySchema,
  CandidatePublishReadyBoundarySchema,
  PublicationPendingBoundarySchema,
  HostedReviewPendingBoundarySchema,
  DeliveryStatusRequiredBoundarySchema,
]);
export type IntegrationBoundaryLocus = z.infer<typeof IntegrationBoundaryLocusSchema>;

/** Parse one structural integration boundary. */
export function parseIntegrationBoundaryLocus(input: unknown): IntegrationBoundaryLocus {
  const canonical = IntegrationBoundaryLocusSchema.safeParse(input);
  if (canonical.success) return canonical.data;
  const legacy = LegacyHostedReviewPendingBoundarySchema.safeParse(input);
  if (!legacy.success) return IntegrationBoundaryLocusSchema.parse(input);
  return DeliveryStatusRequiredBoundarySchema.parse({
    ...legacy.data,
    locus: "delivery-status-required",
    nextAction: {
      ...legacy.data.nextAction,
      kind: "resolve-delivery-status",
      workUnitId: legacy.data.workUnit,
      command: `arc review status --work-unit ${legacy.data.workUnit} --json`,
      interactionText: "Resolve the retained delivery status.",
    },
  });
}

const PublicationBoundaryInputSchema = z.strictObject({
  workUnit: SlugSchema,
  branch: z.string().trim().min(1),
  candidateId: CandidateIdSchema,
  candidateSubjectDigest: CandidateSubjectDigestSchema.nullable().default(null),
  reservation: StandardReviewReservationV1Schema.nullable(),
  terminus: OwnerAcceptedReviewTerminusSchema.nullable().default(null),
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
    terminus: null,
  });
}

/** Resume pre-publication after convergence without discarding its carried hosted-review authority. */
export function projectCandidateReviewResumeBoundary(input: {
  workUnit: string;
  candidateId: string;
  candidateSubjectDigest: string;
  reservation: StandardReviewReservationV1 | null;
  terminus?: OwnerAcceptedReviewTerminus | null;
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
    terminus: input.terminus ?? null,
  });
}

/**
 * Recover an approved Candidate fix response before ordinary currentness can demand a new root.
 *
 * @param input - Work-unit and Candidate coordinates for the source-free recovery boundary.
 * @returns A pre-publication boundary that keeps the approved response resumable.
 */
export function projectCandidateFixResumeBoundary(input: {
  workUnit: string;
  candidateId: string;
  candidateSubjectDigest: string;
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
    locus: "candidate-fix-pending",
    nextAction: {
      kind: "continue-pre-publication-review",
      command: `arc review pre-publication ${workUnit} --json`,
      interactionText: "Resume the approved Candidate review fix response.",
    },
    policy: null,
    reservation: null,
    terminus: null,
  });
}

/**
 * Recover an exact Active prepublication locus without reviving stale review authority.
 *
 * @param input - Stored boundary and the authoritative current Candidate identity.
 * @returns The exact stored prepublication locus when every binding matches; otherwise `null`.
 */
export function recoverPrePublicationBoundary(input: {
  stored: IntegrationBoundaryLocus | null;
  workUnit: string;
  candidateId: string;
  candidateSubjectDigest: string;
}): IntegrationBoundaryLocus | null {
  const workUnit = SlugSchema.parse(input.workUnit);
  const candidateId = CandidateIdSchema.parse(input.candidateId);
  const candidateSubjectDigest = CandidateSubjectDigestSchema.parse(input.candidateSubjectDigest);
  const stored = input.stored;
  if (stored === null
    || stored.workUnit !== workUnit
    || stored.candidateId !== candidateId
    || stored.candidateSubjectDigest !== candidateSubjectDigest
    || stored.locus === "publication-pending"
    || stored.locus === "hosted-review-pending"
    || stored.locus === "delivery-status-required") return null;
  return stored;
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
  const deliveryHosted = hosted && value.reservation?.target.kind === "delivery";
  return IntegrationBoundaryLocusSchema.parse({
    schemaVersion: 1,
    mode: "integration-boundary",
    workUnit: value.workUnit,
    candidateId: value.candidateId,
    candidateSubjectDigest: value.candidateSubjectDigest,
    locus: deliveryHosted
      ? "delivery-status-required"
      : hosted
        ? "hosted-review-pending"
        : "publication-pending",
    nextAction: {
      kind: deliveryHosted
        ? "resolve-delivery-status"
        : hosted
          ? "continue-pre-publication-review"
          : "continue-publication",
      command: deliveryHosted
        ? `arc review status --work-unit ${value.workUnit} --json`
        : hosted
          ? `arc review pre-publication ${value.workUnit} --json`
        : `git push -u origin ${value.branch}`,
      interactionText: deliveryHosted
        ? "Resolve the retained delivery status."
        : hosted
          ? "Continue the reserved hosted standard review."
        : "Resume publication at the idempotent push, then resolve or open the change request.",
      ...(deliveryHosted ? { workUnitId: value.workUnit } : {}),
    },
    policy: null,
    reservation: value.reservation,
    terminus: value.terminus,
  });
}

/**
 * Rebind one carried public delivery reservation to a renewed Candidate continuation.
 *
 * @param input - Renewed Candidate identity, exact source boundary, and current delivery binding.
 * @returns One provider-neutral delivery-status boundary carrying the unchanged public reservation.
 */
export function projectCorrectiveDeliveryStatusBoundary(input: {
  readonly workUnit: string;
  readonly candidateId: string;
  readonly candidateSubjectDigest: string;
  readonly supersedesCandidateId: string | null;
  readonly sourceBoundary: IntegrationBoundaryLocus;
  readonly deliveryContinuation: DeliveryPublicReviewContinuationV1;
}): IntegrationBoundaryLocus {
  const workUnit = SlugSchema.parse(input.workUnit);
  const candidateId = CandidateIdSchema.parse(input.candidateId);
  const candidateSubjectDigest = CandidateSubjectDigestSchema.parse(input.candidateSubjectDigest);
  const supersedesCandidateId = input.supersedesCandidateId === null
    ? null
    : CandidateIdSchema.parse(input.supersedesCandidateId);
  const source = IntegrationBoundaryLocusSchema.parse(input.sourceBoundary);
  const continuation = DeliveryPublicReviewContinuationV1Schema.parse(input.deliveryContinuation);
  if (source.mode !== "integration-boundary"
    || (source.locus !== "publication-pending"
      && source.locus !== "hosted-review-pending"
      && source.locus !== "delivery-status-required")
    || source.workUnit !== workUnit
    || source.candidateSubjectDigest === null
    || (source.candidateId !== candidateId && source.candidateId !== supersedesCandidateId)
    || source.reservation === null
    || source.reservation.target.kind !== "delivery"
    || source.reservation.target.workUnitId !== workUnit
    || source.reservation.target.planId !== continuation.planId) {
    throw new Error("Corrective Candidate renewal requires the exact carried public delivery reservation.");
  }
  return IntegrationBoundaryLocusSchema.parse({
    schemaVersion: 1,
    mode: "integration-boundary",
    workUnit,
    candidateId,
    candidateSubjectDigest,
    locus: "delivery-status-required",
    nextAction: {
      kind: "resolve-delivery-status",
      workUnitId: workUnit,
      command: `arc review status --work-unit ${workUnit} --json`,
      interactionText: "Resolve the retained delivery status.",
    },
    policy: null,
    reservation: source.reservation,
    terminus: source.terminus,
    deliveryReviewTermini: source.deliveryReviewTermini,
    deliveryContinuation: continuation,
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
  if (stored.locus === "publication-pending"
    || stored.locus === "hosted-review-pending"
    || stored.locus === "delivery-status-required") {
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
    terminus: stored.terminus,
    changeRequest: null,
  });
}

/**
 * Recover the exact resume locus for a work unit that remains Integrating during Candidate renewal.
 *
 * @param input - Stored boundary and the authoritative current Candidate and branch identity.
 * @returns The recoverable integration or same-Candidate review locus; otherwise `null`.
 */
export function recoverIntegratingBoundary(input: {
  stored: IntegrationBoundaryLocus | null;
  workUnit: string;
  branch: string;
  candidateId: string;
  candidateSubjectDigest: string;
}): IntegrationBoundaryLocus | null {
  return recoverPublicationBoundary(input) ?? recoverPrePublicationBoundary({
    stored: input.stored,
    workUnit: input.workUnit,
    candidateId: input.candidateId,
    candidateSubjectDigest: input.candidateSubjectDigest,
  });
}

/** Create the exact hosted-first reservation carried across publication. */
interface StandardReviewReservationInputBase {
  candidateId: string;
  sourceId: string;
  sources?: readonly string[];
  obligation: z.input<typeof StandardReviewObligationProjectionSchema>;
}

/** Create a reservation with an explicit vehicle or singleton pinned-head coordinates. */
export function createStandardReviewReservation(input: StandardReviewReservationInputBase & (
  | { target: z.input<typeof StandardReviewReservationTargetSchema> }
  | { repository: string; headSha: string }
)): StandardReviewReservationV1 {
  const candidateId = CandidateIdSchema.parse(input.candidateId);
  const sourceId = z.string().trim().min(1).parse(input.sourceId);
  const configuredSources = z.array(z.string().trim().min(1)).min(1).parse(input.sources ?? [sourceId]);
  const selectedSourceIndex = configuredSources.indexOf(sourceId);
  if (selectedSourceIndex < 0) {
    throw new Error("reserved source must belong to the ordered standard-review sources");
  }
  const sources = configuredSources.slice(selectedSourceIndex);
  const target = "target" in input
    ? StandardReviewReservationTargetSchema.parse(input.target)
    : StandardReviewReservationTargetSchema.parse({
        kind: "pinned-head",
        repository: input.repository,
        headSha: input.headSha,
      });
  const fields = {
    schemaVersion: 1 as const,
    semanticsVersion: "standard-review-reservation/v1" as const,
    sources,
    target,
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
