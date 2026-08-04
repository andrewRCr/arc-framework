/** Registered command-result envelopes for the merge-lock verbs. */

import { z } from "zod";

import type { KernelRegistry } from "../../../lib/kernel/index.js";
import { ReviewTargetSchema } from "../readiness.js";
import { ReviewCommandDiagnosticSchema } from "./review-command-envelope.js";

export const MergeLockCommandModeSchema = z.enum([
  "merge-lock-resolve",
  "merge-lock-hold",
  "merge-lock-release",
]);
export type MergeLockCommandMode = z.infer<typeof MergeLockCommandModeSchema>;

/**
 * Every way a verb refuses to answer. Closed and exhaustive: a reason no verb
 * can reach is a reason that should not be here.
 */
export const MergeLockBlockedReasonSchema = z.enum([
  "config-unresolved",
  "repository-unavailable",
  "repository-mismatch",
  "pull-request-unavailable",
  "pull-request-mismatch",
  "pull-request-closed",
  "stale-head",
  "readiness-failed",
  "transition-failed",
]);
export type MergeLockBlockedReason = z.infer<typeof MergeLockBlockedReasonSchema>;

/**
 * Why a transition was a no-op — the lock is off, or the pull request already
 * holds the requested state. The first never reaches the host.
 */
export const MergeLockNoLockReasonSchema = z.enum(["lock-disabled", "already-in-state"]);
export type MergeLockNoLockReason = z.infer<typeof MergeLockNoLockReasonSchema>;

const TransitionTargetShape = {
  repository: ReviewTargetSchema.shape.repository,
  pullRequest: ReviewTargetSchema.shape.pullRequest,
  headSha: ReviewTargetSchema.shape.headSha,
};

function variant<
  Mode extends MergeLockCommandMode,
  State extends string,
  NextAction extends string,
  Payload extends z.ZodType,
>(mode: Mode, state: State, nextAction: NextAction, payload: Payload, atLeastOneDiagnostic = false) {
  const diagnostics = z.array(ReviewCommandDiagnosticSchema);
  return z.strictObject({
    schemaVersion: z.literal(1),
    mode: z.literal(mode),
    diagnostics: atLeastOneDiagnostic ? diagnostics.min(1) : diagnostics,
    state: z.literal(state),
    nextAction: z.literal(nextAction),
    payload,
  });
}

function errorVariant<Mode extends MergeLockCommandMode, Code extends string>(mode: Mode, code: Code) {
  return z.strictObject({
    schemaVersion: z.literal(1),
    mode: z.literal(mode),
    diagnostics: z.array(ReviewCommandDiagnosticSchema),
    error: z.strictObject({
      code: z.literal(code),
      message: z.string().trim().min(1),
    }),
  });
}

/**
 * The pre-open query's result. No pull request exists yet, so the payload
 * carries no target — only the config-resolution failure has anything to say.
 */
export const MergeLockResolveEnvelopeSchema = z.union([
  variant("merge-lock-resolve", "locked", "open-locked", z.strictObject({})),
  variant("merge-lock-resolve", "none", "open-plain", z.strictObject({})),
  variant(
    "merge-lock-resolve",
    "blocked",
    "stop",
    z.strictObject({ reason: z.literal("config-unresolved") }),
    true,
  ),
]);
export type MergeLockResolveEnvelope = z.infer<typeof MergeLockResolveEnvelopeSchema>;

function transitionEnvelope<Mode extends "merge-lock-hold" | "merge-lock-release", State extends string>(
  mode: Mode,
  settled: State,
) {
  return z.union([
    variant(mode, settled, "proceed", z.strictObject(TransitionTargetShape)),
    variant(
      mode,
      "no-lock",
      "none",
      z.strictObject({ ...TransitionTargetShape, reason: MergeLockNoLockReasonSchema }),
    ),
    variant(
      mode,
      "blocked",
      "stop",
      z.strictObject({ ...TransitionTargetShape, reason: MergeLockBlockedReasonSchema }),
      true,
    ),
  ]);
}

export const MergeLockHoldEnvelopeSchema = transitionEnvelope("merge-lock-hold", "held");
export type MergeLockHoldEnvelope = z.infer<typeof MergeLockHoldEnvelopeSchema>;

export const MergeLockReleaseEnvelopeSchema = transitionEnvelope("merge-lock-release", "released");
export type MergeLockReleaseEnvelope = z.infer<typeof MergeLockReleaseEnvelopeSchema>;

export const MergeLockCommandErrorEnvelopeSchema = z.union([
  ...MergeLockCommandModeSchema.options.flatMap((mode) => [
    errorVariant(mode, "invalid-input"),
    errorVariant(mode, "corrupt-state"),
    errorVariant(mode, "unexpected-failure"),
  ]),
]);
export type MergeLockCommandErrorEnvelope = z.infer<typeof MergeLockCommandErrorEnvelopeSchema>;

/**
 * Register every merge-lock envelope as a strict-current protocol contract.
 *
 * @param registry - Caller-owned kernel registry.
 * @returns The same registry, for composition.
 */
export function registerMergeLockCommandEnvelopeSchemas(registry: KernelRegistry): KernelRegistry {
  for (const [id, schema] of [
    ["merge-lock-resolve-envelope", MergeLockResolveEnvelopeSchema],
    ["merge-lock-hold-envelope", MergeLockHoldEnvelopeSchema],
    ["merge-lock-release-envelope", MergeLockReleaseEnvelopeSchema],
    ["merge-lock-command-error-envelope", MergeLockCommandErrorEnvelopeSchema],
  ] as const) {
    registry.register(schema, { id, version: 1, migrationPosture: "strict-current" });
  }
  return registry;
}
