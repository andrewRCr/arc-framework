/** Typed integration checkpoint reduction over canonical boundary evidence. */

import { z } from "zod";

import type { BaseDriftResult, BaseMovement } from "../../lib/git/base-drift-types.js";
import {
  GitMergeFeasibilitySchema,
  type GitMergeFeasibility,
} from "../../lib/git/merge-feasibility.js";
import type { CandidateCurrentnessProjection } from "../../lib/work-unit/candidate-attestation.js";
import {
  CandidateApplicabilityDecisionResultSchema,
  CandidateApplicabilityResultSchema,
  type CandidateApplicabilityDecisionResult,
  type CandidateApplicabilityResult,
} from "../../lib/work-unit/candidate-applicability.js";
import {
  CandidateApplicabilityResolutionSelectorSchema,
  type CandidateApplicabilityResolutionSelector,
} from "../../lib/work-unit/candidate-applicability-resolution.js";
import {
  MergeMethodSchema,
  MergeMethodStackPositionSchema,
  type MergeMethodResolveResult,
  type MergeMethodStackPosition,
} from "../review-gate/merge-method.js";
import { RequiredCheckStatusSchema } from "../review-gate/status.js";
import {
  ChangeRequestMergeObservationSchema,
  type ChangeRequestMergeObservation,
} from "../review-gate/change-request.js";
import {
  CanonicalSettlementPlanSchema,
  settlementDispositionIds,
  type CanonicalSettlementPlan,
} from "./settlement-plan.js";
import {
  CheckpointInterlockSurfaceSchema,
  composeCheckpointInterlockSurface,
} from "./interlock-surface.js";
import type { DeliveryCheckpointArmResult } from "./delivery-checkpoint.js";
import type { DeliveryTerminalDriftResult } from "../../lib/delivery/terminal-integration.js";
import { DeliveryPlanIdSchema } from "../../lib/delivery/schema.js";
import {
  SpineRemedySchema,
  checkpointResumeArgv,
  attestArgv,
  attestNewRootArgv,
  spineRemedy,
  type SpineRemedy,
} from "./spine-refusal.js";

const DigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const ObjectIdSchema = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u);
const SlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);

export const IntegrationCheckpointRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  workUnit: SlugSchema,
});
export type IntegrationCheckpointRequest = z.infer<typeof IntegrationCheckpointRequestSchema>;

export const IntegrationLifecycleSummarySchema = z.strictObject({
  workUnit: SlugSchema,
  storageVersion: z.string().min(1),
  archiveCadence: z.enum(["with-integration", "manual"]),
  state: z.enum([
    "nonexistent", "provisional", "planned", "planning", "active", "integrating", "parked", "shipped",
  ]),
  position: z.strictObject({
    phase: z.enum(["Planning", "Active", "Integrating", "Shipped"]),
    location: z.enum(["provisional", "planned", "active", "completed"]),
  }).nullable(),
  artifactFacts: z.array(z.strictObject({
    code: z.string().min(1),
    path: z.string().min(1),
    message: z.string().min(1),
  })),
  complete: z.boolean(),
}).superRefine((summary, context) => {
  if (summary.complete && summary.artifactFacts.length > 0) {
    context.addIssue({
      code: "custom",
      path: ["complete"],
      message: "a lifecycle summary owing artifact facts is never complete",
    });
  }
});
export type IntegrationLifecycleSummary = z.infer<typeof IntegrationLifecycleSummarySchema>;

export const CheckpointMovementObservationSchema = z.strictObject({
  movement: z.enum(["disjoint", "overlapping", "unknown"]),
  integrationEvidenceComplete: z.boolean(),
  feasibility: GitMergeFeasibilitySchema,
  admission: ChangeRequestMergeObservationSchema,
});
export type CheckpointMovementObservation = z.infer<typeof CheckpointMovementObservationSchema>;

export type CheckpointMovementPlan =
  | { state: "proceed" }
  | { state: "reconcile"; nextAction: "reconcile-base" | "reconcile-regenerable" }
  | {
      state: "blocked";
      reason: "unsafe-reconcile" | "host-pending" | "host-refused" | "conflict";
      detail?: string;
      paths?: string[];
    };

function coordinatesAgree(
  feasibility: GitMergeFeasibility,
  admission: ChangeRequestMergeObservation,
): boolean {
  return feasibility.base === admission.base && feasibility.head === admission.head;
}

/** Reduce movement, feasibility, admission, and mutation evidence to one continuation. */
export function composeCheckpointMovementPlan(input: {
  movement: BaseMovement;
  integrationEvidenceComplete: boolean;
  feasibility: GitMergeFeasibility;
  admission: ChangeRequestMergeObservation;
}): CheckpointMovementPlan {
  const observation = CheckpointMovementObservationSchema.parse(input);
  if (!coordinatesAgree(observation.feasibility, observation.admission)) {
    return { state: "blocked", reason: "unsafe-reconcile", detail: "Checkpoint evidence coordinates disagree." };
  }
  if (observation.movement === "unknown") {
    return { state: "blocked", reason: "unsafe-reconcile", detail: "Base movement is unknown." };
  }
  if (observation.feasibility.state === "unavailable") {
    return { state: "blocked", reason: "unsafe-reconcile", detail: observation.feasibility.detail };
  }
  if (observation.feasibility.state === "substantive-conflict") {
    return { state: "blocked", reason: "conflict", paths: observation.feasibility.paths };
  }
  if (observation.admission.state === "unresolved") {
    return { state: "blocked", reason: "host-pending", detail: observation.admission.detail };
  }
  if (observation.admission.state === "refused") {
    return { state: "blocked", reason: "host-refused", detail: observation.admission.detail };
  }
  const reconcileAction = observation.feasibility.state === "regenerable-conflict"
    ? "reconcile-regenerable"
    : observation.admission.state === "base-currentness-required" || observation.movement === "overlapping"
      ? "reconcile-base"
      : null;
  if (reconcileAction === null) return { state: "proceed" };
  return observation.integrationEvidenceComplete
    ? { state: "reconcile", nextAction: reconcileAction }
    : {
        state: "blocked",
        reason: "unsafe-reconcile",
        detail: "A mutating reconciliation requires complete integration evidence.",
      };
}

