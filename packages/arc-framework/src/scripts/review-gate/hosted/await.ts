/** Bounded passive wait contract for hosted pull-request reviews. */

import { z } from "zod";
import { CanonicalDigestSchema } from "../../../lib/kernel/schema/vocabulary.js";
import {
  boundedWait,
  type BoundedWaitAttempt,
  type BoundedWaitClock,
} from "../bounded-wait.js";
import {
  NormalizedReviewFindingSchema,
  ReviewFindingIdentitySchema,
  ReviewFindingSourceLabelSchema,
  ReviewFindingSourceOrdinalSchema,
  type NormalizedReviewFinding,
} from "../core/finding-records.js";

import {
  HostedAwaitActionSchema,
  HostedRequestHandleSchema,
  HostedTargetSchema,
  hostedAwaitAction,
  type HostedProviderId,
  type HostedRequestHandle,
} from "./request.js";

const HostedFindingNavigationShape = {
  sourceOrdinal: ReviewFindingSourceOrdinalSchema,
  sourceLabel: ReviewFindingSourceLabelSchema.optional(),
  sourceLabelTruncated: z.literal(true).optional(),
};

const HostedFindingClassificationShape = {
  severity: z.enum(["critical", "major", "minor"]),
  nit: z.literal(true).optional(),
};

interface HostedFindingValidationInput {
  severity: "critical" | "major" | "minor";
  nit?: true;
  sourceLabel?: string;
  sourceLabelTruncated?: true;
}

function validateHostedFinding(
  finding: HostedFindingValidationInput,
  context: z.RefinementCtx,
): void {
  if (finding.nit === true && finding.severity !== "minor") {
    context.addIssue({
      code: "custom",
      message: "nit is valid only for minor findings",
      path: ["nit"],
    });
  }
  if (finding.sourceLabelTruncated === true
    && (finding.sourceLabel === undefined || Array.from(finding.sourceLabel).length !== 512)) {
    context.addIssue({
      code: "custom",
      message: "truncated source labels must retain a 512-code-point prefix",
      path: ["sourceLabelTruncated"],
    });
  }
}

export const HostedThreadFindingSchema = z.strictObject({
  findingId: ReviewFindingIdentitySchema,
  origin: z.literal("review-thread"),
  commentId: z.string().min(1),
  threadId: z.string().min(1),
  settlement: z.literal("reply-and-resolve"),
  ...HostedFindingClassificationShape,
  locus: z.string().min(1),
  url: z.url(),
  ...HostedFindingNavigationShape,
}).superRefine(validateHostedFinding);

export const HostedReviewBodyFindingSchema = z.strictObject({
  findingId: ReviewFindingIdentitySchema,
  origin: z.literal("review-body"),
  reviewId: z.string().min(1),
  fingerprint: z.string().min(1),
  settlement: z.literal("not-applicable"),
  ...HostedFindingClassificationShape,
  locus: z.string().min(1),
  url: z.url(),
  body: z.string().min(1),
  ...HostedFindingNavigationShape,
}).superRefine(validateHostedFinding);

export const HostedFindingSchema = z.discriminatedUnion("origin", [
  HostedThreadFindingSchema,
  HostedReviewBodyFindingSchema,
]);
export type HostedFinding = z.infer<typeof HostedFindingSchema>;

export const HostedFindingsSchema = z.array(HostedFindingSchema).superRefine((findings, context) => {
  for (const [index, finding] of findings.entries()) {
    if (finding.sourceOrdinal !== index + 1) {
      context.addIssue({
        code: "custom",
        message: "source ordinal must match one-based capture order",
        path: [index, "sourceOrdinal"],
      });
    }
  }
});
const NonEmptyHostedFindingsSchema = HostedFindingsSchema.refine((findings) => findings.length > 0, {
  message: "hosted finding results require at least one finding",
});

/**
 * Project one hosted finding without changing its native source navigation.
 *
 * @param finding - Captured hosted finding in final combined source order.
 * @returns The channel-neutral finding consumed by response projections.
 */
export function projectHostedFinding(finding: HostedFinding): NormalizedReviewFinding {
  return NormalizedReviewFindingSchema.parse({
    findingId: finding.findingId,
    severity: finding.severity,
    ...(finding.nit === undefined ? {} : { nit: finding.nit }),
    locus: finding.locus,
    evidenceUrlOrId: finding.url,
    sourceOrdinal: finding.sourceOrdinal,
    ...(finding.sourceLabel === undefined ? {} : { sourceLabel: finding.sourceLabel }),
    ...(finding.sourceLabelTruncated === undefined
      ? {}
      : { sourceLabelTruncated: finding.sourceLabelTruncated }),
  });
}

