/** Exact-target review, check, and base-status reduction. */

import { z } from "zod";

import {
  DeliveryReviewMemberVehicleSchema,
  type DeliveryReviewMemberVehicle,
} from "../../lib/delivery/review-vehicle.js";
import { ChangeRequestTargetRefSchema } from "./change-request.js";
import {
  SpineRemedySchema,
  spineRemedy,
  type SpineRemedy,
} from "../integration/spine-refusal.js";
import { GitObjectIdSchema } from "./core/gate-contract-v2-schema.js";
import {
  HostedProviderIdSchema,
  HostedRequestEnvelopeSchema,
  HostedTargetSchema,
} from "./hosted/request.js";
import { ReviewContributionApplicabilityResultSchema } from
  "./policy/review-contribution-applicability.js";
import {
  ReviewApplicabilityDecisionProjectionSchema,
  ReviewApplicabilitySelectionOfferSchema,
} from "./policy/review-applicability-resolution.js";
import { HostedFindingsResponsePlanSchema } from "./core/response-plan-schema.js";
import {
  ReviewCeilingOverrideSchema,
  type ReviewCeilingOverride,
  type ReviewResolveEnvelope,
} from "./policy/review-policy-driver.js";
import {
  DeliveryLocalReviewAdmissionSchema,
  DeliveryLocalReviewSelectionSchema,
} from "./policy/delivery-local-review-admission.js";

const ObjectIdSchema = GitObjectIdSchema;
const BlockedReviewApplicabilitySchema = ReviewContributionApplicabilityResultSchema.refine(
  (projection) => projection.state !== "applicable" && projection.state !== "decision-required",
  "blocked review applicability must carry a closed non-decision result",
);

export const ReviewStatusTargetInputSchema = z.strictObject({
  target: ChangeRequestTargetRefSchema,
  ceilingOverride: ReviewCeilingOverrideSchema.optional(),
});
export type ReviewStatusTargetInput = z.infer<typeof ReviewStatusTargetInputSchema>;

export const DeliveryReviewConjunctionMemberSchema = z.strictObject({
  target: HostedTargetSchema,
  vehicle: DeliveryReviewMemberVehicleSchema,
  state: z.enum(["discharged", "outstanding"]),
  detail: z.string().min(1),
});

export const DeliveryReviewConjunctionSchema = z.strictObject({
  kind: z.literal("delivery"),
  status: z.enum(["discharged", "outstanding"]),
  members: z.array(DeliveryReviewConjunctionMemberSchema).min(1),
}).superRefine((conjunction, context) => {
  const discharged = conjunction.members.every((member) => member.state === "discharged");
  if ((conjunction.status === "discharged") !== discharged) {
    context.addIssue({
      code: "custom",
      path: ["status"],
      message: "delivery review conjunction status must match its complete member set",
    });
  }
});
export type DeliveryReviewConjunction = z.infer<typeof DeliveryReviewConjunctionSchema>;

export const DeliveryLocalResumeActionSchema = z.strictObject({
  schemaVersion: z.literal(1),
  operationId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u),
});

