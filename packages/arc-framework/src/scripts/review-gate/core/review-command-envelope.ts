/** Registered command-result envelopes for the public review transition protocol. */

import { isDeepStrictEqual } from "node:util";

import { z } from "zod";

import { DeliveryReviewMemberVehicleSchema } from "../../../lib/delivery/review-vehicle.js";
import { FixNotPerformedPayloadSchema } from "./fix-not-performed-envelope.js";
import { SlugSchema } from "../../../lib/kernel/schema/slug.js";
import {
  SpineRemedySchema,
} from "../../integration/spine-refusal.js";
import {
  FrontlineFailedRepairReasonSchema,
  FrontlineFailedRetryReasonSchema,
  FrontlineStaleTargetReasonSchema,
  FrontlineTimedOutReasonSchema,
  FrontlineUnavailableRepairReasonSchema,
  FrontlineUnavailableRetryReasonSchema,
} from "../policy/frontline-outcome.js";
import { FrontlineFollowUpAdviceSchema } from "../policy/frontline-follow-up.js";
import {
  ReviewPolicyCommandRequestSchema,
  ReviewResolveEnvelopeSchema,
} from "../policy/review-policy-driver.js";
import { FrontlineSemanticRecordSchema } from "../policy/frontline-semantic.js";
import { ReviewPassSchema } from "./review-pass.js";
import { PrePublicationScopeMismatchSchema } from "./pre-publication-scope-mismatch.js";
import { ReviewCommandErrorCodeSchema, ReviewPrePublicationRefusalCodeSchema } from
  "./review-command-error-codes.js";
import type { ReviewPrePublicationRefusalCode } from "./review-command-error-codes.js";
import { ReviewRoutingProjectionSchema } from "../policy/routing-schema.js";
import { ReviewReductionProjectionSchema } from "./advisory-records.js";
import { NormalizedReviewFindingsSchema } from "./finding-records.js";
import { ProposedDispositionSetSchema } from "./disposition-records.js";
import { ProvisionalPassAssessmentSchema } from "./provisional-pass-assessment.js";
import { FixAuthorizationSchema } from "./fix-authorization-records.js";
import { NormalizedLocalReviewResultSchema } from "./local-review-result.js";
import {
  GitObjectIdSchema,
  ReviewRequestV2Schema,
  ReviewTargetSchema,
} from "./gate-contract-v2-schema.js";
import { LocalReviewerPayloadSchema } from "./local-review-payload.js";
import { LocalReviewCoverageSelectionActionSchema } from "./local-review-coverage.js";
import { FrontlineAdmissionSchema } from "./frontline-admission.js";
import { HostedTargetSchema } from "../hosted/request.js";
import { StandardReviewObligationProjectionSchema } from
  "../policy/standard-review-projection-schema.js";

const CanonicalDigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const IdentifierSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u);
const DurableReferenceSchema = z.string().trim().min(1);
const PersistedVersionSchema = z.number().int().positive();

export const ReviewCommandModeSchema = z.enum([
  "review-readiness",
  "review-resolve",
  "review-frontline-resolve",
  "review-chunking-resolve",
  "review-planning-grooming-resolve",
  "review-frontline-run",
  "review-local-prepare",
  "review-local-attest",
  "review-respond",
  "review-reduce",
  "review-local-resume",
  "review-hosted-request",
  "review-hosted-await",
  "review-hosted-settle",
  "review-terminus-accept",
  "review-pre-publication",
]);
export type ReviewCommandMode = z.infer<typeof ReviewCommandModeSchema>;

export {
  ReviewCommandErrorCodeSchema,
  ReviewPrePublicationRefusalCodeSchema,
  REVIEW_PRE_PUBLICATION_REFUSAL_CODES,
} from "./review-command-error-codes.js";
export type { ReviewCommandErrorCode, ReviewPrePublicationRefusalCode } from "./review-command-error-codes.js";

export { prePublicationRemedy, prePublicationTargetRemedy } from "./pre-publication-remedy.js";

const RepositoryPreconditionDiagnosticSchema = z.strictObject({
  code: z.literal("repository-precondition"),
  message: z.string().trim().min(1),
  precondition: z.enum([
    "repository-born",
    "base-resolved",
    "clean-worktree",
    "commit-head",
  ]),
});
const GeneralReviewCommandDiagnosticSchema = z.strictObject({
  code: z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u),
  message: z.string().trim().min(1),
});
export const ReviewCommandDiagnosticSchema = z.union([
  RepositoryPreconditionDiagnosticSchema,
  GeneralReviewCommandDiagnosticSchema,
]);

