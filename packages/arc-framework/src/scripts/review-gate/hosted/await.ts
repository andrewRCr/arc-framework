/** Bounded passive wait contract for hosted pull-request reviews. */

import { z } from "zod";
import {
  boundedWait,
  type BoundedWaitAttempt,
  type BoundedWaitClock,
} from "../bounded-wait.js";

import {
  HostedAwaitActionSchema,
  HostedRequestHandleSchema,
  HostedTargetSchema,
  hostedAwaitAction,
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
    responseSourceRef: z.string().trim().min(1).optional(),
  }),
  z.strictObject({ kind: z.literal("rate-limited") }),
  z.strictObject({ kind: z.literal("transient-unavailable") }),
  z.strictObject({ kind: z.literal("terminal-failure"), reason: z.string().min(1) }),
]);
export type HostedObservation = z.infer<typeof HostedObservationSchema>;

const HostedAwaitRequestShape = {
  schemaVersion: z.literal(1),
  handle: HostedRequestHandleSchema,
};

const TimeoutSecondsSchema = z.int().positive().max(30 * 60);
const InitialPollIntervalSecondsSchema = z.int().positive().max(60);
const TimeoutMsSchema = z.int().positive().max(30 * 60 * 1_000);
const PollIntervalMsSchema = z.int().positive().max(60 * 1_000);

export const HostedAwaitEnvelopeSchema = z.strictObject({
  ...HostedAwaitRequestShape,
  timeoutSeconds: TimeoutSecondsSchema.optional(),
  initialPollIntervalSeconds: InitialPollIntervalSecondsSchema.optional(),
  continueAfterAttention: z.literal(true).optional(),
}).refine((value) => value.timeoutSeconds === undefined
  || value.initialPollIntervalSeconds === undefined
  || value.initialPollIntervalSeconds <= value.timeoutSeconds, {
  message: "initialPollIntervalSeconds must not exceed timeoutSeconds",
});
export type HostedAwaitEnvelope = z.infer<typeof HostedAwaitEnvelopeSchema>;

export const HostedAwaitExecutionEnvelopeSchema = z.strictObject({
  ...HostedAwaitRequestShape,
  timeoutMs: TimeoutMsSchema,
  pollIntervalMs: PollIntervalMsSchema,
  continueAfterAttention: z.literal(true).optional(),
}).refine((value) => value.pollIntervalMs <= value.timeoutMs, {
  message: "pollIntervalMs must not exceed timeoutMs",
});
export type HostedAwaitExecutionEnvelope = z.infer<typeof HostedAwaitExecutionEnvelopeSchema>;

