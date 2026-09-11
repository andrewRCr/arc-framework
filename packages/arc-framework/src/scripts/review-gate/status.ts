/** Exact-target review, check, and base-status reduction. */

import { z } from "zod";

import { SlugSchema } from "../../lib/kernel/schema/slug.js";
import {
  DeliveryReviewMemberVehicleSchema,
  sameDeliveryReviewMemberIdentity,
  sameDeliveryReviewMemberVehicle,
  type DeliveryReviewMemberVehicle,
} from "../../lib/delivery/review-vehicle.js";
import type { DeliveryTerminalCoordinateAdvanceProof } from
  "../../lib/delivery/public-review-continuation.js";
import { ChangeRequestTargetRefSchema } from "./change-request.js";
import {
  SpineRemedySchema,
  spineRemedy,
  type SpineRemedy,
} from "../integration/spine-refusal.js";
import { GitObjectIdSchema } from "./core/gate-contract-v2-schema.js";
import type { IncrementalReviewScope } from "./core/incremental-review-scope.js";
import { hostedProviderAdmitsCoverage } from "./hosted/correction-review-capability.js";
import {
  HostedProviderIdSchema,
  HostedReviewCoverageSchema,
  HostedRequestEnvelopeSchema,
  HostedTargetSchema,
  type HostedReviewCoverage,
} from "./hosted/request.js";
import { HostedAwaitEnvelopeSchema } from "./hosted/await.js";
import { ReviewContributionApplicabilityResultSchema } from
  "./policy/review-contribution-applicability.js";
import {
  ReviewApplicabilityDecisionProjectionSchema,
  ReviewApplicabilitySelectionBatchOfferSchema,
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
  DeliveryLocalReviewScopeSelectionSchema,
  DeliveryLocalReviewSelectionSchema,
} from "./policy/delivery-local-review-admission.js";
import {
  DeliveryReviewTerminusAcceptanceActionSchema,
} from "./policy/delivery-review-terminus.js";
import type { DeliveryReviewMemberTerminus } from "./policy/review-terminus.js";
import {
  ReviewCoverageSelectionActionSchema,
  selectReviewCoverageChoice,
  type ReviewCoverageSelectionAction,
} from "./policy/review-coverage-selection.js";

const ObjectIdSchema = GitObjectIdSchema;
export const ReviewStatusSourceIdSchema = z.union([
  HostedProviderIdSchema,
  z.literal("delegated-agent"),
]);
const BlockedReviewApplicabilitySchema = ReviewContributionApplicabilityResultSchema.refine(
  (projection) => projection.state !== "applicable" && projection.state !== "decision-required",
  "blocked review applicability must carry a closed non-decision result",
);
const ReviewApplicabilitySelectionActionSchema = z.union([
  ReviewApplicabilitySelectionOfferSchema,
  ReviewApplicabilitySelectionBatchOfferSchema,
]);

export const ReviewStatusTargetInputSchema = z.strictObject({
  target: ChangeRequestTargetRefSchema,
  ceilingOverride: ReviewCeilingOverrideSchema.optional(),
  coverage: HostedReviewCoverageSchema.optional(),
});
export type ReviewStatusTargetInput = z.infer<typeof ReviewStatusTargetInputSchema>;
export const ReviewStatusWorkUnitInputSchema = z.strictObject({
  workUnitId: SlugSchema,
  ceilingOverride: ReviewCeilingOverrideSchema.optional(),
  coverage: HostedReviewCoverageSchema.optional(),
  sourceId: ReviewStatusSourceIdSchema.optional(),
});
export type ReviewStatusWorkUnitInput = z.infer<typeof ReviewStatusWorkUnitInputSchema>;

export const DeliveryReviewAttemptProgressSchema = z.strictObject({
  updatedAt: z.iso.datetime({ offset: true }),
  headSha: GitObjectIdSchema,
  sourceId: z.string().trim().min(1),
  outcome: z.string().trim().min(1),
  requestedCoverage: HostedReviewCoverageSchema,
  effectiveCoverage: HostedReviewCoverageSchema.nullable(),
  findingCount: z.number().int().nonnegative(),
  settledFindingCount: z.number().int().nonnegative(),
}).superRefine((attempt, context) => {
  if (attempt.settledFindingCount > attempt.findingCount) {
    context.addIssue({
      code: "custom",
      path: ["settledFindingCount"],
      message: "settled findings cannot exceed the attempt's finding count",
    });
  }
});

