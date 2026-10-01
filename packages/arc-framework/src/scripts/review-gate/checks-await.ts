/** One-shot and bounded required-check observation for an exact pull-request head. */

import { z } from "zod";
import { boundedWait, type BoundedWaitClock } from "./bounded-wait.js";
import { GitObjectIdSchema } from "./core/gate-contract-v2-schema.js";
import {
  FailedCheckLogsResultSchema,
  type FailedCheckLogsResult,
} from "./failed-check-logs.js";
import { SpineRemedySchema } from "../integration/spine-refusal.js";

export const RequiredChecksObservationInputSchema = z.strictObject({
  repository: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u),
  pullRequest: z.number().int().positive(),
  headSha: GitObjectIdSchema,
});
export type RequiredChecksObservationInput = z.infer<typeof RequiredChecksObservationInputSchema>;

export const ChecksAwaitInputSchema = RequiredChecksObservationInputSchema.extend({
  timeoutMs: z.number().int().positive().max(30 * 60 * 1_000),
  pollIntervalMs: z.number().int().positive().max(60 * 1_000),
}).refine((value) => value.pollIntervalMs <= value.timeoutMs, {
  message: "pollIntervalMs must not exceed timeoutMs",
});
export type ChecksAwaitInput = z.infer<typeof ChecksAwaitInputSchema>;

export const RequiredCheckSchema = z.strictObject({
  name: z.string().trim().min(1),
  state: z.enum(["pending", "green", "failed"]),
});
export type RequiredCheck = z.infer<typeof RequiredCheckSchema>;

export interface RequiredChecksPort {
  resolveRepository(signal: AbortSignal): Promise<string>;
  readHead(repository: string, pullRequest: number, signal: AbortSignal): Promise<string>;
  readRequiredChecks(repository: string, pullRequest: number, signal: AbortSignal): Promise<RequiredCheck[]>;
  readObservedChecks(repository: string, pullRequest: number, signal: AbortSignal): Promise<RequiredCheck[]>;
}

export interface RequiredChecksObservationDependencies {
  port: RequiredChecksPort;
  signal: AbortSignal;
}

/** The status a required-check set reduces to. */
export type AggregatedCheckStatus = "not-required" | "failed" | "green" | "pending";

export type RequiredChecksUnavailableCause = "provider" | "aborted" | "deadline";

/**
 * Reduce a required-check set to one status.
 *
 * @param checks - The observed required checks for one exact head.
 * @returns `not-required` for an empty set, `failed` on any failure, `green` when all pass, else `pending`.
 */
export function aggregateChecks(
  checks: readonly Pick<RequiredCheck, "state">[],
): AggregatedCheckStatus {
  if (checks.length === 0) return "not-required";
  if (checks.some(({ state }) => state === "failed")) return "failed";
  if (checks.every(({ state }) => state === "green")) return "green";
  return "pending";
}

const ChecksResultBaseShape = {
  schemaVersion: z.literal(1),
  mode: z.literal("review-checks-await"),
  repository: z.string().trim().min(1),
  pullRequest: z.number().int().positive(),
  headSha: GitObjectIdSchema,
};

const ChecksObservationBaseShape = {
  schemaVersion: z.literal(1),
  mode: z.literal("review-checks-observe"),
  repository: z.string().trim().min(1),
  pullRequest: z.number().int().positive(),
  headSha: GitObjectIdSchema,
};

export const RequiredChecksObservationResultSchema = z.union([
  z.strictObject({ ...ChecksObservationBaseShape, state: z.literal("not-required"), nextAction: z.literal("complete"), checks: z.tuple([]) }),
  z.strictObject({ ...ChecksObservationBaseShape, state: z.literal("green"), nextAction: z.literal("complete"), checks: z.array(RequiredCheckSchema) }),
  z.strictObject({ ...ChecksObservationBaseShape, state: z.literal("failed"), nextAction: z.literal("stop"), checks: z.array(RequiredCheckSchema) }),
  z.strictObject({
    ...ChecksObservationBaseShape,
    state: z.literal("pending"),
    nextAction: z.literal("retry"),
    checks: z.array(RequiredCheckSchema),
    diagnosticFailures: z.array(RequiredCheckSchema),
  }),
  z.strictObject({ ...ChecksObservationBaseShape, state: z.literal("stale-target"), nextAction: z.literal("stop"), actualHeadSha: GitObjectIdSchema }),
  z.strictObject({ ...ChecksObservationBaseShape, state: z.literal("target-mismatch"), nextAction: z.literal("stop"), actualRepository: z.string().trim().min(1) }),
  z.strictObject({
    ...ChecksObservationBaseShape,
    state: z.literal("unavailable"),
    nextAction: z.literal("retry"),
    cause: z.enum(["provider", "aborted", "deadline"]),
    detail: z.string().trim().min(1),
    checks: z.array(RequiredCheckSchema),
    diagnosticFailures: z.array(RequiredCheckSchema),
  }),
]);
export type RequiredChecksObservationResult = z.infer<typeof RequiredChecksObservationResultSchema>;