const HeaderShape = {
  schemaVersion: z.literal(1),
  diagnostics: z.array(ReviewCommandDiagnosticSchema),
};

const TargetPairPayloadSchema = z.strictObject({
  attemptedTarget: ReviewTargetSchema,
  currentTarget: ReviewTargetSchema,
});
const OperationPayloadShape = {
  operationId: IdentifierSchema,
  persistedVersion: PersistedVersionSchema,
};
const CurrentOperationPayloadShape = {
  ...OperationPayloadShape,
  currentTarget: ReviewTargetSchema,
};
const FrontlineTerminalPayloadShape = {
  ...OperationPayloadShape,
  target: ReviewTargetSchema,
  outcomeRef: DurableReferenceSchema,
  outcomeDigest: CanonicalDigestSchema,
};
const ExecutableIdentitySchema = z.strictObject({
  digest: CanonicalDigestSchema,
  qualifiedVersion: z.string().trim().min(1),
});

function envelopeVariant<
  Mode extends ReviewCommandMode,
  State extends string,
  NextAction extends string,
  Payload extends z.ZodType,
>(
  mode: Mode,
  state: State,
  nextAction: NextAction,
  payload: Payload,
): z.ZodObject<{
  schemaVersion: z.ZodLiteral<1>;
  diagnostics: z.ZodArray<typeof ReviewCommandDiagnosticSchema>;
  mode: z.ZodLiteral<Mode>;
  state: z.ZodLiteral<State>;
  nextAction: z.ZodLiteral<NextAction>;
  payload: Payload;
}> {
  return z.strictObject({
    ...HeaderShape,
    mode: z.literal(mode),
    state: z.literal(state),
    nextAction: z.literal(nextAction),
    payload,
  });
}

const ReviewChunkingBasePayload = {
  target: ReviewTargetSchema,
};
const ReviewChunkingMeasuredPayload = {
  ...ReviewChunkingBasePayload,
  metrics: z.strictObject({
    lines: z.number().int().nonnegative(),
    files: z.number().int().nonnegative(),
  }),
  thresholds: z.strictObject({
    lines: z.number().int().nonnegative(),
    files: z.number().int().nonnegative(),
  }),
};

function trippedReviewChunkingDimensions(payload: {
  metrics: { lines: number; files: number };
  thresholds: { lines: number; files: number };
}): Array<"lines" | "files"> {
  const tripped: Array<"lines" | "files"> = [];
  if (payload.thresholds.lines > 0 && payload.metrics.lines >= payload.thresholds.lines) {
    tripped.push("lines");
  }
  if (payload.thresholds.files > 0 && payload.metrics.files >= payload.thresholds.files) {
    tripped.push("files");
  }
  return tripped;
}

const ReviewChunkingBelowThresholdPayloadSchema = z.strictObject(
  ReviewChunkingMeasuredPayload,
).superRefine((payload, context) => {
  if (payload.thresholds.lines === 0 && payload.thresholds.files === 0) {
    context.addIssue({
      code: "custom",
      message: "disabled review chunking cannot produce a below-threshold result",
      path: ["thresholds"],
    });
  }
  if (trippedReviewChunkingDimensions(payload).length > 0) {
    context.addIssue({
      code: "custom",
      message: "below-threshold metrics must not trip an enabled dimension",
      path: ["metrics"],
    });
  }
});

const ReviewChunkingTrippedPayloadShape = {
  ...ReviewChunkingMeasuredPayload,
  tripped: z.array(z.enum(["lines", "files"])).min(1),
};

function refineReviewChunkingTrippedPayload(
  payload: z.infer<z.ZodObject<typeof ReviewChunkingTrippedPayloadShape>>,
  context: z.RefinementCtx,
): void {
  const expected = trippedReviewChunkingDimensions(payload);
  const exact = payload.tripped.length === expected.length
    && payload.tripped.every((dimension, index) => dimension === expected[index]);
  if (!exact) {
    context.addIssue({
      code: "custom",
      message: "tripped dimensions must exactly match every enabled metric at or above its threshold",
      path: ["tripped"],
    });
  }
}

const ReviewChunkingSilentTrippedPayloadSchema = z.strictObject(
  ReviewChunkingTrippedPayloadShape,
).superRefine(refineReviewChunkingTrippedPayload);

const ReviewChunkingConsiderPayloadSchema = z.strictObject({
  ...ReviewChunkingTrippedPayloadShape,
  remedy: z.literal("review-chunks"),
  recommendedActionText: z.string().trim().min(1),
}).superRefine(refineReviewChunkingTrippedPayload);

