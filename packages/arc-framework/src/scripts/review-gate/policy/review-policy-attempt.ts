/** Validated persisted attempts at the review policy boundary. */

import { z } from "zod";
import { ReviewIdentifierSchema } from "../core/gate-contract-v2-schema.js";

const ReviewSourceIdSchema = z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u);

export const ReviewAttemptOutcomeSchema = z.enum([
  "clean",
  "findings",
  "rate-limited",
  "transient-unavailable",
  "partial",
  "ambiguous-delivery",
  "malformed",
  "timed-out",
  "stale-target",
  "capability-unsupported",
  "source-unbound",
  "terminal-failure",
]);
const TerminalReviewAttemptSchema = z.strictObject({
  sourceId: ReviewSourceIdSchema,
  outcome: z.enum(["clean", "findings"]),
  reviewOperationId: ReviewIdentifierSchema,
  chunkSeriesComplete: z.boolean().optional(),
}).readonly();
const NonTerminalReviewAttemptSchema = z.strictObject({
  sourceId: ReviewSourceIdSchema,
  outcome: ReviewAttemptOutcomeSchema.exclude(["clean", "findings"]),
  chunkSeriesComplete: z.boolean().optional(),
}).readonly();
export const ReviewAttemptSchema = z.discriminatedUnion("outcome", [
  TerminalReviewAttemptSchema,
  NonTerminalReviewAttemptSchema,
]).readonly();
export type ReviewAttempt = z.infer<typeof ReviewAttemptSchema>;

/**
 * Project one persisted lane attempt into the policy command's evidence vocabulary.
 *
 * Operational finding settlement retains the original findings producer. The policy sees that
 * original outcome and its immutable producer identity, never settlement as new evidence.
 *
 * @param input - Persisted attempt identity, source, outcome, and optional chunk completion marker.
 * @returns The validated policy attempt with terminal producer identity retained.
 */
export function projectReviewPolicyAttempt(input: {
  readonly attemptId: string;
  readonly sourceId: string;
  readonly outcome: z.infer<typeof ReviewAttemptOutcomeSchema> | "pending" | "settled-findings";
  readonly chunkSeriesComplete?: boolean;
}): ReviewAttempt {
  if (input.outcome === "pending") {
    throw new Error("pending lane attempts are not completed policy evidence");
  }
  const outcome = input.outcome === "settled-findings" ? "findings" : input.outcome;
  return ReviewAttemptSchema.parse({
    sourceId: input.sourceId,
    outcome,
    ...(outcome === "clean" || outcome === "findings"
      ? { reviewOperationId: input.attemptId }
      : {}),
    ...(input.chunkSeriesComplete === undefined
      ? {}
      : { chunkSeriesComplete: input.chunkSeriesComplete }),
  });
}
