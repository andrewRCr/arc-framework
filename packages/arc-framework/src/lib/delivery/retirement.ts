/** Exact retirement of completed delivery plan and state records. */

import type { DeliveryHostRequestObservation } from "./host.js";
import type { DeliveryPlanStore, DeliveryStateStore } from "./ports.js";
import { classifyPredecessorRelation, type AncestryAnswer } from "./predecessor-relation.js";
import type { DeliveryPlanV1, DeliveryStateV1 } from "./schema.js";
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

/**
 * Why one terminal is unsettled, naming the condition that holds rather than that some condition does.
 *
 * Every name carries the `terminal-` prefix, which is the shape that keeps these apart from the reasons
 * closeout raises on its own behalf: it passes a terminal reason through bare and prefixes its own, so the
 * two sets share one namespace and only the prefix tells a caller which reader spoke.
 */
export type DeliveryTerminalUnsettledReason =
  | "terminal-member-absent"
  | "terminal-ref-unbound"
  | "terminal-request-unbound"
  | "terminal-coordinates-unbound"
  | "terminal-target-unbound"
  | "terminal-request-unobserved"
  | "terminal-provider-mismatch"
  | "terminal-request-mismatch"
  | "terminal-repository-mismatch"
  | "terminal-head-repository-mismatch"
  | "terminal-head-ref-mismatch"
  | "terminal-head-moved"
  | "terminal-base-ref-mismatch"
  | "terminal-not-merged";

/**
 * The act that clears one terminal condition, named so a caller dispatches on it rather than on prose.
 *
 * No act is a command ARC can run — each is a repair to the record the caller owns or a change on the host —
 * so the automated command is always absent here, and the kind is the whole of what a caller dispatches on.
 */
export interface DeliveryTerminalRemedy {
  readonly kind:
    | "delivery-record-repair-required"
    | "delivery-member-rebind-required"
    | "delivery-member-publication-required"
    | "delivery-host-reobservation-required"
    | "delivery-closeout-repository-correction-required"
    | "delivery-request-retarget-required"
    | "delivery-terminal-landing-required"
    | "delivery-terminal-checkout-required"
    | "delivery-terminal-restore-required"
    | "delivery-terminal-hand-merge-required"
    | "delivery-terminal-absorption-retry-required"
    | "delivery-worktree-clean-required";
  readonly automatedCommand: null;
}

/**
 * The clearing act for every terminal condition.
 *
 * Several conditions share an act, which is the division working rather than the collapse it replaced: the
 * condition reports what was observed and the act reports what to do about it, so two observations a caller
 * clears the same way name that way once. Totality is the compiler's, not a check's.
 */
export const DELIVERY_TERMINAL_REMEDIES: Record<DeliveryTerminalUnsettledReason, DeliveryTerminalRemedy> = {
  "terminal-member-absent": { kind: "delivery-record-repair-required", automatedCommand: null },
  "terminal-ref-unbound": { kind: "delivery-member-rebind-required", automatedCommand: null },
  "terminal-request-unbound": { kind: "delivery-member-publication-required", automatedCommand: null },
  "terminal-coordinates-unbound": { kind: "delivery-member-rebind-required", automatedCommand: null },
  "terminal-target-unbound": { kind: "delivery-record-repair-required", automatedCommand: null },
  "terminal-request-unobserved": { kind: "delivery-host-reobservation-required", automatedCommand: null },
  "terminal-provider-mismatch": { kind: "delivery-member-rebind-required", automatedCommand: null },
  "terminal-request-mismatch": { kind: "delivery-member-rebind-required", automatedCommand: null },
  "terminal-repository-mismatch": {
    kind: "delivery-closeout-repository-correction-required",
    automatedCommand: null,
  },
  "terminal-head-repository-mismatch": { kind: "delivery-request-retarget-required", automatedCommand: null },
  "terminal-head-ref-mismatch": { kind: "delivery-request-retarget-required", automatedCommand: null },
  "terminal-head-moved": { kind: "delivery-member-rebind-required", automatedCommand: null },
  "terminal-base-ref-mismatch": { kind: "delivery-request-retarget-required", automatedCommand: null },
  "terminal-not-merged": { kind: "delivery-terminal-landing-required", automatedCommand: null },
};

export type DeliveryTerminalSettlementResult =
  | { readonly status: "settled" }
  | { readonly status: "blocked"; readonly reason: DeliveryTerminalUnsettledReason };

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
  const blocked = (
    reason: DeliveryTerminalUnsettledReason,
  ): DeliveryTerminalSettlementResult => ({ status: "blocked", reason });

  // Coherence against the plan has already established that state carries the plan's members, and a
  // plan carries at least one, so the first miss below cannot hold; it keeps the reader total.
  const terminal = input.state.members.at(-1);
  if (terminal === undefined) return blocked("terminal-member-absent");
  if (terminal.ref === null) return blocked("terminal-ref-unbound");
  if (terminal.changeRequest === null) return blocked("terminal-request-unbound");
  if (terminal.coordinates === null) return blocked("terminal-coordinates-unbound");
  const targetRef = input.state.target?.ref;
  if (targetRef === undefined) return blocked("terminal-target-unbound");

  // The host withheld the request in more than one way, and none of them is a reading of the request:
  // a caller acts on an absent, ambiguous, or unavailable observation by observing again, not by
  // correcting a field. So the several withholdings keep one reason between them.
  const observed = await dependencies.readTerminalRequest(input.repository, terminal.changeRequest);
  if (observed.status !== "observed") return blocked("terminal-request-unobserved");
  const request = observed.request;

  if (request.binding.providerId !== terminal.changeRequest.providerId) {
    return blocked("terminal-provider-mismatch");
  }
  if (request.binding.changeRequestId !== terminal.changeRequest.changeRequestId) {
    return blocked("terminal-request-mismatch");
  }
  if (request.repository !== input.repository) return blocked("terminal-repository-mismatch");
  if (request.headRepository !== input.repository) {
    return blocked("terminal-head-repository-mismatch");
  }
  if (request.headRef !== terminal.ref.replace(/^refs\/heads\//u, "")) {
    return blocked("terminal-head-ref-mismatch");
  }
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
  // Equality is settled before any ancestry answer is consulted, so reaching here means the heads
  // differ; what is unestablished is whether the difference is the advance this settles on.
  if (relation.kind !== "unchanged" && relation.kind !== "advanced") {
    return blocked("terminal-head-moved");
  }
  if (request.baseRef !== targetRef.replace(/^refs\/heads\//u, "")) {
    return blocked("terminal-base-ref-mismatch");
  }
  if (request.state !== "merged") return blocked("terminal-not-merged");
  return { status: "settled" };
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
      plan.planDigest,
    );
    if (removedPlan.status === "refused") {
      return { status: "blocked", reason: `plan-${removedPlan.reason}`, planId: plan.planId };
    }
  }
  return { status: "retired", planIds: plans.map((plan) => plan.planId) };
}
