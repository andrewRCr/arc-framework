/** Bounded material-fix policy for a single frontline follow-up pass. */

import { z } from "zod";

import type { ApprovedDispositionSet } from "../core/disposition-records.js";
import { validateDispositionState } from "../core/dispositions.js";
import { ReviewTargetSchema, type ReviewTarget } from "../core/gate-contract-v2-schema.js";
import { ReviewPassSchema, type ReviewPass } from "../core/review-pass.js";
import { FrontlineExecutionOutcomeSchema } from "./frontline-outcome.js";

export type FrontlineFollowUpDecision =
  | { action: "follow-up"; pass: ReviewPass; target: ReviewTarget }
  | { action: "stop"; reason: string };

const FollowUpAfterFixAdviceSchema = z.strictObject({
    action: z.literal("follow-up-after-fix"),
    pass: ReviewPassSchema,
    maxPasses: ReviewPassSchema,
    nextCommand: z.literal("frontline-resolve"),
  }).refine((advice) => advice.pass <= advice.maxPasses, {
    message: "frontline follow-up pass cannot exceed maxPasses",
    path: ["pass"],
  });

export const FrontlineFollowUpAdviceSchema = z.discriminatedUnion("action", [
  FollowUpAfterFixAdviceSchema,
  z.strictObject({
    action: z.literal("stop"),
    reason: z.string().trim().min(1),
  }),
]);
export type FrontlineFollowUpAdvice = z.infer<typeof FrontlineFollowUpAdviceSchema>;

/** Project follow-up worthwhileness before a fix exists, without creating a durable chain. */
export function projectFrontlineFollowUpAdvice(input: {
  outcome: unknown;
  dispositionState?: ApprovedDispositionSet | null;
}): FrontlineFollowUpAdvice {
  const outcome = FrontlineExecutionOutcomeSchema.parse(input.outcome);
  if (outcome.outcome !== "findings") {
    return { action: "stop", reason: `outcome-${outcome.outcome}` };
  }

  if (input.dispositionState === undefined || input.dispositionState === null) {
    throw new Error("frontline findings follow-up requires approved dispositions");
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
  return {
    action: "follow-up-after-fix",
    pass: outcome.pass + 1,
    maxPasses: outcome.maxPasses,
    nextCommand: "frontline-resolve",
  };
}

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
  const advice = projectFrontlineFollowUpAdvice(input);
  if (advice.action === "stop") return advice;

  const changedTarget = ReviewTargetSchema.parse(input.changedTarget);
  const outcome = FrontlineExecutionOutcomeSchema.parse(input.outcome);
  if (changedTarget.targetId === outcome.target.targetId) {
    return { action: "stop", reason: "target-unchanged" };
  }
  return { action: "follow-up", pass: advice.pass, target: changedTarget };
}
