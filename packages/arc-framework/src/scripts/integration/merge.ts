/** Exact-checkpoint integration merge and its fail-closed compensating exits. */

import { z } from "zod";

import type {
  CheckpointMovementObservation,
  CheckpointMovementPlan,
} from "./checkpoint.js";
import {
  RequiredCheckSchema,
  type RequiredChecksObservationResult,
} from "../review-gate/checks-await.js";
import type {
  MergeMethodResolveResult,
  MergeMethodStackPosition,
} from "../review-gate/merge-method.js";
import {
  MergeLockTransitionRequestSchema,
  type MergeLockTransitionRequest,
} from "../review-gate/merge-lock.js";
import type { IntegrationCheckpointCompositionRecord } from "./checkpoint-store.js";
import {
  SpineRemedySchema,
  checkpointResumeArgv,
  spineRemedy,
  type SpineRemedy,
} from "./spine-refusal.js";
import type { SettlementExecutionResult } from "./settlement-execution.js";

const SlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
const ObjectIdSchema = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u);
const CheckpointHandleSchema = z.string().regex(
  /^checkpoint-v1:(?:[0-9a-f]{40}|[0-9a-f]{64}):sha256:[0-9a-f]{64}$/u,
);

export const IntegrationMergeRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  workUnit: SlugSchema,
  checkpointHandle: CheckpointHandleSchema,
});
export type IntegrationMergeRequest = z.infer<typeof IntegrationMergeRequestSchema>;

export const IntegrationMergeTargetSchema = z.strictObject({
  repository: z.string().min(1),
  pullRequest: z.number().int().positive(),
  baseRef: z.string().min(1),
  headRef: z.string().min(1),
  headSha: ObjectIdSchema,
});
export type IntegrationMergeTarget = z.infer<typeof IntegrationMergeTargetSchema>;

export const PinnedMergeResultSchema = z.discriminatedUnion("state", [
  z.strictObject({
    state: z.literal("merged"),
    target: IntegrationMergeTargetSchema,
    providerMergeId: z.string().trim().min(1).nullable(),
  }),
  z.strictObject({
    state: z.literal("head-moved"),
    target: IntegrationMergeTargetSchema,
    actualHead: ObjectIdSchema,
    detail: z.string().trim().min(1),
  }),
  z.strictObject({
    state: z.literal("base-currentness-required"),
    target: IntegrationMergeTargetSchema,
    detail: z.string().trim().min(1),
  }),
  z.strictObject({
    state: z.literal("refused"),
    target: IntegrationMergeTargetSchema,
    detail: z.string().trim().min(1),
  }),
  z.strictObject({
    state: z.literal("merge-outcome-unknown"),
    target: IntegrationMergeTargetSchema,
    mutationDetail: z.string().trim().min(1),
    confirmationDetail: z.string().trim().min(1),
  }),
  z.strictObject({
    state: z.literal("operation-failed"),
    target: IntegrationMergeTargetSchema,
    detail: z.string().trim().min(1),
  }),
]);
export type PinnedMergeResult = z.infer<typeof PinnedMergeResultSchema>;

export type IntegrationFinalPlan =
  | {
      readonly status: "available";
      readonly target: IntegrationMergeTarget;
      readonly baseOid: string;
      readonly observation: CheckpointMovementObservation;
      readonly plan: CheckpointMovementPlan;
    }
  | {
      readonly status: "unavailable";
      readonly target: IntegrationMergeTarget;
      readonly baseOid: string | null;
      readonly detail: string;
    };

export const IntegrationMergeInvalidationReasonSchema = z.enum([
  "checkpoint-missing",
  "settlement-invalidated",
  "head-mismatch",
  "lifecycle-moved",
  "release-blocked",
  "checks-failed",
  "merge-method-moved",
  "drift-reconcile",
  "merge-blocked",
  "head-moved",
  "base-currentness-required",
]);
export type IntegrationMergeInvalidationReason = z.infer<typeof IntegrationMergeInvalidationReasonSchema>;

export const MergeBlockedReasonSchema = z.enum([
  "relock-failed",
  "operation-failed",
  "host-refused",
  "host-pending",
  "merge-outcome-unknown",
]);

/** Every reason the merge verb refuses with — invalidation plus terminal block. */
export type MergeRefusalReason =
  | IntegrationMergeInvalidationReason
  | z.infer<typeof MergeBlockedReasonSchema>;

