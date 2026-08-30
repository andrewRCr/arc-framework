/** Exact delivery evidence carried by a corrective public review continuation. */

import { z } from "zod";

import { canonicalDigest } from "../kernel/index.js";
import {
  DeliveryCanonicalDigestSchema,
  DeliveryPlanIdSchema,
  type DeliveryPlanV1,
  type DeliveryStateV1,
} from "./schema.js";
import { validateDeliveryStateAgainstPlan } from "./state.js";

const PositiveSafeIntegerSchema = z.number().int().positive();

/** Versioned binding from one Candidate boundary to exact current delivery evidence. */
export const DeliveryPublicReviewContinuationV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  semanticsVersion: z.literal("delivery-public-review-continuation/v1"),
  planId: DeliveryPlanIdSchema,
  planRevision: PositiveSafeIntegerSchema,
  planDigest: DeliveryCanonicalDigestSchema,
  stateRevision: PositiveSafeIntegerSchema,
  stateDigest: DeliveryCanonicalDigestSchema,
  memberEvidenceDigest: DeliveryCanonicalDigestSchema,
});
export type DeliveryPublicReviewContinuationV1 = z.infer<
  typeof DeliveryPublicReviewContinuationV1Schema
>;

/** Closed projection result for exact public delivery review evidence. */
export type ProjectDeliveryPublicReviewContinuationResult =
  | { readonly status: "projected"; readonly continuation: DeliveryPublicReviewContinuationV1 }
  | {
      readonly status: "refused";
      readonly reason:
        | "state-incoherent"
        | "state-revision-invalid"
        | "state-not-idle"
        | "member-evidence-incomplete";
    };

/**
 * Project exact plan, state, and member evidence for one public review continuation.
 *
 * @param input - Current canonical plan and revisioned delivery state.
 * @returns The exact continuation binding or a closed refusal.
 */
export function projectDeliveryPublicReviewContinuation(input: {
  readonly plan: DeliveryPlanV1;
  readonly state: DeliveryStateV1;
  readonly stateRevision: number;
}): ProjectDeliveryPublicReviewContinuationResult {
  const coherent = validateDeliveryStateAgainstPlan(input.state, input.plan);
  if (coherent.status === "refused") return { status: "refused", reason: "state-incoherent" };
  const revision = PositiveSafeIntegerSchema.safeParse(input.stateRevision);
  if (!revision.success) return { status: "refused", reason: "state-revision-invalid" };
  if (coherent.state.activeOperation !== null || coherent.state.pendingReviewFixVerification !== null) {
    return { status: "refused", reason: "state-not-idle" };
  }
  if (coherent.state.members.some((member) => member.ref === null
    || member.changeRequest === null
    || member.coordinates === null)) {
    return { status: "refused", reason: "member-evidence-incomplete" };
  }
  return {
    status: "projected",
    continuation: DeliveryPublicReviewContinuationV1Schema.parse({
      schemaVersion: 1,
      semanticsVersion: "delivery-public-review-continuation/v1",
      planId: input.plan.planId,
      planRevision: input.plan.planRevision,
      planDigest: input.plan.planDigest,
      stateRevision: revision.data,
      stateDigest: canonicalDigest(coherent.state),
      memberEvidenceDigest: canonicalDigest(coherent.state.members),
    }),
  };
}

/**
 * Validate a persisted continuation against fresh exact delivery evidence.
 *
 * @param input - Persisted binding plus freshly read plan and state evidence.
 * @returns Current when every binding reproduces exactly; otherwise a closed refusal.
 */
export function validateDeliveryPublicReviewContinuation(input: {
  readonly continuation: unknown;
  readonly plan: DeliveryPlanV1;
  readonly state: DeliveryStateV1;
  readonly stateRevision: number;
}): { readonly status: "current" } | {
  readonly status: "refused";
  readonly reason:
    | "continuation-invalid"
    | "state-incoherent"
    | "state-revision-invalid"
    | "state-not-idle"
    | "member-evidence-incomplete"
    | "plan-mismatch"
    | "state-mismatch"
    | "member-evidence-mismatch";
} {
  const continuation = DeliveryPublicReviewContinuationV1Schema.safeParse(input.continuation);
  if (!continuation.success) return { status: "refused", reason: "continuation-invalid" };
  const projected = projectDeliveryPublicReviewContinuation(input);
  if (projected.status === "refused") return projected;
  if (continuation.data.planId !== projected.continuation.planId
    || continuation.data.planRevision !== projected.continuation.planRevision
    || continuation.data.planDigest !== projected.continuation.planDigest) {
    return { status: "refused", reason: "plan-mismatch" };
  }
  if (continuation.data.stateRevision !== projected.continuation.stateRevision
    || continuation.data.stateDigest !== projected.continuation.stateDigest) {
    return { status: "refused", reason: "state-mismatch" };
  }
  if (continuation.data.memberEvidenceDigest !== projected.continuation.memberEvidenceDigest) {
    return { status: "refused", reason: "member-evidence-mismatch" };
  }
  return { status: "current" };
}
