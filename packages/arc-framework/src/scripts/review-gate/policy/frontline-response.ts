/** Adapter from frontline findings into the universal review-response checkpoint. */

import { projectReviewResponse } from "../core/response-plan.js";
import type {
  ReviewResponseInput,
  ReviewResponsePlan,
} from "../core/response-plan-schema.js";
import { FrontlineExecutionOutcomeSchema } from "./frontline-outcome.js";

type FrontlineResponseFields = Omit<
  ReviewResponseInput,
  "currentTarget" | "findings" | "channel" | "conversations"
>;

/**
 * Project a local frontline finding set through exact disposition approval and fix verification.
 *
 * @param input - A findings outcome plus the universal response-cycle state.
 * @returns The existing channel-neutral response plan; no carrier capability is introduced.
 */
export function projectFrontlineResponse(
  input: FrontlineResponseFields & { outcome: unknown },
): ReviewResponsePlan {
  const outcome = FrontlineExecutionOutcomeSchema.parse(input.outcome);
  if (outcome.outcome !== "findings") {
    throw new Error("frontline response requires a findings outcome");
  }
  const { outcome: _outcome, ...response } = input;
  void _outcome;
  return projectReviewResponse({
    ...response,
    currentTarget: outcome.target,
    findings: outcome.findings,
    channel: "local",
    conversations: [],
  });
}
