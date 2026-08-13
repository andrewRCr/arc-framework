/** Lossless transfer contract for repository-common delivery plan and state records. */

import { z } from "zod";

import { canonicalize } from "../kernel/index.js";
import { validateDeliveryPlanRecord } from "./plan.js";
import type { DeliveryRevisionedRecord } from "./ports.js";
import {
  DeliveryPlanV1Schema,
  DeliveryStateV1Schema,
  type DeliveryPlanV1,
  type DeliveryStateV1,
} from "./schema.js";
import { validateDeliveryStateAgainstPlan } from "./state.js";

/** Portable, exact delivery plan/state pair. */
export const DeliveryTransferBundleV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  semanticsVersion: z.literal("delivery-transfer/v1"),
  plan: DeliveryPlanV1Schema,
  state: z.strictObject({
    revision: z.number().int().positive(),
    value: DeliveryStateV1Schema,
  }),
});
export type DeliveryTransferBundleV1 = z.infer<typeof DeliveryTransferBundleV1Schema>;

export type BuildDeliveryTransferBundleResult =
  | { readonly status: "ready"; readonly bundle: DeliveryTransferBundleV1 }
  | { readonly status: "refused"; readonly reason: string };

/** Validate and assemble one portable bundle without changing either record. */
export function buildDeliveryTransferBundle(input: {
  readonly plan: DeliveryPlanV1;
  readonly state: DeliveryRevisionedRecord<DeliveryStateV1>;
}): BuildDeliveryTransferBundleResult {
  const plan = validateDeliveryPlanRecord(input.plan);
  if (plan.status !== "valid") return { status: "refused", reason: "plan-invalid" };
  if (!Number.isSafeInteger(input.state.revision) || input.state.revision <= 0) {
    return { status: "refused", reason: "state-revision-invalid" };
  }
  const state = validateDeliveryStateAgainstPlan(input.state.value, plan.plan);
  if (state.status !== "valid") return { status: "refused", reason: state.reason };
  return {
    status: "ready",
    bundle: {
      schemaVersion: 1,
      semanticsVersion: "delivery-transfer/v1",
      plan: plan.plan,
      state: { revision: input.state.revision, value: state.state },
    },
  };
}

export type ClassifyDeliveryTransferImportResult =
  | {
      readonly status: "ready" | "already-current";
      readonly writePlan: boolean;
      readonly writeState: boolean;
    }
  | { readonly status: "refused"; readonly reason: string };

/** Admit only a fresh destination or the exact same plan/state generation. */
export function classifyDeliveryTransferImport(input: {
  readonly bundle: DeliveryTransferBundleV1;
  readonly currentWorkUnitId: string;
  readonly currentPlan: DeliveryPlanV1 | null;
  readonly currentState: DeliveryRevisionedRecord<DeliveryStateV1> | null;
}): ClassifyDeliveryTransferImportResult {
  const built = buildDeliveryTransferBundle({ plan: input.bundle.plan, state: input.bundle.state });
  if (built.status === "refused") return built;
  if (built.bundle.plan.workUnitId !== input.currentWorkUnitId) {
    return { status: "refused", reason: "subject-mismatch" };
  }
  const planMatches = input.currentPlan === null
    || canonicalize(input.currentPlan) === canonicalize(built.bundle.plan);
  const stateMatches = input.currentState === null
    || canonicalize(input.currentState) === canonicalize(built.bundle.state);
  if (!planMatches || !stateMatches) {
    return { status: "refused", reason: "destination-conflict" };
  }
  const writePlan = input.currentPlan === null;
  const writeState = input.currentState === null;
  return {
    status: writePlan || writeState ? "ready" : "already-current",
    writePlan,
    writeState,
  };
}