export type HostedAwaitClock = BoundedWaitClock;

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
    action: HostedAwaitActionSchema,
    elapsedMs: z.number().nonnegative(),
  }),
  z.strictObject({
    ...HostedAwaitResultBaseShape,
    state: z.literal("pending"),
    nextAction: z.literal("inspect-or-extend"),
    action: HostedAwaitActionSchema,
    ageMs: z.number().nonnegative(),
    attentionAfterMs: z.number().int().positive(),
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
    responseSourceRef: z.string().trim().min(1).optional(),
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
    expectedHeadSha: HostedTargetSchema.shape.headSha,
    actualHeadSha: HostedTargetSchema.shape.headSha,
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

function requestAgeMs(handle: HostedRequestHandle, nowMs: number): number {
  return Math.max(0, nowMs - Date.parse(handle.artifact.createdAt));
}

function attentionRequired(
  handle: HostedRequestHandle,
  ageMs: number,
  attentionAfterMs: number,
): HostedAwaitResult {
  return {
    ...base(handle),
    state: "pending",
    nextAction: "inspect-or-extend",
    action: hostedAwaitAction(handle),
    ageMs,
    attentionAfterMs,
  };
}

async function observeHostedReview(
  observer: HostedReviewObserver,
  handle: HostedRequestHandle,
  signal: AbortSignal,
): Promise<BoundedWaitAttempt<HostedAwaitResult>> {
  const actualHeadSha = await observer.readHead(handle, { signal });
  if (actualHeadSha !== handle.target.headSha) {
    return { kind: "return", value: {
      ...base(handle),
      state: "stale-target",
      nextAction: "stop",
      expectedHeadSha: handle.target.headSha,
      actualHeadSha,
    } } as const;
  }

  const rawObservation = await observer.observe(handle, { signal });
  const parsed = HostedObservationSchema.safeParse(rawObservation);
  if (!parsed.success) {
    return { kind: "return", value: {
      ...base(handle),
      state: "malformed-output",
      nextAction: "stop",
      reason: parsed.error.message,
    } } as const;
  }
  const observation = parsed.data;
  if (observation.kind === "clean") {
    return { kind: "return", value: {
      ...base(handle), state: "clean", nextAction: "complete", reviewUrl: observation.reviewUrl,
    } } as const;
  }
  if (observation.kind === "findings") {
    return { kind: "return", value: {
      ...base(handle),
      state: "findings",
      nextAction: "triage",
      reviewUrl: observation.reviewUrl,
      findings: observation.findings,
    } } as const;
  }
  if (observation.kind === "rate-limited" || observation.kind === "transient-unavailable") {
    return { kind: "return", value: {
      ...base(handle), state: observation.kind, nextAction: "try-next-source",
    } } as const;
  }
  if (observation.kind === "terminal-failure") {
    return { kind: "return", value: {
      ...base(handle),
      state: "terminal-failure",
      nextAction: "stop",
      reason: observation.reason,
    } } as const;
  }
  return { kind: "continue" } as const;
}

/**
 * Observe one already-requested review until it completes or a timing boundary expires.
 *
 * @param input - Effective await request with a bounded call window.
 * @param dependencies - Provider observers, clock, and unattended-wait attention threshold.
 * @returns A provider result, resumable pending state, or pending state requiring attention.
 */
export async function awaitHostedReview(
  input: unknown,
  dependencies: {
    observers: readonly HostedReviewObserver[];
    clock: HostedAwaitClock;
    attentionAfterMs: number;
  },
): Promise<HostedAwaitResult> {
  const request = HostedAwaitExecutionEnvelopeSchema.parse(input);
  const attentionAfterMs = z.number().int().positive().parse(dependencies.attentionAfterMs);
  const observer = dependencies.observers.find((candidate) => candidate.id === request.handle.provider);
  if (observer === undefined) {
    return {
      ...base(request.handle),
      state: "source-unavailable",
      nextAction: "stop",
    };
  }
  const initialAgeMs = requestAgeMs(request.handle, dependencies.clock.now());
  if (initialAgeMs >= attentionAfterMs && request.continueAfterAttention !== true) {
    return boundedWait<HostedAwaitResult>({
      timeoutMs: request.timeoutMs,
      pollIntervalMs: request.pollIntervalMs,
      clock: dependencies.clock,
      deadline: () => attentionRequired(
        request.handle,
        requestAgeMs(request.handle, dependencies.clock.now()),
        attentionAfterMs,
      ),
      attempt: async ({ signal }) => {
        const observation = await observeHostedReview(observer, request.handle, signal);
        return observation.kind === "continue"
          ? { kind: "return", value: attentionRequired(
              request.handle,
              requestAgeMs(request.handle, dependencies.clock.now()),
              attentionAfterMs,
            ) }
          : observation;
      },
    });
  }

  return boundedWait<HostedAwaitResult>({
    timeoutMs: request.continueAfterAttention === true
      ? request.timeoutMs
      : Math.min(request.timeoutMs, attentionAfterMs - initialAgeMs),
    pollIntervalMs: request.pollIntervalMs,
    clock: dependencies.clock,
    deadline: (elapsedMs): HostedAwaitResult => {
      const ageMs = requestAgeMs(request.handle, dependencies.clock.now());
      return ageMs >= attentionAfterMs
        ? attentionRequired(request.handle, ageMs, attentionAfterMs)
        : {
            ...base(request.handle),
            state: "pending",
            nextAction: "await",
            action: hostedAwaitAction(request.handle),
            elapsedMs,
          };
    },
    attempt: ({ signal }): Promise<BoundedWaitAttempt<HostedAwaitResult>> =>
      observeHostedReview(observer, request.handle, signal),
  });
}
