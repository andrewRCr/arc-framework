/** Terminal absorption, readiness, and post-merge state adoption. */

import { canonicalize } from "../kernel/index.js";
import type { DeliveryContributionProofResult } from "./contribution-proof.js";
import type { DeliveryHostChangeRequest } from "./host.js";
import type { DeliveryRevisionedRecord, DeliveryStateStore } from "./ports.js";
import type {
  DeliveryPlanV1,
  DeliveryStateV1,
  DeliveryTargetCoordinatesV1,
} from "./schema.js";
import { DeliveryStateV1Schema } from "./schema.js";
import { validateDeliveryStateAgainstPlan } from "./state.js";

export interface DeliveryAbsorptionIntent {
  readonly controlRef: string;
  readonly controlHead: string;
  readonly protectedTargetRef: string;
  readonly protectedTargetHead: string;
}

export type DeliveryAbsorptionDecision =
  | { readonly status: "absorption-ready"; readonly intent: DeliveryAbsorptionIntent }
  | { readonly status: "already-absorbed" }
  | { readonly status: "blocked"; readonly reason: string };

/** Pure closed decision over fresh terminal-handoff facts. */
export function assessDeliveryAbsorption(input: {
  readonly plan: DeliveryPlanV1;
  readonly state: DeliveryStateV1;
  readonly landedDeliverableIds: readonly string[];
  readonly retainedControl: { readonly ref: string; readonly head: string; readonly tree: string };
  readonly observedControl: { readonly ref: string; readonly head: string; readonly tree: string };
  readonly protectedTarget: { readonly ref: string; readonly head: string; readonly tree: string };
  readonly dirty: boolean;
  readonly suffixReconciled: boolean;
  readonly absorption: "required" | "exact" | "stale";
}): DeliveryAbsorptionDecision {
  if (validateDeliveryStateAgainstPlan(input.state, input.plan).status !== "valid") {
    return { status: "blocked", reason: "state-mismatch" };
  }
  if (input.state.activeOperation !== null) return { status: "blocked", reason: "operation-active" };
  if (input.dirty) return { status: "blocked", reason: "dirty-control" };
  if (!input.suffixReconciled) return { status: "blocked", reason: "suffix-unreconciled" };
  const prefix = input.plan.members.slice(0, -1).map((member) => member.deliverableId);
  if (canonicalize(input.landedDeliverableIds) !== canonicalize(prefix)) {
    return { status: "blocked", reason: "landed-prefix-incomplete" };
  }
  const terminal = input.state.members.at(-1);
  if (terminal === undefined || terminal.ref !== null || terminal.changeRequest !== null || terminal.coordinates !== null) {
    return { status: "blocked", reason: "terminal-bound" };
  }
  if (canonicalize(input.retainedControl) !== canonicalize(input.observedControl)) {
    return { status: "blocked", reason: "control-moved" };
  }
  if (input.state.target?.ref !== input.protectedTarget.ref
    || canonicalize(input.state.target.coordinates) !== canonicalize({
      head: input.protectedTarget.head, tree: input.protectedTarget.tree,
    })) return { status: "blocked", reason: "target-moved" };
  if (input.absorption === "stale") return { status: "blocked", reason: "absorption-stale" };
  if (input.absorption === "exact") return { status: "already-absorbed" };
  return {
    status: "absorption-ready",
    intent: {
      controlRef: input.retainedControl.ref,
      controlHead: input.retainedControl.head,
      protectedTargetRef: input.protectedTarget.ref,
      protectedTargetHead: input.protectedTarget.head,
    },
  };
}

/** Execute only the ordinary append-only reconcile selected by the pure decision. */
export async function executeDeliveryAbsorption(input: {
  readonly decision: DeliveryAbsorptionDecision;
  merge(intent: DeliveryAbsorptionIntent): Promise<{ readonly status: "merged" | "refused" }>;
  tier1(): Promise<{ readonly status: "passed" | "failed" }>;
}): Promise<{ readonly status: "absorbed" | "already-absorbed" | "blocked" }> {
  if (input.decision.status === "already-absorbed") return input.decision;
  if (input.decision.status !== "absorption-ready") return { status: "blocked" };
  if ((await input.merge(input.decision.intent)).status !== "merged") return { status: "blocked" };
  return (await input.tier1()).status === "passed" ? { status: "absorbed" } : { status: "blocked" };
}

