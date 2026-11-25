/** The Owner's decision before another complete hosted pass on an Errand head changed after its review converged. */

import { z } from "zod";
import { GitObjectIdSchema } from "./core/gate-contract-v2-schema.js";
import { HostedRequestEnvelopeSchema, type HostedRequestEnvelope } from "./hosted/request.js";

/** A complete hosted pass held for the Owner, with the stop that accepts the residual risk instead. */
export const ErrandReviewContinuationDecisionSchema = z.strictObject({
  schemaVersion: z.literal(1),
  kind: z.literal("errand-review-continuation"),
  reviewedHeadSha: GitObjectIdSchema,
  completePasses: z.number().int().positive(),
  maxPasses: z.number().int().positive(),
  choices: z.tuple([z.literal("request-complete-pass"), z.literal("owner-directed-stop")]),
  hostedAction: HostedRequestEnvelopeSchema,
  interactionText: z.string().min(1),
});
export type ErrandReviewContinuationDecision = z.infer<typeof ErrandReviewContinuationDecisionSchema>;

/**
 * Hold the next complete hosted pass for the Owner once the claim's last review converged and the head moved.
 *
 * @param input - The last reviewed head, the claim's pass count, and the hosted request the policy admits.
 * @returns The decision whose `hostedAction` is requested only when the Owner chooses the pass.
 */
export function errandReviewContinuationDecision(input: {
  readonly reviewedHeadSha: string;
  readonly completePasses: number;
  readonly maxPasses: number;
  readonly hostedAction: HostedRequestEnvelope;
}): ErrandReviewContinuationDecision {
  return ErrandReviewContinuationDecisionSchema.parse({
    schemaVersion: 1,
    kind: "errand-review-continuation",
    ...input,
    choices: ["request-complete-pass", "owner-directed-stop"],
    interactionText: `The last review, at ${input.reviewedHeadSha}, converged, and the head has changed since. `
      + `Another complete hosted pass would use ${String(input.completePasses + 1)} of ${String(input.maxPasses)} `
      + "configured passes. Request it, or stop review and accept the unreviewed change as residual risk.",
  });
}