/** Every refusal reason, for exhaustive iteration. */
export const MERGE_REFUSAL_REASONS: readonly MergeRefusalReason[] = [
  ...IntegrationMergeInvalidationReasonSchema.options,
  ...MergeBlockedReasonSchema.options,
];

const MERGE_REMEDIES: Record<
  Exclude<MergeRefusalReason, "relock-failed" | "host-pending" | "merge-outcome-unknown">,
  (workUnit: string) => SpineRemedy
> = {
  "checkpoint-missing": (workUnit) => spineRemedy(
    "A merge executes only a persisted checkpoint composition.",
    "Compose a fresh checkpoint",
    checkpointResumeArgv(workUnit),
  ),
  "settlement-invalidated": (workUnit) => spineRemedy(
    "The executed settlement is exactly what the approval covered.",
    "Re-settle the reported channel, then re-checkpoint",
    checkpointResumeArgv(workUnit),
  ),
  "head-mismatch": (workUnit) => spineRemedy(
    "A merge lands only the exact approved head.",
    "Re-checkpoint over the current head",
    checkpointResumeArgv(workUnit),
  ),
  "lifecycle-moved": (workUnit) => spineRemedy(
    "The lifecycle stays complete from checkpoint through merge.",
    "Restore the reported lifecycle position, then re-checkpoint",
    checkpointResumeArgv(workUnit),
  ),
  "release-blocked": (workUnit) => spineRemedy(
    "The merge lock releases only through its own lifecycle gate.",
    "Resolve the reported release refusal, then re-checkpoint",
    checkpointResumeArgv(workUnit),
  ),
  "checks-failed": (workUnit) => spineRemedy(
    "Required checks are green on the exact approved head.",
    "Land a fix for the failing checks, then re-checkpoint",
    checkpointResumeArgv(workUnit),
  ),
  "merge-method-moved": () => spineRemedy(
    "The merge method does not move after the checkpoint pinned it.",
    "Re-resolve the host merge-method policy",
    ["arc", "review", "merge-method", "resolve", "--json"],
  ),
  "drift-reconcile": (workUnit) => spineRemedy(
    "A merge lands only from an authoritatively clean base.",
    "Reconcile the base append-only, then re-checkpoint",
    checkpointResumeArgv(workUnit),
  ),
  "merge-blocked": (workUnit) => spineRemedy(
    "The host merge succeeds on the pinned head or the candidate stays unmerged.",
    "Resolve the reported host refusal, then re-checkpoint",
    checkpointResumeArgv(workUnit),
  ),
  "head-moved": (workUnit) => spineRemedy(
    "A merge lands only the exact approved head.",
    "Re-checkpoint over the current head",
    checkpointResumeArgv(workUnit),
  ),
  "base-currentness-required": () => spineRemedy(
    "A host-required current base is reconciled only through a fresh typed checkpoint.",
    "Reconcile the current base, then re-checkpoint",
    ["arc", "base", "merge", "--json"],
  ),
  "operation-failed": (workUnit) => spineRemedy(
    "A merge either lands or leaves the candidate resumable.",
    "Resolve the reported operational failure, then re-checkpoint",
    checkpointResumeArgv(workUnit),
  ),
  "host-refused": (workUnit) => spineRemedy(
    "The host must accept the exact approved-head merge under its configured policy.",
    "Resolve the reported host refusal, then re-checkpoint",
    checkpointResumeArgv(workUnit),
  ),
};

/**
 * Resolve the corrective remedy for one merge refusal.
 *
 * @param reason - The typed invalidation or blocked reason.
 * @param workUnit - The refused work unit, interpolated into slug-bearing commands.
 * @param relockRequest - Exact lock request required only by a re-lock failure.
 * @param checkpointHandle - Exact continuation handle required by retryable terminal outcomes.
 * @returns The remedy naming the failed invariant and one corrective command.
 */
