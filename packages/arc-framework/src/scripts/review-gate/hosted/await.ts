/** Bounded passive wait contract for hosted pull-request reviews. */

import { z } from "zod";

import {
  HostedRequestHandleSchema,
  type HostedProviderId,
  type HostedRequestHandle,
} from "./request.js";

export const HostedThreadFindingSchema = z.strictObject({
  findingId: z.string().min(1),
  origin: z.literal("review-thread"),
  commentId: z.string().min(1),
  threadId: z.string().min(1),
  settlement: z.literal("reply-and-resolve"),
  severity: z.enum(["blocker", "major", "minor"]),
  locus: z.string().min(1),
  url: z.url(),
});

export const HostedReviewBodyFindingSchema = z.strictObject({
  findingId: z.string().min(1),
  origin: z.literal("review-body"),
  category: z.enum(["nitpick", "outside-diff"]),
  reviewId: z.string().min(1),
  fingerprint: z.string().min(1),
  settlement: z.literal("not-applicable"),
  severity: z.enum(["blocker", "major", "minor"]),
  locus: z.string().min(1),
  url: z.url(),
  body: z.string().min(1),
});

export const HostedFindingSchema = z.discriminatedUnion("origin", [
  HostedThreadFindingSchema,
  HostedReviewBodyFindingSchema,
]);
export type HostedFinding = z.infer<typeof HostedFindingSchema>;

const HostedObservationSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("pending") }),
  z.strictObject({ kind: z.literal("clean"), reviewUrl: z.url() }),
  z.strictObject({
    kind: z.literal("findings"),
    reviewUrl: z.url(),
    findings: z.array(HostedFindingSchema).min(1),
  }),
  z.strictObject({ kind: z.literal("rate-limited") }),
  z.strictObject({ kind: z.literal("transient-unavailable") }),
  z.strictObject({ kind: z.literal("terminal-failure"), reason: z.string().min(1) }),
]);
export type HostedObservation = z.infer<typeof HostedObservationSchema>;

export const HostedAwaitEnvelopeSchema = z.strictObject({
  schemaVersion: z.literal(1),
  handle: HostedRequestHandleSchema,
  timeoutMs: z.int().positive().max(30 * 60 * 1_000),
  pollIntervalMs: z.int().positive().max(60 * 1_000),
}).refine((value) => value.pollIntervalMs <= value.timeoutMs, {
  message: "pollIntervalMs must not exceed timeoutMs",
});
export type HostedAwaitEnvelope = z.infer<typeof HostedAwaitEnvelopeSchema>;

export interface HostedAwaitClock {
  now(): number;
  sleep(milliseconds: number): Promise<void>;
}

export interface HostedReviewObserver {
  id: HostedProviderId;
  readHead(handle: HostedRequestHandle, options?: { signal?: AbortSignal }): Promise<string>;
  observe(handle: HostedRequestHandle, options?: { signal?: AbortSignal }): Promise<unknown>;
}

const HostedAwaitResultBaseShape = {
  schemaVersion: z.literal(1),
  mode: z.literal("review-hosted-await"),
  handle: HostedRequestHandleSchema,
};

export const HostedAwaitResultSchema = z.union([
  z.strictObject({
    ...HostedAwaitResultBaseShape,
    state: z.literal("pending"),
    nextAction: z.literal("await"),
    elapsedMs: z.number().nonnegative(),
  }),
  z.strictObject({
    ...HostedAwaitResultBaseShape,
    state: z.literal("clean"),
    nextAction: z.literal("complete"),
    reviewUrl: z.url(),
  }),
  z.strictObject({
    ...HostedAwaitResultBaseShape,
    state: z.literal("findings"),
    nextAction: z.literal("triage"),
    reviewUrl: z.url(),
    findings: z.array(HostedFindingSchema).min(1),
  }),
  z.strictObject({
    ...HostedAwaitResultBaseShape,
    state: z.enum(["rate-limited", "transient-unavailable"]),
    nextAction: z.literal("try-next-source"),
  }),
  z.strictObject({
    ...HostedAwaitResultBaseShape,
    state: z.literal("stale-target"),
    nextAction: z.literal("stop"),
    expectedHeadSha: HostedRequestHandleSchema.shape.target.shape.headSha,
    actualHeadSha: HostedRequestHandleSchema.shape.target.shape.headSha,
  }),
  z.strictObject({
    ...HostedAwaitResultBaseShape,
    state: z.literal("source-unavailable"),
    nextAction: z.literal("stop"),
  }),
  z.strictObject({
    ...HostedAwaitResultBaseShape,
    state: z.enum(["malformed-output", "terminal-failure"]),
    nextAction: z.literal("stop"),
    reason: z.string().min(1),
  }),
]);
export type HostedAwaitResult = z.infer<typeof HostedAwaitResultSchema>;