export const CandidateTailDiffReferenceSchema = z.strictObject({
  fromRevision: ObjectIdSchema,
  throughRevision: ObjectIdSchema,
  reference: z.string().min(1),
});

export const CheckpointRequirementSchema = z.strictObject({
  id: z.string().min(1),
  state: z.enum(["satisfied", "pending", "failure", "not-applicable"]),
  detail: z.string().min(1),
});
export type CheckpointRequirement = z.infer<typeof CheckpointRequirementSchema>;

export const CheckpointRequirementSummarySchema = z.strictObject({
  conclusion: z.enum(["satisfied", "pending", "failure"]),
  requirements: z.array(CheckpointRequirementSchema),
});
export type CheckpointRequirementSummary = z.infer<typeof CheckpointRequirementSummarySchema>;

/** The requirement identity carrying the hosted-review obligation deferred across publication. */
export const HOSTED_REVIEW_REQUIREMENT_ID = "hosted-review-reservation";

function outstanding(requirement: CheckpointRequirement): boolean {
  return requirement.state !== "satisfied" && requirement.state !== "not-applicable";
}

/** Render what the composed requirements establish, so the surface reports a read rather than a claim. */
function requirementEvidence(summary: CheckpointRequirementSummary): string {
  const open = summary.requirements.filter(outstanding);
  return open.length === 0
    ? `Every composed requirement is satisfied (${summary.requirements.length} checked).`
    : open.map(({ id, state, detail }) => `${id} is ${state}: ${detail}`).join(" ");
}

export const CheckpointStatusSummarySchema = z.strictObject({
  lifecycle: IntegrationLifecycleSummarySchema,
  changeRequest: z.strictObject({
    repository: z.string().min(1),
    pullRequest: z.number().int().positive(),
    baseRef: z.string().min(1),
    headRef: z.string().min(1),
    headSha: ObjectIdSchema,
    state: z.literal("open"),
  }),
  requiredChecks: RequiredCheckStatusSchema,
});

export const CheckpointReadyCompositionSchema = z.strictObject({
  approvedHead: ObjectIdSchema,
  candidateTailDiff: CandidateTailDiffReferenceSchema,
  requirementSummary: CheckpointRequirementSummarySchema,
  statusSummary: CheckpointStatusSummarySchema,
});
export type CheckpointReadyComposition = z.infer<typeof CheckpointReadyCompositionSchema>;

export const ValidatedMergeMethodSchema = z.strictObject({
  schemaVersion: z.literal(1),
  mode: z.literal("review-merge-method-resolve"),
  repository: z.string().min(1),
  stackPosition: MergeMethodStackPositionSchema,
  state: z.literal("validated"),
  nextAction: z.literal("use-method"),
  method: MergeMethodSchema,
  allowedMethods: z.array(MergeMethodSchema),
  policyFingerprint: DigestSchema,
});
export type ValidatedMergeMethod = z.infer<typeof ValidatedMergeMethodSchema>;

const BlockedMergeMethodSchema = z.strictObject({
  schemaVersion: z.literal(1),
  mode: z.literal("review-merge-method-resolve"),
  repository: z.string().min(1).nullable(),
  stackPosition: MergeMethodStackPositionSchema,
  state: z.literal("blocked"),
  nextAction: z.literal("stop"),
  reason: z.enum(["invalid-input", "method-disallowed", "policy-unreadable"]),
  configuredMethod: MergeMethodSchema,
  allowedMethods: z.array(MergeMethodSchema),
  policyFingerprint: DigestSchema.optional(),
  detail: z.string().min(1).optional(),
  remedy: SpineRemedySchema,
});

const ResultBaseShape = {
  schemaVersion: z.literal(1),
  mode: z.literal("integrate-checkpoint"),
  workUnit: SlugSchema,
};

const CheckpointBlockedBaseShape = {
  ...ResultBaseShape,
  state: z.literal("blocked"),
  nextAction: z.literal("stop"),
  remedy: SpineRemedySchema,
};

const CandidateApplicabilityCheckpointPayloadSchema = z.union([
  CandidateApplicabilityDecisionResultSchema.extend({
    resolutionSelector: CandidateApplicabilityResolutionSelectorSchema,
  }),
  CandidateApplicabilityResultSchema,
]);

const CandidateApplicabilityCheckpointResultSchema = z.strictObject({
  ...ResultBaseShape,
  state: z.literal("candidate-applicability"),
  nextAction: z.enum(["request-authority", "rerun-checkpoint", "stop", "upgrade"]),
  payload: CandidateApplicabilityCheckpointPayloadSchema,
}).superRefine((result, context) => {
  if (result.payload.state === "applicable") {
    context.addIssue({
      code: "custom",
      path: ["payload", "state"],
      message: "an applicable Candidate must be reduced to currentness before checkpoint dispatch",
    });
  }
  if (result.payload.nextAction !== result.nextAction) {
    context.addIssue({
      code: "custom",
      path: ["nextAction"],
      message: "must match the Candidate applicability result",
    });
  }
  if (result.payload.state === "decision-required" && !("resolutionSelector" in result.payload)) {
    context.addIssue({
      code: "custom",
      path: ["payload", "resolutionSelector"],
      message: "a bounded applicability decision requires its exact resolution selector",
    });
  }
});

