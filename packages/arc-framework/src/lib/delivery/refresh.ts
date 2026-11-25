/** Demand-driven refresh planning for one exact registered delivery suffix. */

import type { DeliveryPlanV1 } from "./schema.js";

export type DeliveryRefreshTrigger =
  | { readonly kind: "base-moved" }
  | {
      readonly kind: "landing-refused";
      readonly reason: "conflict" | "native-stale-suffix" | "host-up-to-date";
      readonly mechanics: "provider-invoked" | "operator-initiated";
    }
  | {
      readonly kind: "operator-choice";
      readonly mechanics: "provider-invoked" | "operator-initiated";
    };

export type DeliveryRefreshPlanResult =
  | {
      readonly status: "disclosed";
      readonly plannedSuffix: readonly string[];
      readonly recommendedActionText: string;
    }
  | {
      readonly status: "refresh-required";
      readonly mechanics: "provider-invoked" | "operator-initiated";
      readonly plannedSuffix: readonly string[];
      readonly recommendedActionText: string;
    }
  | {
      readonly status: "refused";
      readonly reason: "position-mismatch" | "suffix-empty" | "ambiguous-provider-movement" | "target-rewritten";
      readonly recommendedActionText: string;
    };

/** Derive the planned suffix and classify whether refresh is advisory, required, or refused. */
export function planDeliverySuffixRefresh(input: {
  readonly plan: DeliveryPlanV1;
  readonly landedPrefix: readonly string[];
  readonly trigger: DeliveryRefreshTrigger;
  readonly providerMovement: "stable" | "ambiguous" | "target-rewritten";
}): DeliveryRefreshPlanResult {
  const plannedPrefix = input.plan.members
    .slice(0, input.landedPrefix.length)
    .map(({ deliverableId }) => deliverableId);
  if (JSON.stringify(plannedPrefix) !== JSON.stringify(input.landedPrefix)) {
    return {
      status: "refused",
      reason: "position-mismatch",
      recommendedActionText: "Refresh delivery position before planning suffix reconciliation.",
    };
  }
  const plannedSuffix = input.plan.members
    .slice(input.landedPrefix.length, -1)
    .map(({ deliverableId }) => deliverableId);
  if (plannedSuffix.length === 0) {
    return {
      status: "refused",
      reason: "suffix-empty",
      recommendedActionText: "Continue to terminal integration; no registered suffix remains to refresh.",
    };
  }
  if (input.providerMovement === "ambiguous") {
    return {
      status: "refused",
      reason: "ambiguous-provider-movement",
      recommendedActionText:
        "Stop before adoption; the provider result does not identify one exact planned suffix.",
    };
  }
  if (input.providerMovement === "target-rewritten") {
    return {
      status: "refused",
      reason: "target-rewritten",
      recommendedActionText:
        "Stop before adoption; refresh may not rewrite the protected target or its recorded coordinates.",
    };
  }
  if (input.trigger.kind === "base-moved") {
    return {
      status: "disclosed",
      plannedSuffix,
      recommendedActionText:
        "Base movement alone obligates no refresh. Continue append-only until a landing refusal or explicit "
        + "operator choice requires the exact registered suffix.",
    };
  }
  return {
    status: "refresh-required",
    mechanics: input.trigger.mechanics,
    plannedSuffix,
    recommendedActionText:
      "Refresh only the exact registered suffix shown here. Safety requires fresh structural-equivalence proof "
      + "for every moved head; review invalidation applies wherever the provider changes a reviewed head. The "
      + "terminal top remains outside provider mutation and absorbs predecessor movement append-only.",
  };
}
