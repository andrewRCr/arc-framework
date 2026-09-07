/** Read-only delivery binding evidence for changeset attention selection. */

import type { DeliveryPlanV1, DeliveryStateV1 } from "../../../lib/delivery/schema.js";
import type {
  DeliveryPlanStore,
  DeliveryStateStore,
} from "../../../lib/delivery/ports.js";
import { validateDeliveryStateAgainstPlan } from "../../../lib/delivery/state.js";
import type { ReviewTarget } from "./gate-contract-v2-schema.js";

type PlanEnumeration = Pick<DeliveryPlanStore<DeliveryPlanV1>, "enumerateCurrent">["enumerateCurrent"];
type StateRead = Pick<DeliveryStateStore<DeliveryStateV1>, "read">["read"];
type MemberResolve = Pick<DeliveryStateStore<DeliveryStateV1>, "resolveMember">["resolveMember"];

/** Closed delivery evidence returned to the review-attention policy. */
export type DeliveryBindingLookupResult =
  | {
    readonly status: "bound";
    readonly planId: string;
    readonly targetKind: "work-unit" | "delivery-member";
  }
  | { readonly status: "authoritative-unbound" }
  | { readonly status: "unavailable"; readonly reason: string };

/** Storage-agnostic read surface for resolving fresh delivery evidence. */
export class DeliveryBindingLookup {
  /** @param input - Read-only plan and state operations for one repository. */
  constructor(private readonly input: {
    readonly enumeratePlans: PlanEnumeration;
    readonly readState: StateRead;
    readonly resolveMember: MemberResolve;
  }) {}

  /**
   * Resolve one target against an optional owning work unit without writing state.
   *
   * @param input - Exact review target and handler-resolved owning work-unit identity.
   * @returns Bound, authoritatively unbound, or contained unavailable evidence.
   */
  async resolve(input: {
    readonly target: ReviewTarget;
    readonly workUnitId: string | null;
  }): Promise<DeliveryBindingLookupResult> {
    let memberResolution: Awaited<ReturnType<MemberResolve>> | null = null;
    try {
      if (input.target.kind === "delivery-member") {
        memberResolution = await this.input.resolveMember({
          selector: { kind: "head", objectId: input.target.headSha },
        });
        if (memberResolution.status === "refused") {
          return { status: "unavailable", reason: memberResolution.reason };
        }
      }
      if (input.workUnitId === null) {
        return memberResolution?.status === "ok" && memberResolution.value !== null
          ? { status: "unavailable", reason: "state-without-owning-work-unit" }
          : { status: "authoritative-unbound" };
      }
      const plans = await this.input.enumeratePlans();
      if (plans.status === "refused") return { status: "unavailable", reason: plans.reason };
      const matches = plans.value.filter((plan) => plan.workUnitId === input.workUnitId);
      if (matches.length > 1) return { status: "unavailable", reason: "ambiguous-plan" };
      const plan = matches[0];
      if (plan === undefined) {
        return memberResolution?.status === "ok" && memberResolution.value !== null
          ? { status: "unavailable", reason: "state-without-plan" }
          : { status: "authoritative-unbound" };
      }
      const state = await this.input.readState(plan.planId);
      if (state.status === "refused") return { status: "unavailable", reason: state.reason };
      if (state.value === null) return { status: "authoritative-unbound" };
      const coherence = validateDeliveryStateAgainstPlan(state.value.value, plan);
      if (coherence.status === "refused") {
        return { status: "unavailable", reason: coherence.reason };
      }
      if (input.target.kind === "delivery-member") {
        const owned = await this.input.resolveMember({
          selector: { kind: "head", objectId: input.target.headSha },
          owningUnit: { workUnitId: input.workUnitId, planId: plan.planId },
        });
        if (owned.status === "refused") return { status: "unavailable", reason: owned.reason };
        if (owned.value === null) return { status: "unavailable", reason: "member-unbound" };
        if (owned.value.planId !== plan.planId || owned.value.workUnitId !== input.workUnitId) {
          return { status: "unavailable", reason: "member-identity-mismatch" };
        }
      }
      return {
        status: "bound",
        planId: plan.planId,
        targetKind: input.target.kind === "delivery-member" ? "delivery-member" : "work-unit",
      };
    } catch {
      return { status: "unavailable", reason: "reader-failure" };
    }
  }
}