const CandidatePublicationCheckpointResultSchema = z.strictObject({
  ...ResultBaseShape,
  state: z.literal("candidate-publication-required"),
  nextAction: z.literal("resume-pre-publication"),
  payload: z.strictObject({
    attestArgv: z.union([
      z.tuple([
        z.literal("arc"),
        z.literal("attest"),
        SlugSchema,
        z.literal("--json"),
      ]),
      z.tuple([
        z.literal("arc"),
        z.literal("attest"),
        SlugSchema,
        z.literal("--new-root"),
        z.literal("--json"),
      ]),
    ]),
    recommendedActionText: z.string().min(1),
  }),
});


const IntegrationCheckpointBlockedResultSchema = z.discriminatedUnion("reason", [
  z.strictObject({
    ...CheckpointBlockedBaseShape,
    reason: z.literal("drift-unavailable"),
    payload: z.strictObject({ drift: z.custom<BaseDriftResult>() }),
  }),
  z.strictObject({
    ...CheckpointBlockedBaseShape,
    reason: z.literal("unsafe-reconcile"),
    payload: z.strictObject({
      drift: z.custom<BaseDriftResult>(),
      observation: CheckpointMovementObservationSchema,
      detail: z.string().min(1).optional(),
    }),
  }),
  z.strictObject({
    ...CheckpointBlockedBaseShape,
    reason: z.literal("host-pending"),
    payload: z.strictObject({ observation: CheckpointMovementObservationSchema, detail: z.string().min(1) }),
  }),
  z.strictObject({
    ...CheckpointBlockedBaseShape,
    reason: z.literal("host-refused"),
    payload: z.strictObject({ observation: CheckpointMovementObservationSchema, detail: z.string().min(1) }),
  }),
  z.strictObject({
    ...CheckpointBlockedBaseShape,
    reason: z.literal("conflict"),
    payload: z.strictObject({ observation: CheckpointMovementObservationSchema, paths: z.array(z.string().min(1)) }),
  }),
  z.strictObject({
    ...CheckpointBlockedBaseShape,
    reason: z.literal("lifecycle-incomplete"),
    payload: z.strictObject({ lifecycle: IntegrationLifecycleSummarySchema }),
  }),
  z.strictObject({
    ...CheckpointBlockedBaseShape,
    reason: z.literal("candidate-missing"),
    payload: z.strictObject({ workUnit: SlugSchema }),
  }),
  z.strictObject({
    ...CheckpointBlockedBaseShape,
    reason: z.literal("candidate-unexplained-delta"),
    payload: z.strictObject({
      candidate: z.custom<Extract<CandidateCurrentnessProjection, { status: "blocked" }>>(),
    }),
  }),
  z.strictObject({
    ...CheckpointBlockedBaseShape,
    reason: z.literal("candidate-convergence-pending"),
    payload: z.strictObject({
      candidate: z.custom<Extract<CandidateCurrentnessProjection, { status: "current" }>>(),
    }),
  }),
  z.strictObject({
    ...CheckpointBlockedBaseShape,
    reason: z.literal("merge-method-blocked"),
    payload: z.strictObject({
      mergeMethod: z.union([BlockedMergeMethodSchema, ValidatedMergeMethodSchema]),
    }),
  }),
  z.strictObject({
    ...CheckpointBlockedBaseShape,
    reason: z.literal("hosted-reservation-pending"),
    payload: z.strictObject({ requirement: CheckpointRequirementSchema }),
  }),
  z.strictObject({
    ...CheckpointBlockedBaseShape,
    reason: z.literal("composition-unavailable"),
    payload: z.strictObject({ detail: z.string().min(1) }),
  }),
  z.strictObject({
    ...ResultBaseShape,
    state: z.literal("blocked"),
    nextAction: z.enum(["stop", "retarget", "reopen-and-retarget"]),
    reason: z.literal("delivery-terminal-blocked"),
    remedy: SpineRemedySchema,
    payload: z.custom<Extract<DeliveryCheckpointArmResult, { readonly status: "blocked" }>>(),
  }),
]);

/** The blocked reasons the checkpoint refuses with — derived from the refusal union itself. */
export type CheckpointBlockedReason = z.infer<typeof IntegrationCheckpointBlockedResultSchema>["reason"];

/** Every blocked reason, for exhaustive iteration. */
export const CHECKPOINT_BLOCKED_REASONS: readonly CheckpointBlockedReason[] =
  IntegrationCheckpointBlockedResultSchema.options.map((option) => option.shape.reason.value);

