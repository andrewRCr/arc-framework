/** Bounded material-fix policy for a single frontline follow-up pass. */

import type { ApprovedDispositionSet } from "../core/disposition-records.js";
import { validateDispositionState } from "../core/dispositions.js";
import { ReviewTargetSchema, type ReviewTarget } from "../core/gate-contract-v2-schema.js";
import { FrontlineExecutionOutcomeSchema } from "./frontline-outcome.js";

export type FrontlineFollowUpDecision =
  | { action: "follow-up"; pass: 2; target: ReviewTarget }
  | { action: "stop"; reason: string };

/**
 * Permit only the V1 second pass after an approved material fix changes the exact target.
 *
 * @param input - First-pass outcome, exact approved dispositions, and resulting target.
 * @returns A second-pass instruction or an advisory stop reason.
 */
export function resolveFrontlineFollowUp(input: {
  outcome: unknown;
  dispositionState: ApprovedDispositionSet;
  changedTarget: unknown;
}): FrontlineFollowUpDecision {
  const outcome = FrontlineExecutionOutcomeSchema.parse(input.outcome);
  if (outcome.outcome !== "findings") {
    return { action: "stop", reason: `outcome-${outcome.outcome}` };
  }

  const dispositionState = validateDispositionState(input.dispositionState);
  if (dispositionState.state !== "approved") throw new Error("frontline follow-up requires approved dispositions");
  const { dispositionSet } = dispositionState;
  if (dispositionSet.targetId !== outcome.target.targetId
    || dispositionSet.findings.length !== outcome.findings.length
    || !dispositionSet.findings.every((item) => {
      const finding = outcome.findings.find((candidate) => candidate.findingId === item.findingId);
      return finding !== undefined
        && item.sourceIdentity === outcome.source.sourceId
        && item.locus === finding.locus
        && item.severity === finding.severity
        && item.nit === finding.nit;
    })) {
    throw new Error("approved dispositions do not match the frontline outcome");
  }

  const materialFix = dispositionSet.findings.some((item) =>
    item.disposition === "fix" && (item.severity === "major" || item.severity === "blocker"));
  if (!materialFix) return { action: "stop", reason: "no-approved-material-fix" };
  if (outcome.pass >= outcome.maxPasses) return { action: "stop", reason: "pass-cap-exhausted" };

  const changedTarget = ReviewTargetSchema.parse(input.changedTarget);
  if (changedTarget.targetId === outcome.target.targetId) {
    return { action: "stop", reason: "target-unchanged" };
  }
  return { action: "follow-up", pass: 2, target: changedTarget };
}
