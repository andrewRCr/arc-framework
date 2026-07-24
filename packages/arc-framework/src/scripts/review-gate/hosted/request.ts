/** Typed request contract for hosted pull-request review sources. */

import { z } from "zod";

export const HostedProviderIdSchema = z.enum(["coderabbit-pr", "codex-pr"]);
export type HostedProviderId = z.infer<typeof HostedProviderIdSchema>;

export const HostedTargetSchema = z.strictObject({
  repository: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u),
  pullRequest: z.int().positive(),
  headSha: z.string().regex(/^[a-f0-9]{40}$/u),
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
  target: HostedTargetSchema,
  artifact: HostedArtifactSchema,
});
export type HostedRequestHandle = z.infer<typeof HostedRequestHandleSchema>;

export const HostedRequestEnvelopeSchema = z.strictObject({
  schemaVersion: z.literal(1),
  target: HostedTargetSchema,
  provider: HostedProviderIdSchema,
});
export type HostedRequestEnvelope = z.infer<typeof HostedRequestEnvelopeSchema>;

export type HostedRequestOutcome =
  | { kind: "created"; artifact: HostedArtifact }
  | { kind: "rate-limited" | "transient-unavailable" }
  | { kind: "ambiguous-delivery" }
  | { kind: "terminal-failure"; reason: string };

export interface HostedReviewAdapter {
  id: HostedProviderId;
  requestCommand: string;
  identities: {
    botUserId: string;
    appId?: string;
  };
  request(target: HostedTarget): Promise<HostedRequestOutcome>;
}

const HostedRequestResultBaseShape = {
  schemaVersion: z.literal(1),
  mode: z.literal("review-hosted-request"),
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
  const adapter = dependencies.adapters.find((candidate) => candidate.id === request.provider);
  if (adapter === undefined) {
    return {
      schemaVersion: 1,
      mode: "review-hosted-request",
      state: "source-unavailable",
      nextAction: "stop",
      provider: request.provider,
      attemptedProviders,
    };
  }

  const outcome = await adapter.request(request.target);
  if (outcome.kind === "created") {
    return {
      schemaVersion: 1,
      mode: "review-hosted-request",
      state: "requested",
      nextAction: "await",
      handle: HostedRequestHandleSchema.parse({
        schemaVersion: 1,
        provider: adapter.id,
        target: request.target,
        artifact: outcome.artifact,
      }),
      attemptedProviders,
    };
  }
  if (outcome.kind === "rate-limited" || outcome.kind === "transient-unavailable") {
    return {
      schemaVersion: 1,
      mode: "review-hosted-request",
      state: outcome.kind,
      nextAction: "try-next-source",
      provider: request.provider,
      attemptedProviders,
    };
  }
  return outcome.kind === "terminal-failure"
    ? {
      schemaVersion: 1,
      mode: "review-hosted-request",
      state: "terminal-failure",
      nextAction: "stop",
      provider: request.provider,
      attemptedProviders,
      reason: outcome.reason,
    }
    : {
      schemaVersion: 1,
      mode: "review-hosted-request",
      state: "ambiguous-delivery",
      nextAction: "stop",
      provider: request.provider,
      attemptedProviders,
    };
}