const ReviewChunkingDeliveryBoundPayloadSchema = z.strictObject({
  ...ReviewChunkingTrippedPayloadShape,
  planId: IdentifierSchema,
  remedy: z.literal("continue-bound-delivery"),
  recommendedActionText: z.string().trim().min(1),
}).superRefine(refineReviewChunkingTrippedPayload);

export const ReviewChunkingResolveEnvelopeSchema = z.union([
  envelopeVariant(
    "review-chunking-resolve",
    "disabled",
    "none",
    z.strictObject(ReviewChunkingBasePayload),
  ),
  envelopeVariant(
    "review-chunking-resolve",
    "below-threshold",
    "continue-review",
    ReviewChunkingBelowThresholdPayloadSchema,
  ),
  envelopeVariant(
    "review-chunking-resolve",
    "consider-chunks",
    "select-review-scope",
    ReviewChunkingConsiderPayloadSchema,
  ),
  envelopeVariant(
    "review-chunking-resolve",
    "scope-selected",
    "continue-review",
    ReviewChunkingSilentTrippedPayloadSchema,
  ),
  envelopeVariant(
    "review-chunking-resolve",
    "evidence-unavailable",
    "continue-review",
    ReviewChunkingSilentTrippedPayloadSchema,
  ),
  envelopeVariant(
    "review-chunking-resolve",
    "delivery-bound",
    "continue-review",
    ReviewChunkingDeliveryBoundPayloadSchema,
  ),
]);

const PlanningGroomingRoutingPayloadShape = {
  target: ReviewTargetSchema,
  routing: ReviewRoutingProjectionSchema,
  frontline: z.union([
    z.strictObject({ state: z.literal("skipped"), nextAction: z.literal("none") }),
    z.strictObject({
      state: z.literal("continue-review"),
      nextAction: z.literal("continue-review"),
    }),
  ]),
  standard: z.union([
    z.strictObject({
      state: z.literal("exempt"),
      nextAction: z.literal("none"),
      obligation: StandardReviewObligationProjectionSchema.refine(
        (projection) => projection.obligation === "exempt",
        { message: "exempt lane state requires an exempt standard-review obligation" },
      ),
    }),
    z.strictObject({
      state: z.literal("continue-review"),
      nextAction: z.literal("continue-review"),
      obligation: StandardReviewObligationProjectionSchema.refine(
        (projection) => projection.obligation !== "exempt",
        { message: "continued lane state requires a non-exempt standard-review obligation" },
      ),
    }),
  ]),
};

function refinePlanningGroomingRoutingPayload(
  payload: z.infer<z.ZodObject<typeof PlanningGroomingRoutingPayloadShape>>,
  context: z.RefinementCtx,
): void {
  const decision = payload.routing.decision;
  const expectedFrontlineState = decision.frontlineAction === "skip"
    ? "skipped"
    : "continue-review";
  if (payload.frontline.state !== expectedFrontlineState) {
    context.addIssue({
      code: "custom",
      path: ["frontline", "state"],
      message: "frontline lane state must match the routing decision",
    });
  }
  const expectedStandardState = decision.standardReview === "exempt"
    ? "exempt"
    : "continue-review";
  if (payload.standard.state !== expectedStandardState) {
    context.addIssue({
      code: "custom",
      path: ["standard", "state"],
      message: "standard lane state must match the routing decision",
    });
  }
  const projection = payload.standard.obligation;
  const reasonsMatch = projection.reasons.length === decision.reasons.length
    && projection.reasons.every((reason, index) => reason === decision.reasons[index]);
  if (projection.obligation !== decision.standardReview
    || projection.retrigger !== decision.retrigger
    || !reasonsMatch) {
    context.addIssue({
      code: "custom",
      path: ["standard", "obligation"],
      message: "standard lane obligation must be projected from the routing decision",
    });
  }
}

const PlanningGroomingExemptPayloadSchema = z.strictObject({
  ...PlanningGroomingRoutingPayloadShape,
  frontline: z.strictObject({ state: z.literal("skipped"), nextAction: z.literal("none") }),
  standard: z.strictObject({
    state: z.literal("exempt"),
    nextAction: z.literal("none"),
    obligation: StandardReviewObligationProjectionSchema.refine(
      (projection) => projection.obligation === "exempt",
      { message: "exempt lane state requires an exempt standard-review obligation" },
    ),
  }),
}).superRefine(refinePlanningGroomingRoutingPayload);

const PlanningGroomingReviewRequiredPayloadSchema = z.strictObject(
  PlanningGroomingRoutingPayloadShape,
).superRefine(refinePlanningGroomingRoutingPayload).refine(
  (payload) => payload.frontline.state === "continue-review"
    || payload.standard.state === "continue-review",
  { message: "review-required state requires at least one continued lane" },
);