const CHECKPOINT_REMEDIES: Record<CheckpointBlockedReason, (workUnit: string) => SpineRemedy> = {
  "drift-unavailable": () => spineRemedy(
    "The checkpoint requires an authoritative base-drift read.",
    "Restore remote access, then re-read drift",
    ["arc", "base", "drift", "--json"],
  ),
  "unsafe-reconcile": (workUnit) => spineRemedy(
    "Checkpoint movement, feasibility, admission, and integration evidence must authorize one continuation.",
    "Refresh the typed drift and checkpoint observations, then re-run",
    checkpointResumeArgv(workUnit),
  ),
  "host-pending": (workUnit) => spineRemedy(
    "Host admission must resolve for the exact base and head.",
    "Retry the bounded checkpoint observation",
    checkpointResumeArgv(workUnit),
  ),
  "host-refused": () => spineRemedy(
    "Host admission must permit the exact change request and coordinates.",
    "Resolve the reported host policy refusal before retrying",
    ["arc", "review", "status", "--json"],
  ),
  conflict: () => spineRemedy(
    "The exact base and head must be Git-mergeable without substantive conflicts.",
    "Resolve the reported conflict paths before retrying",
    ["arc", "base", "drift", "--json"],
  ),
  "lifecycle-incomplete": (workUnit) => spineRemedy(
    "Completion Notes and the lifecycle position are verified before merge.",
    "Compose the reported lifecycle artifacts or complete the archive move, then re-run",
    checkpointResumeArgv(workUnit),
  ),
  "candidate-missing": (workUnit) => spineRemedy(
    "Integration requires a managed Candidate attestation.",
    "Attest the candidate",
    attestArgv(workUnit),
  ),
  "candidate-unexplained-delta": (workUnit) => spineRemedy(
    "A Candidate lineage advances only on authorized transitions.",
    "Explain the reported delta through an approved response, or run full verification and root a new lineage over it",
    attestNewRootArgv(workUnit),
  ),
  "candidate-convergence-pending": (workUnit) => spineRemedy(
    "An implementation-changing lineage converges before it is checkpointed.",
    "Run the converged verification, then re-attest",
    attestArgv(workUnit),
  ),
  "merge-method-blocked": () => spineRemedy(
    "The configured merge method is allowed by host policy.",
    "Align the configured `merge.strategy` with the repository's allowed methods, then re-resolve",
    ["arc", "review", "merge-method", "resolve", "--json"],
  ),
  "hosted-reservation-pending": (workUnit) => spineRemedy(
    "A hosted review reserved before publication runs before its Candidate is checkpointed.",
    "Run the reserved hosted review to a verdict, then re-run",
    ["arc", "review", "pre-publication", workUnit, "--json"],
  ),
  "composition-unavailable": (workUnit) => spineRemedy(
    "The ready composition binds the exact satisfied Candidate head.",
    "Resolve the reported composition failure, then re-run",
    checkpointResumeArgv(workUnit),
  ),
  "delivery-terminal-blocked": (workUnit) => spineRemedy(
    "A delivery Candidate reaches integration only through its exact terminal claim and member-review conjunction.",
    "Apply the returned delivery remedy or resolve its reported evidence, then re-run",
    checkpointResumeArgv(workUnit),
  ),
};

/**
 * Resolve the corrective remedy for one checkpoint refusal.
 *
 * @param reason - The typed blocked reason.
 * @param workUnit - The refused work unit, interpolated into slug-bearing commands.
 * @returns The remedy naming the failed invariant and one corrective command.
 */
export function checkpointRemedy(reason: CheckpointBlockedReason, workUnit: string): SpineRemedy {
  return CHECKPOINT_REMEDIES[reason](workUnit);
}

export const IntegrationCheckpointResultSchema = z.union([
  z.strictObject({
    ...ResultBaseShape,
    state: z.literal("ready"),
    nextAction: z.literal("request-approval"),
    payload: CheckpointReadyCompositionSchema.extend({
      checkpointHandle: z.string().regex(
        /^checkpoint-v1:(?:[0-9a-f]{40}|[0-9a-f]{64}):sha256:[0-9a-f]{64}$/u,
      ),
      mergeMethod: ValidatedMergeMethodSchema,
      interlockSurface: CheckpointInterlockSurfaceSchema,
      movementObservation: CheckpointMovementObservationSchema,
    }),
  }),
  z.strictObject({
    ...ResultBaseShape,
    state: z.literal("reconcile"),
    nextAction: z.enum(["reconcile-base", "reconcile-regenerable"]),
    payload: z.strictObject({
      drift: z.custom<BaseDriftResult>(),
      observation: CheckpointMovementObservationSchema,
      candidateHead: ObjectIdSchema,
    }),
  }),
  z.strictObject({
    ...ResultBaseShape,
    state: z.literal("terminal-rebind-required"),
    nextAction: z.literal("reconcile-delivery-state"),
    payload: z.strictObject({
      reconcileInput: z.strictObject({
        planId: DeliveryPlanIdSchema,
        repository: z.string().min(1),
      }),
    }),
  }),
  z.strictObject({
    ...ResultBaseShape,
    state: z.literal("recompose-required"),
    nextAction: z.literal("rerun-checkpoint"),
    payload: z.strictObject({
      expectedRecordVersion: DigestSchema,
      observedRecordVersion: DigestSchema.nullable(),
    }),
  }),
  CandidatePublicationCheckpointResultSchema,
  CandidateApplicabilityCheckpointResultSchema,
  IntegrationCheckpointBlockedResultSchema,
  z.strictObject({
    schemaVersion: z.literal(1),
    mode: z.literal("integrate-checkpoint"),
    workUnit: z.null(),
    state: z.literal("blocked"),
    nextAction: z.literal("stop"),
    reason: z.literal("invalid-input"),
    remedy: SpineRemedySchema,
    payload: z.strictObject({ detail: z.string().min(1) }),
  }),
]);
export type IntegrationCheckpointResult = z.infer<typeof IntegrationCheckpointResultSchema>;

/**
 * Compose the published checkpoint refusal for invalid CLI input.
 *
 * @param detail - Validation detail safe to expose in the result payload.
 * @returns A schema-valid refusal with the checkpoint help command.
 */
