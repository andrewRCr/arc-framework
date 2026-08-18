/** Typed request contract for hosted pull-request review sources. */

import { z } from "zod";
import { GitObjectIdSchema } from "../core/gate-contract-v2-schema.js";

export const HostedProviderIdSchema = z.enum(["coderabbit-pr", "codex-pr"]);
export type HostedProviderId = z.infer<typeof HostedProviderIdSchema>;

export const HostedReviewCoverageSchema = z.enum(["complete", "incremental"]);
export type HostedReviewCoverage = z.infer<typeof HostedReviewCoverageSchema>;

export const HostedTargetSchema = z.strictObject({
  repository: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u),
  pullRequest: z.int().positive(),
  headSha: GitObjectIdSchema,
});
export type HostedTarget = z.infer<typeof HostedTargetSchema>;

export const HostedArtifactSchema = z.strictObject({
  kind: z.enum(["issue-comment", "pull-request-review"]),
  id: z.string().min(1),
  url: z.url(),
  createdAt: z.iso.datetime({ offset: true }),
});
export type HostedArtifact = z.infer<typeof HostedArtifactSchema>;

export const HostedRequestHandleSchema = z.strictObject({
  schemaVersion: z.literal(1),
  provider: HostedProviderIdSchema,
  requestedCoverage: HostedReviewCoverageSchema,
  effectiveCoverage: HostedReviewCoverageSchema,
  target: HostedTargetSchema,
  artifact: HostedArtifactSchema,
}).refine(
  (handle) => handle.requestedCoverage !== "complete" || handle.effectiveCoverage === "complete",
  {
    message: "effective coverage must not weaken requested complete coverage",
    path: ["effectiveCoverage"],
  },
);
export type HostedRequestHandle = z.infer<typeof HostedRequestHandleSchema>;

export const HostedRequestEnvelopeSchema = z.strictObject({
  schemaVersion: z.literal(1),
  target: HostedTargetSchema,
  provider: HostedProviderIdSchema,
  coverage: HostedReviewCoverageSchema,
});
export type HostedRequestEnvelope = z.infer<typeof HostedRequestEnvelopeSchema>;

export type HostedRequestOutcome =
  | {
    kind: "created";
    artifact: HostedArtifact;
    effectiveCoverage: HostedReviewCoverage;
  }
  | { kind: "rate-limited" | "transient-unavailable" }
  | { kind: "ambiguous-delivery" }
  | { kind: "terminal-failure"; reason: string };

export interface HostedReviewAdapter {
  id: HostedProviderId;
  identities: {
    botUserId: string;
    appId?: string;
  };
  request(target: HostedTarget, coverage: HostedReviewCoverage): Promise<HostedRequestOutcome>;
}

const HostedRequestResultBaseShape = {
  schemaVersion: z.literal(1),
  mode: z.literal("review-hosted-request"),
  requestedCoverage: HostedReviewCoverageSchema,
  attemptedProviders: z.array(HostedProviderIdSchema).min(1),
};

export const HostedRequestResultSchema = z.union([
  z.strictObject({
    ...HostedRequestResultBaseShape,
    state: z.literal("requested"),
    nextAction: z.literal("await"),
    handle: HostedRequestHandleSchema,
  }),
  z.strictObject({
    ...HostedRequestResultBaseShape,
    state: z.literal("source-unavailable"),
    nextAction: z.literal("stop"),
    provider: HostedProviderIdSchema,
  }),
  z.strictObject({
    ...HostedRequestResultBaseShape,
    state: z.enum(["rate-limited", "transient-unavailable"]),
    nextAction: z.literal("try-next-source"),
    provider: HostedProviderIdSchema,
  }),
  z.strictObject({
    ...HostedRequestResultBaseShape,
    state: z.literal("ambiguous-delivery"),
    nextAction: z.literal("stop"),
    provider: HostedProviderIdSchema,
  }),
  z.strictObject({
    ...HostedRequestResultBaseShape,
    state: z.literal("terminal-failure"),
    nextAction: z.literal("stop"),
    provider: HostedProviderIdSchema,
    reason: z.string().min(1),
  }),
]);
export type HostedRequestResult = z.infer<typeof HostedRequestResultSchema>;

/** Request one hosted review without introducing local operation state. */
export async function requestHostedReview(
  input: unknown,
  dependencies: { adapters: readonly HostedReviewAdapter[] },
): Promise<HostedRequestResult> {
  const request = HostedRequestEnvelopeSchema.parse(input);
  const attemptedProviders = [request.provider];
  const resultBase = {
    schemaVersion: 1 as const,
    mode: "review-hosted-request" as const,
    requestedCoverage: request.coverage,
    attemptedProviders,
  };
  const adapter = dependencies.adapters.find((candidate) => candidate.id === request.provider);
  if (adapter === undefined) {
    return {
      ...resultBase,
      state: "source-unavailable",
      nextAction: "stop",
      provider: request.provider,
    };
  }

  const outcome = await adapter.request(request.target, request.coverage);
  if (outcome.kind === "created") {
    return {
      ...resultBase,
      state: "requested",
      nextAction: "await",
      handle: HostedRequestHandleSchema.parse({
        schemaVersion: 1,
        provider: adapter.id,
        requestedCoverage: request.coverage,
        effectiveCoverage: outcome.effectiveCoverage,
        target: request.target,
        artifact: outcome.artifact,
      }),
    };
  }
  if (outcome.kind === "rate-limited" || outcome.kind === "transient-unavailable") {
    return {
      ...resultBase,
      state: outcome.kind,
      nextAction: "try-next-source",
      provider: request.provider,
    };
  }
  return outcome.kind === "terminal-failure"
    ? {
      ...resultBase,
      state: "terminal-failure",
      nextAction: "stop",
      provider: request.provider,
      reason: outcome.reason,
    }
    : {
      ...resultBase,
      state: "ambiguous-delivery",
      nextAction: "stop",
      provider: request.provider,
    };
}