export const PlanningGroomingReviewEnvelopeSchema = z.union([
  envelopeVariant(
    "review-planning-grooming-resolve",
    "exempt",
    "none",
    PlanningGroomingExemptPayloadSchema,
  ),
  envelopeVariant(
    "review-planning-grooming-resolve",
    "review-required",
    "continue-review",
    PlanningGroomingReviewRequiredPayloadSchema,
  ),
  envelopeVariant(
    "review-planning-grooming-resolve",
    "not-eligible",
    "continue-review",
    z.strictObject({
      target: ReviewTargetSchema,
      reason: z.enum([
        "unknown-change-set",
        "non-planning-change",
        "transient-vehicle-required",
      ]),
    }),
  ),
]);

const FrontlineResolveBasePayload = {
  routing: ReviewRoutingProjectionSchema,
  frontlineReview: FrontlineSemanticRecordSchema,
};
const FrontlineReadyPayloadSchema = z.strictObject({
  ...FrontlineResolveBasePayload,
  pass: ReviewPassSchema,
  maxPasses: ReviewPassSchema,
  admission: FrontlineAdmissionSchema,
}).superRefine((payload, context) => {
  if (payload.pass > payload.maxPasses) {
    context.addIssue({
      code: "custom",
      message: "frontline pass exceeds the ready resolution allowance",
      path: ["pass"],
    });
  }
  if (payload.maxPasses !== payload.frontlineReview.maxPasses) {
    context.addIssue({
      code: "custom",
      message: "frontline ready allowance does not match the semantic record",
      path: ["maxPasses"],
    });
  }
  if (payload.pass !== payload.admission.logicalPass
    || payload.maxPasses !== payload.admission.maxPasses
    || !isDeepStrictEqual(payload.routing, payload.admission.routing)
    || !isDeepStrictEqual(payload.frontlineReview, payload.admission.frontlineReview)) {
    context.addIssue({
      code: "custom",
      message: "frontline ready payload must match its durable admission",
      path: ["admission"],
    });
  }
});
export const FrontlineCommandResultEnvelopeSchema = z.union([
  envelopeVariant("review-frontline-resolve", "skipped", "none", z.strictObject(FrontlineResolveBasePayload)),
  envelopeVariant(
    "review-frontline-resolve",
    "offered",
    "bind-source",
    z.strictObject(FrontlineResolveBasePayload),
  ),
  envelopeVariant(
    "review-frontline-resolve",
    "offered",
    "obtain-authorization",
    z.strictObject(FrontlineResolveBasePayload),
  ),
  envelopeVariant(
    "review-frontline-resolve",
    "ready",
    "run-frontline",
    FrontlineReadyPayloadSchema,
  ),
]);
export const FrontlineResolveEnvelopeSchema = z.union([
  ...FrontlineCommandResultEnvelopeSchema.options,
  envelopeVariant("review-frontline-resolve", "stale-target", "refresh-pre-publication", z.strictObject({
    workUnit: SlugSchema, reason: z.string().trim().min(1), command: z.string().trim().min(1),
  })),
]);

const FrontlineCompletedPayloadSchema = z.strictObject({
  ...FrontlineTerminalPayloadShape,
  executableIdentity: ExecutableIdentitySchema.optional(),
});
const FrontlineReasonPayload = <Reason extends z.ZodType>(reason: Reason) => z.strictObject({
  ...FrontlineTerminalPayloadShape,
  executableIdentity: ExecutableIdentitySchema.optional(),
  reason,
});
export const FrontlineRunEnvelopeSchema = z.union([
  envelopeVariant("review-frontline-run", "clean", "none", FrontlineCompletedPayloadSchema),
  envelopeVariant("review-frontline-run", "findings", "respond", FrontlineCompletedPayloadSchema),
  envelopeVariant(
    "review-frontline-run",
    "unavailable",
    "operator-repair",
    FrontlineReasonPayload(FrontlineUnavailableRetryReasonSchema),
  ),
  envelopeVariant(
    "review-frontline-run",
    "unavailable",
    "operator-repair",
    FrontlineReasonPayload(FrontlineUnavailableRepairReasonSchema),
  ),
  envelopeVariant(
    "review-frontline-run",
    "timed-out",
    "operator-repair",
    FrontlineReasonPayload(FrontlineTimedOutReasonSchema),
  ),
  envelopeVariant(
    "review-frontline-run",
    "stale-target",
    "prepare-current-target",
    FrontlineReasonPayload(FrontlineStaleTargetReasonSchema),
  ),
  envelopeVariant(
    "review-frontline-run",
    "failed",
    "operator-repair",
    FrontlineReasonPayload(FrontlineFailedRetryReasonSchema),
  ),
  envelopeVariant(
    "review-frontline-run",
    "failed",
    "operator-repair",
    FrontlineReasonPayload(FrontlineFailedRepairReasonSchema),
  ),
]);

