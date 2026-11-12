/** Pure current-position derivation from a delivery plan, state, and fresh facts. */

import { z } from "zod";

import { canonicalize, type CanonicalDigest } from "../kernel/index.js";
import { validateDeliveryPlanRecord } from "./plan.js";
import {
  DeliveryCanonicalDigestSchema,
  DeliveryOperationSnapshotV1Schema,
  DeliveryPlanV1Schema,
  DeliveryStateV1Schema,
  DeliveryTerminalAuthoringMovementV1Schema,
  type DeliveryPlanV1,
  type DeliveryStateV1,
} from "./schema.js";
import { planDeliverySuffixRefresh } from "./refresh.js";
import { validateDeliveryStateAgainstPlan } from "./state.js";

/** Fresh exact positions plus the host-derived landed member sequence. */
export const DeliveryPositionFactsV1Schema = DeliveryOperationSnapshotV1Schema.extend({
  landedDeliverableIds: z.array(DeliveryCanonicalDigestSchema).refine(
    (ids) => new Set(ids).size === ids.length,
    "landed deliverables must be distinct",
  ),
  targetMovement: z.literal("append-only").optional(),
  terminalAuthoringMovement: DeliveryTerminalAuthoringMovementV1Schema.optional(),
});
export type DeliveryPositionFactsV1 = z.infer<typeof DeliveryPositionFactsV1Schema>;

/**
 * Resolve the exact predecessor head for one observed member.
 *
 * @param facts - Fresh exact delivery-position facts.
 * @param memberIndex - Zero-based member position in plan order.
 * @returns The predecessor head, or null when an unlanded predecessor has no coordinates.
 */
export function resolveDeliveryPredecessorHead(
  facts: DeliveryPositionFactsV1,
  memberIndex: number,
): string | null {
  const targetHead = facts.target?.coordinates?.head ?? null;
  if (memberIndex === 0) return targetHead;
  const previous = facts.members[memberIndex - 1];
  if (previous === undefined) return null;
  if (facts.landedDeliverableIds.includes(previous.deliverableId)) return targetHead;
  return previous.coordinates?.head ?? null;
}

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

/** Workflow route derived from one exact current delivery position. */
export type RouteDeliveryPositionResult =
  | {
      readonly status: "position";
      readonly position: DeliveryPositionV1;
      readonly nextAction: "review-member" | "teardown-member" | "terminal-handoff";
      readonly selectedDeliverableId?: CanonicalDigest;
      readonly plannedSuffix?: readonly string[];
      readonly recommendedActionText?: string;
    }
  | { readonly status: "refused"; readonly reason: DeriveDeliveryPositionFailure | "position-mismatch" };

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

/** The sole coordinate movement tolerated by suffix-reconciliation recognition. */
export type RecognizeDeliverySuffixRetargetResult =
  | {
      readonly status: "recognized";
      readonly deliverableId: CanonicalDigest;
      readonly before: z.infer<typeof DeliveryOperationSnapshotV1Schema>;
      readonly requested: z.infer<typeof DeliveryOperationSnapshotV1Schema>;
    }
  | { readonly status: "refused"; readonly reason: DeriveDeliveryPositionFailure };

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
  const landedPrefix = planDeliverableIds.slice(0, landedCount);
  const firstUnlanded = planDeliverableIds[landedCount];
  const boundSuffix = parsedState.data.members
    .slice(landedCount)
    .filter((member) => member.ref !== null || member.changeRequest !== null || member.coordinates !== null)
    .map((member) => member.deliverableId);
  return {
    status: "derived",
    position: {
      landedPrefix,
      firstUnlanded: firstUnlanded ?? null,
      boundSuffix,
    },
  };
}