/** Observe required checks once for one exact pull-request head. */
export async function observeRequiredChecks(
  input: RequiredChecksObservationInput,
  dependencies: RequiredChecksObservationDependencies,
): Promise<RequiredChecksObservationResult> {
  let repository = input.repository;
  let checks: RequiredCheck[] = [];
  let diagnosticFailures: RequiredCheck[] = [];
  const base = () => ({
    schemaVersion: 1 as const,
    mode: "review-checks-observe" as const,
    repository,
    pullRequest: input.pullRequest,
    headSha: input.headSha,
  });
  const readMovedHead = async (): Promise<string | null> => {
    dependencies.signal.throwIfAborted();
    const actualHeadSha = await dependencies.port.readHead(
      repository,
      input.pullRequest,
      dependencies.signal,
    );
    return actualHeadSha === input.headSha ? null : actualHeadSha;
  };
  try {
    dependencies.signal.throwIfAborted();
    repository = await dependencies.port.resolveRepository(dependencies.signal);
    if (repository.toLowerCase() !== input.repository.toLowerCase()) {
      return { ...base(), state: "target-mismatch", nextAction: "stop", actualRepository: repository };
    }
    const actualHeadSha = await readMovedHead();
    if (actualHeadSha !== null) {
      return { ...base(), state: "stale-target", nextAction: "stop", actualHeadSha };
    }
    dependencies.signal.throwIfAborted();
    checks = await dependencies.port.readRequiredChecks(
      repository,
      input.pullRequest,
      dependencies.signal,
    );
    const headAfterRequiredChecks = await readMovedHead();
    if (headAfterRequiredChecks !== null) {
      return { ...base(), state: "stale-target", nextAction: "stop", actualHeadSha: headAfterRequiredChecks };
    }
    const status = aggregateChecks(checks);
    if (status === "not-required") {
      return { ...base(), state: "not-required", nextAction: "complete", checks: [] };
    }
    if (status === "green") {
      return { ...base(), state: "green", nextAction: "complete", checks };
    }
    if (status === "failed") {
      return { ...base(), state: "failed", nextAction: "stop", checks };
    }
    dependencies.signal.throwIfAborted();
    diagnosticFailures = (await dependencies.port.readObservedChecks(
      repository,
      input.pullRequest,
      dependencies.signal,
    )).filter(({ state }) => state === "failed");
    const headAfterObservedChecks = await readMovedHead();
    if (headAfterObservedChecks !== null) {
      return { ...base(), state: "stale-target", nextAction: "stop", actualHeadSha: headAfterObservedChecks };
    }
    return {
      ...base(),
      state: "pending",
      nextAction: "retry",
      checks,
      diagnosticFailures,
    };
  } catch (error) {
    const reason = dependencies.signal.aborted ? dependencies.signal.reason as unknown : error;
    const name = reason instanceof Error ? reason.name : "";
    const cause: RequiredChecksUnavailableCause = dependencies.signal.aborted
      ? name === "TimeoutError" ? "deadline" : "aborted"
      : "provider";
    const value = reason instanceof Error ? reason.message : String(reason);
    const detail = value.replace(/\s+/gu, " ").trim().slice(0, 1_024)
      || "The provider returned no required-check diagnostic detail.";
    return {
      ...base(),
      state: "unavailable",
      nextAction: "retry",
      cause,
      detail: `Required-check evidence was unavailable: ${detail}`,
      checks,
      diagnosticFailures,
    };
  }
}

export const ChecksAwaitResultSchema = z.union([
  z.strictObject({ ...ChecksResultBaseShape, state: z.literal("not-required"), nextAction: z.literal("complete"), checks: z.tuple([]) }),
  z.strictObject({ ...ChecksResultBaseShape, state: z.literal("green"), nextAction: z.literal("complete"), checks: z.array(RequiredCheckSchema) }),
  z.strictObject({
    ...ChecksResultBaseShape,
    state: z.literal("failed"),
    nextAction: z.literal("stop"),
    checks: z.array(RequiredCheckSchema),
    failureLogs: FailedCheckLogsResultSchema.optional(),
  }),
  z.strictObject({
    ...ChecksResultBaseShape,
    state: z.literal("pending"),
    nextAction: z.literal("await"),
    checks: z.array(RequiredCheckSchema),
    diagnosticFailures: z.array(RequiredCheckSchema),
    elapsedMs: z.number().nonnegative(),
    failureLogs: FailedCheckLogsResultSchema.optional(),
  }),
  z.strictObject({ ...ChecksResultBaseShape, state: z.literal("stale-target"), nextAction: z.literal("stop"), actualHeadSha: GitObjectIdSchema }),
  z.strictObject({ ...ChecksResultBaseShape, state: z.literal("target-mismatch"), nextAction: z.literal("stop"), actualRepository: z.string().trim().min(1) }),
  z.strictObject({
    ...ChecksResultBaseShape,
    state: z.literal("unavailable"),
    nextAction: z.literal("retry"),
    cause: z.enum(["provider", "aborted", "deadline"]),
    detail: z.string().trim().min(1),
    checks: z.array(RequiredCheckSchema),
    diagnosticFailures: z.array(RequiredCheckSchema),
    elapsedMs: z.number().nonnegative(),
    failureLogs: FailedCheckLogsResultSchema.optional(),
  }),
]);
export type ChecksAwaitResult = z.infer<typeof ChecksAwaitResultSchema>;