/** Expose terminal integration only after exact absorption and residual-contribution proof. */
export async function assessDeliveryTerminalReadiness(input: {
  readonly absorption: DeliveryAbsorptionDecision;
  readonly terminalUnbound: boolean;
  proveResidual(): Promise<DeliveryContributionProofResult>;
}): Promise<{ readonly status: "terminal-ready" } | { readonly status: "blocked"; readonly reason: string }> {
  if (input.absorption.status !== "already-absorbed") return { status: "blocked", reason: "absorption-missing" };
  if (!input.terminalUnbound) return { status: "blocked", reason: "terminal-bound" };
  return (await input.proveResidual()).status === "accepted"
    ? { status: "terminal-ready" }
    : { status: "blocked", reason: "residual-mismatch" };
}

type TerminalResolution =
  | { readonly status: "ordinary" }
  | { readonly status: "unavailable" }
  | {
      readonly status: "delivery";
      readonly plan: DeliveryPlanV1;
      readonly current: DeliveryRevisionedRecord<DeliveryStateV1>;
    };

/** Total post-merge attachment: ordinary WUs no-op; exact delivery terminals bind once by CAS. */
export async function adoptDeliveryTerminalMerge(input: {
  readonly resolution: TerminalResolution;
  readonly repository: string;
  readonly retainedControlRef: string;
  readonly retainedControlHead: string;
  readonly landedDeliverableIds: readonly string[];
  readonly request: DeliveryHostChangeRequest;
  readonly targetBefore: DeliveryTargetCoordinatesV1;
  readonly targetAfter: DeliveryTargetCoordinatesV1;
  proveResidual(): Promise<DeliveryContributionProofResult>;
  readonly stateStore: Pick<DeliveryStateStore<DeliveryStateV1>, "publish">;
}): Promise<
  | { readonly status: "not-applicable" }
  | { readonly status: "already-attached" | "attached"; readonly state: DeliveryRevisionedRecord<DeliveryStateV1> }
  | { readonly status: "blocked"; readonly reason: string }
> {
  if (input.resolution.status === "ordinary") return { status: "not-applicable" };
  if (input.resolution.status === "unavailable") return { status: "blocked", reason: "plan-unavailable" };
  const { plan, current } = input.resolution;
  if (validateDeliveryStateAgainstPlan(current.value, plan).status !== "valid") {
    return { status: "blocked", reason: "state-mismatch" };
  }
  if (current.value.activeOperation !== null) return { status: "blocked", reason: "operation-active" };
  const prefix = plan.members.slice(0, -1).map((member) => member.deliverableId);
  if (canonicalize(input.landedDeliverableIds) !== canonicalize(prefix)) {
    return { status: "blocked", reason: "landed-prefix-incomplete" };
  }
  const terminalIndex = plan.members.length - 1;
  const terminal = current.value.members[terminalIndex];
  if (terminal === undefined) return { status: "blocked", reason: "terminal-missing" };
  const expectedHeadRef = input.retainedControlRef.replace(/^refs\/heads\//u, "");
  if (input.request.state !== "merged" || input.request.repository !== input.repository
    || input.request.headRepository !== input.repository || input.request.headRef !== expectedHeadRef
    || input.request.headSha !== input.retainedControlHead) {
    return { status: "blocked", reason: "request-mismatch" };
  }
  const expected = {
    deliverableId: terminal.deliverableId,
    ref: input.retainedControlRef,
    changeRequest: input.request.binding,
    coordinates: { base: input.targetBefore.head, head: input.targetAfter.head, tree: input.targetAfter.tree },
  };
  if (canonicalize(terminal) === canonicalize(expected)) return { status: "already-attached", state: current };
  if (terminal.ref !== null || terminal.changeRequest !== null || terminal.coordinates !== null) {
    return { status: "blocked", reason: "terminal-conflict" };
  }
  if (current.value.target === null
    || canonicalize(current.value.target.coordinates) !== canonicalize(input.targetBefore)) {
    return { status: "blocked", reason: "target-mismatch" };
  }
  if ((await input.proveResidual()).status !== "accepted") {
    return { status: "blocked", reason: "residual-mismatch" };
  }
  const parsed = DeliveryStateV1Schema.safeParse({
    ...current.value,
    target: { ref: current.value.target.ref, coordinates: input.targetAfter },
    members: current.value.members.map((member, index) => index === terminalIndex ? expected : member),
  });
  if (!parsed.success) return { status: "blocked", reason: "result-invalid" };
  const persisted = await input.stateStore.publish(plan.planId, parsed.data, current.revision);
  return persisted.status === "ok"
    ? { status: "attached", state: persisted.value }
    : { status: "blocked", reason: "state-conflict" };
}
