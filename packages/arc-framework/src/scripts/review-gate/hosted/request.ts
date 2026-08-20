/** Typed request contract for hosted pull-request review sources. */

import { z } from "zod";

import { canonicalize } from "../../../lib/kernel/index.js";
import { StandardReviewObligationProjectionSchema } from
  "../policy/standard-review-projection-schema.js";

const GitHubObjectIdSchema = z.string().regex(/^[0-9a-f]{40}$/u);
const ReviewSourceIdSchema = z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u);

export const HostedProviderIdSchema = z.enum(["coderabbit-pr", "codex-pr"]);
export type HostedProviderId = z.infer<typeof HostedProviderIdSchema>;

export const HostedReviewCoverageSchema = z.enum(["complete", "incremental"]);
export type HostedReviewCoverage = z.infer<typeof HostedReviewCoverageSchema>;

export const HostedTargetSchema = z.strictObject({
  repository: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u),
  pullRequest: z.int().positive(),
  headSha: GitHubObjectIdSchema,
});
export type HostedTarget = z.infer<typeof HostedTargetSchema>;

export const HostedArtifactSchema = z.strictObject({
  kind: z.enum(["issue-comment", "pull-request-review"]),
  id: z.string().min(1),
  url: z.url(),
  createdAt: z.iso.datetime({ offset: true }),
});
export type HostedArtifact = z.infer<typeof HostedArtifactSchema>;

export const HostedErrandRequestVehicleSchema = z.strictObject({
  kind: z.literal("errand"),
  standardReview: StandardReviewObligationProjectionSchema,
});
export type HostedErrandRequestVehicle = z.infer<typeof HostedErrandRequestVehicleSchema>;

export const HostedErrandProgressBindingSchema = z.strictObject({
  kind: z.literal("errand"),
  key: z.string().trim().min(1),
  claimId: z.string().trim().min(1),
  branch: z.string().trim().min(1),
  sources: z.array(ReviewSourceIdSchema).min(1).readonly(),
  standardReview: StandardReviewObligationProjectionSchema,
});
export type HostedErrandProgressBinding = z.infer<typeof HostedErrandProgressBindingSchema>;

export const HostedRequestHandleSchema = z.strictObject({
  schemaVersion: z.literal(1),
  provider: HostedProviderIdSchema,
  requestedCoverage: HostedReviewCoverageSchema,
  effectiveCoverage: HostedReviewCoverageSchema,
  target: HostedTargetSchema,
  artifact: HostedArtifactSchema,
  vehicle: HostedErrandProgressBindingSchema.optional(),
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
  vehicle: HostedErrandRequestVehicleSchema.optional(),
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
  dependencies: {
    adapters: readonly HostedReviewAdapter[];
    errandBinding?: HostedErrandProgressBinding;
  },
): Promise<HostedRequestResult> {
  const request = HostedRequestEnvelopeSchema.parse(input);
  const errandBinding = request.vehicle === undefined
    ? undefined
    : HostedErrandProgressBindingSchema.parse(dependencies.errandBinding);
  if (request.vehicle !== undefined
    && canonicalize(request.vehicle.standardReview) !== canonicalize(errandBinding?.standardReview)) {
    throw new Error("Hosted Errand progress binding does not match the requested standard-review obligation.");
  }
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
        ...(errandBinding === undefined ? {} : { vehicle: errandBinding }),
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