type FailureBearingChecksAwaitResult = Extract<
  ChecksAwaitResult,
  { state: "failed" | "pending" | "unavailable" }
>;

/**
 * Attach failed-job diagnostics without concealing an exact-target stop.
 *
 * @param observation - Failed or diagnostically actionable required-check observation.
 * @param failureLogs - Exact-target failed-job log retrieval result.
 * @returns The enriched observation, or a promoted top-level target stop.
 */
export function composeChecksAwaitFailureLogs(
  observation: FailureBearingChecksAwaitResult,
  failureLogs: FailedCheckLogsResult,
): ChecksAwaitResult {
  const base = {
    schemaVersion: observation.schemaVersion,
    mode: observation.mode,
    repository: observation.repository,
    pullRequest: observation.pullRequest,
    headSha: observation.headSha,
  };
  if (failureLogs.state === "stale-target") {
    return { ...base, state: "stale-target", nextAction: "stop", actualHeadSha: failureLogs.actualHeadSha };
  }
  if (failureLogs.state === "target-mismatch") {
    return {
      ...base,
      state: "target-mismatch",
      nextAction: "stop",
      actualRepository: failureLogs.actualRepository,
    };
  }
  return { ...observation, failureLogs };
}

export const ChecksAwaitCommandResultSchema = z.union([
  ChecksAwaitResultSchema,
  z.strictObject({
    schemaVersion: z.literal(1),
    mode: z.literal("review-checks-await"),
    repository: z.string().trim().min(1).nullable(),
    pullRequest: z.number().int().positive().nullable(),
    headSha: GitObjectIdSchema.nullable(),
    state: z.literal("blocked"),
    nextAction: z.literal("stop"),
    reason: z.enum(["invalid-input", "checks-unavailable"]),
    detail: z.string().trim().min(1),
    remedy: SpineRemedySchema,
  }),
]);

function withAwaitTiming(
  observation: RequiredChecksObservationResult,
  elapsedMs: number,
): ChecksAwaitResult {
  const projected = { ...observation, mode: "review-checks-await" as const };
  if (observation.state === "pending") {
    return ChecksAwaitResultSchema.parse({
      ...projected,
      nextAction: "await",
      elapsedMs,
    });
  }
  if (observation.state === "unavailable") {
    return ChecksAwaitResultSchema.parse({ ...projected, elapsedMs });
  }
  return ChecksAwaitResultSchema.parse(projected);
}

/**
 * Bound for the one observation made after the wait's deadline. It spans several sequential host reads, so it is
 * sized for those reads rather than tied to the polling interval, which only paces the observations before it.
 */
const FINAL_OBSERVATION_TIMEOUT_MS = 30_000;

/** Await required checks for one exact pull-request head. */
export async function awaitRequiredChecks(
  input: ChecksAwaitInput,
  dependencies: { port: RequiredChecksPort; clock: BoundedWaitClock },
): Promise<ChecksAwaitResult> {
  return boundedWait<ChecksAwaitResult>({
    timeoutMs: input.timeoutMs,
    pollIntervalMs: input.pollIntervalMs,
    clock: dependencies.clock,
    deadline: async (elapsedMs) => {
      const observation = await observeRequiredChecks(input, {
        port: dependencies.port,
        signal: AbortSignal.timeout(FINAL_OBSERVATION_TIMEOUT_MS),
      });
      return withAwaitTiming(observation, elapsedMs);
    },
    attempt: async ({ signal, elapsedMs }) => {
      const observation = await observeRequiredChecks(input, { port: dependencies.port, signal });
      // The wait's own deadline cut this observation short; the final observation answers instead.
      if (observation.state === "unavailable" && signal.aborted) return { kind: "continue" };
      if (observation.state === "pending" && observation.diagnosticFailures.length === 0) {
        return { kind: "continue" };
      }
      return { kind: "return", value: withAwaitTiming(observation, elapsedMs) };
    },
  });
}
