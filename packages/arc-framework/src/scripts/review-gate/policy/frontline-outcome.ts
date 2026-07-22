/** Truthful provider-neutral frontline execution outcome normalization. */

import { z } from "zod";

import {
  ReviewTargetSchema,
  type ReviewTarget,
} from "../core/gate-contract-v2-schema.js";
import { NormalizedReviewFindingSchema } from "../core/finding-records.js";
import {
  FrontlineSourceDescriptorSchema,
  type FrontlineSourceDescriptor,
} from "./frontline-source.js";

const FrontlinePassSchema = z.union([z.literal(1), z.literal(2)]);
const FrontlineProviderResultSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("clean") }),
  z.strictObject({
    kind: z.literal("findings"),
    findings: z.array(NormalizedReviewFindingSchema).min(1),
  }),
  z.strictObject({ kind: z.literal("rate-limited") }),
  z.strictObject({ kind: z.literal("unavailable"), reason: z.string().min(1) }),
  z.strictObject({ kind: z.enum(["ambiguous", "partial", "malformed", "stale-head"]) }),
  z.strictObject({ kind: z.literal("failed"), reason: z.string().min(1) }),
  z.strictObject({ kind: z.literal("pass-cap-exhausted") }),
]);

export const FrontlineExecutionOutcomeSchema = z.strictObject({
  schemaVersion: z.literal(1),
  semanticsVersion: z.literal("frontline-review/v1"),
  outcome: z.enum(["clean", "findings", "unavailable", "failed", "pass-cap-exhausted"]),
  source: FrontlineSourceDescriptorSchema,
  target: ReviewTargetSchema,
  pass: FrontlinePassSchema,
  maxPasses: FrontlinePassSchema,
  findings: z.array(NormalizedReviewFindingSchema),
  reason: z.string().min(1).nullable(),
}).superRefine((record, context) => {
  if (record.pass > record.maxPasses) {
    context.addIssue({ code: "custom", message: "pass cannot exceed maxPasses", path: ["pass"] });
  }
  const completed = record.outcome === "clean" || record.outcome === "findings";
  if (completed && record.reason !== null) {
    context.addIssue({ code: "custom", message: "completed outcomes cannot carry a failure reason" });
  }
  if (!completed && record.reason === null) {
    context.addIssue({ code: "custom", message: "non-clean terminal outcomes require a reason" });
  }
  if ((record.outcome === "findings") !== (record.findings.length > 0)) {
    context.addIssue({ code: "custom", message: "only findings outcomes carry findings" });
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
  pass: 1 | 2;
  maxPasses: 1 | 2;
}): FrontlineExecutionOutcome {
  const providerResult = FrontlineProviderResultSchema.parse(input.providerResult);
  const outcome = providerResult.kind === "rate-limited" || providerResult.kind === "unavailable"
    ? "unavailable"
    : providerResult.kind === "ambiguous"
      || providerResult.kind === "partial"
      || providerResult.kind === "malformed"
      || providerResult.kind === "stale-head"
      || providerResult.kind === "failed"
      ? "failed"
      : providerResult.kind;
  const reason = providerResult.kind === "clean" || providerResult.kind === "findings"
    ? null
    : providerResult.kind === "unavailable" || providerResult.kind === "failed"
      ? providerResult.reason
      : providerResult.kind;
  return FrontlineExecutionOutcomeSchema.parse({
    schemaVersion: 1,
    semanticsVersion: "frontline-review/v1",
    outcome,
    source: input.source,
    target: input.target,
    pass: input.pass,
    maxPasses: input.maxPasses,
    findings: providerResult.kind === "findings" ? providerResult.findings : [],
    reason,
  });
}