export const LocalPrepareEnvelopeSchema = z.union([
  envelopeVariant("review-local-prepare", "exempt", "none", z.strictObject({})),
  envelopeVariant(
    "review-local-prepare",
    "coverage-required",
    "select-coverage",
    z.strictObject({ coverageSelectionAction: LocalReviewCoverageSelectionActionSchema }),
  ),
  envelopeVariant(
    "review-local-prepare",
    "review-complete",
    "reduce",
    z.strictObject({
      ...OperationPayloadShape,
      target: ReviewTargetSchema,
    }),
  ),
  envelopeVariant(
    "review-local-prepare",
    "ready",
    "launch-review",
    z.strictObject({
      ...OperationPayloadShape,
      target: ReviewTargetSchema,
      request: ReviewRequestV2Schema,
      reviewerPayload: LocalReviewerPayloadSchema,
      sourceRef: DurableReferenceSchema,
      sourceDigest: CanonicalDigestSchema,
    }),
  ),
  envelopeVariant("review-local-prepare", "unavailable", "operator-repair", z.strictObject({})),
  envelopeVariant(
    "review-local-prepare",
    "stale-target",
    "prepare-current-target",
    TargetPairPayloadSchema,
  ),
]);

const NotAttestableResultSchema = NormalizedLocalReviewResultSchema.refine(
  (result) => result.status !== "complete" || result.result === null,
  { message: "complete results with a verdict are attestable" },
);
export const LocalAttestEnvelopeSchema = z.union([
  envelopeVariant(
    "review-local-attest",
    "attested-current",
    "reduce",
    z.strictObject({
      ...OperationPayloadShape,
      target: ReviewTargetSchema,
      sourceRef: DurableReferenceSchema,
      receiptRef: DurableReferenceSchema,
      receiptRecorded: z.literal(true),
    }),
  ),
  envelopeVariant(
    "review-local-attest",
    "stale-target",
    "prepare-current-target",
    z.union([
      z.strictObject({
        ...OperationPayloadShape,
        receiptRecorded: z.literal(false),
        attemptedTarget: ReviewTargetSchema,
        currentTarget: ReviewTargetSchema,
      }),
      z.strictObject({
        ...OperationPayloadShape,
        receiptRecorded: z.literal(true),
        receiptRef: DurableReferenceSchema,
        attemptedTarget: ReviewTargetSchema,
        currentTarget: ReviewTargetSchema,
      }),
    ]),
  ),
  envelopeVariant(
    "review-local-attest",
    "expired",
    "rerun-review",
    z.strictObject(OperationPayloadShape),
  ),
  envelopeVariant(
    "review-local-attest",
    "terminal-operation",
    "rerun-review",
    z.strictObject(OperationPayloadShape),
  ),
  envelopeVariant(
    "review-local-attest",
    "not-attestable",
    "rerun-review",
    z.strictObject({
      ...OperationPayloadShape,
      result: NotAttestableResultSchema,
    }),
  ),
]);

const HostedSettlementPlanSchema = z.strictObject({
  actorIdentity: IdentifierSchema,
  beforeFixFindingIds: z.array(IdentifierSchema),
  afterFixFindingIds: z.array(IdentifierSchema),
});
const DispositionSupersessionResultSchema = z.strictObject({
  status: z.enum(["published", "replayed"]),
  predecessorDispositionSetId: CanonicalDigestSchema,
  successorDispositionSetId: CanonicalDigestSchema,
  carriedFindingIds: z.array(IdentifierSchema),
  reopenedFindingIds: z.array(IdentifierSchema),
});
const DispositionSupersessionRefusalPayloadSchema = z.strictObject({
  operationId: IdentifierSchema,
  predecessorDispositionSetId: CanonicalDigestSchema,
  reason: z.enum([
    "head-moved",
    "unexpected-dirty-paths",
    "predecessor-unavailable",
    "predecessor-not-current",
    "fix-consumed",
    "dirty-paths-without-fix-authorization",
    "successor-conflict",
    "hosted-settlement-conflict",
  ]),
  detail: z.string().trim().min(1),
  attemptedTarget: ReviewTargetSchema.optional(),
  currentHeadSha: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u).optional(),
  unexpectedPaths: z.array(z.string().trim().min(1)).optional(),
  currentDispositionSetId: CanonicalDigestSchema.optional(),
});

