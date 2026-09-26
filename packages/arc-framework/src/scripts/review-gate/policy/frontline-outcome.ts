/** Truthful provider-neutral frontline execution outcome normalization. */

import { z } from "zod";

import type { KernelRegistry } from "../../../lib/kernel/index.js";
import {
  ReviewCanonicalDigestSchema,
  ReviewTargetSchema,
  type ReviewTarget,
} from "../core/gate-contract-v2-schema.js";
import { ReviewPassSchema, type ReviewPass } from "../core/review-pass.js";
import { NormalizedReviewFindingsSchema } from "../core/finding-records.js";
import {
  FrontlineSourceDescriptorSchema,
  type FrontlineSourceDescriptor,
} from "./frontline-source.js";

const GitObjectIdSchema = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u);
const EmptyFindingsSchema = NormalizedReviewFindingsSchema.refine((findings) => findings.length === 0, {
  message: "non-finding outcomes require an empty finding set",
});
const NonEmptyFindingsSchema = NormalizedReviewFindingsSchema.refine((findings) => findings.length > 0, {
  message: "finding outcomes require at least one finding",
});

export const FrontlineUnavailableRetryReasonSchema = z.strictObject({
  class: z.enum(["rate-limited", "transient-unavailable"]),
});
export const FrontlineUnavailableRepairReasonSchema = z.strictObject({
  class: z.enum(["source-unbound", "capability-unsupported"]),
});
export const FrontlineUnavailableReasonSchema = z.union([
  FrontlineUnavailableRetryReasonSchema,
  FrontlineUnavailableRepairReasonSchema,
]);
export type FrontlineUnavailableReason = z.infer<typeof FrontlineUnavailableReasonSchema>;

export const FrontlineFailedRetryReasonSchema = z.strictObject({
  class: z.enum([
    "transient-transport",
    "process-failure",
    "signal-termination",
    "unexpected-adapter-failure",
  ]),
  detail: z.string().trim().min(1).max(400).optional(),
});
export const FrontlineFailedRepairReasonSchema = z.strictObject({
  class: z.enum(["invalid-output", "authorization-rejected"]),
  detail: z.string().trim().min(1).max(400).optional(),
});
export const FrontlineFailedReasonSchema = z.union([
  FrontlineFailedRetryReasonSchema,
  FrontlineFailedRepairReasonSchema,
]);
export type FrontlineFailedReason = z.infer<typeof FrontlineFailedReasonSchema>;

export const FrontlineTimedOutReasonSchema = z.strictObject({
  class: z.literal("execution-timeout"),
});

export const FrontlineHeadMismatchReasonSchema = z.strictObject({
  class: z.literal("head-mismatch"),
  expectedHeadSha: GitObjectIdSchema,
  observedHeadSha: GitObjectIdSchema,
}).refine((reason) => reason.expectedHeadSha !== reason.observedHeadSha, {
  message: "stale-target reason must describe different heads",
});
export const FrontlineTargetMismatchReasonSchema = z.strictObject({
  class: z.literal("target-mismatch"),
  attemptedTargetId: ReviewCanonicalDigestSchema,
  currentTargetId: ReviewCanonicalDigestSchema,
}).refine((reason) => reason.attemptedTargetId !== reason.currentTargetId, {
  message: "stale-target reason must describe different targets",
});
export const FrontlineStaleTargetReasonSchema = z.union([
  FrontlineHeadMismatchReasonSchema,
  FrontlineTargetMismatchReasonSchema,
]);

export const FrontlinePassCapReasonSchema = z.strictObject({
  class: z.literal("pass-cap-exhausted"),
});

const FrontlineProviderResultSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("clean") }),
  z.strictObject({
    kind: z.literal("findings"),
    findings: NonEmptyFindingsSchema,
  }),
  z.strictObject({ kind: z.literal("rate-limited") }),
  z.strictObject({ kind: z.literal("unavailable"), reason: z.string().min(1) }),
  z.strictObject({ kind: z.literal("source-unbound") }),
  z.strictObject({ kind: z.literal("capability-unsupported") }),
  z.strictObject({ kind: z.literal("authorization-rejected") }),
  z.strictObject({ kind: z.enum(["ambiguous", "partial", "malformed"]) }),
  z.strictObject({
    kind: z.literal("stale-head"),
    expectedHeadSha: GitObjectIdSchema,
    observedHeadSha: GitObjectIdSchema,
  }),
  z.strictObject({
    kind: z.literal("stale-target"),
    attemptedTargetId: ReviewCanonicalDigestSchema,
    currentTargetId: ReviewCanonicalDigestSchema,
  }),
  z.strictObject({ kind: z.literal("timed-out") }),
  z.strictObject({ kind: z.literal("failed"), reason: z.string().min(1) }),
  z.strictObject({ kind: z.literal("pass-cap-exhausted") }),
]);

const FrontlineOutcomeBaseShape = {
  schemaVersion: z.literal(1),
  semanticsVersion: z.literal("frontline-review/v1"),
  source: FrontlineSourceDescriptorSchema,
  target: ReviewTargetSchema,
  pass: ReviewPassSchema,
  maxPasses: ReviewPassSchema,
};