export function mergeRemedy(
  reason: MergeRefusalReason,
  workUnit: string,
  relockRequest?: MergeLockTransitionRequest,
  checkpointHandle?: string,
): SpineRemedy {
  if (reason === "relock-failed") {
    const request = MergeLockTransitionRequestSchema.parse(relockRequest);
    return spineRemedy(
      "An invalidated candidate is re-locked before the operator resumes.",
      "Re-hold the merge lock",
      ["arc", "merge", "lock", "hold", "-"],
      request,
    );
  }
  if (reason === "host-pending" || reason === "merge-outcome-unknown") {
    const handle = CheckpointHandleSchema.parse(checkpointHandle);
    return reason === "host-pending"
      ? spineRemedy(
          "Host admission must resolve for the exact approved target.",
          "Retry the exact checkpoint merge",
          ["arc", "integrate", "merge", workUnit, "--checkpoint", handle, "--json"],
        )
      : spineRemedy(
          "An ambiguous mutating request is confirmed before another merge attempt.",
          "Retry the exact checkpoint merge to confirm or resume",
          ["arc", "integrate", "merge", workUnit, "--checkpoint", handle, "--json"],
        );
  }
  return MERGE_REMEDIES[reason](workUnit);
}

const ResultBaseShape = {
  schemaVersion: z.literal(1),
  mode: z.literal("integrate-merge"),
  workUnit: SlugSchema,
};

export const IntegrationMergeResultSchema = z.union([
  z.strictObject({
    ...ResultBaseShape,
    state: z.literal("merged"),
    nextAction: z.literal("complete"),
    payload: z.strictObject({
      approvedHead: ObjectIdSchema,
      pullRequest: z.number().int().positive(),
      target: IntegrationMergeTargetSchema,
      providerMergeId: z.string().trim().min(1).nullable(),
    }),
  }),
  z.strictObject({
    ...ResultBaseShape,
    state: z.literal("invalidated"),
    nextAction: z.enum(["checkpoint", "reconcile-base"]),
    reason: IntegrationMergeInvalidationReasonSchema,
    remedy: SpineRemedySchema,
    payload: z.record(z.string(), z.unknown()),
  }),
  z.strictObject({
    ...ResultBaseShape,
    state: z.literal("awaiting-checks"),
    nextAction: z.literal("retry"),
    payload: z.discriminatedUnion("observationKind", [z.strictObject({
      checkpointHandle: CheckpointHandleSchema,
      approvedHead: ObjectIdSchema,
      approvedTarget: IntegrationMergeTargetSchema,
      observationKind: z.literal("pending"),
      checks: z.array(RequiredCheckSchema),
      diagnosticFailures: z.array(RequiredCheckSchema),
      retry: SpineRemedySchema,
    }), z.strictObject({
      checkpointHandle: CheckpointHandleSchema,
      approvedHead: ObjectIdSchema,
      approvedTarget: IntegrationMergeTargetSchema,
      observationKind: z.literal("unavailable"),
      checks: z.array(RequiredCheckSchema),
      diagnosticFailures: z.array(RequiredCheckSchema),
      cause: z.enum(["provider", "aborted", "deadline"]),
      detail: z.string().trim().min(1),
      retry: SpineRemedySchema,
    })]),
  }),
  z.strictObject({
    ...ResultBaseShape,
    state: z.literal("blocked"),
    nextAction: z.enum(["stop", "retry"]),
    reason: MergeBlockedReasonSchema,
    remedy: SpineRemedySchema,
    payload: z.record(z.string(), z.unknown()),
  }),
  z.strictObject({
    ...ResultBaseShape,
    workUnit: z.null(),
    state: z.literal("blocked"),
    nextAction: z.literal("stop"),
    reason: z.literal("invalid-input"),
    remedy: SpineRemedySchema,
    payload: z.strictObject({ detail: z.string().min(1) }),
  }),
]);
export type IntegrationMergeResult = z.infer<typeof IntegrationMergeResultSchema>;

/**
 * Compose the published merge refusal for invalid CLI input.
 *
 * @param detail - Validation detail safe to expose in the result payload.
 * @returns A schema-valid refusal with the merge help command.
 */
export function mergeInputRefusal(detail: string): IntegrationMergeResult {
  return IntegrationMergeResultSchema.parse({
    schemaVersion: 1,
    mode: "integrate-merge",
    workUnit: null,
    state: "blocked",
    nextAction: "stop",
    reason: "invalid-input",
    remedy: spineRemedy(
      "The merge requires a valid work-unit slug and checkpoint handle.",
      "Review command usage",
      ["arc", "integrate", "merge", "--help"],
    ),
    payload: { detail },
  });
}

/**
 * Compose a typed merge refusal for a dependency failure at the handler boundary.
 *
 * @param workUnit - The validated work-unit slug.
 * @param detail - Dependency failure detail safe to expose in the result payload.
 * @returns A schema-valid refusal that routes back through checkpoint composition.
 */