export function checkpointInputRefusal(detail: string): IntegrationCheckpointResult {
  return IntegrationCheckpointResultSchema.parse({
    schemaVersion: 1,
    mode: "integrate-checkpoint",
    workUnit: null,
    state: "blocked",
    nextAction: "stop",
    reason: "invalid-input",
    remedy: spineRemedy(
      "The checkpoint requires a valid work-unit slug.",
      "Review command usage",
      ["arc", "integrate", "checkpoint", "--help"],
    ),
    payload: { detail },
  });
}

/**
 * Compose a typed checkpoint refusal for a dependency failure at the handler boundary.
 *
 * @param workUnit - The validated work-unit slug.
 * @param detail - Dependency failure detail safe to expose in the result payload.
 * @returns A schema-valid refusal that routes back through checkpoint composition.
 */
export function checkpointOperationRefusal(workUnit: string, detail: string): IntegrationCheckpointResult {
  return IntegrationCheckpointResultSchema.parse({
    schemaVersion: 1,
    mode: "integrate-checkpoint",
    workUnit,
    state: "blocked",
    nextAction: "stop",
    reason: "composition-unavailable",
    remedy: checkpointRemedy("composition-unavailable", workUnit),
    payload: { detail },
  });
}

export interface DeliveryDriftClassificationEvidence {
  readonly baseRevision?: string;
  readonly baselineRevision?: string;
  readonly mergeBase?: string;
  readonly substantivePaths?: readonly string[];
  readonly regenerablePaths?: readonly string[];
  readonly residualPaths?: readonly string[];
  readonly predecessorPaths?: readonly string[];
}

export type DeliveryDriftClassificationResult =
  | { readonly status: "not-applicable" }
  | {
      readonly status: "unavailable";
      readonly detail: string;
      readonly evidence: DeliveryDriftClassificationEvidence;
      readonly nextAction: {
        readonly command: "rerun-checkpoint";
        readonly workUnit: string;
      };
    }
  | (Exclude<DeliveryTerminalDriftResult, { readonly status: "refused" }> & {
      readonly evidence: DeliveryDriftClassificationEvidence;
    })
  | (Extract<DeliveryTerminalDriftResult, { readonly status: "refused" }> & {
      readonly evidence: DeliveryDriftClassificationEvidence;
      readonly explanation: string;
    });

export interface IntegrationCheckpointDependencies {
  readDrift(workUnit: string): Promise<BaseDriftResult>;
  classifyDeliveryDrift(workUnit: string, drift: BaseDriftResult): Promise<DeliveryDriftClassificationResult>;
  readMovementObservation(workUnit: string, drift: BaseDriftResult): Promise<{
    feasibility: GitMergeFeasibility;
    admission: ChangeRequestMergeObservation;
  }>;
  readLifecycle(workUnit: string): Promise<IntegrationLifecycleSummary>;
  readCandidate(workUnit: string, baseRevision: string): Promise<
    CandidateCurrentnessProjection | Exclude<CandidateApplicabilityResult, { state: "applicable" }> | null
  >;
  composeCandidateApplicabilityResolutionSelector(
    workUnit: string,
    decision: CandidateApplicabilityDecisionResult,
  ): Promise<CandidateApplicabilityResolutionSelector>;
  readCandidatePublication(workUnit: string, baseRevision: string): Promise<
    { readonly status: "current" } | { readonly status: "refresh-required" }
  >;
  composeDelivery(input: {
    workUnit: string;
    candidate: Extract<CandidateCurrentnessProjection, { status: "current" }>;
    baseRevision: string;
  }): Promise<DeliveryCheckpointArmResult>;
  resolveMergeMethod(repository: string, stackPosition: MergeMethodStackPosition): Promise<MergeMethodResolveResult>;
  composeReady(input: {
    workUnit: string;
    baseRevision: string;
    lifecycle: IntegrationLifecycleSummary;
    candidate: Extract<CandidateCurrentnessProjection, { status: "current" }>;
    delivery: Extract<DeliveryCheckpointArmResult, { status: "not-applicable" | "ready" }>;
  }): Promise<CheckpointReadyComposition>;
  composeSettlementPlan(input: {
    workUnit: string;
    baseRevision: string;
    composition: CheckpointReadyComposition;
  }): Promise<CanonicalSettlementPlan>;
  createHandle(input: CheckpointReadyComposition & {
    workUnit: string;
    settlementPlan: CanonicalSettlementPlan;
    mergeMethod: Extract<MergeMethodResolveResult, { state: "validated" }>;
  }): Promise<
    | { readonly status: "created"; readonly handle: string }
    | {
        readonly status: "recompose-required";
        readonly expectedRecordVersion: string;
        readonly observedRecordVersion: string | null;
      }
  >;
}

async function candidateApplicabilityResult(
  base: { schemaVersion: 1; mode: "integrate-checkpoint"; workUnit: string },
  candidate: Exclude<CandidateApplicabilityResult, { state: "applicable" }>,
  dependencies: IntegrationCheckpointDependencies,
): Promise<IntegrationCheckpointResult> {
  try {
    const payload = candidate.state === "decision-required"
      ? {
          ...candidate,
          resolutionSelector: await dependencies.composeCandidateApplicabilityResolutionSelector(
            base.workUnit,
            candidate,
          ),
        }
      : candidate;
    return IntegrationCheckpointResultSchema.parse({
      ...base,
      state: "candidate-applicability",
      nextAction: candidate.nextAction,
      payload,
    });
  } catch (error) {
    return checkpointOperationRefusal(
      base.workUnit,
      error instanceof Error ? error.message : String(error),
    );
  }
}