export const RoutedReviewObligationSchema = z.union([
  z.strictObject({
    state: z.enum(["settled", "review-required", "blocked"]),
    detail: z.string().min(1),
  }),
  z.strictObject({
    state: z.literal("settled"),
    detail: z.string().min(1),
    conjunction: DeliveryReviewConjunctionSchema.refine(
      (conjunction) => conjunction.status === "discharged",
      "settled delivery review requires a discharged conjunction",
    ),
  }),
  z.strictObject({
    state: z.literal("review-required"),
    detail: z.string().min(1),
    conjunction: DeliveryReviewConjunctionSchema.refine(
      (conjunction) => conjunction.status === "outstanding",
      "delivery review requires an outstanding conjunction",
    ),
    action: HostedRequestEnvelopeSchema,
  }),
  z.strictObject({
    state: z.literal("review-required"),
    detail: z.string().min(1),
    conjunction: DeliveryReviewConjunctionSchema.refine(
      (conjunction) => conjunction.status === "outstanding",
      "delivery local review requires an outstanding conjunction",
    ),
    localAction: DeliveryLocalReviewSelectionSchema,
  }),
  z.strictObject({
    state: z.literal("review-required"),
    detail: z.string().min(1),
    conjunction: DeliveryReviewConjunctionSchema.refine(
      (conjunction) => conjunction.status === "outstanding",
      "delivery local review resume requires an outstanding conjunction",
    ),
    localResumeAction: DeliveryLocalResumeActionSchema,
  }),
  z.strictObject({
    state: z.literal("review-required"),
    detail: z.string().min(1),
    conjunction: DeliveryReviewConjunctionSchema.refine(
      (conjunction) => conjunction.status === "outstanding",
      "delivery review applicability requires an outstanding conjunction",
    ),
    selectionAction: ReviewApplicabilitySelectionOfferSchema,
  }),
  z.strictObject({
    state: z.literal("review-required"),
    detail: z.string().min(1),
    conjunction: DeliveryReviewConjunctionSchema.refine(
      (conjunction) => conjunction.status === "outstanding",
      "delivery findings response requires an outstanding conjunction",
    ),
    responsePlan: HostedFindingsResponsePlanSchema,
  }),
  z.strictObject({
    state: z.literal("approval-required"),
    detail: z.string().min(1),
    conjunction: DeliveryReviewConjunctionSchema.refine(
      (conjunction) => conjunction.status === "outstanding",
      "delivery review ceiling approval requires an outstanding conjunction",
    ),
    consequence: ReviewCeilingOverrideSchema,
  }),
  z.strictObject({
    state: z.literal("applicability-blocked"),
    detail: z.string().min(1),
    conjunction: DeliveryReviewConjunctionSchema.refine(
      (conjunction) => conjunction.status === "outstanding",
      "blocked review applicability requires an outstanding conjunction",
    ),
    applicability: BlockedReviewApplicabilitySchema,
  }),
  z.strictObject({
    state: z.literal("applicability-conflict"),
    detail: z.string().min(1),
    conjunction: DeliveryReviewConjunctionSchema.refine(
      (conjunction) => conjunction.status === "outstanding",
      "conflicting review applicability requires an outstanding conjunction",
    ),
    applicability: ReviewApplicabilityDecisionProjectionSchema,
  }),
]);
export type RoutedReviewObligation = z.infer<typeof RoutedReviewObligationSchema>;

/**
 * Compose the ordered delivery-member conjunction and its next executable hosted request.
 *
 * @param input - Ordered retained targets and each target's independently projected discharge.
 * @returns Settled conjunction, first-outstanding hosted action, or a contained blocked result.
 */
