/** Command orchestration for one exact-target frontline advisory run. */

import { z } from "zod";

import { canonicalize } from "../../../lib/kernel/index.js";
import { FrontlineAdmissionSchema } from "../core/frontline-admission.js";
import { validateReviewTarget } from "../core/gate-contract-v2.js";
import {
  type ReviewTarget,
} from "../core/gate-contract-v2-schema.js";
import type {
  FrontlineOutcomeStore,
  ReviewOperationStateStore,
} from "../core/ports.js";
import {
  FrontlineRunEnvelopeSchema,
} from "../core/review-command-envelope.js";
import { FrontlineRunCommandRequestSchema } from "../core/frontline-run-command-schema.js";
import type { ReviewPass } from "../core/review-pass.js";
import { bindReviewSourceReference } from "../core/review-source-reference.js";
import {
  executeFrontlineRun,
  type FrontlineRunExecutionDependencies,
} from "../policy/frontline-operation.js";
import {
  normalizeFrontlineOutcome,
} from "../policy/frontline-outcome.js";
import { readLaneProgressOwner, recordFrontlineAttempt } from "../lane-progress.js";
import {
  FrontlineSemanticRecordSchema,
} from "../policy/frontline-semantic.js";
import {
  type FrontlineSourceDescriptor,
} from "../policy/frontline-source.js";
import {
  DEFAULT_FRONTLINE_TIMEOUT_MS,
  executeBoundedFrontlineCarrier,
} from "./frontline-execution-boundary.js";

const MAX_TIMER_DELAY_MS = 2_147_483_647;
const OPERATION_LOCK_COMPLETION_MARGIN_MS = 30_000;

export interface FrontlineRunCommandDependencies {
  operationStore: ReviewOperationStateStore;
  outcomeStore: FrontlineOutcomeStore;
  withOperationLock<T>(
    operationId: string,
    maxWaitMs: number,
    action: () => Promise<T>,
  ): Promise<T>;
  confirmSource(source: FrontlineSourceDescriptor): Promise<FrontlineSourceDescriptor | null>;
  prepareExecutionTarget(target: ReviewTarget): Promise<{
    target: ReviewTarget;
    reviewRoot: string;
    release(): Promise<void>;
  }>;
  execute(input: {
    source: FrontlineSourceDescriptor;
    target: ReviewTarget;
    pass: ReviewPass;
    maxPasses: ReviewPass;
    remainingMs: number;
    signal: AbortSignal;
    reviewRoot: string;
  }): ReturnType<FrontlineRunExecutionDependencies["execute"]>;
  now(): string;
}

/** Stable caller-input failure at the frontline run boundary. */
export class FrontlineRunCommandError extends Error {
  readonly code = "invalid-input" as const;

  constructor(message: string) {
    super(message);
    this.name = "FrontlineRunCommandError";
  }
}

function actionFor(outcome: Awaited<ReturnType<typeof executeFrontlineRun>>["outcome"]) {
  switch (outcome.outcome) {
    case "clean":
      return { state: "clean", nextAction: "none" } as const;
    case "findings":
      return { state: "findings", nextAction: "respond" } as const;
    case "timed-out":
      return { state: "timed-out", nextAction: "operator-repair" } as const;
    case "stale-target":
      return { state: "stale-target", nextAction: "prepare-current-target" } as const;
    case "unavailable":
      return { state: "unavailable", nextAction: "operator-repair" } as const;
    case "failed":
      return { state: "failed", nextAction: "operator-repair" } as const;
    case "pass-cap-exhausted":
      throw new Error("frontline run cannot produce pass-cap-exhausted");
  }
}

