/** Exact-target review, check, and base-status reduction. */

import { z } from "zod";

import { ChangeRequestTargetRefSchema } from "./change-request.js";
import { spineRemedy, type SpineRemedy } from "../integration/spine-refusal.js";
import { GitObjectIdSchema } from "./core/gate-contract-v2-schema.js";

const ObjectIdSchema = GitObjectIdSchema;

export const ReviewStatusTargetInputSchema = z.strictObject({
  target: ChangeRequestTargetRefSchema,
});
export type ReviewStatusTargetInput = z.infer<typeof ReviewStatusTargetInputSchema>;

export const RoutedReviewObligationSchema = z.strictObject({
  state: z.enum(["settled", "review-required", "blocked"]),
  detail: z.string().min(1),
});
export type RoutedReviewObligation = z.infer<typeof RoutedReviewObligationSchema>;

export const RequiredCheckStatusSchema = z.enum(["green", "pending", "failed", "not-required", "unavailable"]);
export type RequiredCheckStatus = z.infer<typeof RequiredCheckStatusSchema>;

interface ReviewStatusBase {
  schemaVersion: 1;
  mode: "review-status";
  target: z.infer<typeof ChangeRequestTargetRefSchema>;
  requiredChecks: RequiredCheckStatus;
  routedObligation: RoutedReviewObligation;
  currentBaseOid: string | null;
}

export type ReviewStatusResult = ReviewStatusBase & (
  | { state: "settled"; nextAction: "continue-reconcile" }
  | { state: "review-required"; nextAction: "run-review" }
  | { state: "checks-pending"; nextAction: "rerun-checkpoint" }
  | { state: "base-moved"; nextAction: "rerun-checkpoint" }
  | {
      state: "blocked";
      nextAction: "stop";
      reason: "stale-target" | "checks-failed" | "status-unavailable";
      detail: string;
      remedy: SpineRemedy;
    }
);

export interface ReviewStatusObservation {
  actualHeadSha: string;
  requiredChecks: RequiredCheckStatus;
  routedObligation: RoutedReviewObligation;
  currentBaseOid: string | null;
  baseContained: boolean;
}

export interface ReviewStatusPort {
  observe(target: z.infer<typeof ChangeRequestTargetRefSchema>): Promise<ReviewStatusObservation>;
}

/** Reduce live exact-target evidence to one orchestration action. */
export async function resolveReviewStatus(
  input: ReviewStatusTargetInput,
  port: ReviewStatusPort,
): Promise<ReviewStatusResult> {
  const request = ReviewStatusTargetInputSchema.parse(input);
  const observation = await port.observe(request.target);
  const actualHeadSha = ObjectIdSchema.parse(observation.actualHeadSha);
  const base = {
    schemaVersion: 1 as const,
    mode: "review-status" as const,
    target: request.target,
    requiredChecks: RequiredCheckStatusSchema.parse(observation.requiredChecks),
    routedObligation: RoutedReviewObligationSchema.parse(observation.routedObligation),
    currentBaseOid: observation.currentBaseOid === null
      ? null
      : ObjectIdSchema.parse(observation.currentBaseOid),
  };
  if (actualHeadSha !== request.target.headSha) {
    return {
      ...base,
      state: "blocked",
      nextAction: "stop",
      reason: "stale-target",
      detail: `The target head moved to ${actualHeadSha}.`,
      remedy: spineRemedy(
        "Review status must be recomposed for the current branch head.",
        "Resolve the current change request",
        [
          "arc", "review", "change-request", "resolve",
          "--head-ref", request.target.headRef,
          "--head-sha", actualHeadSha,
          "--json",
        ],
      ),
    };
  }
  if (!observation.baseContained && base.currentBaseOid !== null) {
    return { ...base, state: "base-moved", nextAction: "rerun-checkpoint" };
  }
  if (base.currentBaseOid === null || base.routedObligation.state === "blocked") {
    return {
      ...base,
      state: "blocked",
      nextAction: "stop",
      reason: "status-unavailable",
      detail: base.currentBaseOid === null
        ? "The current base revision is unavailable."
        : base.routedObligation.detail,
      remedy: reviewStatusRetryRemedy(request.target),
    };
  }
  if (base.routedObligation.state === "review-required") {
    return { ...base, state: "review-required", nextAction: "run-review" };
  }
  if (base.requiredChecks === "pending") {
    return { ...base, state: "checks-pending", nextAction: "rerun-checkpoint" };
  }
  if (base.requiredChecks === "failed" || base.requiredChecks === "unavailable") {
    return {
      ...base,
      state: "blocked",
      nextAction: "stop",
      reason: base.requiredChecks === "failed" ? "checks-failed" : "status-unavailable",
      detail: base.requiredChecks === "failed"
        ? "One or more required checks failed."
        : "Required-check status is unavailable.",
      remedy: reviewStatusRetryRemedy(request.target),
    };
  }
  return { ...base, state: "settled", nextAction: "continue-reconcile" };
}

function reviewStatusRetryRemedy(target: z.infer<typeof ChangeRequestTargetRefSchema>): SpineRemedy {
  return spineRemedy(
    "Review status must be recomposed from an exact current target.",
    "Resolve the reported condition, then re-run",
    ["arc", "review", "status", "--target", JSON.stringify(target), "--json"],
  );
}