export function composeDeliveryReviewObligation(input: {
  targets: readonly {
    repository: string;
    pullRequest: number;
    headSha: string;
    vehicle: DeliveryReviewMemberVehicle;
  }[];
  discharges: readonly {
    discharged: boolean;
    detail: string;
    nextSource: string | null;
    applicability?: z.infer<typeof ReviewContributionApplicabilityResultSchema>;
    applicabilityAuthority?: "decision-required" | "blocked";
    responsePlan?: z.infer<typeof HostedFindingsResponsePlanSchema>;
    localResumeAction?: z.infer<typeof DeliveryLocalResumeActionSchema>;
    requestAdmission?: ReviewResolveEnvelope;
    requestCeilingOverride?: ReviewCeilingOverride;
  }[];
  applicabilityContext?: {
    workUnitId: string;
    expectedRecordVersion: string;
    candidateId: string;
  };
}): RoutedReviewObligation {
  if (input.targets.length === 0 || input.targets.length !== input.discharges.length) {
    return {
      state: "blocked",
      detail: "The delivery review conjunction could not be composed from a complete retained target set.",
    };
  }
  const members = input.targets.map((target, index) => {
    const discharge = input.discharges[index];
    if (discharge === undefined) throw new Error("delivery review discharge is unavailable");
    return {
      target: HostedTargetSchema.parse({
        repository: target.repository,
        pullRequest: target.pullRequest,
        headSha: target.headSha,
      }),
      vehicle: target.vehicle,
      state: discharge.discharged ? "discharged" as const : "outstanding" as const,
      detail: discharge.detail,
    };
  });
  const firstOutstandingIndex = input.discharges.findIndex((discharge) => !discharge.discharged);
  if (firstOutstandingIndex < 0) {
    return RoutedReviewObligationSchema.parse({
      state: "settled",
      detail: "Every retained delivery-member review is discharged.",
      conjunction: { kind: "delivery", status: "discharged", members },
    });
  }
  const target = input.targets[firstOutstandingIndex];
  const discharge = input.discharges[firstOutstandingIndex];
  if (discharge?.applicability?.state === "decision-required"
    && discharge.applicabilityAuthority === "blocked") {
    return RoutedReviewObligationSchema.parse({
      state: "applicability-conflict",
      detail: discharge.detail,
      conjunction: { kind: "delivery", status: "outstanding", members },
      applicability: discharge.applicability,
    });
  }
  if (discharge?.applicability?.state === "decision-required"
    && discharge.applicabilityAuthority !== "blocked") {
    if (input.applicabilityContext === undefined) {
      return {
        state: "blocked",
        detail: "The review applicability decision is missing its canonical Candidate coordinates.",
      };
    }
    return RoutedReviewObligationSchema.parse({
      state: "review-required",
      detail: discharge.detail,
      conjunction: { kind: "delivery", status: "outstanding", members },
      selectionAction: {
        schemaVersion: 1,
        kind: "review-applicability-selection",
        workUnitId: input.applicabilityContext.workUnitId,
        expectedRecordVersion: input.applicabilityContext.expectedRecordVersion,
        candidateId: input.applicabilityContext.candidateId,
        projection: discharge.applicability,
        choices: ["covered", "review-required"],
        interactionText: "Choose `covered` only when the exact residual is already covered; otherwise choose "
          + "`review-required`.",
      },
    });
  }
  if (discharge?.applicability !== undefined
    && discharge.applicability.state !== "applicable"
    && discharge.applicability.state !== "decision-required") {
    return RoutedReviewObligationSchema.parse({
      state: "applicability-blocked",
      detail: discharge.detail,
      conjunction: { kind: "delivery", status: "outstanding", members },
      applicability: discharge.applicability,
    });
  }
  if (discharge?.responsePlan !== undefined) {
    return RoutedReviewObligationSchema.parse({
      state: "review-required",
      detail: discharge.detail,
      conjunction: { kind: "delivery", status: "outstanding", members },
      responsePlan: discharge.responsePlan,
    });
  }
  if (discharge?.localResumeAction !== undefined) {
    return RoutedReviewObligationSchema.parse({
      state: "review-required",
      detail: discharge.detail,
      conjunction: { kind: "delivery", status: "outstanding", members },
      localResumeAction: discharge.localResumeAction,
    });
  }
  if (discharge?.requestAdmission?.state === "approval-required") {
    return RoutedReviewObligationSchema.parse({
      state: "approval-required",
      detail: discharge.detail,
      conjunction: { kind: "delivery", status: "outstanding", members },
      consequence: discharge.requestAdmission.payload.consequence,
    });
  }
  if (target === undefined || discharge === undefined || discharge.nextSource === null) {
    return {
      state: "blocked",
      detail: "The first outstanding delivery member has no admissible reserved standard-review source.",
    };
  }
  if (discharge.requestAdmission === undefined) {
    return {
      state: "blocked",
      detail: "The first outstanding delivery member has no standard-review driver admission.",
    };
  }
  if (discharge.requestAdmission.state !== "ready"
    || (discharge.requestAdmission.nextAction !== "hosted-request"
      && discharge.requestAdmission.nextAction !== "local-prepare")) {
    return {
      state: "blocked",
      detail: `The standard-review driver refused a member review request (${discharge.requestAdmission.state}).`,
    };
  }
  if (discharge.requestAdmission.payload.sourceId !== discharge.nextSource) {
    return {
      state: "blocked",
      detail: "The discharge projection and standard-review driver selected different sources.",
    };
  }
  if (discharge.requestAdmission.payload.ceilingOverrideApplied
    !== (discharge.requestCeilingOverride !== undefined)) {
    return {
      state: "blocked",
      detail: "The standard-review driver and member review action disagree about ceiling-override admission.",
    };
  }
  if (discharge.requestAdmission.nextAction === "local-prepare") {
    if (discharge.nextSource !== "delegated-agent") {
      return {
        state: "blocked",
        detail: "The standard-review driver selected an unsupported local review source.",
      };
    }
    return RoutedReviewObligationSchema.parse({
      state: "review-required",
      detail: discharge.detail,
      conjunction: { kind: "delivery", status: "outstanding", members },
      localAction: {
        schemaVersion: 1,
        sourceId: "delegated-agent",
        target: HostedTargetSchema.parse({
          repository: target.repository,
          pullRequest: target.pullRequest,
          headSha: target.headSha,
        }),
        vehicle: target.vehicle,
        pass: discharge.requestAdmission.payload.pass,
        ...(discharge.requestCeilingOverride === undefined
          ? {}
          : { ceilingOverride: discharge.requestCeilingOverride }),
      },
    });
  }
  const provider = HostedProviderIdSchema.safeParse(discharge.nextSource);
  if (!provider.success) {
    return {
      state: "blocked",
      detail: `The next reserved source \`${discharge.nextSource}\` is not a hosted request provider.`,
    };
  }
  return RoutedReviewObligationSchema.parse({
    state: "review-required",
    detail: discharge.detail,
    conjunction: { kind: "delivery", status: "outstanding", members },
    action: {
      schemaVersion: 1,
      target: HostedTargetSchema.parse({
        repository: target.repository,
        pullRequest: target.pullRequest,
        headSha: target.headSha,
      }),
      provider: provider.data,
      coverage: "complete",
      vehicle: target.vehicle,
      ...(discharge.requestCeilingOverride === undefined
        ? {}
        : { ceilingOverride: discharge.requestCeilingOverride }),
    },
  });
}