/** Exact work-unit locus for authoring a Candidate-bound private-member fix. */
export const CandidateBoundMemberFixAuthoringSchema = z.strictObject({
  kind: z.literal("candidate"),
  workUnit: SlugSchema,
  head: GitObjectIdSchema,
  ref: z.string().trim().min(1),
  checkoutPath: z.string().trim().min(1),
  deliverySuffixReconstruction: z.literal("after-candidate-advance"),
});
export type CandidateBoundMemberFixAuthoring = z.infer<
  typeof CandidateBoundMemberFixAuthoringSchema
>;

const DispositionPayloadSchema = z.strictObject({
  operationId: IdentifierSchema,
  dispositionRecordRef: DurableReferenceSchema,
  dispositionReportText: z.string().trim().min(1),
  policyRequest: ReviewPolicyCommandRequestSchema.optional(),
  policy: ReviewResolveEnvelopeSchema.optional(),
  conditionalPassAuthorizationId: CanonicalDigestSchema.optional(),
  supersession: DispositionSupersessionResultSchema.optional(),
  frontlineFollowUp: FrontlineFollowUpAdviceSchema.optional(),
  hostedSettlementPlan: HostedSettlementPlanSchema.optional(),
});
const DeliveryMemberResponsePayloadSchema = z.strictObject({
  ...DispositionPayloadSchema.shape,
  fixAuthorizationId: CanonicalDigestSchema,
  currentTarget: ReviewTargetSchema,
  hostedFixTarget: HostedTargetSchema,
});
const DeliveryCorrectionActionSchema = z.strictObject({
  argv: z.tuple([
    z.literal("arc"), z.literal("delivery"), z.literal("review-fix"), z.literal("continue"),
    z.literal("-"),
  ]),
  input: z.strictObject({
    repository: z.string().trim().min(1),
    remote: z.string().trim().min(1),
  }),
});
const ConditionalAuthorityWithdrawalPayloadSchema = z.strictObject({
  operationId: IdentifierSchema,
  authorizationId: CanonicalDigestSchema,
  dispositionSetId: CanonicalDigestSchema,
  replayed: z.boolean(),
});
const ConditionalAuthorityWithdrawalRefusalPayloadSchema = z.strictObject({
  operationId: IdentifierSchema,
  authorizationId: CanonicalDigestSchema,
  dispositionSetId: CanonicalDigestSchema,
  reason: z.enum(["consumed", "superseded", "stale-current-set", "foreign-authority"]),
  detail: z.string().trim().min(1),
});
export const RespondEnvelopeSchema = z.union([
  envelopeVariant(
    "review-respond",
    "awaiting-approval",
    "obtain-approval",
    z.strictObject({
      operationId: IdentifierSchema,
      proposal: ProposedDispositionSetSchema,
      supersession: z.strictObject({
        predecessorDispositionSetId: CanonicalDigestSchema,
        expectedFixPaths: z.array(z.string().trim().min(1)),
      }).optional(),
      dispositionReportText: z.string().trim().min(1),
      provisionalPassAssessment: ProvisionalPassAssessmentSchema,
    }),
  ),
  envelopeVariant(
    "review-respond",
    "ready-to-fix",
    "apply-fix",
    z.strictObject({
      ...DispositionPayloadSchema.shape,
      fixAuthorization: FixAuthorizationSchema,
      reentryCommand: z.literal("respond-verified-fix"),
      authoring: CandidateBoundMemberFixAuthoringSchema.optional(),
    }),
  ),
  envelopeVariant(
    "review-respond",
    "delivery-correction-required",
    "continue-delivery-correction",
    z.strictObject({
      ...DispositionPayloadSchema.shape,
      fixAuthorization: FixAuthorizationSchema,
      deliveryMember: DeliveryReviewMemberVehicleSchema,
      correctionAction: DeliveryCorrectionActionSchema,
    }),
  ),
  envelopeVariant(
    "review-respond",
    "ready-to-settle",
    "settle-hosted",
    z.strictObject({
      ...DispositionPayloadSchema.shape,
      hostedSettlementPlan: HostedSettlementPlanSchema,
    }),
  ),
  envelopeVariant(
    "review-respond",
    "supersession-refused",
    "stop",
    DispositionSupersessionRefusalPayloadSchema,
  ),
  envelopeVariant(
    "review-respond",
    "conditional-authority-withdrawn",
    "stop",
    ConditionalAuthorityWithdrawalPayloadSchema,
  ),
  envelopeVariant(
    "review-respond",
    "conditional-authority-withdrawal-refused",
    "stop",
    ConditionalAuthorityWithdrawalRefusalPayloadSchema,
  ),
  envelopeVariant("review-respond", "settled", "reduce", DispositionPayloadSchema),
  envelopeVariant("review-respond", "already-settled", "reduce", DispositionPayloadSchema),
  envelopeVariant("review-respond", "fix-not-performed", "complete-verified-fix", FixNotPerformedPayloadSchema),
  envelopeVariant(
    "review-respond",
    "stale-target",
    "prepare-current-target",
    z.strictObject({
      operationId: IdentifierSchema,
      ...TargetPairPayloadSchema.shape,
    }),
  ),
  envelopeVariant(
    "review-respond",
    "candidate-advanced",
    "continue-review",
    z.strictObject({
      operationId: IdentifierSchema,
      candidateId: CanonicalDigestSchema,
      responseId: CanonicalDigestSchema,
      recordPath: DurableReferenceSchema,
      implementationChanged: z.boolean(),
      dispositionReportText: z.string().trim().min(1),
      policyRequest: ReviewPolicyCommandRequestSchema,
      conditionalPassAuthorizationId: CanonicalDigestSchema.optional(),
    }),
  ),
  envelopeVariant(
    "review-respond",
    "candidate-current",
    "continue-review",
    z.strictObject({
      operationId: IdentifierSchema,
      candidateId: CanonicalDigestSchema,
      recordPath: DurableReferenceSchema,
      implementationChanged: z.boolean(),
      dispositionReportText: z.string().trim().min(1),
      policyRequest: ReviewPolicyCommandRequestSchema,
      conditionalPassAuthorizationId: CanonicalDigestSchema.optional(),
    }),
  ),
  envelopeVariant(
    "review-respond",
    "errand-advanced",
    "continue-review",
    z.strictObject({
      ...DispositionPayloadSchema.shape,
      fixAuthorizationId: CanonicalDigestSchema,
    }),
  ),
  envelopeVariant(
    "review-respond",
    "errand-current",
    "continue-review",
    z.strictObject({
      ...DispositionPayloadSchema.shape,
      fixAuthorizationId: CanonicalDigestSchema,
    }),
  ),
  envelopeVariant(
    "review-respond",
    "delivery-member-advanced",
    "continue-review",
    DeliveryMemberResponsePayloadSchema,
  ),
  envelopeVariant(
    "review-respond",
    "delivery-member-current",
    "continue-review",
    DeliveryMemberResponsePayloadSchema,
  ),
  // Settlement-replay invalidations. The replay runs unattended behind the merge verb, where an
  // exception is only legible as an operation failure, so each refusal carries its own state.
  envelopeVariant(
    "review-respond",
    "actor-mismatch",
    "respond-again",
    z.strictObject({
      operationId: IdentifierSchema,
      actor: z.enum(["approver", "proposer"]),
    }),
  ),
  envelopeVariant(
    "review-respond",
    "missing-record",
    "respond-again",
    z.strictObject({ operationId: IdentifierSchema }),
  ),
]);

