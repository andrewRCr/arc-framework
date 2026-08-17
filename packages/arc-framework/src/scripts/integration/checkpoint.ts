/** Typed integration checkpoint reduction over canonical boundary evidence. */

import { z } from "zod";

import type { BaseDriftResult } from "../../lib/git/base-drift-types.js";
import type { CandidateCurrentnessProjection } from "../../lib/work-unit/candidate-attestation.js";
import { MergeMethodSchema, type MergeMethodResolveResult } from "../review-gate/merge-method.js";
import { RequiredCheckStatusSchema } from "../review-gate/status.js";
import {
  CanonicalSettlementPlanSchema,
  settlementDispositionIds,
  type CanonicalSettlementPlan,
} from "./settlement-plan.js";
import {
  CheckpointInterlockSurfaceSchema,
  composeCheckpointInterlockSurface,
} from "./interlock-surface.js";
import {
  SpineRemedySchema,
  checkpointResumeArgv,
  proposeArgv,
  proposeNewRootArgv,
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

export const ReconcileHostFactSchema = z.discriminatedUnion("state", [
  z.strictObject({ state: z.literal("mergeable") }),
  z.strictObject({ state: z.literal("conflicting") }),
  z.strictObject({ state: z.literal("unavailable"), detail: z.string().min(1) }),
]);
export type ReconcileHostFact = z.infer<typeof ReconcileHostFactSchema>;

export const ReconcileSafetyFactsSchema = z.strictObject({
  baseOid: ObjectIdSchema.nullable(),
  integrationEvidenceComplete: z.boolean(),
  overlapAvailable: z.boolean(),
  substantivePaths: z.array(z.string().min(1)),
  regenerablePaths: z.array(z.string().min(1)),
  host: ReconcileHostFactSchema,
  safe: z.boolean(),
});
export type ReconcileSafetyFacts = z.infer<typeof ReconcileSafetyFactsSchema>;

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
  state: z.literal("blocked"),
  nextAction: z.literal("stop"),
  reason: z.enum(["method-disallowed", "policy-unreadable"]),
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


const IntegrationCheckpointBlockedResultSchema = z.discriminatedUnion("reason", [
  z.strictObject({
    ...CheckpointBlockedBaseShape,
    reason: z.literal("drift-unavailable"),
    payload: z.strictObject({ drift: z.custom<BaseDriftResult>() }),
  }),
  z.strictObject({
    ...CheckpointBlockedBaseShape,
    reason: z.literal("unsafe-reconcile"),
    payload: z.strictObject({ drift: z.custom<BaseDriftResult>(), safety: ReconcileSafetyFactsSchema }),
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
      mergeMethod: BlockedMergeMethodSchema,
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
    "A candidate behind its base reconciles before it is checkpointed.",
    "Resolve the reported substantive overlap with an append-only base merge, then re-run",
    checkpointResumeArgv(workUnit),
  ),
  "lifecycle-incomplete": (workUnit) => spineRemedy(
    "Completion Notes and the lifecycle position are verified before merge.",
    "Compose the reported lifecycle artifacts or complete the archive move, then re-run",
    checkpointResumeArgv(workUnit),
  ),
  "candidate-missing": (workUnit) => spineRemedy(
    "Integration requires a managed Candidate attestation.",
    "Attest the candidate",
    proposeArgv(workUnit),
  ),
  "candidate-unexplained-delta": (workUnit) => spineRemedy(
    "A Candidate lineage advances only on approved review responses.",
    "Explain the reported delta through an approved response, or run full verification and root a new lineage over it",
    proposeNewRootArgv(workUnit),
  ),
  "candidate-convergence-pending": (workUnit) => spineRemedy(
    "An implementation-changing lineage converges before it is checkpointed.",
    "Run the converged verification, then re-attest",
    proposeArgv(workUnit),
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
    }),
  }),
  z.strictObject({
    ...ResultBaseShape,
    state: z.literal("reconcile"),
    nextAction: z.literal("reconcile-base"),
    payload: z.strictObject({
      drift: z.custom<BaseDriftResult>(),
      safety: ReconcileSafetyFactsSchema,
    }),
  }),
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

export interface IntegrationCheckpointDependencies {
  readDrift(workUnit: string): Promise<BaseDriftResult>;
  readReconcileHost(workUnit: string, drift: BaseDriftResult): Promise<ReconcileHostFact>;
  readLifecycle(workUnit: string): Promise<IntegrationLifecycleSummary>;
  readCandidate(workUnit: string): Promise<CandidateCurrentnessProjection | null>;
  resolveMergeMethod(): Promise<MergeMethodResolveResult>;
  composeReady(input: {
    workUnit: string;
    lifecycle: IntegrationLifecycleSummary;
    candidate: Extract<CandidateCurrentnessProjection, { status: "current" }>;
  }): Promise<CheckpointReadyComposition>;
  composeSettlementPlan(input: {
    workUnit: string;
    composition: CheckpointReadyComposition;
  }): Promise<CanonicalSettlementPlan>;
  createHandle(input: CheckpointReadyComposition & {
    workUnit: string;
    settlementPlan: CanonicalSettlementPlan;
    mergeMethod: Extract<MergeMethodResolveResult, { state: "validated" }>;
  }): Promise<string>;
}

function reconcileSafety(drift: BaseDriftResult, host: ReconcileHostFact): ReconcileSafetyFacts {
  const integrationEvidenceComplete = drift.integrationEvidence?.coverage === "complete";
  const overlapAvailable = drift.overlap?.status === "available";
  const substantivePaths = drift.overlap?.status === "available" ? drift.overlap.substantivePaths : [];
  const regenerablePaths = drift.overlap?.status === "available" ? drift.overlap.regenerablePaths : [];
  const analyzerSafe = drift.baseOid !== null
    && integrationEvidenceComplete
    && overlapAvailable
    && substantivePaths.length === 0;
  // Host mergeability is the whole host signal: the host reports that the merge conflicts, never
  // which paths conflict, so nothing here can be measured against the regenerable set.
  const hostSafe = host.state === "mergeable";
  return ReconcileSafetyFactsSchema.parse({
    baseOid: drift.baseOid,
    integrationEvidenceComplete,
    overlapAvailable,
    substantivePaths,
    regenerablePaths,
    host,
    safe: analyzerSafe && hostSafe,
  });
}

/** Reduce the complete pre-approval span to one typed checkpoint verdict. */
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
  if (drift.verdict === "reconcile") {
    const safety = reconcileSafety(
      drift,
      ReconcileHostFactSchema.parse(await dependencies.readReconcileHost(request.workUnit, drift)),
    );
    if (safety.safe) {
      return IntegrationCheckpointResultSchema.parse({
        ...base,
        state: "reconcile",
        nextAction: "reconcile-base",
        payload: { drift, safety },
      });
    }
    return IntegrationCheckpointResultSchema.parse({
      ...base,
      state: "blocked",
      nextAction: "stop",
      reason: "unsafe-reconcile",
      remedy: checkpointRemedy("unsafe-reconcile", request.workUnit),
      payload: { drift, safety },
    });
  }
  if (drift.verdict !== "clean") {
    return IntegrationCheckpointResultSchema.parse({
      ...base,
      state: "blocked",
      nextAction: "stop",
      reason: "drift-unavailable",
      remedy: checkpointRemedy("drift-unavailable", request.workUnit),
      payload: { drift },
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
  const candidate = await dependencies.readCandidate(request.workUnit);
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
  const mergeMethod = await dependencies.resolveMergeMethod();
  if (mergeMethod.state !== "validated") {
    return IntegrationCheckpointResultSchema.parse({
      ...base,
      state: "blocked",
      nextAction: "stop",
      reason: "merge-method-blocked",
      remedy: checkpointRemedy("merge-method-blocked", request.workUnit),
      payload: { mergeMethod },
    });
  }
  try {
    const composition = CheckpointReadyCompositionSchema.parse(await dependencies.composeReady({
      workUnit: request.workUnit,
      lifecycle,
      candidate,
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
      || composition.statusSummary.lifecycle.workUnit !== lifecycle.workUnit
      || composition.requirementSummary.conclusion !== "satisfied"
    ) {
      throw new Error("ready composition does not bind the exact satisfied Candidate head");
    }
    const settlementPlan = CanonicalSettlementPlanSchema.parse(await dependencies.composeSettlementPlan({
      workUnit: request.workUnit,
      composition,
    }));
    const settledDispositions = settlementDispositionIds(settlementPlan);
    const checkpointHandle = await dependencies.createHandle({
      workUnit: request.workUnit,
      ...composition,
      settlementPlan,
      mergeMethod,
    });
    const checks = composition.statusSummary.requiredChecks;
    const interlockSurface = composeCheckpointInterlockSurface({
      approvedHead: composition.approvedHead,
      repository: composition.statusSummary.changeRequest.repository,
      pullRequest: composition.statusSummary.changeRequest.pullRequest,
      method: mergeMethod.method,
      candidateTailReference: composition.candidateTailDiff.reference,
      reviewLanding: hostedReview?.detail ?? "Local carrier `local-attestation`.",
      signals: [
        {
          kind: "base-drift",
          label: "Base drift",
          clean: true,
          evidence: "The authoritative drift read is clean.",
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
      payload: { ...composition, checkpointHandle, mergeMethod, interlockSurface },
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