interface HostedAwaitBase {
  schemaVersion: 1;
  mode: "review-hosted-await";
  handle: HostedRequestHandle;
}

function base(handle: HostedRequestHandle): HostedAwaitBase {
  return { schemaVersion: 1, mode: "review-hosted-await", handle };
}

function nextDelay(attempt: number, intervalMs: number, remainingMs: number): number {
  const exponent = Math.min(attempt, 4);
  return Math.min(intervalMs * (2 ** exponent), remainingMs);
}

function isDeadlineAbort(error: unknown): boolean {
  return error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name);
}

/** Observe one already-requested review until it completes or the bounded call expires. */
export async function awaitHostedReview(
  input: unknown,
  dependencies: {
    observers: readonly HostedReviewObserver[];
    clock: HostedAwaitClock;
  },
): Promise<HostedAwaitResult> {
  const request = HostedAwaitEnvelopeSchema.parse(input);
  const observer = dependencies.observers.find((candidate) => candidate.id === request.handle.provider);
  if (observer === undefined) {
    return {
      ...base(request.handle),
      state: "source-unavailable",
      nextAction: "stop",
    };
  }

  const startedAt = dependencies.clock.now();
  let attempt = 0;
  for (;;) {
    const elapsedMs = dependencies.clock.now() - startedAt;
    const remainingMs = request.timeoutMs - elapsedMs;
    if (remainingMs <= 0) {
      return { ...base(request.handle), state: "pending", nextAction: "await", elapsedMs };
    }

    const signal = AbortSignal.timeout(remainingMs);
    let actualHeadSha: string;
    try {
      actualHeadSha = await observer.readHead(request.handle, { signal });
    } catch (error) {
      if (isDeadlineAbort(error)) {
        return {
          ...base(request.handle),
          state: "pending",
          nextAction: "await",
          elapsedMs: dependencies.clock.now() - startedAt,
        };
      }
      throw error;
    }
    if (actualHeadSha !== request.handle.target.headSha) {
      return {
        ...base(request.handle),
        state: "stale-target",
        nextAction: "stop",
        expectedHeadSha: request.handle.target.headSha,
        actualHeadSha,
      };
    }

    let rawObservation: unknown;
    try {
      rawObservation = await observer.observe(request.handle, { signal });
    } catch (error) {
      if (isDeadlineAbort(error)) {
        return {
          ...base(request.handle),
          state: "pending",
          nextAction: "await",
          elapsedMs: dependencies.clock.now() - startedAt,
        };
      }
      throw error;
    }
    const parsed = HostedObservationSchema.safeParse(rawObservation);
    if (!parsed.success) {
      return {
        ...base(request.handle),
        state: "malformed-output",
        nextAction: "stop",
        reason: parsed.error.message,
      };
    }
    const observation = parsed.data;
    if (observation.kind === "clean") {
      return { ...base(request.handle), state: "clean", nextAction: "complete", reviewUrl: observation.reviewUrl };
    }
    if (observation.kind === "findings") {
      return {
        ...base(request.handle),
        state: "findings",
        nextAction: "triage",
        reviewUrl: observation.reviewUrl,
        findings: observation.findings,
      };
    }
    if (observation.kind === "rate-limited" || observation.kind === "transient-unavailable") {
      return { ...base(request.handle), state: observation.kind, nextAction: "try-next-source" };
    }
    if (observation.kind === "terminal-failure") {
      return {
        ...base(request.handle),
        state: "terminal-failure",
        nextAction: "stop",
        reason: observation.reason,
      };
    }

    const afterReadRemaining = request.timeoutMs - (dependencies.clock.now() - startedAt);
    if (afterReadRemaining <= 0) {
      return {
        ...base(request.handle),
        state: "pending",
        nextAction: "await",
        elapsedMs: dependencies.clock.now() - startedAt,
      };
    }
    await dependencies.clock.sleep(nextDelay(attempt, request.pollIntervalMs, afterReadRemaining));
    attempt += 1;
  }
}
