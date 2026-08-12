/** Read-only session orientation over one work unit's canonical delivery binding. */

import { z } from "zod";

import { reconcileDeliveryOperation } from "../delivery/operation.js";
import type { DeliveryPlanStore, DeliveryStateStore } from "../delivery/ports.js";
import { deriveDeliveryPosition, type DeliveryPositionFactsV1 } from "../delivery/position.js";
import {
  DeliveryPlanIdSchema,
  type DeliveryPlanV1,
  type DeliveryStateV1,
} from "../delivery/schema.js";
import { validateDeliveryStateAgainstPlan } from "../delivery/state.js";
import { SlugSchema } from "../kernel/schema/slug.js";

const ActiveOperationViewSchema = z.strictObject({
  kind: z.enum(["materialize", "publish", "land", "rewrite", "teardown"]),
  operationId: z.string().min(1),
});

/** Stable session-envelope value for one coherent delivery binding. */
export const DeliveryPositionViewSchema = z.strictObject({
  planId: DeliveryPlanIdSchema,
  workUnitId: SlugSchema,
  landedCount: z.number().int().nonnegative(),
  totalCount: z.number().int().positive(),
  activeOperation: ActiveOperationViewSchema.nullable(),
  line: z.string().min(1),
}).refine((value) => value.landedCount <= value.totalCount, {
  message: "landedCount cannot exceed totalCount",
  path: ["landedCount"],
});
export type DeliveryPositionView = z.infer<typeof DeliveryPositionViewSchema>;

/** Fresh read-only facts used for clean and interrupted orientation. */
export type DeliveryPositionObservation =
  | {
    readonly status: "observed";
    readonly facts: DeliveryPositionFactsV1;
    readonly operationObservation: unknown;
  }
  | { readonly status: "refused" };

/** Narrow dependencies that cannot publish plan or state records. */
export interface DeliveryPositionReaderDependencies {
  readonly plans: Pick<DeliveryPlanStore<DeliveryPlanV1>, "enumerateCurrent">;
  readonly states: Pick<DeliveryStateStore<DeliveryStateV1>, "read">;
  readonly observe: (
    plan: DeliveryPlanV1,
    state: DeliveryStateV1,
    revision: number,
  ) => Promise<DeliveryPositionObservation>;
}

/** Closed result for the independent session-init probe slot. */
export type ReadDeliveryPositionViewResult =
  | { readonly status: "ok"; readonly value: DeliveryPositionView | null }
  | {
    readonly status: "refused";
    readonly reason:
      | "plan-unavailable"
      | "plan-ambiguous"
      | "state-unavailable"
      | "state-incoherent"
      | "observation-unavailable"
      | "operation-ambiguous"
      | "position-incoherent";
  };

function projectStateForOrientation(
  revision: number,
  state: DeliveryStateV1,
  observation: unknown,
): DeliveryStateV1 | null {
  const reconciled = reconcileDeliveryOperation({ revision, value: state }, observation);
  if (reconciled.status === "adopt") return reconciled.state;
  if (reconciled.status !== "retry") return null;
  return { ...state, activeOperation: null };
}

/**
 * Read one owning work unit's delivery position without changing delivery or Git state.
 *
 * @param workUnitId - Exact owning work-unit identity from the resolved session locus.
 * @param dependencies - Read-only plan, state, and bounded observation ports.
 * @returns A coherent precomposed view, authoritative absence, or a closed slot-local refusal.
 */
export async function readDeliveryPositionView(
  workUnitId: string,
  dependencies: DeliveryPositionReaderDependencies,
): Promise<ReadDeliveryPositionViewResult> {
  const plans = await dependencies.plans.enumerateCurrent();
  if (plans.status === "refused") return { status: "refused", reason: "plan-unavailable" };
  const matches = plans.value.filter((plan) => plan.workUnitId === workUnitId);
  if (matches.length > 1) return { status: "refused", reason: "plan-ambiguous" };
  const plan = matches[0];
  if (plan === undefined) return { status: "ok", value: null };

  const stored = await dependencies.states.read(plan.planId);
  if (stored.status === "refused") return { status: "refused", reason: "state-unavailable" };
  if (stored.value === null) return { status: "ok", value: null };
  const coherence = validateDeliveryStateAgainstPlan(stored.value.value, plan);
  if (coherence.status === "refused") return { status: "refused", reason: "state-incoherent" };

  const observed = await dependencies.observe(plan, coherence.state, stored.value.revision);
  if (observed.status === "refused") {
    return { status: "refused", reason: "observation-unavailable" };
  }

  const activeOperation = coherence.state.activeOperation;
  let projectedState = coherence.state;
  if (activeOperation !== null) {
    if (observed.operationObservation === null) {
      return { status: "refused", reason: "operation-ambiguous" };
    }
    const projected = projectStateForOrientation(
      stored.value.revision,
      coherence.state,
      observed.operationObservation,
    );
    if (projected === null) return { status: "refused", reason: "operation-ambiguous" };
    projectedState = projected;
  }

  const derived = deriveDeliveryPosition(plan, projectedState, observed.facts);
  if (derived.status === "refused") return { status: "refused", reason: "position-incoherent" };
  const landedCount = derived.position.landedPrefix.length;
  const totalCount = plan.members.length;
  const operationText = activeOperation === null
    ? "none"
    : `${activeOperation.kind} ${activeOperation.operationId}`;
  const value = DeliveryPositionViewSchema.parse({
    planId: plan.planId,
    workUnitId: plan.workUnitId,
    landedCount,
    totalCount,
    activeOperation: activeOperation === null
      ? null
      : { kind: activeOperation.kind, operationId: activeOperation.operationId },
    line: `Delivery position: ${landedCount}/${totalCount} landed; active operation: ${operationText}.`,
  });
  return { status: "ok", value };
}