/** Derive the next workflow action from current plan, state, and fresh position facts. */
export function routeDeliveryPosition(
  plan: DeliveryPlanV1,
  state: DeliveryStateV1,
  facts: DeliveryPositionFactsV1,
): RouteDeliveryPositionResult {
  const derived = deriveDeliveryPosition(plan, state, facts);
  if (derived.status !== "derived") return derived;
  const refreshDisclosure = facts.targetMovement === "append-only"
    ? planDeliverySuffixRefresh({
        plan,
        landedPrefix: derived.position.landedPrefix,
        trigger: { kind: "base-moved" },
        providerMovement: "stable",
      })
    : null;
  const disclosedRefresh = refreshDisclosure?.status === "disclosed"
    ? {
        plannedSuffix: refreshDisclosure.plannedSuffix,
        recommendedActionText: refreshDisclosure.recommendedActionText,
      }
    : {};
  const terminal = plan.members.at(-1);
  if (derived.position.firstUnlanded === null || plan.members.length === 1) {
    return {
      status: "position",
      position: derived.position,
      nextAction: "terminal-handoff",
      ...disclosedRefresh,
    };
  }
  if (derived.position.firstUnlanded === terminal?.deliverableId) {
    const highest = plan.members.at(-2);
    if (highest === undefined) return { status: "refused", reason: "position-mismatch" };
    return {
      status: "position",
      position: derived.position,
      nextAction: "teardown-member",
      selectedDeliverableId: highest.deliverableId,
      ...disclosedRefresh,
    };
  }
  return {
    status: "position",
    position: derived.position,
    nextAction: "review-member",
    selectedDeliverableId: derived.position.firstUnlanded,
    ...disclosedRefresh,
  };
}

/**
 * Recognize exactly one already-observed first-suffix retarget without weakening ordinary position reads.
 *
 * @param plan - Current authored plan revision
 * @param state - Current exact delivery state with no active operation
 * @param facts - Fresh facts in which only the first unlanded member may have moved
 * @returns Exact before/requested snapshots for a post-observation rewrite reservation
 */
export function recognizeDeliverySuffixRetarget(
  plan: DeliveryPlanV1,
  state: DeliveryStateV1,
  facts: unknown,
): RecognizeDeliverySuffixRetargetResult {
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
  const ids = plan.members.map((member) => member.deliverableId);
  if (canonicalize(parsedFacts.data.members.map((member) => member.deliverableId)) !== canonicalize(ids)) {
    return { status: "refused", reason: "member-sequence-invalid" };
  }
  const landedCount = parsedFacts.data.landedDeliverableIds.length;
  if (landedCount < 1 || landedCount >= ids.length
    || canonicalize(parsedFacts.data.landedDeliverableIds) !== canonicalize(ids.slice(0, landedCount))) {
    return { status: "refused", reason: "landed-sequence-invalid" };
  }
  if (canonicalize(parsedFacts.data.target) !== canonicalize(parsedState.data.target)) {
    return { status: "refused", reason: "coordinates-moved" };
  }
  const candidate = parsedState.data.members[landedCount];
  const observed = parsedFacts.data.members[landedCount];
  const target = parsedState.data.target;
  if (candidate === undefined || observed === undefined || candidate.coordinates === null
    || observed.coordinates === null || target?.coordinates == null
    || candidate.ref !== observed.ref
    || canonicalize(candidate.changeRequest) !== canonicalize(observed.changeRequest)
    || observed.coordinates.base !== target.coordinates.head
    || canonicalize(candidate.coordinates) === canonicalize(observed.coordinates)) {
    return { status: "refused", reason: "coordinates-moved" };
  }
  for (const [index, member] of parsedState.data.members.entries()) {
    if (index === landedCount) continue;
    const fresh = parsedFacts.data.members[index];
    if (fresh === undefined || canonicalize({
      deliverableId: member.deliverableId,
      ref: member.ref,
      changeRequest: member.changeRequest,
      coordinates: member.coordinates,
    }) !== canonicalize(fresh)) return { status: "refused", reason: "coordinates-moved" };
  }
  const before = {
    target: parsedState.data.target,
    members: [{
      deliverableId: candidate.deliverableId,
      ref: candidate.ref,
      changeRequest: candidate.changeRequest,
      coordinates: candidate.coordinates,
    }],
  };
  const requested = {
    target: parsedState.data.target,
    members: [observed],
  };
  return {
    status: "recognized",
    deliverableId: candidate.deliverableId,
    before,
    requested,
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
