/** Idempotent execution of one persisted integration settlement plan. */

import { z } from "zod";

import type { HostedSettleEnvelope, HostedSettleResult } from "../review-gate/hosted/settle.js";
import type {
  ReviewResponseSettlementAction,
  ReviewResponseSettlementRequest,
} from "../review-gate/core/response-plan-schema.js";
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

/**
 * One approved response replayed at settlement time.
 *
 * The settled target travels beside the request because settlement runs after the approved response:
 * the originating review target may be stale by then, and the head the response settled at is what
 * must still be current. The hosted channel pins the same head through its own envelope.
 */
export interface ReviewResponseSettlementReplay {
  request: ReviewResponseSettlementRequest;
  fixTarget: ReviewResponseSettlementAction["fixTarget"];
}

export interface SettlementExecutionDependencies {
  settleHosted(request: HostedSettleEnvelope): Promise<HostedSettleResult>;
  settleReviewResponse(input: ReviewResponseSettlementReplay): Promise<{ state: string }>;
}

/**
 * Both channels classify their own refusals, so neither is read back from an error message here.
 * A state this does not name is `ambiguous` rather than settled — an unrecognized outcome is not
 * evidence that the approved response landed.
 */
function reviewResponseInvalidation(state: string): SettlementInvalidationReason | null {
  if (state === "settled" || state === "already-settled") return null;
  if (state === "missing-record") return "missing";
  if (state === "stale-target") return "stale";
  if (state === "actor-mismatch") return "actor-mismatched";
  return "ambiguous";
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
      const result = await dependencies.settleReviewResponse({
        request: action.request,
        fixTarget: action.fixTarget,
      });
      reason = reviewResponseInvalidation(result.state);
    }
    if (reason !== null) {
      return { state: "invalidated", reason, dispositionId: action.dispositionId, completedActions };
    }
    completedActions += 1;
  }
  return { state: "settled", completedActions };
}