export function mergeOperationRefusal(workUnit: string, detail: string): IntegrationMergeResult {
  return IntegrationMergeResultSchema.parse({
    schemaVersion: 1,
    mode: "integrate-merge",
    workUnit,
    state: "blocked",
    nextAction: "stop",
    reason: "operation-failed",
    remedy: mergeRemedy("operation-failed", workUnit),
    payload: { detail },
  });
}

export interface IntegrationMergeDependencies {
  readCheckpoint(workUnit: string, handle: string): Promise<IntegrationCheckpointCompositionRecord | null>;
  executeSettlement(record: IntegrationCheckpointCompositionRecord): Promise<SettlementExecutionResult>;
  readStatus(workUnit: string): Promise<{
    actualHead: string;
    lifecycleComplete: boolean;
    lifecycleVersion: string;
    target: IntegrationMergeTarget;
  }>;
  readMerged(target: IntegrationMergeTarget): Promise<boolean>;
  refreshTarget(target: IntegrationMergeTarget): Promise<IntegrationMergeTarget>;
  releaseLock(target: IntegrationMergeTarget): Promise<{ state: string }>;
  holdLock(target?: IntegrationMergeTarget): Promise<{ state: string }>;
  createLockRequest(target?: IntegrationMergeTarget): Promise<MergeLockTransitionRequest>;
  observeChecks(target: IntegrationMergeTarget): Promise<RequiredChecksObservationResult>;
  resolveMergeMethod(repository: string, stackPosition: MergeMethodStackPosition): Promise<MergeMethodResolveResult>;
  readConfiguredBase(): Promise<string>;
  readFinalPlan(
    target: IntegrationMergeTarget,
    admissionOverride?: { readonly state: "base-currentness-required" | "refused"; readonly detail: string },
  ): Promise<IntegrationFinalPlan>;
  mergePinned(
    target: IntegrationMergeTarget,
    method: "merge" | "rebase" | "squash",
  ): Promise<PinnedMergeResult>;
}

async function invalidated(
  base: { schemaVersion: 1; mode: "integrate-merge"; workUnit: string },
  reason: IntegrationMergeInvalidationReason,
  payload: Record<string, unknown>,
  dependencies: IntegrationMergeDependencies,
  target?: IntegrationMergeTarget,
): Promise<IntegrationMergeResult> {
  let holdRequest: MergeLockTransitionRequest | null = null;
  try {
    const holdTarget = target === undefined
      ? undefined
      : await dependencies.refreshTarget(target);
    holdRequest = await dependencies.createLockRequest(holdTarget);
    const hold = await dependencies.holdLock(holdTarget);
    if (hold.state !== "held" && hold.state !== "no-lock") throw new Error("lock hold was refused");
  } catch (error) {
    const relockFailed = holdRequest !== null;
    return IntegrationMergeResultSchema.parse({
      ...base,
      state: "blocked",
      nextAction: "stop",
      reason: relockFailed ? "relock-failed" : "operation-failed",
      remedy: relockFailed
        ? mergeRemedy("relock-failed", base.workUnit, holdRequest ?? undefined)
        : mergeRemedy("operation-failed", base.workUnit),
      payload: {
        invalidationReason: reason,
        detail: error instanceof Error ? error.message : String(error),
      },
    });
  }
  return IntegrationMergeResultSchema.parse({
    ...base,
    state: "invalidated",
    nextAction: "checkpoint",
    reason,
    remedy: mergeRemedy(reason, base.workUnit),
    payload,
  });
}