function deliveryTerminalDisposition(
  workUnit: string,
  delivery: Extract<DeliveryCheckpointArmResult, { readonly status: "blocked" }>,
): {
  readonly nextAction: "stop" | "retarget" | "reopen-and-retarget";
  readonly remedy: SpineRemedy;
} {
  if ((delivery.nextAction === "retarget" || delivery.nextAction === "reopen-and-retarget")
    && delivery.planId !== undefined && delivery.remedy !== undefined) {
    return {
      nextAction: delivery.nextAction,
      remedy: spineRemedy(
        "The terminal delivery request targets the protected base before integration.",
        "Apply the exact observed failure-only remedy",
        ["arc", "delivery", "top-remedy", "-", "--json"],
        {
          planId: delivery.planId,
          action: delivery.nextAction,
          repository: delivery.remedy.repository,
          protectedBaseRef: delivery.remedy.protectedBaseRef,
        },
      ),
    };
  }
  return {
    nextAction: "stop",
    remedy: checkpointRemedy("delivery-terminal-blocked", workUnit),
  };
}

/**
 * Reduce the complete pre-approval span to one typed checkpoint verdict.
 *
 * @param input - Work-unit checkpoint request.
 * @param dependencies - Exact repository, lifecycle, review, and persistence boundaries.
 * @returns A ready, reconcile, or blocked result with its typed next action.
 */