/** Revalidate the ready resolution and exact checkout, then execute the durable run transaction. */
export async function runFrontlineReviewCommand(
  requestInput: unknown,
  dependencies: FrontlineRunCommandDependencies,
): Promise<z.infer<typeof FrontlineRunEnvelopeSchema>> {
  const request = FrontlineRunCommandRequestSchema.parse(requestInput);
  if (request.resolution.state !== "ready") {
    throw new FrontlineRunCommandError("frontline run requires a ready resolution");
  }
  const readyPayload = request.resolution.payload;
  if (!("pass" in readyPayload) || !("maxPasses" in readyPayload)) {
    throw new FrontlineRunCommandError("frontline ready resolution lacks its pass binding");
  }
  const admission = FrontlineAdmissionSchema.parse(readyPayload.admission);
  const semantic = FrontlineSemanticRecordSchema.parse(admission.frontlineReview);
  if (semantic.action !== "attempt" || semantic.source === null) {
    throw new FrontlineRunCommandError("frontline ready resolution lacks an executable source");
  }
  const target = validateReviewTarget(request.target);
  if (canonicalize(target) !== canonicalize(admission.target)) {
    throw new FrontlineRunCommandError("frontline ready admission is unavailable");
  }
  const owner = await readLaneProgressOwner(dependencies.operationStore, {
    lane: "frontline",
    repositoryId: target.repositoryId,
    headSha: target.headSha,
    lineage: admission.lineage,
  });
  const admittedAttempts = owner?.attempts.filter((attempt) => (
    attempt.attemptId === admission.operationId
    && attempt.frontline !== undefined
    && canonicalize(attempt.frontline.admission) === canonicalize(admission)
  )) ?? [];
  if (admittedAttempts.length !== 1) {
    throw new FrontlineRunCommandError("frontline ready admission is unavailable");
  }
  const source = semantic.source;
  const execute: FrontlineRunExecutionDependencies["execute"] = async () => {
    const prepared = await dependencies.prepareExecutionTarget(target);
    try {
      const executionTarget = validateReviewTarget(prepared.target);
      if (canonicalize(executionTarget) !== canonicalize(target)) {
        return {
          outcome: normalizeFrontlineOutcome({
            providerResult: executionTarget.headSha === target.headSha
              ? {
                  kind: "stale-target",
                  attemptedTargetId: target.targetId,
                  currentTargetId: executionTarget.targetId,
                }
              : {
                  kind: "stale-head",
                  expectedHeadSha: target.headSha,
                  observedHeadSha: executionTarget.headSha,
                },
            source,
            target,
            pass: admission.logicalPass,
            maxPasses: admission.maxPasses,
          }),
          executableIdentity: null,
        };
      }
      const confirmed = await dependencies.confirmSource(source);
      if (confirmed === null || canonicalize(confirmed) !== canonicalize(source)) {
        return {
          outcome: normalizeFrontlineOutcome({
            providerResult: { kind: "source-unbound" },
            source,
            target,
            pass: admission.logicalPass,
            maxPasses: admission.maxPasses,
          }),
          executableIdentity: null,
        };
      }
      return await executeBoundedFrontlineCarrier({
        timeoutMs: request.timeoutMs,
        execute: ({ remainingMs, signal }) => dependencies.execute({
          source: confirmed,
          target: executionTarget,
          pass: admission.logicalPass,
          maxPasses: admission.maxPasses,
          remainingMs,
          signal,
          reviewRoot: prepared.reviewRoot,
        }),
      });
    } finally {
      await prepared.release();
    }
  };
  const terminal = await executeFrontlineRun({
    operationStore: dependencies.operationStore,
    outcomeStore: dependencies.outcomeStore,
    withOperationLock: (operationId, maxWaitMs, action) => dependencies.withOperationLock(
      operationId,
      maxWaitMs,
      action,
    ),
    execute,
    now: () => dependencies.now(),
  }, {
    admission,
    ...(request.responseBinding === undefined ? {} : { responseBinding: request.responseBinding }),
    lockWaitMs: Math.min(
      MAX_TIMER_DELAY_MS,
      (request.timeoutMs ?? DEFAULT_FRONTLINE_TIMEOUT_MS) + OPERATION_LOCK_COMPLETION_MARGIN_MS,
    ),
  });
  await recordFrontlineAttempt(dependencies.operationStore, {
    admission,
    outcome: terminal.outcome,
    now: dependencies.now(),
  });
  const transition = actionFor(terminal.outcome);
  const diagnostics = transition.nextAction === "operator-repair"
    ? [{
        code: "frontline-explicit-retry",
        message: "This exact request replays its durable outcome. Inspect the provider failure before starting "
          + `a new review with retryOfOperationId: '${terminal.operationId}'.`,
      }]
    : [];
  return FrontlineRunEnvelopeSchema.parse({
    schemaVersion: 1,
    mode: "review-frontline-run",
    diagnostics,
    ...transition,
    payload: {
      operationId: terminal.operationId,
      persistedVersion: terminal.persistedVersion,
      target: terminal.target,
      outcomeRef: bindReviewSourceReference({
        kind: "frontline",
        operationId: terminal.operationId,
        durableRef: terminal.outcomeRef,
      }),
      outcomeDigest: terminal.outcomeDigest,
      ...(terminal.executableIdentity === null
        ? {}
        : { executableIdentity: terminal.executableIdentity }),
      ...(terminal.outcome.reason === null ? {} : { reason: terminal.outcome.reason }),
    },
  });
}
