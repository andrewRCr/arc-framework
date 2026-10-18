/** Unstored instructions for ordinary local prepare on a published singleton's branch. */
import { z } from "zod";
import { CanonicalDigestSchema, SlugSchema } from "../../lib/kernel/index.js";
import { HostedTargetSchema, type HostedRequestEnvelope } from "./hosted/request.js";
import { ReviewLaneJudgmentSchema } from "./policy/review-policy-driver.js";
import { StandardReviewObligationProjectionSchema, type StandardReviewObligationProjection } from "./policy/standard-review-projection-schema.js";

export const SingletonLocalPrepareActionSchema = z.strictObject({
  schemaVersion: z.literal(1), sourceId: z.literal("delegated-agent"), target: HostedTargetSchema,
  lineageBoundary: z.strictObject({ workUnitId: SlugSchema, candidateId: CanonicalDigestSchema }),
  standardReview: StandardReviewObligationProjectionSchema,
  request: z.strictObject({ schemaVersion: z.literal(1), policyJudgment: ReviewLaneJudgmentSchema.optional() }),
});
export type SingletonLocalPrepareAction = z.infer<typeof SingletonLocalPrepareActionSchema>;

/** Compose ordinary prepare input while keeping the exact target and Candidate boundary visible. */
export function projectSingletonLocalPrepareAction(input: {
  readonly target: z.input<typeof HostedTargetSchema>;
  readonly lineageBoundary: { readonly workUnitId: string; readonly candidateId: string };
  readonly standardReview: StandardReviewObligationProjection;
  readonly judgment: Pick<HostedRequestEnvelope, "invocation" | "ceilingOverride" | "additionalPassAuthorization">;
}): SingletonLocalPrepareAction {
  const ceiling = input.judgment.ceilingOverride;
  const additional = input.judgment.additionalPassAuthorization;
  const policyJudgment = {
    ...(input.judgment.invocation === undefined ? {} : { invocation: input.judgment.invocation }),
    ...(ceiling === undefined ? {} : { ceilingOverride: { exhaustedPassCount: ceiling.exhaustedPassCount,
      nextPass: ceiling.nextPass, ...(ceiling.conditionalPassAuthorizationId === undefined ? {}
        : { conditionalPassAuthorizationId: ceiling.conditionalPassAuthorizationId }) } }),
    ...(additional === undefined ? {} : { additionalPassAuthorization: { headSha: additional.target.headSha,
      precedingProducerId: additional.precedingProducerId, completedPasses: additional.completedPasses,
      nextPass: additional.nextPass } }),
  };
  return SingletonLocalPrepareActionSchema.parse({ schemaVersion: 1, sourceId: "delegated-agent", target: input.target,
    lineageBoundary: input.lineageBoundary, standardReview: input.standardReview,
    request: { schemaVersion: 1, ...(Object.keys(policyJudgment).length === 0 ? {} : { policyJudgment }) } });
}