export const DeliveryReviewMemberProgressSchema = z.strictObject({
  completedPasses: z.number().int().nonnegative(),
  completePasses: z.number().int().nonnegative(),
  passCeiling: z.number().int().positive(),
  attempts: z.array(DeliveryReviewAttemptProgressSchema),
}).superRefine((progress, context) => {
  if (progress.completePasses > progress.completedPasses) {
    context.addIssue({
      code: "custom",
      path: ["completePasses"],
      message: "complete passes cannot exceed completed logical passes",
    });
  }
});

export const DeliveryReviewConjunctionMemberSchema = z.strictObject({
  position: z.number().int().positive(),
  memberCount: z.number().int().positive(),
  chunkKey: SlugSchema,
  title: z.string().trim().min(1),
  target: HostedTargetSchema,
  vehicle: DeliveryReviewMemberVehicleSchema,
  state: z.enum(["discharged", "outstanding"]),
  detail: z.string().min(1),
  progress: DeliveryReviewMemberProgressSchema,
}).superRefine((member, context) => {
  if (member.position > member.memberCount) {
    context.addIssue({
      code: "custom",
      path: ["position"],
      message: "delivery review member position must fit the conjunction",
    });
  }
  if (member.target.headSha !== member.vehicle.head) {
    context.addIssue({
      code: "custom",
      path: ["target", "headSha"],
      message: "delivery review member target must match its vehicle head",
    });
  }
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
  const first = conjunction.members[0];
  for (const [index, member] of conjunction.members.entries()) {
    if (member.position !== index + 1 || member.memberCount !== conjunction.members.length) {
      context.addIssue({
        code: "custom",
        path: ["members", index, "position"],
        message: "delivery review conjunction members must preserve complete plan order",
      });
    }
    if (first !== undefined
      && (member.vehicle.planId !== first.vehicle.planId
        || member.vehicle.workUnitId !== first.vehicle.workUnitId)) {
      context.addIssue({
        code: "custom",
        path: ["members", index, "vehicle"],
        message: "delivery review conjunction members must share one delivery identity",
      });
    }
  }
});
export type DeliveryReviewConjunction = z.infer<typeof DeliveryReviewConjunctionSchema>;

export const DeliveryReviewCursorSchema = z.strictObject({
  status: z.enum(["outstanding", "discharged"]),
  completedMemberCount: z.number().int().nonnegative(),
  memberCount: z.number().int().positive(),
  currentMember: DeliveryReviewConjunctionMemberSchema.nullable(),
}).superRefine((cursor, context) => {
  if (cursor.completedMemberCount > cursor.memberCount
    || (cursor.currentMember === null) !== (cursor.status === "discharged")
    || (cursor.status === "discharged" && cursor.completedMemberCount !== cursor.memberCount)
    || (cursor.currentMember !== null
      && (cursor.currentMember.state !== "outstanding"
        || cursor.currentMember.memberCount !== cursor.memberCount))) {
    context.addIssue({
      code: "custom",
      message: "delivery review cursor must match its member completion state",
    });
  }
});

export const DeliveryLocalResumeActionSchema = z.strictObject({
  schemaVersion: z.literal(1),
  operationId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u),
});

const RoutedReviewCoverageUnsupportedSchema = z.strictObject({
  state: z.literal("blocked"),
  reason: z.literal("coverage-unsupported"),
  detail: z.string().min(1),
  conjunction: DeliveryReviewConjunctionSchema.refine(
    (conjunction) => conjunction.status === "outstanding",
    "unsupported delivery review coverage requires an outstanding conjunction",
  ),
});
const RoutedReviewCoverageRequiredSchema = z.strictObject({
  state: z.literal("coverage-required"),
  detail: z.string().min(1),
  conjunction: DeliveryReviewConjunctionSchema.refine(
    (conjunction) => conjunction.status === "outstanding",
    "coverage selection requires an outstanding delivery review conjunction",
  ),
  coverageSelectionAction: ReviewCoverageSelectionActionSchema,
});