/** Execute the exact persisted post-approval span and merge only its approved head. */
export async function mergeIntegration(
  input: IntegrationMergeRequest,
  dependencies: IntegrationMergeDependencies,
): Promise<IntegrationMergeResult> {
  const request = IntegrationMergeRequestSchema.parse(input);
  const base = {
    schemaVersion: 1 as const,
    mode: "integrate-merge" as const,
    workUnit: request.workUnit,
  };
  let checkpoint: IntegrationCheckpointCompositionRecord | null = null;
  let target: IntegrationMergeTarget | undefined;
  try {
    checkpoint = await dependencies.readCheckpoint(request.workUnit, request.checkpointHandle);
    if (checkpoint === null) {
      return await invalidated(
        base,
        "checkpoint-missing",
        { checkpointHandle: request.checkpointHandle },
        dependencies,
      );
    }
    target = IntegrationMergeTargetSchema.parse(checkpoint.target);
    if (await dependencies.readMerged(target)) {
      return IntegrationMergeResultSchema.parse({
        ...base,
        state: "merged",
        nextAction: "complete",
        payload: {
          approvedHead: checkpoint.approvedHead,
          pullRequest: target.pullRequest,
          target,
          providerMergeId: null,
        },
      });
    }
    const settlement = await dependencies.executeSettlement(checkpoint);
    if (settlement.state === "invalidated") {
      return await invalidated(base, "settlement-invalidated", { settlement }, dependencies, target);
    }

    const status = await dependencies.readStatus(request.workUnit);
    const liveTarget = IntegrationMergeTargetSchema.parse(status.target);
    if (
      status.actualHead !== checkpoint.approvedHead
      || liveTarget.headSha !== checkpoint.approvedHead
      || liveTarget.repository !== checkpoint.target.repository
      || liveTarget.pullRequest !== checkpoint.target.pullRequest
      || liveTarget.baseRef !== checkpoint.target.baseRef
      || liveTarget.headRef !== checkpoint.target.headRef
      || status.lifecycleVersion !== checkpoint.lifecycleVersion
    ) {
      return await invalidated(base, "head-mismatch", {
        approvedHead: checkpoint.approvedHead,
        actualHead: status.actualHead,
        checkpointTarget: checkpoint.target,
        liveTarget,
        checkpointLifecycleVersion: checkpoint.lifecycleVersion,
        liveLifecycleVersion: status.lifecycleVersion,
      }, dependencies, target);
    }
    target = liveTarget;
    if (!status.lifecycleComplete) {
      return await invalidated(base, "lifecycle-moved", {}, dependencies, target);
    }
    const configuredBaseBeforeRelease = await dependencies.readConfiguredBase();
    if (configuredBaseBeforeRelease !== target.baseRef) {
      return await invalidated(base, "head-mismatch", {
        configuredBase: configuredBaseBeforeRelease,
        targetBase: target.baseRef,
      }, dependencies, target);
    }

    const checks = await dependencies.observeChecks(target);
    if (checks.state === "pending") {
      return IntegrationMergeResultSchema.parse({
        ...base,
        state: "awaiting-checks",
        nextAction: "retry",
        payload: {
          checkpointHandle: request.checkpointHandle,
          approvedHead: checkpoint.approvedHead,
          approvedTarget: target,
          observationKind: "pending",
          checks: checks.checks,
          diagnosticFailures: checks.diagnosticFailures,
          retry: spineRemedy(
            "Required checks must settle on the exact approved target before merge.",
            "Retry the same checkpoint after external check progress",
            [
              "arc", "integrate", "merge", request.workUnit,
              "--checkpoint", request.checkpointHandle, "--json",
            ],
          ),
        },
      });
    }
    if (checks.state === "unavailable") {
      return IntegrationMergeResultSchema.parse({
        ...base,
        state: "awaiting-checks",
        nextAction: "retry",
        payload: {
          checkpointHandle: request.checkpointHandle,
          approvedHead: checkpoint.approvedHead,
          approvedTarget: target,
          observationKind: "unavailable",
          checks: checks.checks,
          diagnosticFailures: checks.diagnosticFailures,
          cause: checks.cause,
          detail: checks.detail,
          retry: spineRemedy(
            "Required checks must be observable on the exact approved target before merge.",
            "Retry the same checkpoint after host evidence is available",
            [
              "arc", "integrate", "merge", request.workUnit,
              "--checkpoint", request.checkpointHandle, "--json",
            ],
          ),
        },
      });
    }
    if (checks.state === "failed") {
      return await invalidated(base, "checks-failed", { checks: checks.checks }, dependencies, target);
    }
    if (checks.state === "stale-target") {
      return await invalidated(base, "head-mismatch", {
        approvedHead: checkpoint.approvedHead,
        actualHead: checks.actualHeadSha,
      }, dependencies, target);
    }
    if (checks.state === "target-mismatch") {
      return await invalidated(base, "head-mismatch", {
        approvedRepository: target.repository,
        actualRepository: checks.actualRepository,
      }, dependencies, target);
    }

    const postChecksTarget = IntegrationMergeTargetSchema.parse(await dependencies.refreshTarget(target));
    if (
      postChecksTarget.repository !== target.repository
      || postChecksTarget.pullRequest !== target.pullRequest
      || postChecksTarget.baseRef !== target.baseRef
      || postChecksTarget.headRef !== target.headRef
      || postChecksTarget.headSha !== target.headSha
    ) {
      return await invalidated(base, "head-mismatch", {
        approvedHead: target.headSha,
        actualHead: postChecksTarget.headSha,
        checkpointTarget: target,
        liveTarget: postChecksTarget,
      }, dependencies, target);
    }

    const mergeMethod = await dependencies.resolveMergeMethod(
      target.repository,
      checkpoint.mergeMethod.stackPosition,
    );
    if (
      mergeMethod.state !== "validated"
      || mergeMethod.repository?.toLowerCase() !== target.repository.toLowerCase()
      || mergeMethod.stackPosition !== checkpoint.mergeMethod.stackPosition
      || mergeMethod.method !== checkpoint.mergeMethod.method
      || mergeMethod.policyFingerprint !== checkpoint.mergeMethod.policyFingerprint
    ) {
      return await invalidated(base, "merge-method-moved", { mergeMethod }, dependencies, target);
    }

    {
      const final = await dependencies.readFinalPlan(target);
      if (final.status === "unavailable") {
        return await invalidated(base, "drift-reconcile", { final }, dependencies, target);
      }
      const exactTarget = final.target.repository.toLowerCase() === target.repository.toLowerCase()
        && final.target.pullRequest === target.pullRequest
        && final.target.baseRef === target.baseRef
        && final.target.headRef === target.headRef
        && final.target.headSha === target.headSha;
      const exactObservation = final.observation.feasibility.base === final.baseOid
        && final.observation.feasibility.head === target.headSha
        && final.observation.admission.repository.toLowerCase() === target.repository.toLowerCase()
        && final.observation.admission.changeRequest === target.pullRequest
        && final.observation.admission.base === final.baseOid
        && final.observation.admission.head === target.headSha;
      if (!exactTarget || !exactObservation) {
        return await invalidated(base, "head-mismatch", { target, final }, dependencies, target);
      }
      if (final.plan.state === "blocked" && final.plan.reason === "host-pending") {
        return IntegrationMergeResultSchema.parse({
          ...base,
          state: "blocked",
          nextAction: "retry",
          reason: "host-pending",
          remedy: mergeRemedy(
            "host-pending",
            request.workUnit,
            undefined,
            request.checkpointHandle,
          ),
          payload: {
            checkpointHandle: request.checkpointHandle,
            target: final.target,
            baseOid: final.baseOid,
            detail: final.plan.detail,
            observation: final.observation,
          },
        });
      }
      if (final.plan.state === "blocked" && final.plan.reason === "host-refused") {
        return IntegrationMergeResultSchema.parse({
          ...base,
          state: "blocked",
          nextAction: "stop",
          reason: "host-refused",
          remedy: mergeRemedy("host-refused", request.workUnit),
          payload: {
            target: final.target,
            baseOid: final.baseOid,
            detail: final.plan.detail,
            observation: final.observation,
          },
        });
      }
      if (final.plan.state !== "proceed") {
        return await invalidated(base, "drift-reconcile", { final }, dependencies, target);
      }
    }
    const configuredBaseBeforeMerge = await dependencies.readConfiguredBase();
    if (configuredBaseBeforeMerge !== target.baseRef) {
      return await invalidated(base, "head-mismatch", {
        configuredBase: configuredBaseBeforeMerge,
        targetBase: target.baseRef,
      }, dependencies, target);
    }

    const release = await dependencies.releaseLock(target);
    if (release.state !== "released" && release.state !== "no-lock") {
      return await invalidated(base, "release-blocked", { release }, dependencies, target);
    }

    const merged = await dependencies.mergePinned(target, mergeMethod.method);
    if (merged.state === "refused") {
      const final = await dependencies.readFinalPlan(target, {
        state: "refused",
        detail: merged.detail,
      });
      if (final.status === "unavailable"
        || final.target.repository.toLowerCase() !== target.repository.toLowerCase()
        || final.target.pullRequest !== target.pullRequest
        || final.target.baseRef !== target.baseRef
        || final.target.headRef !== target.headRef
        || final.target.headSha !== target.headSha) {
        return await invalidated(base, "head-mismatch", { target, final }, dependencies, target);
      }
      const relocked = await invalidated(base, "merge-blocked", { merge: merged }, dependencies, target);
      if (relocked.state === "blocked") return relocked;
      return IntegrationMergeResultSchema.parse({
        ...base,
        state: "blocked",
        nextAction: "stop",
        reason: "host-refused",
        remedy: mergeRemedy("host-refused", request.workUnit),
        payload: {
          target: merged.target,
          baseOid: final.baseOid,
          detail: merged.detail,
          observation: final.observation,
        },
      });
    }
    if (merged.state === "merge-outcome-unknown") {
      return IntegrationMergeResultSchema.parse({
        ...base,
        state: "blocked",
        nextAction: "retry",
        reason: "merge-outcome-unknown",
        remedy: mergeRemedy(
          "merge-outcome-unknown",
          request.workUnit,
          undefined,
          request.checkpointHandle,
        ),
        payload: {
          checkpointHandle: request.checkpointHandle,
          target: merged.target,
          mutationDetail: merged.mutationDetail,
          confirmationDetail: merged.confirmationDetail,
        },
      });
    }
    if (merged.state === "base-currentness-required") {
      const final = await dependencies.readFinalPlan(target, {
        state: "base-currentness-required",
        detail: merged.detail,
      });
      const reconcileAuthorized = final.status === "available"
        && final.target.repository.toLowerCase() === target.repository.toLowerCase()
        && final.target.pullRequest === target.pullRequest
        && final.target.baseRef === target.baseRef
        && final.target.headRef === target.headRef
        && final.target.headSha === target.headSha
        && final.observation.integrationEvidenceComplete
        && final.plan.state === "reconcile"
        && final.plan.nextAction === "reconcile-base";
      const relocked = await invalidated(
        base,
        "base-currentness-required",
        {
          target: merged.target,
          detail: merged.detail,
          ...(final.status === "available"
            ? { baseOid: final.baseOid, observation: final.observation }
            : {}),
          ...(reconcileAuthorized
            ? {}
            : { terminalExplanation: "Complete exact integration evidence did not authorize base reconciliation." }),
        },
        dependencies,
        target,
      );
      if (relocked.state === "blocked") return relocked;
      return reconcileAuthorized
        ? IntegrationMergeResultSchema.parse({ ...relocked, nextAction: "reconcile-base" })
        : relocked;
    }
    if (merged.state === "head-moved") {
      return await invalidated(base, "head-moved", {
        target: merged.target,
        actualHead: merged.actualHead,
        detail: merged.detail,
      }, dependencies, target);
    }
    if (merged.state === "operation-failed") {
      const relocked = await invalidated(base, "merge-blocked", { merge: merged }, dependencies, target);
      if (relocked.state === "blocked") return relocked;
      return IntegrationMergeResultSchema.parse({
        ...base,
        state: "blocked",
        nextAction: "stop",
        reason: "operation-failed",
        remedy: mergeRemedy("operation-failed", request.workUnit),
        payload: { target: merged.target, detail: merged.detail },
      });
    }
    return IntegrationMergeResultSchema.parse({
      ...base,
      state: "merged",
      nextAction: "complete",
      payload: {
        approvedHead: checkpoint.approvedHead,
        pullRequest: target.pullRequest,
        target: merged.target,
        providerMergeId: merged.providerMergeId,
      },
    });
  } catch (error) {
    if (target !== undefined) {
      try {
        if (await dependencies.readMerged(target)) {
          return IntegrationMergeResultSchema.parse({
            ...base,
            state: "merged",
            nextAction: "complete",
            payload: {
              approvedHead: checkpoint?.approvedHead ?? target.headSha,
              pullRequest: target.pullRequest,
              target,
              providerMergeId: null,
            },
          });
        }
      } catch {
        // Without exact merged-state evidence the compensating lock remains the safe fallback.
      }
    }
    const result = await invalidated(base, "merge-blocked", {
      detail: error instanceof Error ? error.message : String(error),
    }, dependencies, target);
    if (result.state === "invalidated") {
      return IntegrationMergeResultSchema.parse({
        ...base,
        state: "blocked",
        nextAction: "stop",
        reason: "operation-failed",
        remedy: mergeRemedy("operation-failed", request.workUnit),
        payload: result.payload,
      });
    }
    return result;
  }
}
