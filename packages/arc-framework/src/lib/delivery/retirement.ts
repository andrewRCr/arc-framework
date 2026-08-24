/** Exact retirement of completed delivery plan and state records. */

import type { DeliveryHostRequestObservation } from "./host.js";
import type { DeliveryPlanStore, DeliveryStateStore } from "./ports.js";
import type { DeliveryPlanV1, DeliveryStateV1 } from "./schema.js";
import { SlugSchema, type CanonicalDigest } from "../kernel/index.js";
import { validateDeliveryStateAgainstPlan } from "./state.js";

type DeliveryRefObservation =
  | { readonly status: "absent" }
  | { readonly status: "observed"; readonly head: string }
  | { readonly status: "refused"; readonly reason?: string };

export interface DeliveryRetirementDependencies {
  readonly planStore: Pick<DeliveryPlanStore<DeliveryPlanV1>, "enumerateCurrent" | "removeCurrent">;
  readonly stateStore: Pick<DeliveryStateStore<DeliveryStateV1>, "read" | "remove">;
  readonly observeLocalRef: (ref: string) => Promise<DeliveryRefObservation>;
  readonly observeRemoteRef: (ref: string) => Promise<DeliveryRefObservation>;
  readonly readTerminalRequest: (
    repository: string,
    binding: NonNullable<DeliveryStateV1["members"][number]["changeRequest"]>,
  ) => Promise<DeliveryHostRequestObservation>;
}

export type DeliveryTerminalSettlementResult =
  | { readonly status: "settled" }
  | { readonly status: "blocked"; readonly reason: "terminal-unsettled" };

export type DeliveryRetirementResult =
  | { readonly status: "retired"; readonly planIds: readonly string[] }
  | { readonly status: "blocked"; readonly reason: string; readonly planId?: string; readonly deliverableId?: string };

/**
 * Verify the exact terminal host request bound by one delivery state.
 *
 * @param input - Explicit repository identity and the state carrying terminal coordinates.
 * @param readTerminalRequest - Fresh host observation boundary.
 * @returns Exact settlement or a closed terminal refusal.
 */
export async function verifyDeliveryTerminalSettlement(
  input: { readonly state: DeliveryStateV1; readonly repository: string },
  readTerminalRequest: DeliveryRetirementDependencies["readTerminalRequest"],
): Promise<DeliveryTerminalSettlementResult> {
  const terminal = input.state.members.at(-1);
  const targetRef = input.state.target?.ref;
  if (terminal?.ref === null || terminal?.ref === undefined
    || terminal.changeRequest === null || terminal.coordinates === null
    || targetRef === undefined) {
    return { status: "blocked", reason: "terminal-unsettled" };
  }
  const observed = await readTerminalRequest(input.repository, terminal.changeRequest);
  const request = observed.status === "observed" ? observed.request : null;
  return request !== null
    && request.binding.providerId === terminal.changeRequest.providerId
    && request.binding.changeRequestId === terminal.changeRequest.changeRequestId
    && request.repository === input.repository
    && request.headRepository === input.repository
    && request.headRef === terminal.ref.replace(/^refs\/heads\//u, "")
    && request.headSha === terminal.coordinates.head
    && request.baseRef === targetRef.replace(/^refs\/heads\//u, "")
    && request.state !== "open"
    ? { status: "settled" }
    : { status: "blocked", reason: "terminal-unsettled" };
}

/** Retire one completed delivery record set selected by explicit work-unit identity. */
export async function retireCompletedDeliveryRecords(
  input: { readonly workUnitId: string; readonly repository: string },
  dependencies: DeliveryRetirementDependencies,
): Promise<DeliveryRetirementResult> {
  if (!SlugSchema.safeParse(input.workUnitId).success || input.repository.trim() === "") {
    return { status: "blocked", reason: "identity-invalid" };
  }
  const enumerated = await dependencies.planStore.enumerateCurrent();
  if (enumerated.status === "refused") {
    return { status: "blocked", reason: `plan-${enumerated.reason}` };
  }
  const plans = enumerated.value.filter((plan) => plan.workUnitId === input.workUnitId);
  if (plans.length === 0) return { status: "retired", planIds: [] };

  const records: Array<{ plan: DeliveryPlanV1; state: DeliveryStateV1; revision: number }> = [];
  for (const plan of plans) {
    const read = await dependencies.stateStore.read(plan.planId);
    if (read.status === "refused") {
      return { status: "blocked", reason: `state-${read.reason}`, planId: plan.planId };
    }
    if (read.value !== null) {
      records.push({ plan, state: read.value.value, revision: read.value.revision });
    }
  }
  if (records.length > 1) return { status: "blocked", reason: "multiple-bound-states" };

  const [bound] = records;
  if (bound !== undefined) {
    if (validateDeliveryStateAgainstPlan(bound.state, bound.plan).status === "refused") {
      return { status: "blocked", reason: "state-plan-mismatch", planId: bound.plan.planId };
    }
    if (bound.state.activeOperation !== null) {
      return { status: "blocked", reason: "operation-active", planId: bound.plan.planId };
    }
    for (const member of bound.state.members.slice(0, -1)) {
      if (member.ref === null || member.coordinates === null) {
        return {
          status: "blocked",
          reason: "member-binding-missing",
          planId: bound.plan.planId,
          deliverableId: member.deliverableId,
        };
      }
      const [local, remote] = await Promise.all([
        dependencies.observeLocalRef(member.ref),
        dependencies.observeRemoteRef(member.ref),
      ]);
      if (local.status === "refused" || remote.status === "refused") {
        return {
          status: "blocked",
          reason: "member-ref-observation-refused",
          planId: bound.plan.planId,
          deliverableId: member.deliverableId,
        };
      }
      if (local.status === "observed" || remote.status === "observed") {
        return {
          status: "blocked",
          reason: "member-ref-present",
          planId: bound.plan.planId,
          deliverableId: member.deliverableId,
        };
      }
    }

    const terminal = await verifyDeliveryTerminalSettlement(
      { state: bound.state, repository: input.repository },
      dependencies.readTerminalRequest,
    );
    if (terminal.status === "blocked") {
      return { ...terminal, planId: bound.plan.planId };
    }

    const removedState = await dependencies.stateStore.remove(bound.plan.planId, bound.revision);
    if (removedState.status === "refused") {
      return { status: "blocked", reason: `state-${removedState.reason}`, planId: bound.plan.planId };
    }
  }

  for (const plan of plans) {
    const removedPlan = await dependencies.planStore.removeCurrent(
      plan.planId,
      plan.planDigest as CanonicalDigest,
    );
    if (removedPlan.status === "refused") {
      return { status: "blocked", reason: `plan-${removedPlan.reason}`, planId: plan.planId };
    }
  }
  return { status: "retired", planIds: plans.map((plan) => plan.planId) };
}