export async function checkpointIntegration(
  input: IntegrationCheckpointRequest,
  dependencies: IntegrationCheckpointDependencies,
): Promise<IntegrationCheckpointResult> {
  const request = IntegrationCheckpointRequestSchema.parse(input);
  const base = {
    schemaVersion: 1 as const,
    mode: "integrate-checkpoint" as const,
    workUnit: request.workUnit,
  };
  const drift = await dependencies.readDrift(request.workUnit);
  if ((drift.verdict !== "clean" && drift.verdict !== "reconcile")
    || drift.baseOid === null || drift.movement === undefined) {
    return IntegrationCheckpointResultSchema.parse({
      ...base,
      state: "blocked",
      nextAction: "stop",
      reason: "drift-unavailable",
      remedy: checkpointRemedy("drift-unavailable", request.workUnit),
      payload: { drift },
    });
  }
  let applicabilityAllowsReconcile = true;
  if (drift.verdict === "reconcile") {
    const deliveryDrift = await dependencies.classifyDeliveryDrift(request.workUnit, drift);
    if (deliveryDrift.status === "unavailable") {
      return IntegrationCheckpointResultSchema.parse({
        ...base,
        state: "blocked",
        nextAction: "stop",
        reason: "delivery-terminal-blocked",
        remedy: checkpointRemedy("delivery-terminal-blocked", request.workUnit),
        payload: {
          status: "blocked",
          nextAction: "stop",
          reason: "drift-classification-unavailable",
          detail: deliveryDrift.detail,
          driftEvidence: deliveryDrift.evidence,
          classifierAction: deliveryDrift.nextAction,
        },
      });
    }
    if (deliveryDrift.status === "refused") {
      return IntegrationCheckpointResultSchema.parse({
        ...base,
        state: "blocked",
        nextAction: "stop",
        reason: "delivery-terminal-blocked",
        remedy: checkpointRemedy("delivery-terminal-blocked", request.workUnit),
        payload: {
          status: "blocked",
          nextAction: "stop",
          reason: deliveryDrift.reason,
          paths: deliveryDrift.paths,
          driftEvidence: deliveryDrift.evidence,
          explanation: deliveryDrift.explanation,
        },
      });
    }
    applicabilityAllowsReconcile = deliveryDrift.status !== "reconcile"
      || deliveryDrift.safetyClass === "residual-contained";
  }
  const observed = await dependencies.readMovementObservation(request.workUnit, drift);
  const observation = CheckpointMovementObservationSchema.parse({
    movement: drift.movement,
    integrationEvidenceComplete: drift.integrationEvidence?.coverage === "complete",
    feasibility: observed.feasibility,
    admission: observed.admission,
  });
  const projectedPlan = observation.feasibility.base === drift.baseOid
    ? composeCheckpointMovementPlan(observation)
    : {
        state: "blocked" as const,
        reason: "unsafe-reconcile" as const,
        detail: "Git feasibility belongs to a different base than the drift observation.",
      };
  const movementPlan = projectedPlan.state === "reconcile" && !applicabilityAllowsReconcile
    ? {
        state: "blocked" as const,
        reason: "unsafe-reconcile" as const,
        detail: "The applicability result does not authorize this reconciliation.",
      }
    : projectedPlan;
  if (movementPlan.state === "blocked") {
    const common = {
      ...base,
      state: "blocked" as const,
      nextAction: "stop" as const,
      reason: movementPlan.reason,
      remedy: checkpointRemedy(movementPlan.reason, request.workUnit),
    };
    if (movementPlan.reason === "host-pending" || movementPlan.reason === "host-refused") {
      return IntegrationCheckpointResultSchema.parse({
        ...common,
        payload: { observation, detail: movementPlan.detail },
      });
    }
    if (movementPlan.reason === "conflict") {
      return IntegrationCheckpointResultSchema.parse({
        ...common,
        payload: { observation, paths: movementPlan.paths },
      });
    }
    return IntegrationCheckpointResultSchema.parse({
      ...common,
      payload: { drift, observation, detail: movementPlan.detail },
    });
  }
  if (movementPlan.state === "reconcile") {
    const candidate = await dependencies.readCandidate(request.workUnit, drift.baseOid);
    if (candidate === null) {
      return IntegrationCheckpointResultSchema.parse({
        ...base,
        state: "blocked",
        nextAction: "stop",
        reason: "candidate-missing",
        remedy: checkpointRemedy("candidate-missing", request.workUnit),
        payload: { workUnit: request.workUnit },
      });
    }
    if (!("status" in candidate)) return candidateApplicabilityResult(base, candidate, dependencies);
    if (candidate.status === "blocked") {
      return IntegrationCheckpointResultSchema.parse({
        ...base,
        state: "blocked",
        nextAction: "stop",
        reason: "candidate-unexplained-delta",
        remedy: checkpointRemedy("candidate-unexplained-delta", request.workUnit),
        payload: { candidate },
      });
    }
    if (candidate.convergenceVerification === "pending") {
      return IntegrationCheckpointResultSchema.parse({
        ...base,
        state: "blocked",
        nextAction: "stop",
        reason: "candidate-convergence-pending",
        remedy: checkpointRemedy("candidate-convergence-pending", request.workUnit),
        payload: { candidate },
      });
    }
    if (candidate.recognizedRevision !== observation.feasibility.head) {
      return IntegrationCheckpointResultSchema.parse({
        ...base,
        state: "blocked",
        nextAction: "stop",
        reason: "unsafe-reconcile",
        remedy: checkpointRemedy("unsafe-reconcile", request.workUnit),
        payload: { drift, observation, detail: "The Candidate head does not match merge observations." },
      });
    }
    return IntegrationCheckpointResultSchema.parse({
      ...base,
      state: "reconcile",
      nextAction: movementPlan.nextAction,
      payload: { drift, observation, candidateHead: candidate.recognizedRevision },
    });
  }
  const lifecycle = IntegrationLifecycleSummarySchema.parse(
    await dependencies.readLifecycle(request.workUnit),
  );
  if (!lifecycle.complete) {
    return IntegrationCheckpointResultSchema.parse({
      ...base,
      state: "blocked",
      nextAction: "stop",
      reason: "lifecycle-incomplete",
      remedy: checkpointRemedy("lifecycle-incomplete", request.workUnit),
      payload: { lifecycle },
    });
  }
  const candidate = await dependencies.readCandidate(request.workUnit, drift.baseOid);
  if (candidate === null) {
    return IntegrationCheckpointResultSchema.parse({
      ...base,
      state: "blocked",
      nextAction: "stop",
      reason: "candidate-missing",
      remedy: checkpointRemedy("candidate-missing", request.workUnit),
      payload: { workUnit: request.workUnit },
    });
  }
  if (!("status" in candidate)) return candidateApplicabilityResult(base, candidate, dependencies);
  if (candidate.status === "blocked") {
    return IntegrationCheckpointResultSchema.parse({
      ...base,
      state: "blocked",
      nextAction: "stop",
      reason: "candidate-unexplained-delta",
      remedy: checkpointRemedy("candidate-unexplained-delta", request.workUnit),
      payload: { candidate },
    });
  }
  if (candidate.convergenceVerification === "pending") {
    return IntegrationCheckpointResultSchema.parse({
      ...base,
      state: "blocked",
      nextAction: "stop",
      reason: "candidate-convergence-pending",
      remedy: checkpointRemedy("candidate-convergence-pending", request.workUnit),
      payload: { candidate },
    });
  }
  if (candidate.recognizedRevision !== observation.feasibility.head) {
    return IntegrationCheckpointResultSchema.parse({
      ...base,
      state: "blocked",
      nextAction: "stop",
      reason: "unsafe-reconcile",
      remedy: checkpointRemedy("unsafe-reconcile", request.workUnit),
      payload: { drift, observation, detail: "The Candidate head does not match merge observations." },
    });
  }
  try {
    const publication = await dependencies.readCandidatePublication(request.workUnit, drift.baseOid);
    if (publication.status === "refresh-required") {
      return IntegrationCheckpointResultSchema.parse({
        ...base,
        state: "candidate-publication-required",
        nextAction: "resume-pre-publication",
        payload: {
          attestArgv: [
            ...(lifecycle.state === "shipped"
              ? attestNewRootArgv(request.workUnit)
              : attestArgv(request.workUnit)),
            "--json",
          ],
          recommendedActionText:
            "Refresh the recognized Candidate boundary, settle ordinary pre-publication review, then rerun checkpoint.",
        },
      });
    }
    const delivery = await dependencies.composeDelivery({
      workUnit: request.workUnit,
      candidate,
      baseRevision: drift.baseOid,
    });
    if (delivery.status === "terminal-rebind-required") {
      return IntegrationCheckpointResultSchema.parse({
        ...base,
        state: delivery.status,
        nextAction: delivery.nextAction,
        payload: {
          reconcileInput: {
            planId: delivery.planId,
            repository: delivery.repository,
          },
        },
      });
    }
    if (delivery.status === "blocked") {
      const terminal = deliveryTerminalDisposition(request.workUnit, delivery);
      return IntegrationCheckpointResultSchema.parse({
        ...base,
        state: "blocked",
        nextAction: terminal.nextAction,
        reason: "delivery-terminal-blocked",
        remedy: terminal.remedy,
        payload: delivery,
      });
    }
    const composition = CheckpointReadyCompositionSchema.parse(await dependencies.composeReady({
      workUnit: request.workUnit,
      baseRevision: drift.baseOid,
      lifecycle,
      candidate,
      delivery,
    }));
    const hostedReview = composition.requirementSummary.requirements
      .find(({ id }) => id === HOSTED_REVIEW_REQUIREMENT_ID);
    // The deferred hosted obligation is the one composed requirement an operator can still
    // discharge, so it refuses by name with that command rather than through the generic
    // composition failure the bind check below raises.
    if (hostedReview !== undefined && outstanding(hostedReview)) {
      return IntegrationCheckpointResultSchema.parse({
        ...base,
        state: "blocked",
        nextAction: "stop",
        reason: "hosted-reservation-pending",
        remedy: checkpointRemedy("hosted-reservation-pending", request.workUnit),
        payload: { requirement: hostedReview },
      });
    }
    if (
      composition.approvedHead !== candidate.recognizedRevision
      || composition.candidateTailDiff.throughRevision !== composition.approvedHead
      || composition.statusSummary.changeRequest.headSha !== composition.approvedHead
      || composition.statusSummary.changeRequest.repository.toLowerCase()
        !== observation.admission.repository.toLowerCase()
      || composition.statusSummary.changeRequest.pullRequest !== observation.admission.changeRequest
      || composition.statusSummary.lifecycle.workUnit !== lifecycle.workUnit
      || composition.requirementSummary.conclusion !== "satisfied"
    ) {
      throw new Error("ready composition does not bind the exact approved request and Candidate head");
    }
    const stackPosition = delivery.status === "ready" ? "top" : "non-delivery";
    const mergeMethod = await dependencies.resolveMergeMethod(
      composition.statusSummary.changeRequest.repository,
      stackPosition,
    );
    if (mergeMethod.state !== "validated"
      || mergeMethod.repository?.toLowerCase() !== composition.statusSummary.changeRequest.repository.toLowerCase()
      || mergeMethod.stackPosition !== stackPosition) {
      return IntegrationCheckpointResultSchema.parse({
        ...base,
        state: "blocked",
        nextAction: "stop",
        reason: "merge-method-blocked",
        remedy: checkpointRemedy("merge-method-blocked", request.workUnit),
        payload: { mergeMethod },
      });
    }
    const settlementPlan = CanonicalSettlementPlanSchema.parse(await dependencies.composeSettlementPlan({
      workUnit: request.workUnit,
      baseRevision: drift.baseOid,
      composition,
    }));
    const settledDispositions = settlementDispositionIds(settlementPlan);
    const handleResult = await dependencies.createHandle({
      workUnit: request.workUnit,
      ...composition,
      settlementPlan,
      mergeMethod,
    });
    if (handleResult.status === "recompose-required") {
      return IntegrationCheckpointResultSchema.parse({
        ...base,
        state: "recompose-required",
        nextAction: "rerun-checkpoint",
        payload: {
          expectedRecordVersion: handleResult.expectedRecordVersion,
          observedRecordVersion: handleResult.observedRecordVersion,
        },
      });
    }
    const checkpointHandle = handleResult.handle;
    const checks = composition.statusSummary.requiredChecks;
    const interlockSurface = composeCheckpointInterlockSurface({
      approvedHead: composition.approvedHead,
      repository: composition.statusSummary.changeRequest.repository,
      pullRequest: composition.statusSummary.changeRequest.pullRequest,
      baseRef: composition.statusSummary.changeRequest.baseRef,
      observedBase: observation.admission.base,
      method: mergeMethod.method,
      candidateTailReference: composition.candidateTailDiff.reference,
      reviewLanding: hostedReview?.detail ?? "Local carrier `local-attestation`.",
      signals: [
        {
          kind: "base-drift",
          label: "Base drift",
          clean: observation.movement === "disjoint"
            && observation.feasibility.state === "clean"
            && observation.admission.state === "mergeable",
          evidence: `Movement is ${observation.movement}; Git feasibility is ${observation.feasibility.state}; `
            + `host admission is ${observation.admission.state}.`,
        },
        {
          kind: "candidate",
          label: "Candidate",
          clean: true,
          evidence: `Candidate ${candidate.candidateId} is current and converged at ${composition.approvedHead}.`,
        },
        {
          kind: "lifecycle",
          label: "Lifecycle",
          clean: true,
          evidence: `Lifecycle is complete at ${composition.statusSummary.lifecycle.state}.`,
        },
        {
          kind: "change-request",
          label: "Change request",
          clean: true,
          evidence: "The change request is open on the exact approved head.",
        },
        {
          kind: "requirements",
          label: "Requirements",
          clean: !composition.requirementSummary.requirements.some(outstanding),
          evidence: requirementEvidence(composition.requirementSummary),
        },
        {
          kind: "required-checks",
          label: "Required checks",
          clean: checks === "green" || checks === "not-required",
          evidence: `Required-check state is ${checks} on the exact approved head.`,
        },
        {
          kind: "merge-method",
          label: "Merge method",
          clean: true,
          evidence: `${mergeMethod.method} is allowed by policy ${mergeMethod.policyFingerprint}.`,
        },
        {
          kind: "settlement",
          label: "Settlement",
          clean: settledDispositions.length === 0,
          evidence: settledDispositions.length === 0
            ? "No approved dispositions require settlement."
            : `${settledDispositions.length} approved disposition set(s) require settlement.`,
        },
        {
          kind: "checkpoint",
          label: "Checkpoint",
          clean: true,
          evidence: `The approved composition is persisted as ${checkpointHandle}.`,
        },
      ],
    });
    return IntegrationCheckpointResultSchema.parse({
      ...base,
      state: "ready",
      nextAction: "request-approval",
      payload: {
        ...composition,
        checkpointHandle,
        mergeMethod,
        interlockSurface,
        movementObservation: observation,
      },
    });
  } catch (error) {
    return IntegrationCheckpointResultSchema.parse({
      ...base,
      state: "blocked",
      nextAction: "stop",
      reason: "composition-unavailable",
      remedy: checkpointRemedy("composition-unavailable", request.workUnit),
      payload: { detail: error instanceof Error ? error.message : String(error) },
    });
  }
}