export const FrontlineExecutionOutcomeSchema = z.discriminatedUnion("outcome", [
  z.strictObject({
    ...FrontlineOutcomeBaseShape,
    outcome: z.literal("clean"),
    findings: EmptyFindingsSchema,
    reason: z.null(),
  }),
  z.strictObject({
    ...FrontlineOutcomeBaseShape,
    outcome: z.literal("findings"),
    findings: NonEmptyFindingsSchema,
    reason: z.null(),
  }),
  z.strictObject({
    ...FrontlineOutcomeBaseShape,
    outcome: z.literal("unavailable"),
    findings: EmptyFindingsSchema,
    reason: FrontlineUnavailableReasonSchema,
  }),
  z.strictObject({
    ...FrontlineOutcomeBaseShape,
    outcome: z.literal("failed"),
    findings: EmptyFindingsSchema,
    reason: FrontlineFailedReasonSchema,
  }),
  z.strictObject({
    ...FrontlineOutcomeBaseShape,
    outcome: z.literal("timed-out"),
    findings: EmptyFindingsSchema,
    reason: FrontlineTimedOutReasonSchema,
  }),
  z.strictObject({
    ...FrontlineOutcomeBaseShape,
    outcome: z.literal("stale-target"),
    findings: EmptyFindingsSchema,
    reason: FrontlineStaleTargetReasonSchema,
  }),
  z.strictObject({
    ...FrontlineOutcomeBaseShape,
    outcome: z.literal("pass-cap-exhausted"),
    findings: EmptyFindingsSchema,
    reason: FrontlinePassCapReasonSchema,
  }),
]).superRefine((record, context) => {
  if (record.pass > record.maxPasses) {
    context.addIssue({ code: "custom", message: "pass cannot exceed maxPasses", path: ["pass"] });
  }
});
export type FrontlineExecutionOutcome = z.infer<typeof FrontlineExecutionOutcomeSchema>;

/**
 * Normalize a carrier result against its exact source, target, and bounded pass.
 *
 * @param input - Provider result and immutable execution bindings.
 * @returns A validated provider-neutral outcome.
 */
export function normalizeFrontlineOutcome(input: {
  providerResult: unknown;
  source: FrontlineSourceDescriptor;
  target: ReviewTarget;
  pass: ReviewPass;
  maxPasses: ReviewPass;
}): FrontlineExecutionOutcome {
  const providerResult = FrontlineProviderResultSchema.parse(input.providerResult);
  const base = {
    schemaVersion: 1 as const,
    semanticsVersion: "frontline-review/v1" as const,
    source: input.source,
    target: input.target,
    pass: input.pass,
    maxPasses: input.maxPasses,
  };

  switch (providerResult.kind) {
    case "clean":
      return FrontlineExecutionOutcomeSchema.parse({
        ...base, outcome: "clean", findings: [], reason: null,
      });
    case "findings":
      return FrontlineExecutionOutcomeSchema.parse({
        ...base, outcome: "findings", findings: providerResult.findings, reason: null,
      });
    case "rate-limited":
      return FrontlineExecutionOutcomeSchema.parse({
        ...base, outcome: "unavailable", findings: [], reason: { class: "rate-limited" },
      });
    case "unavailable":
      return FrontlineExecutionOutcomeSchema.parse({
        ...base, outcome: "unavailable", findings: [], reason: { class: "transient-unavailable" },
      });
    case "source-unbound":
      return FrontlineExecutionOutcomeSchema.parse({
        ...base, outcome: "unavailable", findings: [], reason: { class: "source-unbound" },
      });
    case "capability-unsupported":
      return FrontlineExecutionOutcomeSchema.parse({
        ...base, outcome: "unavailable", findings: [], reason: { class: "capability-unsupported" },
      });
    case "authorization-rejected":
      return FrontlineExecutionOutcomeSchema.parse({
        ...base, outcome: "failed", findings: [], reason: { class: "authorization-rejected" },
      });
    case "ambiguous":
    case "partial":
    case "malformed":
      return FrontlineExecutionOutcomeSchema.parse({
        ...base, outcome: "failed", findings: [], reason: { class: "invalid-output" },
      });
    case "stale-head":
      return FrontlineExecutionOutcomeSchema.parse({
        ...base,
        outcome: "stale-target",
        findings: [],
        reason: {
          class: "head-mismatch",
          expectedHeadSha: providerResult.expectedHeadSha,
          observedHeadSha: providerResult.observedHeadSha,
        },
      });
    case "stale-target":
      return FrontlineExecutionOutcomeSchema.parse({
        ...base,
        outcome: "stale-target",
        findings: [],
        reason: {
          class: "target-mismatch",
          attemptedTargetId: providerResult.attemptedTargetId,
          currentTargetId: providerResult.currentTargetId,
        },
      });
    case "timed-out":
      return FrontlineExecutionOutcomeSchema.parse({
        ...base, outcome: "timed-out", findings: [], reason: { class: "execution-timeout" },
      });
    case "failed":
      return FrontlineExecutionOutcomeSchema.parse({
        ...base,
        outcome: "failed",
        findings: [],
        reason: { class: "unexpected-adapter-failure", detail: providerResult.reason.slice(0, 400) },
      });
    case "pass-cap-exhausted":
      return FrontlineExecutionOutcomeSchema.parse({
        ...base,
        outcome: "pass-cap-exhausted",
        findings: [],
        reason: { class: "pass-cap-exhausted" },
      });
  }
}

/** Register the provider-neutral normalized frontline outcome contract. */
export function registerFrontlineOutcomeSchema(registry: KernelRegistry): KernelRegistry {
  registry.register(FrontlineExecutionOutcomeSchema, {
    id: "frontline-execution-outcome",
    version: 1,
    migrationPosture: "strict-current",
  });
  return registry;
}