const ReductionBasePayload = {
  ...CurrentOperationPayloadShape,
};
const ReductionResponseSourceSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("attested-local"),
    receiptRef: DurableReferenceSchema,
  }),
  z.strictObject({
    kind: z.literal("frontline"),
    outcomeRef: DurableReferenceSchema,
  }),
]);
export const ReduceEnvelopeSchema = z.union([
  envelopeVariant(
    "review-reduce",
    "findings",
    "respond",
    z.strictObject({
      ...ReductionBasePayload,
      projection: ReviewReductionProjectionSchema,
      responseSource: ReductionResponseSourceSchema,
    }),
  ),
  envelopeVariant(
    "review-reduce",
    "settled",
    "none",
    z.strictObject({ ...ReductionBasePayload, projection: ReviewReductionProjectionSchema }),
  ),
  envelopeVariant(
    "review-reduce",
    "advisory-complete",
    "none",
    z.strictObject({
      ...ReductionBasePayload,
      projection: ReviewReductionProjectionSchema,
      frontlineOutcomeRef: DurableReferenceSchema.optional(),
      frontlineFollowUp: FrontlineFollowUpAdviceSchema.optional(),
    }),
  ),
  envelopeVariant(
    "review-reduce",
    "retryable",
    "retry",
    z.strictObject({
      ...ReductionBasePayload,
      retryCommand: z.enum(["local-attest", "frontline-run"]),
      requestRef: DurableReferenceSchema,
    }),
  ),
  envelopeVariant(
    "review-reduce",
    "retryable",
    "operator-repair",
    z.strictObject({
      ...ReductionBasePayload,
      retryCommand: z.literal("frontline-run"),
      requestRef: DurableReferenceSchema,
      retryOfOperationId: IdentifierSchema,
    }),
  ),
  envelopeVariant(
    "review-reduce",
    "stale-target",
    "prepare-current-target",
    z.strictObject({
      ...OperationPayloadShape,
      ...TargetPairPayloadSchema.shape,
    }),
  ),
]);
export type ReviewReduceEnvelope = z.infer<typeof ReduceEnvelopeSchema>;

