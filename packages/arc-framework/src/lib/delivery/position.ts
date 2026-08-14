/** Pure current-position derivation from a delivery plan, state, and fresh facts. */

import { z } from "zod";

import { canonicalize, type CanonicalDigest } from "../kernel/index.js";
import { validateDeliveryPlanRecord } from "./plan.js";
import {
  DeliveryCanonicalDigestSchema,
  DeliveryOperationSnapshotV1Schema,
  DeliveryPlanV1Schema,
  DeliveryStateV1Schema,
  type DeliveryPlanV1,
  type DeliveryStateV1,
} from "./schema.js";
import { validateDeliveryStateAgainstPlan } from "./state.js";

/** Fresh exact positions plus the host-derived landed member sequence. */
export const DeliveryPositionFactsV1Schema = DeliveryOperationSnapshotV1Schema.extend({
  landedDeliverableIds: z.array(DeliveryCanonicalDigestSchema).refine(
    (ids) => new Set(ids).size === ids.length,
    "landed deliverables must be distinct",
  ),
});
export type DeliveryPositionFactsV1 = z.infer<typeof DeliveryPositionFactsV1Schema>;

/** Current labels derived from plan order, state bindings, and host facts. */
export interface DeliveryPositionV1 {
  readonly landedPrefix: readonly CanonicalDigest[];
  readonly firstUnlanded: CanonicalDigest | null;
  readonly boundSuffix: readonly CanonicalDigest[];
}

/** Closed failures while deriving current delivery position. */
export type DeriveDeliveryPositionFailure =
  | "plan-invalid"
  | "state-invalid"
  | "stale-plan-binding"
  | "operation-active"
  | "facts-invalid"
  | "member-sequence-invalid"
  | "landed-sequence-invalid"
  | "coordinates-moved";

/** Result of deriving current delivery position from fresh facts. */
export type DeriveDeliveryPositionResult =
  | { readonly status: "derived"; readonly position: DeliveryPositionV1 }
  | { readonly status: "refused"; readonly reason: DeriveDeliveryPositionFailure };

/** Closed failures while checking whether one selected member may advance. */
export type AssessDeliveryMemberReadinessFailure = DeriveDeliveryPositionFailure
  | "unknown-deliverable"
  | "member-out-of-position"
  | "member-unbound"
  | "landability-mismatch";

/** Result of deriving position and checking one selected member. */
export type AssessDeliveryMemberReadinessResult =
  | { readonly status: "ready"; readonly position: DeliveryPositionV1 }
  | { readonly status: "blocked"; readonly reason: AssessDeliveryMemberReadinessFailure };

/**
 * Derive current delivery labels without persisting aggregate status.
 *
 * @param plan - Current authored plan revision.
 * @param state - Current mutable delivery state.
 * @param facts - Fresh exact member positions and landed sequence.
 * @returns Derived position labels or a closed refusal.
 */
export function deriveDeliveryPosition(
  plan: DeliveryPlanV1,
  state: DeliveryStateV1,
  facts: unknown,
): DeriveDeliveryPositionResult {
  if (validateDeliveryPlanRecord(plan).status === "refused") {
    return { status: "refused", reason: "plan-invalid" };
  }
  const parsedState = DeliveryStateV1Schema.safeParse(state);
  if (!parsedState.success) return { status: "refused", reason: "state-invalid" };
  if (validateDeliveryStateAgainstPlan(parsedState.data, plan).status === "refused") {
    return { status: "refused", reason: "stale-plan-binding" };
  }
  if (parsedState.data.activeOperation !== null) {
    return { status: "refused", reason: "operation-active" };
  }
  const parsedFacts = DeliveryPositionFactsV1Schema.safeParse(facts);
  if (!parsedFacts.success) return { status: "refused", reason: "facts-invalid" };

  const planDeliverableIds = plan.members.map((member) => member.deliverableId);
  if (canonicalize(parsedFacts.data.members.map((member) => member.deliverableId))
    !== canonicalize(planDeliverableIds)) {
    return { status: "refused", reason: "member-sequence-invalid" };
  }
  if (parsedFacts.data.landedDeliverableIds.length > planDeliverableIds.length
    || canonicalize(parsedFacts.data.landedDeliverableIds)
      !== canonicalize(planDeliverableIds.slice(0, parsedFacts.data.landedDeliverableIds.length))) {
    return { status: "refused", reason: "landed-sequence-invalid" };
  }
  const storedPositions = {
    target: parsedState.data.target,
    members: parsedState.data.members.map((member) => ({
      deliverableId: member.deliverableId,
      ref: member.ref,
      changeRequest: member.changeRequest,
      coordinates: member.coordinates,
    })),
  };
  const observedPositions = {
    target: parsedFacts.data.target,
    members: parsedFacts.data.members,
  };
  if (canonicalize(observedPositions) !== canonicalize(storedPositions)) {
    return { status: "refused", reason: "coordinates-moved" };
  }

  const landedCount = parsedFacts.data.landedDeliverableIds.length;
  const landedPrefix = planDeliverableIds.slice(0, landedCount) as CanonicalDigest[];
  const firstUnlanded = planDeliverableIds[landedCount] as CanonicalDigest | undefined;
  const boundSuffix = parsedState.data.members
    .slice(landedCount)
    .filter((member) => member.ref !== null || member.changeRequest !== null || member.coordinates !== null)
    .map((member) => member.deliverableId as CanonicalDigest);
  return {
    status: "derived",
    position: {
      landedPrefix,
      firstUnlanded: firstUnlanded ?? null,
      boundSuffix,
    },
  };
}

/**
 * Check one selected member against current derived position and plan landability.
 *
 * @param plan - Current authored plan revision.
 * @param state - Current mutable delivery state.
 * @param facts - Fresh exact member positions and landed sequence.
 * @param selectedDeliverableId - Member the caller proposes to advance.
 * @returns Current derived position or a closed block.
 */
export function assessDeliveryMemberReadiness(
  plan: DeliveryPlanV1,
  state: DeliveryStateV1,
  facts: unknown,
  selectedDeliverableId: string,
): AssessDeliveryMemberReadinessResult {
  const parsedPlan = DeliveryPlanV1Schema.safeParse(plan);
  if (!parsedPlan.success) return { status: "blocked", reason: "plan-invalid" };
  const selected = parsedPlan.data.members.find(
    (member) => member.deliverableId === selectedDeliverableId,
  );
  if (selected === undefined) return { status: "blocked", reason: "unknown-deliverable" };
  const validation = validateDeliveryPlanRecord(parsedPlan.data);
  if (validation.status === "refused") {
    const selectedIndex = parsedPlan.data.members.indexOf(selected);
    const selectedLacksLandability = validation.issues.some((issue) => (
      issue.code === "stack-member-not-landable" && issue.path?.[1] === selectedIndex
    ));
    return selectedLacksLandability
      ? { status: "blocked", reason: "landability-mismatch" }
      : { status: "blocked", reason: "plan-invalid" };
  }
  const derived = deriveDeliveryPosition(validation.plan, state, facts);
  if (derived.status === "refused") {
    return { status: "blocked", reason: derived.reason };
  }
  if (derived.position.firstUnlanded !== selectedDeliverableId) {
    return { status: "blocked", reason: "member-out-of-position" };
  }
  if (!derived.position.boundSuffix.includes(selectedDeliverableId)) {
    return { status: "blocked", reason: "member-unbound" };
  }
  return { status: "ready", position: derived.position };
}
