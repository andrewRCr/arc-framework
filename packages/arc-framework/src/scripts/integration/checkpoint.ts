/** Typed integration checkpoint reduction over canonical boundary evidence. */

import { z } from "zod";

import type { BaseDriftResult } from "../../lib/git/base-drift-types.js";
import type { CandidateCurrentnessProjection } from "../../lib/work-unit/candidate-attestation.js";
import type { MergeMethodResolveResult } from "../review-gate/merge-method.js";

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
  complete: z.boolean(),
});
export type IntegrationLifecycleSummary = z.infer<typeof IntegrationLifecycleSummarySchema>;

export const ReconcileHostFactSchema = z.discriminatedUnion("state", [
  z.strictObject({ state: z.literal("mergeable") }),
  z.strictObject({ state: z.literal("conflicting"), conflictingPaths: z.array(z.string().min(1)) }),
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

export const CheckpointRequirementSummarySchema = z.strictObject({
  conclusion: z.enum(["satisfied", "pending", "failure"]),
  requirements: z.array(z.strictObject({
    id: z.string().min(1),
    state: z.enum(["satisfied", "pending", "failure", "not-applicable"]),
    detail: z.string().min(1),
  })),
});

export const CheckpointStatusSummarySchema = z.strictObject({
  lifecycle: IntegrationLifecycleSummarySchema,
  changeRequest: z.strictObject({
    repository: z.string().min(1),
    pullRequest: z.number().int().positive(),
    headRef: z.string().min(1),
    headSha: ObjectIdSchema,
    state: z.literal("open"),
  }),
  requiredChecks: z.enum(["green", "pending", "failed", "not-required", "unavailable"]),
});

export const ComposedReviewRecordSchema = z.strictObject({
  markdown: z.string().min(1).nullable(),
  dispositionIds: z.array(DigestSchema),
}).superRefine((record, context) => {
  if ((record.markdown === null) !== (record.dispositionIds.length === 0)) {
    context.addIssue({
      code: "custom",
      path: ["markdown"],
      message: "a disposition-bearing review record requires composed markdown",
    });
  }
});

export const CheckpointReadyCompositionSchema = z.strictObject({
  approvedHead: ObjectIdSchema,
  candidateTailDiff: CandidateTailDiffReferenceSchema,
  requirementSummary: CheckpointRequirementSummarySchema,
  statusSummary: CheckpointStatusSummarySchema,
  reviewRecord: ComposedReviewRecordSchema,
});
export type CheckpointReadyComposition = z.infer<typeof CheckpointReadyCompositionSchema>;

const ValidatedMergeMethodSchema = z.strictObject({
  schemaVersion: z.literal(1),
  mode: z.literal("review-merge-method-resolve"),
  repository: z.string().min(1),
  state: z.literal("validated"),
  nextAction: z.literal("use-method"),
  method: z.enum(["merge", "rebase", "squash"]),
  allowedMethods: z.array(z.enum(["merge", "rebase", "squash"])),
  policyFingerprint: DigestSchema,
});

const BlockedMergeMethodSchema = z.strictObject({
  schemaVersion: z.literal(1),
  mode: z.literal("review-merge-method-resolve"),
  repository: z.string().min(1).nullable(),
  state: z.literal("blocked"),
  nextAction: z.literal("stop"),
  reason: z.enum(["method-disallowed", "policy-unreadable"]),
  configuredMethod: z.enum(["merge", "rebase", "squash"]),
  allowedMethods: z.array(z.enum(["merge", "rebase", "squash"])),
  policyFingerprint: DigestSchema.optional(),
  detail: z.string().min(1).optional(),
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
    reason: z.literal("composition-unavailable"),
    payload: z.strictObject({ detail: z.string().min(1) }),
  }),
]);

export const IntegrationCheckpointResultSchema = z.union([
  z.strictObject({
    ...ResultBaseShape,
    state: z.literal("ready"),
    nextAction: z.literal("request-approval"),
    payload: CheckpointReadyCompositionSchema.extend({
      checkpointHandle: z.string().min(1),
      mergeMethod: ValidatedMergeMethodSchema,
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
]);
export type IntegrationCheckpointResult = z.infer<typeof IntegrationCheckpointResultSchema>;

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
  createHandle(input: CheckpointReadyComposition & {
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
  const hostSafe = host.state === "mergeable"
    || (host.state === "conflicting"
      && host.conflictingPaths.every((path) => regenerablePaths.includes(path)));
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
      payload: { drift, safety },
    });
  }
  if (drift.verdict !== "clean") {
    return IntegrationCheckpointResultSchema.parse({
      ...base,
      state: "blocked",
      nextAction: "stop",
      reason: "drift-unavailable",
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
      payload: { workUnit: request.workUnit },
    });
  }
  if (candidate.status === "blocked") {
    return IntegrationCheckpointResultSchema.parse({
      ...base,
      state: "blocked",
      nextAction: "stop",
      reason: "candidate-unexplained-delta",
      payload: { candidate },
    });
  }
  if (candidate.convergenceVerification === "pending") {
    return IntegrationCheckpointResultSchema.parse({
      ...base,
      state: "blocked",
      nextAction: "stop",
      reason: "candidate-convergence-pending",
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
      payload: { mergeMethod },
    });
  }
  try {
    const composition = CheckpointReadyCompositionSchema.parse(await dependencies.composeReady({
      workUnit: request.workUnit,
      lifecycle,
      candidate,
    }));
    if (
      composition.approvedHead !== candidate.recognizedRevision
      || composition.candidateTailDiff.throughRevision !== composition.approvedHead
      || composition.statusSummary.changeRequest.headSha !== composition.approvedHead
      || composition.statusSummary.lifecycle.workUnit !== lifecycle.workUnit
      || composition.requirementSummary.conclusion !== "satisfied"
    ) {
      throw new Error("ready composition does not bind the exact satisfied Candidate head");
    }
    const checkpointHandle = await dependencies.createHandle({ ...composition, mergeMethod });
    return IntegrationCheckpointResultSchema.parse({
      ...base,
      state: "ready",
      nextAction: "request-approval",
      payload: { ...composition, checkpointHandle, mergeMethod },
    });
  } catch (error) {
    return IntegrationCheckpointResultSchema.parse({
      ...base,
      state: "blocked",
      nextAction: "stop",
      reason: "composition-unavailable",
      payload: { detail: error instanceof Error ? error.message : String(error) },
    });
  }
}