const ProviderNativeShaSchema = z.string().regex(/^[0-9a-f]{7,40}$/u);
const CodeRabbitNativeIncrementalEvidenceBaseShape = {
  schemaVersion: z.literal(1),
  kind: z.literal("provider-native-incremental"),
  sourceId: z.literal("coderabbit-pr"),
  requestArtifactId: z.string().trim().min(1),
};

/** Immutable provider evidence that either establishes or refuses native incremental coverage. */
export const HostedCoverageEvidenceSchema = z.discriminatedUnion("status", [
  z.strictObject({
    ...CodeRabbitNativeIncrementalEvidenceBaseShape,
    status: z.literal("established"),
    baselineSha: ProviderNativeShaSchema,
    headSha: ProviderNativeShaSchema,
    providerGeneration: z.strictObject({
      artifactId: z.string().trim().min(1),
      url: z.url(),
      createdAt: z.iso.datetime({ offset: true }),
      updatedAt: z.iso.datetime({ offset: true }),
      actorIdentity: z.literal("136622811"),
      appId: z.literal("347564"),
    }),
  }),
  z.strictObject({
    ...CodeRabbitNativeIncrementalEvidenceBaseShape,
    status: z.literal("unestablished"),
    reason: z.enum([
      "provider-incremental-range-missing",
      "provider-incremental-range-ambiguous",
      "provider-incremental-range-mismatch",
    ]),
  }),
]);
export type HostedCoverageEvidence = z.infer<typeof HostedCoverageEvidenceSchema>;

const HostedTerminalCoverageShape = {
  coverageEvidence: HostedCoverageEvidenceSchema.optional(),
};

const HostedObservationSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("pending") }),
  z.strictObject({
    kind: z.literal("clean"),
    reviewUrl: z.url(),
    ...HostedTerminalCoverageShape,
  }),
  z.strictObject({
    kind: z.literal("findings"),
    reviewUrl: z.url(),
    findings: NonEmptyHostedFindingsSchema,
    responseSourceRef: z.string().trim().min(1).optional(),
    ...HostedTerminalCoverageShape,
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
    ...HostedTerminalCoverageShape,
    responseSourceRef: z.string().trim().min(1).optional(),
    hostedResultId: CanonicalDigestSchema.optional(),
  }),
  z.strictObject({
    ...HostedAwaitResultBaseShape,
    state: z.literal("findings"),
    nextAction: z.literal("triage"),
    reviewUrl: z.url(),
    findings: NonEmptyHostedFindingsSchema,
    ...HostedTerminalCoverageShape,
    responseSourceRef: z.string().trim().min(1).optional(),
    hostedResultId: CanonicalDigestSchema.optional(),
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
]).superRefine((result, context) => {
  if (result.state !== "clean" && result.state !== "findings") return;
  const nativeIncremental = result.handle.provider === "coderabbit-pr"
    && result.handle.requestedCoverage === "incremental";
  if (nativeIncremental !== (result.coverageEvidence !== undefined)) {
    context.addIssue({
      code: "custom",
      path: ["coverageEvidence"],
      message: nativeIncremental
        ? "CodeRabbit incremental terminal results require provider coverage evidence"
        : "provider-native coverage evidence belongs only to CodeRabbit incremental results",
    });
    return;
  }
  const evidence = result.coverageEvidence;
  if (evidence === undefined) return;
  if (evidence.requestArtifactId !== result.handle.artifact.id) {
    context.addIssue({
      code: "custom",
      path: ["coverageEvidence", "requestArtifactId"],
      message: "provider coverage evidence does not match the admitted request artifact",
    });
  }
  if (evidence.status === "established") {
    const scope = result.handle.admission.correctionScope;
    if (scope === undefined
      || !scope.predecessorHeadSha.startsWith(evidence.baselineSha)
      || !scope.headSha.startsWith(evidence.headSha)
      || evidence.providerGeneration.updatedAt < result.handle.artifact.createdAt) {
      context.addIssue({
        code: "custom",
        path: ["coverageEvidence"],
        message: "provider coverage evidence does not establish the admitted correction range",
      });
    }
  }
});
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
      ...base(handle),
      state: "clean",
      nextAction: "complete",
      reviewUrl: observation.reviewUrl,
      ...(observation.coverageEvidence === undefined
        ? {}
        : { coverageEvidence: observation.coverageEvidence }),
    } } as const;
  }
  if (observation.kind === "findings") {
    return { kind: "return", value: {
      ...base(handle),
      state: "findings",
      nextAction: "triage",
      reviewUrl: observation.reviewUrl,
      findings: observation.findings,
      ...(observation.coverageEvidence === undefined
        ? {}
        : { coverageEvidence: observation.coverageEvidence }),
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
