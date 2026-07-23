/** Command orchestration for one exact-target frontline advisory run. */

import { z } from "zod";

import { canonicalDigest, canonicalize } from "../../../lib/kernel/index.js";
import { validateReviewTarget } from "../core/gate-contract-v2.js";
import {
  ReviewTargetSchema,
  type ReviewTarget,
} from "../core/gate-contract-v2-schema.js";
import type {
  FrontlineOutcomeStore,
  ReviewOperationStateStore,
} from "../core/ports.js";
import {
  FrontlineResolveEnvelopeSchema,
  FrontlineRunEnvelopeSchema,
} from "../core/review-command-envelope.js";
import {
  executeFrontlineRun,
  type FrontlineRunExecutionDependencies,
} from "../policy/frontline-operation.js";
import {
  FrontlineSemanticRecordSchema,
} from "../policy/frontline-semantic.js";
import {
  FrontlineSourceDescriptorSchema,
  type FrontlineSourceDescriptor,
} from "../policy/frontline-source.js";
import {
  executeBoundedFrontlineCarrier,
} from "./frontline-execution-boundary.js";

export const FrontlineRunRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  target: ReviewTargetSchema,
  resolution: FrontlineResolveEnvelopeSchema,
  timeoutMs: z.number().int().positive().max(2_147_483_647).optional(),
});

export interface FrontlineRunCommandDependencies {
  operationStore: ReviewOperationStateStore;
  outcomeStore: FrontlineOutcomeStore;
  confirmSource(source: FrontlineSourceDescriptor): Promise<FrontlineSourceDescriptor>;
  prepareExecutionTarget(target: ReviewTarget): Promise<{
    target: ReviewTarget;
    reviewRoot: string;
    release(): Promise<void>;
  }>;
  execute(input: {
    source: FrontlineSourceDescriptor;
    target: ReviewTarget;
    pass: 1 | 2;
    maxPasses: 1 | 2;
    remainingMs: number;
    signal: AbortSignal;
    reviewRoot: string;
  }): ReturnType<FrontlineRunExecutionDependencies["execute"]>;
  now(): string;
}

function actionFor(outcome: Awaited<ReturnType<typeof executeFrontlineRun>>["outcome"]) {
  switch (outcome.outcome) {
    case "clean":
      return { state: "clean", nextAction: "none" } as const;
    case "findings":
      return { state: "findings", nextAction: "respond" } as const;
    case "timed-out":
      return { state: "timed-out", nextAction: "retry" } as const;
    case "stale-target":
      return { state: "stale-target", nextAction: "prepare-current-target" } as const;
    case "unavailable":
      return ["rate-limited", "transient-unavailable"].includes(outcome.reason.class)
        ? { state: "unavailable", nextAction: "retry" } as const
        : { state: "unavailable", nextAction: "operator-repair" } as const;
    case "failed":
      return [
        "transient-transport",
        "process-failure",
        "signal-termination",
        "unexpected-adapter-failure",
      ].includes(outcome.reason.class)
        ? { state: "failed", nextAction: "retry" } as const
        : { state: "failed", nextAction: "operator-repair" } as const;
    case "pass-cap-exhausted":
      throw new Error("frontline run cannot produce pass-cap-exhausted");
  }
}

/** Revalidate the ready resolution and exact checkout, then execute the durable run transaction. */
export async function runFrontlineReviewCommand(
  requestInput: unknown,
  dependencies: FrontlineRunCommandDependencies,
): Promise<z.infer<typeof FrontlineRunEnvelopeSchema>> {
  const request = FrontlineRunRequestSchema.parse(requestInput);
  if (request.resolution.state !== "ready") throw new Error("frontline run requires a ready resolution");
  const readyPayload = request.resolution.payload;
  if (!("pass" in readyPayload) || !("maxPasses" in readyPayload)) {
    throw new Error("frontline ready resolution lacks its pass binding");
  }
  const semantic = FrontlineSemanticRecordSchema.parse(readyPayload.frontlineReview);
  if (semantic.action !== "attempt" || semantic.source === null) {
    throw new Error("frontline ready resolution lacks an executable source");
  }
  const source = FrontlineSourceDescriptorSchema.parse(await dependencies.confirmSource(semantic.source));
  if (canonicalize(source) !== canonicalize(semantic.source)) {
    throw new Error("frontline source registration changed");
  }
  const target = validateReviewTarget(request.target);
  const prepared = await dependencies.prepareExecutionTarget(target);
  const executionTarget = validateReviewTarget(prepared.target);
  if (canonicalize(executionTarget) !== canonicalize(target)) {
    await prepared.release();
    throw new Error("frontline execution target mismatch");
  }
  let terminal;
  try {
    terminal = await executeFrontlineRun({
      operationStore: dependencies.operationStore,
      outcomeStore: dependencies.outcomeStore,
      execute: () => executeBoundedFrontlineCarrier({
        timeoutMs: request.timeoutMs,
        execute: ({ remainingMs, signal }) => dependencies.execute({
          source,
          target: executionTarget,
          pass: readyPayload.pass,
          maxPasses: readyPayload.maxPasses,
          remainingMs,
          signal,
          reviewRoot: prepared.reviewRoot,
        }),
      }),
      now: () => dependencies.now(),
    }, {
      target,
      source,
      generation: 0,
      pass: readyPayload.pass,
      maxPasses: readyPayload.maxPasses,
      policyVersion: canonicalDigest({
        routing: readyPayload.routing,
        frontlineReview: semantic,
      }),
    });
  } finally {
    await prepared.release();
  }
  const transition = actionFor(terminal.outcome);
  return FrontlineRunEnvelopeSchema.parse({
    schemaVersion: 1,
    mode: "review-frontline-run",
    diagnostics: [],
    ...transition,
    payload: {
      operationId: terminal.operationId,
      persistedVersion: terminal.persistedVersion,
      target: terminal.target,
      outcomeRef: terminal.outcomeRef,
      outcomeDigest: terminal.outcomeDigest,
      ...(terminal.executableIdentity === null
        ? {}
        : { executableIdentity: terminal.executableIdentity }),
      ...(terminal.outcome.reason === null ? {} : { reason: terminal.outcome.reason }),
    },
  });
}