export const RequiredCheckStatusSchema = z.enum(["green", "pending", "failed", "not-required", "unavailable"]);
export type RequiredCheckStatus = z.infer<typeof RequiredCheckStatusSchema>;

const ReviewStatusBaseShape = {
  schemaVersion: z.literal(1),
  mode: z.literal("review-status"),
  target: ChangeRequestTargetRefSchema,
  requiredChecks: RequiredCheckStatusSchema,
  routedObligation: RoutedReviewObligationSchema,
  currentBaseOid: GitObjectIdSchema.nullable(),
};

const ReviewStatusSettledSchema = z.strictObject({
  ...ReviewStatusBaseShape,
  state: z.literal("settled"),
  nextAction: z.literal("continue-reconcile"),
});
const ReviewStatusRunReviewSchema = z.strictObject({
  ...ReviewStatusBaseShape,
  state: z.literal("review-required"),
  nextAction: z.literal("run-review"),
});
const ReviewStatusHostedRequestSchema = z.strictObject({
  ...ReviewStatusBaseShape,
  state: z.literal("review-required"),
  nextAction: z.literal("review-hosted-request"),
  action: HostedRequestEnvelopeSchema,
});
const ReviewStatusLocalPrepareSchema = z.strictObject({
  ...ReviewStatusBaseShape,
  state: z.literal("review-required"),
  nextAction: z.literal("review-local-prepare"),
  action: DeliveryLocalReviewAdmissionSchema,
});
const ReviewStatusLocalResumeSchema = z.strictObject({
  ...ReviewStatusBaseShape,
  state: z.literal("review-required"),
  nextAction: z.literal("review-local-resume"),
  action: DeliveryLocalResumeActionSchema,
});
const ReviewStatusApplicabilitySelectionSchema = z.strictObject({
  ...ReviewStatusBaseShape,
  state: z.literal("review-required"),
  nextAction: z.literal("resolve-review-applicability"),
  selectionAction: ReviewApplicabilitySelectionOfferSchema,
});
const ReviewStatusFindingsResponseSchema = z.strictObject({
  ...ReviewStatusBaseShape,
  state: z.literal("review-required"),
  nextAction: z.literal("respond-to-findings"),
  responsePlan: HostedFindingsResponsePlanSchema,
});
const ReviewStatusCeilingApprovalSchema = z.strictObject({
  ...ReviewStatusBaseShape,
  state: z.literal("approval-required"),
  nextAction: z.literal("obtain-ceiling-override"),
  consequence: ReviewCeilingOverrideSchema,
});
const ReviewStatusApplicabilityRerunSchema = z.strictObject({
  ...ReviewStatusBaseShape,
  state: z.literal("applicability-rerun"),
  nextAction: z.literal("rerun-checkpoint"),
  applicability: BlockedReviewApplicabilitySchema,
});
const ReviewStatusApplicabilityUnsupportedSchema = z.strictObject({
  ...ReviewStatusBaseShape,
  state: z.literal("applicability-unsupported"),
  nextAction: z.literal("upgrade"),
  applicability: BlockedReviewApplicabilitySchema,
});
const ReviewStatusApplicabilityBlockedSchema = z.strictObject({
  ...ReviewStatusBaseShape,
  state: z.literal("blocked"),
  nextAction: z.literal("stop"),
  reason: z.enum(["applicability-failed", "applicability-unavailable"]),
  detail: z.string().trim().min(1),
  remedy: SpineRemedySchema,
  applicability: BlockedReviewApplicabilitySchema,
});
const ReviewStatusApplicabilityConflictSchema = z.strictObject({
  ...ReviewStatusBaseShape,
  state: z.literal("blocked"),
  nextAction: z.literal("stop"),
  reason: z.literal("applicability-selection-conflict"),
  detail: z.string().trim().min(1),
  remedy: SpineRemedySchema,
  applicability: ReviewApplicabilityDecisionProjectionSchema,
});
const ReviewStatusChecksPendingSchema = z.strictObject({
  ...ReviewStatusBaseShape,
  state: z.literal("checks-pending"),
  nextAction: z.literal("rerun-checkpoint"),
});
const ReviewStatusBaseMovedSchema = z.strictObject({
  ...ReviewStatusBaseShape,
  state: z.literal("base-moved"),
  nextAction: z.literal("rerun-checkpoint"),
});
const ReviewStatusBlockedSchema = z.strictObject({
  ...ReviewStatusBaseShape,
  state: z.literal("blocked"),
  nextAction: z.literal("stop"),
  reason: z.enum(["stale-target", "checks-failed", "status-unavailable"]),
  detail: z.string().trim().min(1),
  remedy: SpineRemedySchema,
});
export type ReviewStatusResult =
  | z.infer<typeof ReviewStatusSettledSchema>
  | z.infer<typeof ReviewStatusRunReviewSchema>
  | z.infer<typeof ReviewStatusHostedRequestSchema>
  | z.infer<typeof ReviewStatusLocalPrepareSchema>
  | z.infer<typeof ReviewStatusLocalResumeSchema>
  | z.infer<typeof ReviewStatusApplicabilitySelectionSchema>
  | z.infer<typeof ReviewStatusFindingsResponseSchema>
  | z.infer<typeof ReviewStatusCeilingApprovalSchema>
  | z.infer<typeof ReviewStatusApplicabilityRerunSchema>
  | z.infer<typeof ReviewStatusApplicabilityUnsupportedSchema>
  | z.infer<typeof ReviewStatusApplicabilityBlockedSchema>
  | z.infer<typeof ReviewStatusApplicabilityConflictSchema>
  | z.infer<typeof ReviewStatusChecksPendingSchema>
  | z.infer<typeof ReviewStatusBaseMovedSchema>
  | z.infer<typeof ReviewStatusBlockedSchema>;
