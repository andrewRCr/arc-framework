/** Exact-checkpoint integration merge and its fail-closed compensating exits. */

import { z } from "zod";

import type { BaseDriftResult } from "../../lib/git/base-drift-types.js";
import type { ChecksAwaitResult } from "../review-gate/checks-await.js";
import type { MergeMethodResolveResult } from "../review-gate/merge-method.js";
import type { IntegrationCheckpointCompositionRecord } from "./checkpoint-store.js";
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
  "review-record-failed",
  "drift-reconcile",
  "merge-blocked",
]);
export type IntegrationMergeInvalidationReason = z.infer<typeof IntegrationMergeInvalidationReasonSchema>;

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
    reason: z.enum(["relock-failed", "operation-failed"]),
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
  releaseLock(target: IntegrationMergeTarget): Promise<{ state: string }>;
  holdLock(target?: IntegrationMergeTarget): Promise<{ state: string }>;
  awaitChecks(target: IntegrationMergeTarget): Promise<ChecksAwaitResult>;
  resolveMergeMethod(): Promise<MergeMethodResolveResult>;
  postReviewRecord(target: IntegrationMergeTarget, markdown: string | null): Promise<void>;
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
    return IntegrationMergeResultSchema.parse({
      ...base,
      state: "invalidated",
      nextAction: "checkpoint",
      reason: "checkpoint-missing",
      payload: { checkpointHandle: request.checkpointHandle },
    });
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

    try {
      await dependencies.postReviewRecord(target, checkpoint.reviewRecord.markdown);
    } catch (error) {
      return await invalidated(base, "review-record-failed", {
        detail: error instanceof Error ? error.message : String(error),
      }, dependencies, target);
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
    const result = await invalidated(base, "merge-blocked", {
      detail: error instanceof Error ? error.message : String(error),
    }, dependencies, target);
    if (result.state === "invalidated") {
      return IntegrationMergeResultSchema.parse({
        ...base,
        state: "blocked",
        nextAction: "stop",
        reason: "operation-failed",
        payload: result.payload,
      });
    }
    return result;
  }
}
