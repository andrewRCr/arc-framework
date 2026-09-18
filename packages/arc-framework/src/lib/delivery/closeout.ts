/** Typed orchestration for completed delivery residue reaping and record retirement. */

import type { DeliveryPlanStore, DeliveryRevisionedRecord, DeliveryStateStore } from "./ports.js";
import type { DeliveryPlanV1, DeliveryStateV1 } from "./schema.js";
import { SlugSchema } from "../kernel/index.js";
import {
  reapCompletedDeliveryResidue,
  type DeliveryResidueReapingDependencies,
} from "./residue-reaping.js";
import {
  retireCompletedDeliveryRecords,
  type DeliveryRetirementDependencies,
  verifyDeliveryTerminalSettlement,
} from "./retirement.js";
import { validateDeliveryStateAgainstPlan } from "./state.js";
import {
  resolveForwardDeliverySubjects,
  type DeliveryRenameEvidenceAuthority,
  type DeliveryRenameTransitionSource,
} from "./plan-resolution.js";

export interface DeliveryCloseoutDependencies {
  readonly planStore: Pick<DeliveryPlanStore<DeliveryPlanV1>, "enumerateCurrent" | "removeCurrent">;
  readonly stateStore: Pick<DeliveryStateStore<DeliveryStateV1>, "read" | "publish" | "remove">;
  readonly gitCommonDir: string;
  readonly renameAuthority: DeliveryRenameEvidenceAuthority;
  readonly renameTransitionSource: DeliveryRenameTransitionSource;
  readonly residue: Omit<DeliveryResidueReapingDependencies, "stateStore">;
  readonly retirement: Omit<DeliveryRetirementDependencies, "planStore" | "stateStore">;
}

export type DeliveryCloseoutResult =
  | {
      readonly status: "closed-out";
      readonly workUnitId: string;
      readonly planIds: readonly string[];
      readonly recommendedActionText: string;
    }
  | {
      readonly status: "blocked";
      readonly reason: string;
      readonly planId?: string;
      readonly deliverableId?: string;
      readonly recommendedActionText: string;
    };

/**
 * Reap exact delivery residue, then retire its completed records.
 *
 * @param input - Explicit completed work-unit, host repository, and Git remote identities.
 * @param dependencies - Storage-neutral records plus exact Git and host authority boundaries.
 * @returns A typed closeout result with CLI-precomposed continuation text.
 */
export async function closeoutCompletedDelivery(
  input: { readonly workUnitId: string; readonly repository: string; readonly remote: string },
  dependencies: DeliveryCloseoutDependencies,
): Promise<DeliveryCloseoutResult> {
  const blocked = (
    reason: string,
    details: { readonly planId?: string; readonly deliverableId?: string } = {},
  ): DeliveryCloseoutResult => ({
    status: "blocked",
    reason,
    ...details,
    recommendedActionText:
      `Delivery closeout stopped for \`${input.workUnitId}\`: ${reason}. Resolve the exact reported state and rerun `
      + "`arc delivery closeout` with the same work-unit, repository, and remote inputs.",
  });
  if (!SlugSchema.safeParse(input.workUnitId).success
    || input.repository.trim() === "" || input.remote.trim() === "") {
    return blocked("identity-invalid");
  }

  const enumerated = await dependencies.planStore.enumerateCurrent();
  if (enumerated.status === "refused") return blocked(`plan-${enumerated.reason}`);
  const resolved = await resolveForwardDeliverySubjects({
    records: enumerated.value,
    currentWorkUnitId: input.workUnitId,
    recordWorkUnitId: (plan) => plan.workUnitId,
    authority: dependencies.renameAuthority,
    transitionSource: dependencies.renameTransitionSource,
  });
  if (resolved.status === "indeterminate") return blocked(`plan-${resolved.reason}`);
  const plans = resolved.records;
  const bound: Array<{
    readonly plan: DeliveryPlanV1;
    readonly current: DeliveryRevisionedRecord<DeliveryStateV1>;
  }> = [];
  for (const plan of plans) {
    const state = await dependencies.stateStore.read(plan.planId);
    if (state.status === "refused") return blocked(`state-${state.reason}`, { planId: plan.planId });
    if (state.value !== null) bound.push({ plan, current: state.value });
  }
  if (bound.length > 1) return blocked("multiple-bound-states");

  const current = bound[0];
  if (current !== undefined) {
    if (validateDeliveryStateAgainstPlan(current.current.value, current.plan).status === "refused") {
      return blocked("state-plan-mismatch", { planId: current.plan.planId });
    }
    const terminal = await verifyDeliveryTerminalSettlement(
      { state: current.current.value, repository: input.repository },
      dependencies.retirement,
    );
    if (terminal.status === "blocked") {
      return blocked(terminal.reason, { planId: current.plan.planId });
    }
    const reaped = await reapCompletedDeliveryResidue({
      plan: current.plan,
      current: current.current,
      gitCommonDir: dependencies.gitCommonDir,
    }, { ...dependencies.residue, stateStore: dependencies.stateStore });
    if (reaped.status === "blocked") {
      return blocked(`reap-${reaped.reason}`, {
        planId: current.plan.planId,
        ...(reaped.deliverableId === undefined ? {} : { deliverableId: reaped.deliverableId }),
      });
    }
  }

  const retired = await retireCompletedDeliveryRecords({
    plans,
    repository: input.repository,
  }, {
    ...dependencies.retirement,
    planStore: dependencies.planStore,
    stateStore: dependencies.stateStore,
  });
  if (retired.status === "blocked") {
    return blocked(`retire-${retired.reason}`, {
      ...(retired.planId === undefined ? {} : { planId: retired.planId }),
      ...(retired.deliverableId === undefined ? {} : { deliverableId: retired.deliverableId }),
    });
  }
  return {
    status: "closed-out",
    workUnitId: input.workUnitId,
    planIds: retired.planIds,
    recommendedActionText:
      `Delivery closeout is complete for \`${input.workUnitId}\`. Continue with ordinary work-unit teardown.`,
  };
}