export const RoutedReviewObligationSchema = z.union([
  z.strictObject({
    state: z.enum(["settled", "review-required", "blocked"]),
    detail: z.string().min(1),
  }),
  RoutedReviewCoverageUnsupportedSchema,
  RoutedReviewCoverageRequiredSchema,
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
    scope: z.literal("singleton"),
    awaitAction: HostedAwaitEnvelopeSchema,
  }),
  z.strictObject({
    state: z.literal("review-required"),
    detail: z.string().min(1),
    conjunction: DeliveryReviewConjunctionSchema.refine(
      (conjunction) => conjunction.status === "outstanding",
      "delivery hosted review await requires an outstanding conjunction",
    ),
    awaitAction: HostedAwaitEnvelopeSchema,
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
    scope: z.literal("singleton"),
    localResumeAction: DeliveryLocalResumeActionSchema,
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
    scope: z.literal("singleton"),
    selectionAction: ReviewApplicabilitySelectionActionSchema,
  }),
  z.strictObject({
    state: z.literal("review-required"),
    detail: z.string().min(1),
    conjunction: DeliveryReviewConjunctionSchema.refine(
      (conjunction) => conjunction.status === "outstanding",
      "delivery review applicability requires an outstanding conjunction",
    ),
    selectionAction: ReviewApplicabilitySelectionActionSchema,
  }),
  z.strictObject({
    state: z.literal("review-required"),
    detail: z.string().min(1),
    scope: z.literal("singleton"),
    responsePlan: HostedFindingsResponsePlanSchema,
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
    scope: z.literal("singleton"),
    applicability: BlockedReviewApplicabilitySchema,
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
    scope: z.literal("singleton"),
    applicability: ReviewApplicabilityDecisionProjectionSchema,
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

interface ReviewApplicabilityContext {
  readonly workUnitId: string;
  readonly expectedRecordVersion: string;
  readonly candidateId: string;
}

interface ReviewDischargeIntervention {
  readonly detail: string;
  readonly applicability?: z.infer<typeof ReviewContributionApplicabilityResultSchema>;
  readonly equivalentApplicabilities?: readonly z.infer<typeof ReviewContributionApplicabilityResultSchema>[];
  readonly applicabilityAuthority?: "decision-required" | "blocked";
  readonly responsePlan?: z.infer<typeof HostedFindingsResponsePlanSchema>;
  readonly awaitAction?: z.infer<typeof HostedAwaitEnvelopeSchema>;
  readonly localResumeAction?: z.infer<typeof DeliveryLocalResumeActionSchema>;
  readonly coverageSelectionAction?: ReviewCoverageSelectionAction;
}

/** Git-proved mechanical movement from one exact stored terminus vehicle to its current terminal target. */
export interface DeliveryReviewOwnerTerminusAdvance {
  readonly priorVehicle: DeliveryReviewMemberVehicle;
  readonly currentVehicle: DeliveryReviewMemberVehicle;
  readonly proof: DeliveryTerminalCoordinateAdvanceProof;
}

/**
 * Decide whether one exact stored Owner terminus discharges a delivery-member projection.
 *
 * @param input - Exact member target, current discharge state, and retained Owner termini.
 * @returns Whether the member is discharged by an exact, still-current Owner terminus.
 */
export function isDeliveryReviewMemberDischargedByOwnerTerminus(input: {
  readonly target: { readonly vehicle: DeliveryReviewMemberVehicle };
  readonly discharge: {
    readonly discharged: boolean;
    readonly nextSource: string | null;
    readonly applicability?: z.infer<typeof ReviewContributionApplicabilityResultSchema>;
    readonly applicabilityAuthority?: "decision-required" | "blocked";
    readonly responsePlan?: z.infer<typeof HostedFindingsResponsePlanSchema>;
    readonly awaitAction?: z.infer<typeof HostedAwaitEnvelopeSchema>;
    readonly localResumeAction?: z.infer<typeof DeliveryLocalResumeActionSchema>;
    readonly coverageSelectionAction?: ReviewCoverageSelectionAction;
    readonly completedPasses: number;
  };
  readonly ownerTermini?: readonly DeliveryReviewMemberTerminus[];
  readonly ownerTerminusAdvances?: readonly DeliveryReviewOwnerTerminusAdvance[];
}): boolean {
  const terminus = input.ownerTermini?.find((record) => {
    if (sameDeliveryReviewMemberVehicle(record.vehicle, input.target.vehicle)) return true;
    return input.ownerTerminusAdvances?.some((advance) => (
      sameDeliveryReviewMemberVehicle(record.vehicle, advance.priorVehicle)
      && sameDeliveryReviewMemberVehicle(input.target.vehicle, advance.currentVehicle)
      && sameDeliveryReviewMemberIdentity(advance.priorVehicle, advance.currentVehicle)
      && advance.proof.priorHead === advance.priorVehicle.head
      && advance.proof.currentHead === advance.currentVehicle.head
    )) ?? false;
  });
  const replayedApplicability = input.discharge.applicability?.state === "decision-required"
    && input.discharge.applicabilityAuthority !== "blocked";
  const hasPendingIntervention = input.discharge.responsePlan !== undefined
    || input.discharge.awaitAction !== undefined
    || input.discharge.localResumeAction !== undefined
    || input.discharge.coverageSelectionAction !== undefined
    || (!replayedApplicability && (input.discharge.nextSource === null
      || (input.discharge.applicability !== undefined && input.discharge.applicability.state !== "applicable")));
  return terminus !== undefined
    && !input.discharge.discharged
    && !hasPendingIntervention
    && terminus.terminus.completedPasses === input.discharge.completedPasses;
}

function composeReviewDischargeIntervention(
  discharge: ReviewDischargeIntervention,
  applicabilityContext: ReviewApplicabilityContext | undefined,
  conjunction?: DeliveryReviewConjunction,
): RoutedReviewObligation | null {
  const subject = conjunction === undefined
    ? { scope: "singleton" as const }
    : { conjunction };
  if (discharge.applicability?.state === "decision-required"
    && discharge.applicabilityAuthority === "blocked") {
    return RoutedReviewObligationSchema.parse({
      state: "applicability-conflict",
      detail: discharge.detail,
      ...subject,
      applicability: discharge.applicability,
    });
  }
  if (discharge.applicability?.state === "decision-required") {
    if (applicabilityContext === undefined) {
      return {
        state: "blocked",
        detail: "The review applicability decision is missing its canonical Candidate coordinates.",
      };
    }
    const equivalent = discharge.equivalentApplicabilities?.filter(
      (projection): projection is z.infer<typeof ReviewApplicabilityDecisionProjectionSchema> => (
        projection.state === "decision-required"
      ),
    ) ?? [];
    return RoutedReviewObligationSchema.parse({
      state: "review-required",
      detail: discharge.detail,
      ...subject,
      selectionAction: {
        schemaVersion: 1,
        kind: equivalent.length < 2
          ? "review-applicability-selection"
          : "review-applicability-selection-batch",
        workUnitId: applicabilityContext.workUnitId,
        expectedRecordVersion: applicabilityContext.expectedRecordVersion,
        candidateId: applicabilityContext.candidateId,
        ...(equivalent.length < 2
          ? { projection: discharge.applicability }
          : { projections: equivalent }),
        choices: ["covered", "review-required"],
        interactionText: "Choose `covered` only when the exact residual is already covered; otherwise choose "
          + "`review-required`.",
      },
    });
  }
  if (discharge.applicability !== undefined
    && discharge.applicability.state !== "applicable") {
    return RoutedReviewObligationSchema.parse({
      state: "applicability-blocked",
      detail: discharge.detail,
      ...subject,
      applicability: discharge.applicability,
    });
  }
  if (discharge.responsePlan !== undefined) {
    return RoutedReviewObligationSchema.parse({
      state: "review-required",
      detail: discharge.detail,
      ...subject,
      responsePlan: discharge.responsePlan,
    });
  }
  if (discharge.awaitAction !== undefined) {
    return RoutedReviewObligationSchema.parse({
      state: "review-required",
      detail: discharge.detail,
      ...subject,
      awaitAction: discharge.awaitAction,
    });
  }
  if (discharge.localResumeAction !== undefined) {
    return RoutedReviewObligationSchema.parse({
      state: "review-required",
      detail: discharge.detail,
      ...subject,
      localResumeAction: discharge.localResumeAction,
    });
  }
  if (discharge.coverageSelectionAction !== undefined) {
    if (conjunction === undefined) {
      return {
        state: "blocked",
        detail: "Review coverage selection is unavailable without one exact delivery-member subject.",
      };
    }
    return RoutedReviewObligationSchema.parse({
      state: "coverage-required",
      detail: discharge.detail,
      conjunction,
      coverageSelectionAction: discharge.coverageSelectionAction,
    });
  }
  return null;
}

/** Preserve the typed review intervention projected for one ordinary change-request target. */
export function composeSingletonReviewObligation(input: {
  readonly discharge: ReviewDischargeIntervention & { readonly discharged: boolean };
  readonly applicabilityContext: ReviewApplicabilityContext;
}): RoutedReviewObligation {
  if (input.discharge.discharged) {
    return RoutedReviewObligationSchema.parse({
      state: "settled",
      detail: input.discharge.detail,
    });
  }
  return composeReviewDischargeIntervention(input.discharge, input.applicabilityContext)
    ?? RoutedReviewObligationSchema.parse({
      state: "review-required",
      detail: input.discharge.detail,
    });
}

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
    position: number;
    memberCount: number;
    chunkKey: string;
    title: string;
  }[];
  discharges: readonly {
    discharged: boolean;
    detail: string;
    nextSource: string | null;
    applicability?: z.infer<typeof ReviewContributionApplicabilityResultSchema>;
    equivalentApplicabilities?: readonly z.infer<typeof ReviewContributionApplicabilityResultSchema>[];
    applicabilityAuthority?: "decision-required" | "blocked";
    responsePlan?: z.infer<typeof HostedFindingsResponsePlanSchema>;
    awaitAction?: z.infer<typeof HostedAwaitEnvelopeSchema>;
    localResumeAction?: z.infer<typeof DeliveryLocalResumeActionSchema>;
    coverageSelectionAction?: ReviewCoverageSelectionAction;
    requestAdmission?: ReviewResolveEnvelope;
    requestCeilingOverride?: ReviewCeilingOverride;
    requestScopeSelection?: z.infer<typeof DeliveryLocalReviewScopeSelectionSchema>;
    requestCoverage?: HostedReviewCoverage;
    correctionScope?: IncrementalReviewScope;
    completedPasses: number;
    completePasses: number;
    passCeiling: number;
    attemptHistory: readonly z.infer<typeof DeliveryReviewAttemptProgressSchema>[];
  }[];
  applicabilityContext?: {
    workUnitId: string;
    expectedRecordVersion: string;
    candidateId: string;
  };
  requestCoverage?: HostedReviewCoverage;
  requestInvocation?: { readonly mode: "force"; readonly sourceId: string };
  ownerTermini?: readonly DeliveryReviewMemberTerminus[];
  ownerTerminusAdvances?: readonly DeliveryReviewOwnerTerminusAdvance[];
}): RoutedReviewObligation {
  if (input.targets.length === 0 || input.targets.length !== input.discharges.length) {
    return {
      state: "blocked",
      detail: "The delivery review conjunction could not be composed from a complete retained target set.",
    };
  }
  const effectiveDischarges = input.discharges.map((discharge, index) => {
    const target = input.targets[index];
    if (target === undefined || !isDeliveryReviewMemberDischargedByOwnerTerminus({
      target,
      discharge,
      ownerTermini: input.ownerTermini,
      ownerTerminusAdvances: input.ownerTerminusAdvances,
    })) return discharge;
    return {
      ...discharge,
      discharged: true,
      detail: "The Work Unit Owner accepted the standard-review terminus for this exact delivery-member head.",
      nextSource: null,
    };
  });
  const members = input.targets.map((target, index) => {
    const discharge = effectiveDischarges[index];
    if (discharge === undefined) throw new Error("delivery review discharge is unavailable");
    return {
      position: target.position,
      memberCount: target.memberCount,
      chunkKey: SlugSchema.parse(target.chunkKey),
      title: target.title,
      target: HostedTargetSchema.parse({
        repository: target.repository,
        pullRequest: target.pullRequest,
        headSha: target.headSha,
      }),
      vehicle: target.vehicle,
      state: discharge.discharged ? "discharged" as const : "outstanding" as const,
      detail: discharge.detail,
      progress: {
        completedPasses: discharge.completedPasses,
        completePasses: discharge.completePasses,
        passCeiling: discharge.passCeiling,
        attempts: [...discharge.attemptHistory],
      },
    };
  });
  const firstOutstandingIndex = effectiveDischarges.findIndex((discharge) => !discharge.discharged);
  if (firstOutstandingIndex < 0) {
    return RoutedReviewObligationSchema.parse({
      state: "settled",
      detail: "Every retained delivery-member review is discharged.",
      conjunction: { kind: "delivery", status: "discharged", members },
    });
  }
  const target = input.targets[firstOutstandingIndex];
  let discharge = effectiveDischarges[firstOutstandingIndex];
  const selectedCoverage = discharge?.coverageSelectionAction === undefined
    ? null
    : selectReviewCoverageChoice(discharge.coverageSelectionAction, {
        sourceId: input.requestInvocation?.sourceId,
        coverage: input.requestCoverage,
      });
  if (discharge !== undefined && selectedCoverage !== null) {
    discharge = {
      ...discharge,
      coverageSelectionAction: undefined,
      nextSource: selectedCoverage.sourceId,
      requestCoverage: selectedCoverage.coverage,
    };
  }
  if (discharge !== undefined) {
    const intervention = composeReviewDischargeIntervention(
      discharge,
      input.applicabilityContext,
      { kind: "delivery", status: "outstanding", members },
    );
    if (intervention !== null) return intervention;
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
  if ((discharge.requestAdmission.payload.scope === "chunked")
    !== (discharge.requestScopeSelection !== undefined)) {
    return {
      state: "blocked",
      detail: "The standard-review driver and member review action disagree about chunked-scope admission.",
    };
  }
  if (discharge.requestCoverage !== undefined
    && input.requestCoverage !== undefined
    && discharge.requestCoverage !== input.requestCoverage) {
    return {
      state: "blocked",
      detail: "The requested review coverage does not match the active logical pass.",
    };
  }
  const requestCoverage = discharge.requestCoverage ?? input.requestCoverage ?? "complete";
  if (discharge.requestAdmission.nextAction === "local-prepare") {
    if (discharge.nextSource !== "delegated-agent") {
      return {
        state: "blocked",
        detail: "The standard-review driver selected an unsupported local review source.",
      };
    }
    if (requestCoverage === "incremental" && discharge.correctionScope === undefined) {
      return RoutedReviewObligationSchema.parse({
        state: "blocked",
        reason: "coverage-unsupported",
        detail: "The selected local review carrier cannot preserve explicit incremental coverage.",
        conjunction: { kind: "delivery", status: "outstanding", members },
      });
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
        requestedCoverage: requestCoverage,
        ...(discharge.requestCeilingOverride === undefined
          ? {}
          : { ceilingOverride: discharge.requestCeilingOverride }),
        ...(discharge.requestScopeSelection === undefined
          ? {}
          : { scopeSelection: discharge.requestScopeSelection }),
        ...(requestCoverage !== "incremental" || discharge.correctionScope === undefined
          ? {}
          : { correctionScope: discharge.correctionScope }),
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
  if (!hostedProviderAdmitsCoverage(provider.data, requestCoverage, discharge.correctionScope)) {
    return RoutedReviewObligationSchema.parse({
      state: "blocked",
      reason: "coverage-unsupported",
      detail: "The selected hosted review carrier cannot preserve the admitted correction scope.",
      conjunction: { kind: "delivery", status: "outstanding", members },
    });
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
      coverage: requestCoverage,
      ...(requestCoverage !== "incremental" || discharge.correctionScope === undefined
        ? {}
        : { correctionScope: discharge.correctionScope }),
      vehicle: target.vehicle,
      ...(input.requestInvocation === undefined ? {} : { invocation: input.requestInvocation }),
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
  deliveryCursor: DeliveryReviewCursorSchema.optional(),
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
  terminusAction: DeliveryReviewTerminusAcceptanceActionSchema.optional(),
});
const ReviewStatusHostedAwaitSchema = z.strictObject({
  ...ReviewStatusBaseShape,
  state: z.literal("review-required"),
  nextAction: z.literal("review-hosted-await"),
  action: HostedAwaitEnvelopeSchema,
});
const ReviewStatusLocalPrepareSchema = z.strictObject({
  ...ReviewStatusBaseShape,
  state: z.literal("review-required"),
  nextAction: z.literal("review-local-prepare"),
  action: DeliveryLocalReviewAdmissionSchema,
  terminusAction: DeliveryReviewTerminusAcceptanceActionSchema.optional(),
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
  selectionAction: ReviewApplicabilitySelectionActionSchema,
  terminusAction: DeliveryReviewTerminusAcceptanceActionSchema.optional(),
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
  terminusAction: DeliveryReviewTerminusAcceptanceActionSchema.optional(),
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
  terminusAction: DeliveryReviewTerminusAcceptanceActionSchema.optional(),
});
const ReviewStatusBlockedSchema = z.strictObject({
  ...ReviewStatusBaseShape,
  state: z.literal("blocked"),
  nextAction: z.literal("stop"),
  reason: z.enum(["stale-target", "checks-failed", "status-unavailable"]),
  detail: z.string().trim().min(1),
  remedy: SpineRemedySchema,
});
const ReviewStatusCoverageUnsupportedSchema = z.strictObject({
  ...ReviewStatusBaseShape,
  routedObligation: RoutedReviewCoverageUnsupportedSchema,
  deliveryCursor: DeliveryReviewCursorSchema.refine(
    (cursor) => cursor.status === "outstanding" && cursor.currentMember !== null,
    "unsupported delivery review coverage requires an outstanding delivery cursor",
  ),
  state: z.literal("blocked"),
  nextAction: z.literal("stop"),
  reason: z.literal("coverage-unsupported"),
  detail: z.string().trim().min(1),
  remedy: SpineRemedySchema,
});
const ReviewStatusCoverageRequiredSchema = z.strictObject({
  ...ReviewStatusBaseShape,
  routedObligation: RoutedReviewCoverageRequiredSchema,
  deliveryCursor: DeliveryReviewCursorSchema.refine(
    (cursor) => cursor.status === "outstanding" && cursor.currentMember !== null,
    "coverage selection requires an outstanding delivery cursor",
  ),
  state: z.literal("coverage-required"),
  nextAction: z.literal("select-coverage"),
  coverageSelectionAction: ReviewCoverageSelectionActionSchema,
});
export type ReviewStatusResult =
  | z.infer<typeof ReviewStatusSettledSchema>
  | z.infer<typeof ReviewStatusRunReviewSchema>
  | z.infer<typeof ReviewStatusHostedRequestSchema>
  | z.infer<typeof ReviewStatusHostedAwaitSchema>
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
  | z.infer<typeof ReviewStatusCoverageUnsupportedSchema>
  | z.infer<typeof ReviewStatusCoverageRequiredSchema>
  | z.infer<typeof ReviewStatusBlockedSchema>;
const ReviewStatusResultSchemaInternal: z.ZodType<ReviewStatusResult> = z.union([
  ReviewStatusSettledSchema,
  ReviewStatusRunReviewSchema,
  ReviewStatusHostedRequestSchema,
  ReviewStatusHostedAwaitSchema,
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
  ReviewStatusCoverageUnsupportedSchema,
  ReviewStatusCoverageRequiredSchema,
  ReviewStatusBlockedSchema,
]);
export const ReviewStatusResultSchema: z.ZodType<ReviewStatusResult> = ReviewStatusResultSchemaInternal;

function hasCompletedCompleteReviewPass(
  member: z.infer<typeof DeliveryReviewConjunctionMemberSchema>,
): boolean {
  return member.progress.completedPasses > 0 && member.progress.attempts.some((attempt) => (
    (attempt.outcome === "clean"
      || attempt.outcome === "findings"
      || attempt.outcome === "settled-findings")
    && (attempt.requestedCoverage === "complete" || attempt.effectiveCoverage === "complete")
  ));
}

/** Bind an eligible delivery-member continuation to the exact Owner-terminus mutation offer. */
export function bindDeliveryReviewTerminusOffer(
  result: ReviewStatusResult,
  binding: {
    readonly workUnitId: string;
    readonly remote?: string;
    readonly expectedBoundaryVersion: string;
    readonly candidateId: string;
    readonly candidateSubjectDigest: string;
  },
): ReviewStatusResult {
  const isCeiling = result.nextAction === "obtain-ceiling-override";
  const isBaseMoved = result.state === "base-moved";
  const isEligibleContinuation = result.nextAction === "review-hosted-request"
    || result.nextAction === "review-local-prepare"
    || result.nextAction === "resolve-review-applicability";
  if (!isCeiling && !isBaseMoved && !isEligibleContinuation) return result;
  const member = result.deliveryCursor?.currentMember;
  if (member === undefined || member === null) {
    if (isCeiling) {
      throw new Error("A delivery-member ceiling stop requires one exact first-outstanding member.");
    }
    return result;
  }
  if (!isCeiling && !hasCompletedCompleteReviewPass(member)) return result;
  return ReviewStatusResultSchema.parse({
    ...result,
    terminusAction: {
      schemaVersion: 1,
      offer: {
        schemaVersion: 1,
        kind: "delivery-member-owner-terminus",
        workUnitId: binding.workUnitId,
        remote: binding.remote ?? "origin",
        expectedBoundaryVersion: binding.expectedBoundaryVersion,
        candidateId: binding.candidateId,
        candidateSubjectDigest: binding.candidateSubjectDigest,
        target: member.target,
        vehicle: member.vehicle,
        completedPasses: member.progress.completedPasses,
        interactionText: "Accept the standard-review terminus for this exact delivery member without claiming a "
          + "clean or converged pass.",
      },
    },
  });
}

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
    coverage?: HostedReviewCoverage,
  ): Promise<ReviewStatusObservation>;
}

/** Reduce live exact-target evidence to one orchestration action. */
export async function resolveReviewStatus(
  input: ReviewStatusTargetInput,
  port: ReviewStatusPort,
): Promise<ReviewStatusResult> {
  const request = ReviewStatusTargetInputSchema.parse(input);
  const observation = await port.observe(request.target, request.ceilingOverride, request.coverage);
  const actualHeadSha = ObjectIdSchema.parse(observation.actualHeadSha);
  const conjunction = "conjunction" in observation.routedObligation
    ? observation.routedObligation.conjunction
    : undefined;
  const currentMember = conjunction?.members.find((member) => member.state === "outstanding") ?? null;
  const base = {
    schemaVersion: 1 as const,
    mode: "review-status" as const,
    target: request.target,
    requiredChecks: RequiredCheckStatusSchema.parse(observation.requiredChecks),
    routedObligation: RoutedReviewObligationSchema.parse(observation.routedObligation),
    currentBaseOid: observation.currentBaseOid === null
      ? null
      : ObjectIdSchema.parse(observation.currentBaseOid),
    ...(conjunction === undefined
      ? {}
      : {
          deliveryCursor: DeliveryReviewCursorSchema.parse({
            status: conjunction.status,
            completedMemberCount: conjunction.members.filter((member) => member.state === "discharged").length,
            memberCount: conjunction.members.length,
            currentMember,
          }),
        }),
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
  if (base.routedObligation.state === "coverage-required") {
    if (currentMember === null || conjunction === undefined) {
      throw new Error("Review coverage selection requires one exact outstanding delivery member.");
    }
    return ReviewStatusCoverageRequiredSchema.parse({
      ...base,
      deliveryCursor: {
        status: conjunction.status,
        completedMemberCount: conjunction.members.filter((member) => member.state === "discharged").length,
        memberCount: conjunction.members.length,
        currentMember,
      },
      state: "coverage-required",
      nextAction: "select-coverage",
      coverageSelectionAction: base.routedObligation.coverageSelectionAction,
    });
  }
  if (base.currentBaseOid === null) {
    return {
      ...base,
      state: "blocked",
      nextAction: "stop",
      reason: "status-unavailable",
      detail: "The current base revision is unavailable.",
      remedy: reviewStatusRetryRemedy(request.target),
    };
  }
  if (base.routedObligation.state === "blocked") {
    const coverageUnsupported = "reason" in base.routedObligation;
    if (coverageUnsupported && currentMember !== null && conjunction !== undefined) {
      return ReviewStatusCoverageUnsupportedSchema.parse({
        ...base,
        deliveryCursor: {
          status: conjunction.status,
          completedMemberCount: conjunction.members.filter((member) => member.state === "discharged").length,
          memberCount: conjunction.members.length,
          currentMember,
        },
        state: "blocked",
        nextAction: "stop",
        reason: "coverage-unsupported",
        detail: base.routedObligation.detail,
        remedy: spineRemedy(
          "The selected review carrier cannot preserve the admitted correction scope.",
          "Select a capable source or complete coverage, then re-run",
          [
            "arc", "review", "status", "--work-unit", currentMember.vehicle.workUnitId,
            "--coverage", "incremental", "--json",
          ],
        ),
      });
    }
    return {
      ...base,
      state: "blocked",
      nextAction: "stop",
      reason: "status-unavailable",
      detail: base.routedObligation.detail,
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
    if ("awaitAction" in base.routedObligation) {
      return {
        ...base,
        state: "review-required",
        nextAction: "review-hosted-await",
        action: base.routedObligation.awaitAction,
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