const ResumeBasePayload = {
  ...CurrentOperationPayloadShape,
};
export const LocalResumeResponsePlanSchema = z.strictObject({
  schemaVersion: z.literal(1),
  target: ReviewTargetSchema,
  source: z.strictObject({
    kind: z.literal("attested-local"),
    receiptRef: DurableReferenceSchema,
  }),
  findings: NormalizedReviewFindingsSchema.refine((findings) => findings.length > 0),
});
export const LocalResumeEnvelopeSchema = z.union([
  envelopeVariant(
    "review-local-resume",
    "suspended",
    "wait",
    z.strictObject(ResumeBasePayload),
  ),
  envelopeVariant(
    "review-local-resume",
    "review-complete",
    "reduce",
    z.strictObject({ ...ResumeBasePayload, receiptRef: DurableReferenceSchema }),
  ),
  envelopeVariant(
    "review-local-resume",
    "respond-to-findings",
    "respond",
    z.strictObject({
      ...ResumeBasePayload,
      receiptRef: DurableReferenceSchema,
      responsePlan: LocalResumeResponsePlanSchema,
    }),
  ),
  envelopeVariant(
    "review-local-resume",
    "stale-target",
    "prepare-current-target",
    z.strictObject({
      ...OperationPayloadShape,
      ...TargetPairPayloadSchema.shape,
    }),
  ),
  envelopeVariant(
    "review-local-resume",
    "expired",
    "rerun-review",
    z.strictObject(ResumeBasePayload),
  ),
  envelopeVariant(
    "review-local-resume",
    "terminal-operation",
    "rerun-review",
    z.strictObject(ResumeBasePayload),
  ),
]);

export const ReviewCommandErrorEnvelopeSchema = z.union([
  ...ReviewCommandModeSchema.options
    .filter((mode) => mode !== "review-pre-publication")
    .flatMap((mode) => ReviewCommandErrorCodeSchema.options.map((code) => errorVariant(mode, code))),
  // The pre-publication verb is the review spine's middle verb, so its refusals carry the same
  // corrective guidance the checkpoint and merge verbs do.
  ...ReviewPrePublicationRefusalCodeSchema.options
    .filter((code) => code !== "scope-judgment-required")
    .map((code) => remedialErrorVariant("review-pre-publication", code)),
  remedialErrorVariant("review-pre-publication", "scope-judgment-required")
    .extend({ scopeMismatch: PrePublicationScopeMismatchSchema }),
]);

function errorVariant<Mode extends ReviewCommandMode, Code extends ReviewPrePublicationRefusalCode>(
  mode: Mode,
  code: Code,
): z.ZodObject<{
  schemaVersion: z.ZodLiteral<1>;
  diagnostics: z.ZodArray<typeof ReviewCommandDiagnosticSchema>;
  mode: z.ZodLiteral<Mode>;
  error: z.ZodObject<{
    code: z.ZodLiteral<Code>;
    message: z.ZodString;
  }>;
}> {
  return z.strictObject({
    ...HeaderShape,
    mode: z.literal(mode),
    error: z.strictObject({
      code: z.literal(code),
      message: z.string().trim().min(1),
    }),
  });
}

function remedialErrorVariant<Mode extends ReviewCommandMode, Code extends ReviewPrePublicationRefusalCode>(
  mode: Mode,
  code: Code,
): z.ZodObject<{
  schemaVersion: z.ZodLiteral<1>;
  diagnostics: z.ZodArray<typeof ReviewCommandDiagnosticSchema>;
  mode: z.ZodLiteral<Mode>;
  error: z.ZodObject<{
    code: z.ZodLiteral<Code>;
    message: z.ZodString;
  }>;
  remedy: typeof SpineRemedySchema;
}> {
  return errorVariant(mode, code).extend({ remedy: SpineRemedySchema });
}

export { registerReviewCommandEnvelopeSchemas } from "./review-command-envelope-registry.js";
