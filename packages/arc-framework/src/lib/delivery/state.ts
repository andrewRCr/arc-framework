/** Delivery-state codec, plan coherence, and initial external binding. */

import { z } from "zod";

import { canonicalize } from "../kernel/index.js";
import { validateDeliveryPlanRecord } from "./plan.js";
import type { DeliveryPayloadCodec } from "./ports.js";
import {
  DeliveryCanonicalDigestSchema,
  DeliveryChangeRequestV1Schema,
  DeliveryMemberCoordinatesV1Schema,
  DeliveryOpaqueIdSchema,
  DeliveryStateV1Schema,
  type DeliveryPlanV1,
  type DeliveryStateV1,
} from "./schema.js";

/** The exact first external event that turns a current plan into bound state. */
export const DeliveryInitialBindingEventV1Schema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("pushed-ref"),
    deliverableId: DeliveryCanonicalDigestSchema,
    ref: DeliveryOpaqueIdSchema,
    coordinates: DeliveryMemberCoordinatesV1Schema,
  }),
  z.strictObject({
    kind: z.literal("opened-change-request"),
    deliverableId: DeliveryCanonicalDigestSchema,
    changeRequest: DeliveryChangeRequestV1Schema,
  }),
]);
export type DeliveryInitialBindingEventV1 = z.infer<typeof DeliveryInitialBindingEventV1Schema>;

/** Persisted delivery-state payload codec. */
export const DeliveryStateV1Codec: DeliveryPayloadCodec<DeliveryStateV1> = {
  decode: (value) => {
    const parsed = DeliveryStateV1Schema.safeParse(value);
    return parsed.success
      ? { status: "decoded", value: parsed.data }
      : { status: "refused" };
  },
  planId: (value) => value.planId,
};

/** Closed state-to-plan coherence failures. */
export type DeliveryStatePlanCoherenceFailure =
  | "state-invalid"
  | "plan-invalid"
  | "plan-identity-mismatch"
  | "subject-mismatch"
  | "bound-plan-mismatch"
  | "member-sequence-mismatch";

/** Result of proving one state payload coherent with one exact plan revision. */
export type ValidateDeliveryStateAgainstPlanResult =
  | { readonly status: "valid"; readonly state: DeliveryStateV1 }
  | { readonly status: "refused"; readonly reason: DeliveryStatePlanCoherenceFailure };

/** Validate the state subject, bound revision, and ordered member identities against a plan. */
export function validateDeliveryStateAgainstPlan(
  state: unknown,
  plan: DeliveryPlanV1,
): ValidateDeliveryStateAgainstPlanResult {
  const parsedState = DeliveryStateV1Schema.safeParse(state);
  if (!parsedState.success) return { status: "refused", reason: "state-invalid" };
  if (validateDeliveryPlanRecord(plan).status === "refused") {
    return { status: "refused", reason: "plan-invalid" };
  }
  if (parsedState.data.planId !== plan.planId) {
    return { status: "refused", reason: "plan-identity-mismatch" };
  }
  if (parsedState.data.workUnitId !== plan.workUnitId) {
    return { status: "refused", reason: "subject-mismatch" };
  }
  if (parsedState.data.boundPlan.planRevision !== plan.planRevision
    || parsedState.data.boundPlan.planDigest !== plan.planDigest) {
    return { status: "refused", reason: "bound-plan-mismatch" };
  }
  if (canonicalize(parsedState.data.members.map((member) => member.deliverableId))
    !== canonicalize(plan.members.map((member) => member.deliverableId))) {
    return { status: "refused", reason: "member-sequence-mismatch" };
  }
  return { status: "valid", state: parsedState.data };
}

/** Closed failures while creating the first bound state for a plan. */
export type ConstructInitialDeliveryStateFailure =
  | "plan-invalid"
  | "binding-invalid"
  | "unknown-deliverable";

/** Result of constructing state from one observed external binding event. */
export type ConstructInitialDeliveryStateResult =
  | { readonly status: "constructed"; readonly state: DeliveryStateV1 }
  | { readonly status: "refused"; readonly reason: ConstructInitialDeliveryStateFailure };

