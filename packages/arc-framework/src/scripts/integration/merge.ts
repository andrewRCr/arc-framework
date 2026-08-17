/** Exact-checkpoint integration merge and its fail-closed compensating exits. */

import { z } from "zod";

import type { BaseDriftResult } from "../../lib/git/base-drift-types.js";
import type { ChecksAwaitResult } from "../review-gate/checks-await.js";
import type { MergeMethodResolveResult } from "../review-gate/merge-method.js";
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
  headSha: ObjectIdSchema,
});
export type IntegrationMergeTarget = z.infer<typeof IntegrationMergeTargetSchema>;

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
]);
export type IntegrationMergeInvalidationReason = z.infer<typeof IntegrationMergeInvalidationReasonSchema>;

export const MergeBlockedReasonSchema = z.enum(["relock-failed", "operation-failed"]);

/** Every reason the merge verb refuses with — invalidation plus terminal block. */
export type MergeRefusalReason =
  | IntegrationMergeInvalidationReason
  | z.infer<typeof MergeBlockedReasonSchema>;

/** Every refusal reason, for exhaustive iteration. */
export const MERGE_REFUSAL_REASONS: readonly MergeRefusalReason[] = [
  ...IntegrationMergeInvalidationReasonSchema.options,
  ...MergeBlockedReasonSchema.options,
];

const MERGE_REMEDIES: Record<MergeRefusalReason, (workUnit: string) => SpineRemedy> = {
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
  "relock-failed": () => spineRemedy(
    "An invalidated candidate is re-locked before the operator resumes.",
    "Re-hold the merge lock",
    ["arc", "merge", "lock", "hold", "-"],
  ),
  "operation-failed": (workUnit) => spineRemedy(
    "A merge either lands or leaves the candidate resumable.",
    "Resolve the reported operational failure, then re-checkpoint",
    checkpointResumeArgv(workUnit),
  ),
};

/**
 * Resolve the corrective remedy for one merge refusal.
 *
 * @param reason - The typed invalidation or blocked reason.
 * @param workUnit - The refused work unit, interpolated into slug-bearing commands.
 * @returns The remedy naming the failed invariant and one corrective command.
 */
export function mergeRemedy(reason: MergeRefusalReason, workUnit: string): SpineRemedy {
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
    payload: z.strictObject({ approvedHead: ObjectIdSchema, pullRequest: z.number().int().positive() }),
  }),
  z.strictObject({
    ...ResultBaseShape,
    state: z.literal("invalidated"),
    nextAction: z.literal("checkpoint"),
    reason: IntegrationMergeInvalidationReasonSchema,
    remedy: SpineRemedySchema,
    payload: z.record(z.string(), z.unknown()),
  }),
  z.strictObject({
    ...ResultBaseShape,
    state: z.literal("awaiting-checks"),
    nextAction: z.literal("retry"),
    payload: z.strictObject({
      approvedHead: ObjectIdSchema,
      pullRequest: z.number().int().positive(),
      elapsedMs: z.number().int().nonnegative(),
    }),
  }),
  z.strictObject({
    ...ResultBaseShape,
    state: z.literal("blocked"),
    nextAction: z.literal("stop"),
    reason: MergeBlockedReasonSchema,
    remedy: SpineRemedySchema,
    payload: z.record(z.string(), z.unknown()),
  }),
]);
export type IntegrationMergeResult = z.infer<typeof IntegrationMergeResultSchema>;

export interface IntegrationMergeDependencies {
  readCheckpoint(workUnit: string, handle: string): Promise<IntegrationCheckpointCompositionRecord | null>;
  executeSettlement(record: IntegrationCheckpointCompositionRecord): Promise<SettlementExecutionResult>;
  readStatus(workUnit: string): Promise<{
    actualHead: string;
    lifecycleComplete: boolean;
    target: IntegrationMergeTarget;
  }>;
  readMerged(target: IntegrationMergeTarget): Promise<boolean>;
  releaseLock(target: IntegrationMergeTarget): Promise<{ state: string }>;
  holdLock(target?: IntegrationMergeTarget): Promise<{ state: string }>;
  awaitChecks(target: IntegrationMergeTarget): Promise<ChecksAwaitResult>;
  resolveMergeMethod(): Promise<MergeMethodResolveResult>;
  readFinalDrift(): Promise<Pick<BaseDriftResult, "verdict">>;
  mergePinned(target: IntegrationMergeTarget, method: "merge" | "rebase" | "squash"): Promise<{ state: string }>;
}