const ReviewStatusResultSchemaInternal: z.ZodType<ReviewStatusResult> = z.union([
  ReviewStatusSettledSchema,
  ReviewStatusRunReviewSchema,
  ReviewStatusHostedRequestSchema,
  ReviewStatusLocalPrepareSchema,
  ReviewStatusLocalResumeSchema,
  ReviewStatusApplicabilitySelectionSchema,
  ReviewStatusFindingsResponseSchema,
  ReviewStatusCeilingApprovalSchema,
  ReviewStatusApplicabilityRerunSchema,
  ReviewStatusApplicabilityUnsupportedSchema,
  ReviewStatusApplicabilityBlockedSchema,
  ReviewStatusApplicabilityConflictSchema,
  ReviewStatusChecksPendingSchema,
  ReviewStatusBaseMovedSchema,
  ReviewStatusBlockedSchema,
]);
export const ReviewStatusResultSchema: z.ZodType<ReviewStatusResult> = ReviewStatusResultSchemaInternal;

const ReviewStatusCommandResultSchemaInternal = z.union([
  ReviewStatusResultSchema,
  z.strictObject({
    schemaVersion: z.literal(1),
    mode: z.literal("review-status"),
    target: ChangeRequestTargetRefSchema.nullable(),
    requiredChecks: z.literal("unavailable"),
    routedObligation: z.strictObject({ state: z.literal("blocked"), detail: z.string().trim().min(1) }),
    currentBaseOid: z.null(),
    state: z.literal("blocked"),
    nextAction: z.literal("stop"),
    reason: z.enum(["invalid-input", "status-unavailable"]),
    detail: z.string().trim().min(1),
    remedy: SpineRemedySchema,
  }),
]);
export type ReviewStatusCommandResult = z.infer<typeof ReviewStatusCommandResultSchemaInternal>;
export const ReviewStatusCommandResultSchema: z.ZodType<ReviewStatusCommandResult> =
  ReviewStatusCommandResultSchemaInternal;