/** Build a complete plan-ordered state record from its first observed external binding. */
export function constructInitialDeliveryState(
  plan: DeliveryPlanV1,
  event: unknown,
): ConstructInitialDeliveryStateResult {
  if (validateDeliveryPlanRecord(plan).status === "refused") {
    return { status: "refused", reason: "plan-invalid" };
  }
  const parsedEvent = DeliveryInitialBindingEventV1Schema.safeParse(event);
  if (!parsedEvent.success) return { status: "refused", reason: "binding-invalid" };
  if (!plan.members.some((member) => member.deliverableId === parsedEvent.data.deliverableId)) {
    return { status: "refused", reason: "unknown-deliverable" };
  }
  const parsedState = DeliveryStateV1Schema.safeParse({
    schemaVersion: 1,
    semanticsVersion: "delivery-state/v1",
    planId: plan.planId,
    workUnitId: plan.workUnitId,
    boundPlan: {
      planRevision: plan.planRevision,
      planDigest: plan.planDigest,
    },
    target: null,
    members: plan.members.map((member) => ({
      deliverableId: member.deliverableId,
      ref: parsedEvent.data.kind === "pushed-ref"
        && parsedEvent.data.deliverableId === member.deliverableId
        ? parsedEvent.data.ref
        : null,
      changeRequest: parsedEvent.data.kind === "opened-change-request"
        && parsedEvent.data.deliverableId === member.deliverableId
        ? parsedEvent.data.changeRequest
        : null,
      coordinates: parsedEvent.data.kind === "pushed-ref"
        && parsedEvent.data.deliverableId === member.deliverableId
        ? parsedEvent.data.coordinates
        : null,
    })),
    activeOperation: null,
    pendingReviewFixVerification: null,
  });
  if (!parsedState.success) return { status: "refused", reason: "binding-invalid" };
  return { status: "constructed", state: parsedState.data };
}

/** Closed failures while carrying accepted mutable bindings onto a successor plan. */
export type RebindDeliveryStateFailure =
  | "state-invalid"
  | "plan-invalid"
  | "plan-identity-mismatch"
  | "subject-mismatch"
  | "operation-active"
  | "pending-review-fix-verification"
  | "bound-member-missing";

/** Result of projecting preserved current bindings into one accepted successor plan. */
export type RebindDeliveryStateResult =
  | { readonly status: "rebound"; readonly state: DeliveryStateV1 }
  | { readonly status: "refused"; readonly reason: RebindDeliveryStateFailure };

/**
 * Rebind current mutable state to a classified successor without copying intent into state.
 *
 * @param state - Exact receipt-pinned state value to carry forward.
 * @param candidate - Accepted successor plan that becomes the new binding authority.
 * @returns Candidate-ordered state with existing bindings preserved by deliverable identity.
 */
export function rebindDeliveryStateToPlan(
  state: unknown,
  candidate: DeliveryPlanV1,
): RebindDeliveryStateResult {
  const parsedState = DeliveryStateV1Schema.safeParse(state);
  if (!parsedState.success) return { status: "refused", reason: "state-invalid" };
  if (validateDeliveryPlanRecord(candidate).status === "refused") {
    return { status: "refused", reason: "plan-invalid" };
  }
  if (parsedState.data.planId !== candidate.planId) {
    return { status: "refused", reason: "plan-identity-mismatch" };
  }
  if (parsedState.data.workUnitId !== candidate.workUnitId) {
    return { status: "refused", reason: "subject-mismatch" };
  }
  if (parsedState.data.activeOperation !== null) {
    return { status: "refused", reason: "operation-active" };
  }
  if (parsedState.data.pendingReviewFixVerification !== null) {
    return { status: "refused", reason: "pending-review-fix-verification" };
  }

  const candidateIds = new Set(candidate.members.map((member) => member.deliverableId));
  if (parsedState.data.members.some((member) => !candidateIds.has(member.deliverableId)
    && (member.ref !== null || member.changeRequest !== null || member.coordinates !== null))) {
    return { status: "refused", reason: "bound-member-missing" };
  }
  const currentMembers = new Map(parsedState.data.members.map((member) => [member.deliverableId, member]));
  const rebound = DeliveryStateV1Schema.safeParse({
    ...parsedState.data,
    boundPlan: {
      planRevision: candidate.planRevision,
      planDigest: candidate.planDigest,
    },
    members: candidate.members.map((member) => currentMembers.get(member.deliverableId) ?? {
      deliverableId: member.deliverableId,
      ref: null,
      changeRequest: null,
      coordinates: null,
    }),
  });
  if (!rebound.success) return { status: "refused", reason: "state-invalid" };
  return { status: "rebound", state: rebound.data };
}
