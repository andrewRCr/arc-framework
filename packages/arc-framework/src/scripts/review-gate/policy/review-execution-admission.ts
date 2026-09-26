/** Live standard-lane capacity admission at a producer effect boundary. */

import {
  ReviewCeilingOverrideSchema,
  ReviewLaneJudgmentSchema,
  resolveReviewPolicy,
  type ReviewCeilingOverride,
  type ReviewLaneJudgment,
  type ReviewPolicyCommandRequest,
  type ReviewPolicyRequest,
  type ReviewResolveEnvelope,
} from "./review-policy-driver.js";
import type { ReviewAdditionalPassAuthorization } from "./review-additional-pass.js";

interface StandardExecutionInput {
  readonly target: ReviewPolicyRequest["target"];
  readonly frontlineActive: boolean;
  readonly standardReview: ReviewPolicyRequest["standardReview"];
  readonly completedPasses: number;
  readonly attempts: ReviewPolicyCommandRequest["attempts"];
  readonly sources: readonly string[];
  readonly maxPasses: number;
  readonly expectedSourceId: string;
  readonly expectedNextAction: "local-prepare" | "hosted-request";
  readonly judgment?: ReviewLaneJudgment;
  readonly ceilingOverride?: ReviewCeilingOverride;
  readonly additionalPassAuthorization?: ReviewAdditionalPassAuthorization;
}

function sameAdditionalPassAuthority(
  full: ReviewAdditionalPassAuthorization,
  targetless: NonNullable<ReviewLaneJudgment["additionalPassAuthorization"]>,
): boolean {
  return full.target.headSha === targetless.headSha
    && full.precedingProducerId === targetless.precedingProducerId
    && full.completedPasses === targetless.completedPasses
    && full.nextPass === targetless.nextPass;
}

function assertConsistentCeilingAuthority(
  supplied: ReviewCeilingOverride | undefined,
  judgment: ReviewLaneJudgment | undefined,
): void {
  if (supplied !== undefined && judgment?.ceilingOverride !== undefined
    && (supplied.exhaustedPassCount !== judgment.ceilingOverride.exhaustedPassCount
      || supplied.nextPass !== judgment.ceilingOverride.nextPass)) {
    throw new Error("Full and targetless review ceiling authority disagree.");
  }
}

function assertConsistentAdditionalAuthority(
  supplied: ReviewAdditionalPassAuthorization | undefined,
  judgment: ReviewLaneJudgment | undefined,
): void {
  const targetless = judgment?.additionalPassAuthorization;
  if (supplied !== undefined && targetless !== undefined
    && !sameAdditionalPassAuthority(supplied, targetless)) {
    throw new Error("Full and targetless additional review authority disagree.");
  }
}

function bindJudgment(input: StandardExecutionInput) {
  const judgment = input.judgment === undefined
    ? undefined : ReviewLaneJudgmentSchema.parse(input.judgment);
  const suppliedCeiling = input.ceilingOverride === undefined
    ? undefined : ReviewCeilingOverrideSchema.parse(input.ceilingOverride);
  assertConsistentCeilingAuthority(suppliedCeiling, judgment);
  const ceilingOverride = suppliedCeiling ?? (judgment?.ceilingOverride === undefined
    ? undefined : { ...judgment.ceilingOverride, target: input.target, lane: "standard" as const });
  const additional = judgment?.additionalPassAuthorization;
  assertConsistentAdditionalAuthority(input.additionalPassAuthorization, judgment);
  const additionalPassAuthorization = input.additionalPassAuthorization ?? (additional === undefined
    ? undefined : {
        target: { ...input.target, headSha: additional.headSha },
        lane: "standard" as const,
        precedingProducerId: additional.precedingProducerId,
        completedPasses: additional.completedPasses,
        nextPass: additional.nextPass,
      });
  return { judgment, ceilingOverride, additionalPassAuthorization };
}

/**
 * Require the exact current driver action and source before spending review capacity.
 *
 * @param input - Live progress, configuration, judgment, and expected producer.
 * @returns The ready policy resolution for that exact producer.
 */
export function assertStandardReviewExecutionAdmission(
  input: StandardExecutionInput,
): Extract<ReviewResolveEnvelope, { state: "ready" }> {
  const { judgment, ceilingOverride, additionalPassAuthorization } = bindJudgment(input);
  const resolution = resolveReviewPolicy({
    schemaVersion: 1,
    target: input.target,
    lane: "standard",
    frontlineActive: input.frontlineActive,
    standardReview: input.standardReview,
    completedPasses: input.completedPasses,
    attempts: input.attempts,
    sources: input.sources,
    maxPasses: input.maxPasses,
    ...(judgment?.scopeMode === undefined ? {}
      : { scopeSelection: { mode: judgment.scopeMode, target: input.target } }),
    ...(judgment?.invocation === undefined ? {} : { invocation: judgment.invocation }),
    ...(ceilingOverride === undefined ? {} : { ceilingOverride }),
    ...(additionalPassAuthorization === undefined ? {} : { additionalPassAuthorization }),
    ...(judgment?.terminus === undefined ? {} : { terminus: judgment.terminus }),
  });
  if (resolution.state !== "ready" || resolution.nextAction !== input.expectedNextAction) {
    const reason = resolution.state === "invalid-override" ? `/${resolution.payload.reason}` : "";
    throw new Error(`Review capacity lacks standard-review driver admission `
      + `(${resolution.state}/${resolution.nextAction}${reason}).`);
  }
  if (resolution.payload.sourceId !== input.expectedSourceId) {
    throw new Error(`Review source \`${input.expectedSourceId}\` is not driver-admissible; `
      + `the standard lane requires \`${resolution.payload.sourceId}\` next.`);
  }
  return resolution;
}
