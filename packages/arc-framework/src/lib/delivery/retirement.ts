/** Exact retirement of completed delivery plan and state records. */

import type { DeliveryHostRequestObservation } from "./host.js";
import type { DeliveryPlanStore, DeliveryStateStore } from "./ports.js";
import { classifyPredecessorRelation, type AncestryAnswer } from "./predecessor-relation.js";
import type { DeliveryPlanV1, DeliveryStateV1 } from "./schema.js";
import type { CanonicalDigest } from "../kernel/index.js";
import { validateDeliveryStateAgainstPlan } from "./state.js";

type DeliveryRefObservation =
  | { readonly status: "absent" }
  | { readonly status: "observed"; readonly head: string }
  | { readonly status: "refused"; readonly reason?: string };

export interface DeliveryRetirementDependencies {
  readonly planStore: Pick<DeliveryPlanStore<DeliveryPlanV1>, "removeCurrent">;
  readonly stateStore: Pick<DeliveryStateStore<DeliveryStateV1>, "read" | "remove">;
  readonly observeLocalRef: (ref: string) => Promise<DeliveryRefObservation>;
  readonly observeRemoteRef: (ref: string) => Promise<DeliveryRefObservation>;
  /**
   * Ancestry between the head a terminal member records and the head the host reports merged.
   *
   * Required rather than optional, because a branch that advanced before merging is the ordinary
   * case here: a caller that omitted the read would go on refusing every such terminal, which is
   * the condition this boundary exists to settle rather than a safe default to fall back on.
   */
  readonly readAncestry: (ancestor: string, descendant: string) => Promise<AncestryAnswer>;
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
 * @param dependencies - Fresh host observation and ancestry boundaries.
 * @returns Exact settlement or a closed terminal refusal.
 */
export async function verifyDeliveryTerminalSettlement(
  input: { readonly state: DeliveryStateV1; readonly repository: string },
  dependencies: Pick<DeliveryRetirementDependencies, "readAncestry" | "readTerminalRequest">,
): Promise<DeliveryTerminalSettlementResult> {
  const terminal = input.state.members.at(-1);
  const targetRef = input.state.target?.ref;
  if (terminal?.ref === null || terminal?.ref === undefined
    || terminal.changeRequest === null || terminal.coordinates === null
    || targetRef === undefined) {
    return { status: "blocked", reason: "terminal-unsettled" };
  }
  const observed = await dependencies.readTerminalRequest(input.repository, terminal.changeRequest);
  if (observed.status !== "observed") return { status: "blocked", reason: "terminal-unsettled" };
  const request = observed.request;
  const relation = classifyPredecessorRelation({
    boundHead: terminal.coordinates.head,
    observedHead: request.headSha,
    boundIsAncestorOfObserved: await dependencies.readAncestry(terminal.coordinates.head, request.headSha),
    // Only the append-only advance is admissible, so the reverse direction is never read. Leaving it
    // unestablished also keeps `diverged` unreachable, which is the one variant carrying the
    // cardinality below, so no count is ever read.
    observedIsAncestorOfBound: "unresolvable",
    mergeBaseCount: 1,
  });
  return request.binding.providerId === terminal.changeRequest.providerId
    && request.binding.changeRequestId === terminal.changeRequest.changeRequestId
    && request.repository === input.repository
    && request.headRepository === input.repository
    && request.headRef === terminal.ref.replace(/^refs\/heads\//u, "")
    && (relation.kind === "unchanged" || relation.kind === "advanced")
    && request.baseRef === targetRef.replace(/^refs\/heads\//u, "")
    && request.state === "merged"
    ? { status: "settled" }
    : { status: "blocked", reason: "terminal-unsettled" };
}

/** Retire one already-authoritatively-selected completed delivery record set. */
export async function retireCompletedDeliveryRecords(
  input: { readonly plans: readonly DeliveryPlanV1[]; readonly repository: string },
  dependencies: DeliveryRetirementDependencies,
): Promise<DeliveryRetirementResult> {
  if (input.repository.trim() === "") {
    return { status: "blocked", reason: "identity-invalid" };
  }
  const plans = input.plans;
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
    if (bound.state.pendingReviewFixVerification !== null) {
      return {
        status: "blocked",
        reason: "pending-review-fix-verification",
        planId: bound.plan.planId,
      };
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
      dependencies,
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