async function invalidated(
  base: { schemaVersion: 1; mode: "integrate-merge"; workUnit: string },
  reason: IntegrationMergeInvalidationReason,
  payload: Record<string, unknown>,
  dependencies: IntegrationMergeDependencies,
  target?: IntegrationMergeTarget,
): Promise<IntegrationMergeResult> {
  try {
    const hold = await dependencies.holdLock(target);
    if (hold.state !== "held" && hold.state !== "no-lock") throw new Error("lock hold was refused");
  } catch (error) {
    return IntegrationMergeResultSchema.parse({
      ...base,
      state: "blocked",
      nextAction: "stop",
      reason: "relock-failed",
      remedy: mergeRemedy("relock-failed", base.workUnit),
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
  const checkpoint = await dependencies.readCheckpoint(request.workUnit, request.checkpointHandle);
  if (checkpoint === null) {
    return invalidated(
      base,
      "checkpoint-missing",
      { checkpointHandle: request.checkpointHandle },
      dependencies,
    );
  }

  let target: IntegrationMergeTarget | undefined;
  try {
    const settlement = await dependencies.executeSettlement(checkpoint);
    if (settlement.state === "invalidated") {
      return await invalidated(base, "settlement-invalidated", { settlement }, dependencies);
    }

    const status = await dependencies.readStatus(request.workUnit);
    target = IntegrationMergeTargetSchema.parse(status.target);
    if (status.actualHead !== checkpoint.approvedHead || target.headSha !== checkpoint.approvedHead) {
      return await invalidated(base, "head-mismatch", {
        approvedHead: checkpoint.approvedHead,
        actualHead: status.actualHead,
      }, dependencies, target);
    }
    if (!status.lifecycleComplete) {
      return await invalidated(base, "lifecycle-moved", {}, dependencies, target);
    }

    const release = await dependencies.releaseLock(target);
    if (release.state !== "released" && release.state !== "no-lock") {
      return await invalidated(base, "release-blocked", { release }, dependencies, target);
    }

    const checks = await dependencies.awaitChecks(target);
    if (checks.state === "pending") {
      return IntegrationMergeResultSchema.parse({
        ...base,
        state: "awaiting-checks",
        nextAction: "retry",
        payload: {
          approvedHead: checkpoint.approvedHead,
          pullRequest: target.pullRequest,
          elapsedMs: checks.elapsedMs,
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

    const mergeMethod = await dependencies.resolveMergeMethod();
    if (
      mergeMethod.state !== "validated"
      || mergeMethod.method !== checkpoint.mergeMethod.method
      || mergeMethod.policyFingerprint !== checkpoint.mergeMethod.policyFingerprint
    ) {
      return await invalidated(base, "merge-method-moved", { mergeMethod }, dependencies, target);
    }

    const drift = await dependencies.readFinalDrift();
    if (drift.verdict !== "clean") {
      return await invalidated(base, "drift-reconcile", { verdict: drift.verdict }, dependencies, target);
    }

    const merged = await dependencies.mergePinned(target, mergeMethod.method);
    if (merged.state !== "merged") {
      return await invalidated(base, "merge-blocked", { merge: merged }, dependencies, target);
    }
    return IntegrationMergeResultSchema.parse({
      ...base,
      state: "merged",
      nextAction: "complete",
      payload: { approvedHead: checkpoint.approvedHead, pullRequest: target.pullRequest },
    });
  } catch (error) {
    if (target !== undefined) {
      try {
        if (await dependencies.readMerged(target)) {
          return IntegrationMergeResultSchema.parse({
            ...base,
            state: "merged",
            nextAction: "complete",
            payload: { approvedHead: checkpoint.approvedHead, pullRequest: target.pullRequest },
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
