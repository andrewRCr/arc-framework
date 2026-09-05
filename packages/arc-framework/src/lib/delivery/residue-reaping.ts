/** Deterministic private candidate locators for delivery authoring. */

import { isAbsolute, join, resolve } from "node:path";

import {
  DeliveryPlanV1Schema,
  type DeliveryPlanV1,
} from "./schema.js";

export interface DeliveryResidueLocator {
  readonly deliverableId: string;
  readonly candidateRef: string;
  readonly gatePath: string;
}

/**
 * Derive the only candidate refs and gate paths owned by one canonical plan.
 *
 * @param plan - Canonical delivery plan supplying stable plan/member identity.
 * @param gitCommonDir - Absolute Git common directory shared by all linked worktrees.
 * @returns Exact locators or a closed refusal for malformed authority.
 */
export function deriveDeliveryResidueLocators(
  plan: DeliveryPlanV1,
  gitCommonDir: string,
):
  | { readonly status: "derived"; readonly locators: readonly DeliveryResidueLocator[] }
  | { readonly status: "refused"; readonly reason: "plan-invalid" | "git-common-dir-invalid" } {
  const parsed = DeliveryPlanV1Schema.safeParse(plan);
  if (!parsed.success) return { status: "refused", reason: "plan-invalid" };
  if (!isAbsolute(gitCommonDir)) return { status: "refused", reason: "git-common-dir-invalid" };
  const commonDir = resolve(gitCommonDir);
  return {
    status: "derived",
    locators: parsed.data.members.map((member) => ({
      deliverableId: member.deliverableId,
      candidateRef: `refs/arc/delivery-candidates/${parsed.data.planId}/${member.chunkKey}`,
      gatePath: join(commonDir, "arc", "delivery-gates", parsed.data.planId, member.chunkKey),
    })),
  };
}
