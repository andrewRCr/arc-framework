/** Idempotent execution of one persisted integration settlement plan. */

import { z } from "zod";

import type { HostedSettleEnvelope, HostedSettleResult } from "../review-gate/hosted/settle.js";
import type { ReviewResponseSettlementRequest } from "../review-gate/core/response-plan-schema.js";
import {
  CanonicalSettlementPlanSchema,
  type CanonicalSettlementPlan,
} from "./settlement-plan.js";

export const SettlementInvalidationReasonSchema = z.enum([
  "missing",
  "stale",
  "ambiguous",
  "actor-mismatched",
]);
export type SettlementInvalidationReason = z.infer<typeof SettlementInvalidationReasonSchema>;

export type SettlementExecutionResult =
  | { state: "settled"; completedActions: number }
  | {
      state: "invalidated";
      reason: SettlementInvalidationReason;
      dispositionId: string;
      completedActions: number;
    };

export interface SettlementExecutionDependencies {
  settleHosted(request: HostedSettleEnvelope): Promise<HostedSettleResult>;
  settleReviewResponse(
    request: ReviewResponseSettlementRequest,
  ): Promise<{ state: string }>;
}

function hostedInvalidation(result: HostedSettleResult): SettlementInvalidationReason | null {
  if (result.state === "settled" || result.state === "already-settled") return null;
  if (result.state === "missing-thread" || result.state === "missing-comment") return "missing";
  if (result.state === "stale-target") return "stale";
  if (result.state === "actor-mismatch") return "actor-mismatched";
  return "ambiguous";
}

/** Execute canonical actions in order, stopping before any action after the first invalidation. */
export async function executeSettlementPlan(
  input: CanonicalSettlementPlan,
  dependencies: SettlementExecutionDependencies,
): Promise<SettlementExecutionResult> {
  const plan = CanonicalSettlementPlanSchema.parse(input);
  let completedActions = 0;
  for (const action of plan.actions) {
    let reason: SettlementInvalidationReason | null;
    if (action.channel === "hosted") {
      reason = hostedInvalidation(await dependencies.settleHosted(action.request));
    } else {
      const result = await dependencies.settleReviewResponse(action.request);
      reason = result.state === "settled" || result.state === "already-settled"
        ? null
        : result.state === "stale-target" ? "stale" : "ambiguous";
    }
    if (reason !== null) {
      return { state: "invalidated", reason, dispositionId: action.dispositionId, completedActions };
    }
    completedActions += 1;
  }
  return { state: "settled", completedActions };
}