export interface ReviewStatusObservation {
  actualHeadSha: string;
  requiredChecks: RequiredCheckStatus;
  routedObligation: RoutedReviewObligation;
  currentBaseOid: string | null;
  baseContained: boolean;
}

export interface ReviewStatusPort {
  observe(
    target: z.infer<typeof ChangeRequestTargetRefSchema>,
    ceilingOverride?: ReviewCeilingOverride,
  ): Promise<ReviewStatusObservation>;
}

/** Reduce live exact-target evidence to one orchestration action. */
export async function resolveReviewStatus(
  input: ReviewStatusTargetInput,
  port: ReviewStatusPort,
): Promise<ReviewStatusResult> {
  const request = ReviewStatusTargetInputSchema.parse(input);
  const observation = await port.observe(request.target, request.ceilingOverride);
  const actualHeadSha = ObjectIdSchema.parse(observation.actualHeadSha);
  const base = {
    schemaVersion: 1 as const,
    mode: "review-status" as const,
    target: request.target,
    requiredChecks: RequiredCheckStatusSchema.parse(observation.requiredChecks),
    routedObligation: RoutedReviewObligationSchema.parse(observation.routedObligation),
    currentBaseOid: observation.currentBaseOid === null
      ? null
      : ObjectIdSchema.parse(observation.currentBaseOid),
  };
  if (actualHeadSha !== request.target.headSha) {
    return {
      ...base,
      state: "blocked",
      nextAction: "stop",
      reason: "stale-target",
      detail: `The target head moved to ${actualHeadSha}.`,
      remedy: spineRemedy(
        "Review status must be recomposed for the current branch head.",
        "Resolve the current change request",
        [
          "arc", "review", "change-request", "resolve",
          "--head-ref", request.target.headRef,
          "--head-sha", actualHeadSha,
          "--json",
        ],
      ),
    };
  }
  if (!observation.baseContained && base.currentBaseOid !== null) {
    return { ...base, state: "base-moved", nextAction: "rerun-checkpoint" };
  }
  if (base.routedObligation.state === "applicability-blocked") {
    const applicability = base.routedObligation.applicability;
    if (applicability.nextAction === "rerun-checkpoint") {
      return { ...base, state: "applicability-rerun", nextAction: "rerun-checkpoint", applicability };
    }
    if (applicability.nextAction === "upgrade") {
      return { ...base, state: "applicability-unsupported", nextAction: "upgrade", applicability };
    }
    return {
      ...base,
      state: "blocked",
      nextAction: "stop",
      reason: applicability.state === "classification-failed"
        ? "applicability-failed"
        : "applicability-unavailable",
      detail: base.routedObligation.detail,
      remedy: reviewStatusRetryRemedy(request.target),
      applicability,
    };
  }
  if (base.routedObligation.state === "applicability-conflict") {
    return {
      ...base,
      state: "blocked",
      nextAction: "stop",
      reason: "applicability-selection-conflict",
      detail: base.routedObligation.detail,
      remedy: reviewStatusRetryRemedy(request.target),
      applicability: base.routedObligation.applicability,
    };
  }
  if (base.routedObligation.state === "approval-required") {
    return {
      ...base,
      state: "approval-required",
      nextAction: "obtain-ceiling-override",
      consequence: base.routedObligation.consequence,
    };
  }
  if (base.currentBaseOid === null || base.routedObligation.state === "blocked") {
    return {
      ...base,
      state: "blocked",
      nextAction: "stop",
      reason: "status-unavailable",
      detail: base.currentBaseOid === null
        ? "The current base revision is unavailable."
        : base.routedObligation.detail,
      remedy: reviewStatusRetryRemedy(request.target),
    };
  }
  if (base.routedObligation.state === "review-required") {
    if ("responsePlan" in base.routedObligation) {
      return {
        ...base,
        state: "review-required",
        nextAction: "respond-to-findings",
        responsePlan: base.routedObligation.responsePlan,
      };
    }
    if ("selectionAction" in base.routedObligation) {
      return {
        ...base,
        state: "review-required",
        nextAction: "resolve-review-applicability",
        selectionAction: base.routedObligation.selectionAction,
      };
    }
    if ("action" in base.routedObligation) {
      return {
        ...base,
        state: "review-required",
        nextAction: "review-hosted-request",
        action: base.routedObligation.action,
      };
    }
    if ("localAction" in base.routedObligation) {
      return {
        ...base,
        state: "review-required",
        nextAction: "review-local-prepare",
        action: DeliveryLocalReviewAdmissionSchema.parse({
          ...base.routedObligation.localAction,
          statusTarget: request.target,
        }),
      };
    }
    if ("localResumeAction" in base.routedObligation) {
      return {
        ...base,
        state: "review-required",
        nextAction: "review-local-resume",
        action: base.routedObligation.localResumeAction,
      };
    }
    return { ...base, state: "review-required", nextAction: "run-review" };
  }
  if (base.requiredChecks === "pending") {
    return { ...base, state: "checks-pending", nextAction: "rerun-checkpoint" };
  }
  if (base.requiredChecks === "failed" || base.requiredChecks === "unavailable") {
    return {
      ...base,
      state: "blocked",
      nextAction: "stop",
      reason: base.requiredChecks === "failed" ? "checks-failed" : "status-unavailable",
      detail: base.requiredChecks === "failed"
        ? "One or more required checks failed."
        : "Required-check status is unavailable.",
      remedy: reviewStatusRetryRemedy(request.target),
    };
  }
  return { ...base, state: "settled", nextAction: "continue-reconcile" };
}

function reviewStatusRetryRemedy(target: z.infer<typeof ChangeRequestTargetRefSchema>): SpineRemedy {
  return spineRemedy(
    "Review status must be recomposed from an exact current target.",
    "Resolve the reported condition, then re-run",
    ["arc", "review", "status", "--target", JSON.stringify(target), "--json"],
  );
}
